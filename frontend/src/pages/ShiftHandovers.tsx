import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, orderBy, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Wallet, CheckCircle2, Plus, X, Trash2, ArrowRightLeft } from 'lucide-react';
import toast from 'react-hot-toast';

interface Branch {
  id: string;
  name: string;
}

interface ShiftReport {
  id: string;
  branchId: string;
  cashierEmail: string;
  cashierName: string;
  startTime: Date;
  endTime: Date | null;
  startCash: number;
  startTransfer: number;
  endCash: number | null;
  endTransfer: number | null;
  revenueCash: number | null;
  revenueTransfer: number | null;
  status: 'OPEN' | 'CLOSED';
  notes: string;
}

const ShiftHandovers = () => {
  const [reports, setReports] = useState<ShiftReport[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchMap, setBranchMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  
  const userRole = localStorage.getItem('userRole') || 'EMPLOYEE';
  const currentUserEmail = localStorage.getItem('userEmail') || '';
  const currentBranchId = localStorage.getItem('branchId') || '';
  
  // States cho Lọc
  const [filterBranchId, setFilterBranchId] = useState(userRole === 'BRANCH_ADMIN' ? currentBranchId : 'all');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);

  // States cho Mở / Chốt ca
  const [activeShift, setActiveShift] = useState<ShiftReport | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'OPEN' | 'CLOSE'>('OPEN');
  
  // Dữ liệu nhập
  const [startCash, setStartCash] = useState(0);
  const [startTransfer, setStartTransfer] = useState(0);
  const [endCash, setEndCash] = useState(0);
  const [endTransfer, setEndTransfer] = useState(0);
  const [notes, setNotes] = useState('');
  
  // Doanh thu tạm tính (chỉ khi đang chốt ca mới tính)
  const [tempRevenueCash, setTempRevenueCash] = useState(0);
  const [tempRevenueTransfer, setTempRevenueTransfer] = useState(0);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Branches
      const branchSnap = await getDocs(collection(db, 'branches'));
      const branchList: Branch[] = [];
      const map: Record<string, string> = {};
      branchSnap.forEach(doc => {
        branchList.push({ id: doc.id, name: doc.data().name });
        map[doc.id] = doc.data().name;
      });
      setBranches(branchList);
      setBranchMap(map);

      // 2. Fetch Active Shift (dành cho Thu Ngân)
      if (userRole === 'CASHIER') {
        const activeQuery = query(
          collection(db, 'shift_reports'),
          where('cashierEmail', '==', currentUserEmail),
          where('status', '==', 'OPEN')
        );
        const activeSnap = await getDocs(activeQuery);
        if (!activeSnap.empty) {
          const docData = activeSnap.docs[0];
          const data = docData.data() as any;
          setActiveShift({
            id: docData.id,
            ...data,
            startTime: data.startTime.toDate(),
            endTime: data.endTime ? data.endTime.toDate() : null
          } as ShiftReport);
        } else {
          setActiveShift(null);
        }
      }

      // 3. Fetch History Reports
      let reportsQuery: any;
      
      const startOfDay = new Date(filterDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filterDate);
      endOfDay.setHours(23, 59, 59, 999);

      if (userRole === 'SUPER_ADMIN') {
        if (filterBranchId === 'all') {
          reportsQuery = query(
            collection(db, 'shift_reports'),
            where('startTime', '>=', Timestamp.fromDate(startOfDay)),
            where('startTime', '<=', Timestamp.fromDate(endOfDay)),
            orderBy('startTime', 'desc')
          );
        } else {
          reportsQuery = query(
            collection(db, 'shift_reports'),
            where('branchId', '==', filterBranchId),
            where('startTime', '>=', Timestamp.fromDate(startOfDay)),
            where('startTime', '<=', Timestamp.fromDate(endOfDay)),
            orderBy('startTime', 'desc')
          );
        }
      } else if (userRole === 'BRANCH_ADMIN') {
        reportsQuery = query(
          collection(db, 'shift_reports'),
          where('branchId', '==', currentBranchId),
          where('startTime', '>=', Timestamp.fromDate(startOfDay)),
          where('startTime', '<=', Timestamp.fromDate(endOfDay)),
          orderBy('startTime', 'desc')
        );
      } else {
        // Thu ngân chỉ xem ca của mình
        reportsQuery = query(
          collection(db, 'shift_reports'),
          where('cashierEmail', '==', currentUserEmail),
          where('startTime', '>=', Timestamp.fromDate(startOfDay)),
          where('startTime', '<=', Timestamp.fromDate(endOfDay)),
          orderBy('startTime', 'desc')
        );
      }

      const snap = await getDocs(reportsQuery);
      const list: ShiftReport[] = [];
      snap.forEach(doc => {
        const data = doc.data() as any;
        list.push({
          id: doc.id,
          ...data,
          startTime: data.startTime.toDate(),
          endTime: data.endTime ? data.endTime.toDate() : null
        } as ShiftReport);
      });
      setReports(list);

    } catch (error) {
      console.error("Lỗi lấy dữ liệu ca:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [filterBranchId, filterDate]);

  const calculateRevenue = async (start: Date, end: Date) => {
    try {
      // Tìm các hóa đơn trong khoảng thời gian ca
      const ordersQuery = query(
        collection(db, 'orders'),
        where('branchId', '==', currentBranchId),
        where('createdAt', '>=', Timestamp.fromDate(start)),
        where('createdAt', '<=', Timestamp.fromDate(end))
      );
      
      const ordersSnap = await getDocs(ordersQuery);
      let revCash = 0;
      let revTrans = 0;

      ordersSnap.forEach(doc => {
        const data = doc.data();
        if (data.status === 'COMPLETED') { // Chỉ tính hóa đơn đã hoàn thành
          if (data.paymentMethod === 'CASH') {
            revCash += data.total || 0;
          } else {
            revTrans += data.total || 0;
          }
        }
      });

      return { revCash, revTrans };
    } catch (err) {
      console.error("Lỗi tính doanh thu:", err);
      return { revCash: 0, revTrans: 0 };
    }
  };

  const handleOpenShift = () => {
    setModalMode('OPEN');
    setStartCash(0);
    setStartTransfer(0);
    setNotes('');
    setIsModalOpen(true);
  };

  const handlePrepareCloseShift = async () => {
    if (!activeShift) return;
    
    // Tạm tính doanh thu ngay lúc này
    const rev = await calculateRevenue(activeShift.startTime, new Date());
    setTempRevenueCash(rev.revCash);
    setTempRevenueTransfer(rev.revTrans);
    
    // Suggest end cash = start + revenue
    setEndCash(activeShift.startCash + rev.revCash);
    setEndTransfer(activeShift.startTransfer + rev.revTrans);
    
    setModalMode('CLOSE');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranchId) {
      toast.error('Lỗi: Không xác định được cơ sở');
      return;
    }

    try {
      if (modalMode === 'OPEN') {
        // Lấy tên user
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', currentUserEmail)));
        const cashierName = userSnap.empty ? currentUserEmail : (userSnap.docs[0].data().fullName || currentUserEmail);

        await addDoc(collection(db, 'shift_reports'), {
          branchId: currentBranchId,
          cashierEmail: currentUserEmail,
          cashierName: cashierName,
          startTime: new Date(),
          endTime: null,
          startCash,
          startTransfer,
          endCash: null,
          endTransfer: null,
          revenueCash: null,
          revenueTransfer: null,
          status: 'OPEN',
          notes
        });
        toast.success('Mở ca thành công!');
      } else {
        // Đóng ca
        if (!activeShift) return;
        const now = new Date();
        const rev = await calculateRevenue(activeShift.startTime, now);
        
        await updateDoc(doc(db, 'shift_reports', activeShift.id), {
          endTime: now,
          endCash,
          endTransfer,
          revenueCash: rev.revCash,
          revenueTransfer: rev.revTrans,
          status: 'CLOSED',
          notes
        });
        toast.success('Chốt ca thành công!');
        setActiveShift(null);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      console.error("Lỗi khi lưu ca:", err);
      toast.error('Lỗi khi lưu ca làm việc');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa báo cáo ca này?')) {
      try {
        await deleteDoc(doc(db, 'shift_reports', id));
        toast.success('Đã xóa báo cáo');
        fetchData();
      } catch (err) {
        toast.error('Lỗi khi xóa');
      }
    }
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Bàn giao ca</h2>
          <p className="text-sm text-gray-500">Quản lý đóng/mở ca và đối soát tiền mặt thu ngân</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {userRole === 'SUPER_ADMIN' && (
            <select
              value={filterBranchId}
              onChange={(e) => setFilterBranchId(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
            >
              <option value="all">Tất cả cơ sở</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
          />

          {userRole === 'CASHIER' && (
            activeShift ? (
              <button 
                onClick={handlePrepareCloseShift}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-sm"
              >
                <CheckCircle2 size={20} className="mr-2" />
                Chốt ca ngay
              </button>
            ) : (
              <button 
                onClick={handleOpenShift}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
              >
                <Plus size={20} className="mr-2" />
                Mở ca mới
              </button>
            )
          )}
        </div>
      </div>

      {userRole === 'CASHIER' && activeShift && (
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 shadow-md text-white">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-bold flex items-center mb-1">
                <span className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></span>
                Bạn đang trong ca làm việc
              </h3>
              <p className="text-blue-100 text-sm">
                Bắt đầu lúc: {activeShift.startTime.toLocaleTimeString('vi-VN')} ({activeShift.startTime.toLocaleDateString('vi-VN')})
              </p>
            </div>
            <div className="text-right">
              <p className="text-blue-100 text-sm mb-1">Tiền nhận đầu ca</p>
              <div className="flex items-center justify-end gap-4 text-sm font-medium">
                <span className="flex items-center bg-white/20 px-3 py-1.5 rounded-lg">
                  <Wallet size={16} className="mr-2" />
                  Tiền mặt: {formatMoney(activeShift.startCash)}
                </span>
                <span className="flex items-center bg-white/20 px-3 py-1.5 rounded-lg">
                  <ArrowRightLeft size={16} className="mr-2" />
                  Chuyển khoản: {formatMoney(activeShift.startTransfer)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table Lịch sử */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-100">
          <h3 className="font-bold text-gray-700">Lịch sử Bàn giao ca</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-semibold text-gray-600 text-sm">Thời gian</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở / Thu ngân</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Tiền đầu ca (Mặt / CK)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Doanh thu trong ca (Mặt / CK)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Thực tế cuối ca (Mặt / CK)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Chênh lệch tiền mặt</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-center">Trạng thái</th>
                {(userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN') && (
                  <th className="p-4"></th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">Đang tải...</td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500 italic">Không có dữ liệu ca làm việc</td>
                </tr>
              ) : (
                reports.map(r => {
                  const varianceCash = (r.endCash ?? 0) - (r.startCash + (r.revenueCash ?? 0));
                  return (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="font-medium text-gray-800">{r.startTime.toLocaleTimeString('vi-VN')}</div>
                        <div className="text-xs text-gray-500">{r.startTime.toLocaleDateString('vi-VN')}</div>
                        {r.endTime && (
                          <div className="text-xs text-gray-400 mt-1">Đến: {r.endTime.toLocaleTimeString('vi-VN')}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-blue-600">{r.cashierName}</div>
                        <div className="text-xs text-gray-500">{branchMap[r.branchId] || ''}</div>
                      </td>
                      <td className="p-4 text-sm">
                        <div className="text-gray-800">{formatMoney(r.startCash)}</div>
                        <div className="text-gray-500 text-xs">{formatMoney(r.startTransfer)}</div>
                      </td>
                      <td className="p-4 text-sm">
                        <div className="text-green-600">{r.status === 'CLOSED' ? formatMoney(r.revenueCash || 0) : '---'}</div>
                        <div className="text-gray-500 text-xs">{r.status === 'CLOSED' ? formatMoney(r.revenueTransfer || 0) : '---'}</div>
                      </td>
                      <td className="p-4 text-sm font-medium">
                        <div className="text-gray-800">{r.status === 'CLOSED' ? formatMoney(r.endCash || 0) : '---'}</div>
                        <div className="text-gray-500 text-xs">{r.status === 'CLOSED' ? formatMoney(r.endTransfer || 0) : '---'}</div>
                      </td>
                      <td className="p-4">
                        {r.status === 'CLOSED' ? (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${varianceCash > 0 ? 'bg-blue-100 text-blue-700' : varianceCash < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {varianceCash > 0 ? '+' : ''}{formatMoney(varianceCash)}
                          </span>
                        ) : (
                          <span className="text-gray-400">---</span>
                        )}
                        {r.notes && <div className="text-[10px] text-gray-500 mt-1 max-w-[150px] truncate" title={r.notes}>{r.notes}</div>}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${r.status === 'OPEN' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                          {r.status === 'OPEN' ? 'ĐANG MỞ' : 'ĐÃ CHỐT'}
                        </span>
                      </td>
                      {(userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN') && (
                        <td className="p-4 text-right">
                          <button onClick={() => handleDelete(r.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors" title="Xóa báo cáo">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Mở/Đóng Ca */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className={`p-4 border-b flex justify-between items-center text-white ${modalMode === 'OPEN' ? 'bg-blue-600' : 'bg-green-600'}`}>
              <h3 className="font-bold text-lg flex items-center">
                {modalMode === 'OPEN' ? <Plus size={20} className="mr-2" /> : <CheckCircle2 size={20} className="mr-2" />}
                {modalMode === 'OPEN' ? 'Mở ca làm việc mới' : 'Chốt ca làm việc'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              
              {modalMode === 'OPEN' ? (
                <>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                    <p className="text-sm text-blue-800">Vui lòng kiểm tra và nhập chính xác số tiền bạn đang nhận để bắt đầu ca làm việc.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền mặt nhận (VNĐ)</label>
                    <input 
                      type="text" required
                      value={startCash.toLocaleString('vi-VN')}
                      onChange={(e) => setStartCash(Number(e.target.value.replace(/[^0-9]/g, '')))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-bold text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số dư Tài khoản nhận (nếu có theo dõi)</label>
                    <input 
                      type="text" 
                      value={startTransfer.toLocaleString('vi-VN')}
                      onChange={(e) => setStartTransfer(Number(e.target.value.replace(/[^0-9]/g, '')))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-bold text-gray-800"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Tiền mặt đầu ca</p>
                      <p className="font-bold text-gray-800">{formatMoney(activeShift?.startCash || 0)}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Doanh thu tiền mặt (tạm tính)</p>
                      <p className="font-bold text-green-600">+{formatMoney(tempRevenueCash)}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Doanh thu chuyển khoản (tạm tính)</p>
                      <p className="font-bold text-green-600">+{formatMoney(tempRevenueTransfer)}</p>
                    </div>
                  </div>

                  <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 text-center mb-6">
                    <p className="text-sm text-yellow-800 mb-1">Tiền mặt lý thuyết trên hệ thống</p>
                    <p className="text-2xl font-bold text-yellow-700">{formatMoney((activeShift?.startCash || 0) + tempRevenueCash)}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tiền mặt THỰC TẾ đang có <span className="text-red-500">*</span></label>
                    <input 
                      type="text" required
                      value={endCash.toLocaleString('vi-VN')}
                      onChange={(e) => setEndCash(Number(e.target.value.replace(/[^0-9]/g, '')))}
                      className="w-full px-4 py-3 border-2 border-green-500 rounded-xl outline-none focus:ring-4 focus:ring-green-100 text-xl font-bold text-gray-800 text-center"
                    />
                    
                    {/* Hiển thị chênh lệch */}
                    {(() => {
                      const theoretical = (activeShift?.startCash || 0) + tempRevenueCash;
                      const variance = endCash - theoretical;
                      if (variance === 0) return <p className="text-sm text-green-600 mt-2 font-medium text-center">Khớp hoàn toàn!</p>;
                      return <p className={`text-sm mt-2 font-bold text-center ${variance > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {variance > 0 ? 'THỪA' : 'THIẾU'} {formatMoney(Math.abs(variance))} so với hệ thống
                      </p>;
                    })()}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tiền tài khoản thực tế cuối ca</label>
                    <input 
                      type="text" 
                      value={endTransfer.toLocaleString('vi-VN')}
                      onChange={(e) => setEndTransfer(Number(e.target.value.replace(/[^0-9]/g, '')))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-green-500 text-lg font-bold text-gray-800 text-center"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú {modalMode === 'CLOSE' && '(Bắt buộc nếu có chênh lệch)'}</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500 resize-none h-24"
                  placeholder={modalMode === 'OPEN' ? "Ghi chú thêm..." : "Giải trình lý do chênh lệch (nếu có)..."}
                ></textarea>
              </div>

              <div className="pt-4 mt-4 border-t border-gray-100 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className={`px-8 py-2.5 text-white rounded-xl font-bold transition-colors shadow-sm ${modalMode === 'OPEN' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  {modalMode === 'OPEN' ? 'Xác nhận Mở ca' : 'Hoàn tất Chốt ca'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftHandovers;
