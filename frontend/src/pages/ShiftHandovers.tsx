import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, orderBy, deleteDoc, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Wallet, CheckCircle2, Plus, X, Trash2, ArrowRightLeft, FileText } from 'lucide-react';
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
  editHistory?: {
    timestamp: Date;
    editorName: string;
    changes: string[];
  }[];
}

const ShiftHandovers = () => {
  const [reports, setReports] = useState<ShiftReport[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchMap, setBranchMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  
  const userRole = localStorage.getItem('userRole') || 'EMPLOYEE';
  const currentUserEmail = localStorage.getItem('userEmail') || '';
  const currentBranchId = localStorage.getItem('branchId') || '';
  const currentEmployeeId = localStorage.getItem('employeeId') || '';
  
  // States cho Lọc
  const [filterBranchId, setFilterBranchId] = useState(userRole === 'BRANCH_ADMIN' ? currentBranchId : 'all');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);

  // States cho Mở / Chốt ca
  const [activeShift, setActiveShift] = useState<ShiftReport | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'OPEN' | 'CLOSE' | 'EDIT'>('OPEN');
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [historyShift, setHistoryShift] = useState<ShiftReport | null>(null);
  
  // Dữ liệu nhập
  const [startCash, setStartCash] = useState(0);
  const [startTransfer, setStartTransfer] = useState(0);
  const [endCash, setEndCash] = useState(0);
  const [endTransfer, setEndTransfer] = useState(0);
  const [notes, setNotes] = useState('');
  
  // Doanh thu tạm tính (chỉ khi đang chốt ca mới tính)
  const [tempRevenueCash, setTempRevenueCash] = useState(0);
  const [tempRevenueTransfer, setTempRevenueTransfer] = useState(0);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
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
      const startOfDay = new Date(filterDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filterDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Lấy tất cả ca trong ngày và lọc ở client để tránh lỗi thiếu index kép trên Firestore
      const reportsQuery = query(
        collection(db, 'shift_reports'),
        where('startTime', '>=', Timestamp.fromDate(startOfDay)),
        where('startTime', '<=', Timestamp.fromDate(endOfDay)),
        orderBy('startTime', 'desc')
      );

      const snap = await getDocs(reportsQuery);
      const list: ShiftReport[] = [];
      const openShiftPromises: Promise<void>[] = [];

      snap.forEach(doc => {
        const data = doc.data() as any;
        
        // Lọc theo phân quyền
        if (userRole === 'SUPER_ADMIN' && filterBranchId !== 'all' && data.branchId !== filterBranchId) return;
        if (userRole === 'BRANCH_ADMIN' && data.branchId !== currentBranchId) return;
        if (userRole === 'CASHIER' && data.cashierEmail !== currentUserEmail) return;
        if (userRole === 'POS' && data.branchId !== currentBranchId) return;

        const editHistory = data.editHistory ? data.editHistory.map((eh: any) => ({
          ...eh,
          timestamp: eh.timestamp.toDate()
        })) : [];

        const report = {
          id: doc.id,
          ...data,
          startTime: data.startTime.toDate(),
          endTime: data.endTime ? data.endTime.toDate() : null,
          editHistory
        } as ShiftReport;
        
        list.push(report);

        if (report.status === 'OPEN') {
           // Tính doanh thu tạm tính cho ca đang mở (chỉ để hiển thị)
           openShiftPromises.push((async () => {
             const rev = await calculateRevenue(report.startTime, new Date(), report.branchId);
             report.revenueCash = rev.revCash;
             report.revenueTransfer = rev.revTrans;
           })());
        }
      });
      
      await Promise.all(openShiftPromises);
      setReports(list);

    } catch (error) {
      console.error("Lỗi lấy dữ liệu ca:", error);
    } finally {
      if (!silent) setLoading(false);
    };
  };

  useEffect(() => {
    fetchData();
  }, [filterBranchId, filterDate]);

  const calculateRevenue = async (start: Date, end: Date, branchId: string) => {
    try {
      // Lấy các hóa đơn trong khoảng thời gian để tính doanh thu
      // Query bằng createdAt để tránh lỗi index kết hợp, lọc branchId bằng JS
      const ordersQuery = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(start)),
        where('createdAt', '<=', Timestamp.fromDate(end))
      );
      
      const ordersSnap = await getDocs(ordersQuery);
      let revCash = 0;
      let revTrans = 0;

      ordersSnap.forEach(doc => {
        const data = doc.data();
        if (data.branchId === branchId && data.status === 'COMPLETED') { // Lọc theo branchId
          const totalAmount = data.totalAmount || data.total || 0; // Hỗ trợ cả 2 tên biến tổng tiền
          if (data.paymentMethod === 'CASH') {
            revCash += totalAmount;
          } else {
            revTrans += totalAmount;
          }
        }
      });

      return { revCash, revTrans };
    } catch (err) {
      console.error("Lỗi tính doanh thu:", err);
      return { revCash: 0, revTrans: 0 };
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleOpenShift = async () => {
    // Kiểm tra xem đã chấm công chưa (chỉ áp dụng cho thu ngân / nhân viên)
    if (userRole === 'CASHIER' || userRole === 'EMPLOYEE' || userRole === 'POS') {
      const empId = localStorage.getItem('employeeId');
      if (!empId) {
        toast.error('Tài khoản chưa liên kết với nhân viên. Vui lòng liên hệ Quản lý.');
        return;
      }
      try {
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-CA');
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA');
        
        const attQuery = query(
          collection(db, 'attendance'),
          where('date', '>=', yesterdayStr),
          where('date', '<=', todayStr)
        );
        const snap = await getDocs(attQuery);
        let hasActiveCheckIn = false;
        snap.forEach(doc => {
          const data = doc.data();
          if (data.employeeId === empId && data.checkIn && !data.checkOut) {
            hasActiveCheckIn = true;
          }
        });
        
        if (!hasActiveCheckIn) {
          toast.error('Bạn phải Chấm công (Check-in) trước khi được phép Mở ca!');
          return;
        }
      } catch (err) {
         console.error('Lỗi kiểm tra chấm công:', err);
         toast.error('Lỗi khi kiểm tra chấm công.');
         return;
      }
    }

    // Lấy số dư cuối ca của ca trước đó
    let autoStartCash = 0;
    let autoStartTransfer = 0;
    try {
      if (currentBranchId) {
        const prevShiftQ = query(
          collection(db, 'shift_reports'),
          where('branchId', '==', currentBranchId),
          where('status', '==', 'CLOSED')
        );
        const prevSnap = await getDocs(prevShiftQ);
        if (!prevSnap.empty) {
           const closedShifts = prevSnap.docs.map(d => d.data());
           closedShifts.sort((a, b) => {
              const timeA = a.endTime?.toMillis ? a.endTime.toMillis() : 0;
              const timeB = b.endTime?.toMillis ? b.endTime.toMillis() : 0;
              return timeB - timeA;
           });
           autoStartCash = closedShifts[0].endCash || 0;
           autoStartTransfer = closedShifts[0].endTransfer || 0;
        }
      }
    } catch (e) {
      console.error("Lỗi lấy số dư ca trước", e);
    }

    setModalMode('OPEN');
    setStartCash(autoStartCash);
    setStartTransfer(autoStartTransfer);
    setNotes('');
    setIsModalOpen(true);
  };

  const handlePrepareCloseShift = async () => {
    if (!activeShift) return;
    
    // Tạm tính doanh thu ngay lúc này
    const rev = await calculateRevenue(activeShift.startTime, new Date(), activeShift.branchId);
    setTempRevenueCash(rev.revCash);
    setTempRevenueTransfer(rev.revTrans);
    
    // Suggest end cash = start + revenue
    setEndCash(activeShift.startCash + rev.revCash);
    setEndTransfer(activeShift.startTransfer + rev.revTrans);
    
    setModalMode('CLOSE');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleEditShift = (shift: ShiftReport) => {
    setActiveShift(shift);
    setStartCash(shift.startCash);
    setStartTransfer(shift.startTransfer);
    setEndCash(shift.endCash || 0);
    setEndTransfer(shift.endTransfer || 0);
    setNotes(shift.notes || '');
    setEditingShiftId(shift.id);
    setModalMode('EDIT');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (modalMode === 'OPEN') {
        if (!currentBranchId) {
          toast.error('Lỗi: Không xác định được cơ sở');
          return;
        }
        let cashierDisplayName = currentUserEmail;
        if (currentEmployeeId) {
          const empDoc = await getDoc(doc(db, 'employees', currentEmployeeId));
          if (empDoc.exists()) {
            const empData = empDoc.data();
            const code = empData.employeeCode || empDoc.id;
            const name = empData.fullName || empData.name || '';
            cashierDisplayName = `${code} - ${name}`;
          }
        } else {
           const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', currentUserEmail)));
           cashierDisplayName = userSnap.empty ? currentUserEmail : (userSnap.docs[0].data().fullName || currentUserEmail);
        }

        await addDoc(collection(db, 'shift_reports'), {
          branchId: currentBranchId,
          cashierEmail: currentUserEmail,
          cashierName: cashierDisplayName,
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
        fetchData(true);
        closeModal();
      } else if (modalMode === 'CLOSE') {
        // Đóng ca
        if (!activeShift) return;
        const now = new Date();
        const rev = await calculateRevenue(activeShift.startTime, now, activeShift.branchId);
        
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
        fetchData(true);
        closeModal();
      } else if (modalMode === 'EDIT' && editingShiftId && activeShift) {
        const changes: string[] = [];
        
        if (activeShift.startCash !== startCash) {
          changes.push(`Tiền mặt đầu ca: ${activeShift.startCash} -> ${startCash}`);
        }
        if (activeShift.startTransfer !== startTransfer) {
          changes.push(`Tiền CK đầu ca: ${activeShift.startTransfer} -> ${startTransfer}`);
        }
        if (activeShift.endCash !== endCash) {
          changes.push(`Tiền mặt cuối ca: ${activeShift.endCash} -> ${endCash}`);
        }
        if (activeShift.endTransfer !== endTransfer) {
          changes.push(`Tiền CK cuối ca: ${activeShift.endTransfer} -> ${endTransfer}`);
        }
        if (activeShift.notes !== notes) {
          changes.push(`Ghi chú thay đổi`);
        }

        const editHistory = activeShift.editHistory || [];
        if (changes.length > 0) {
          let editorDisplayName = 'Quản trị viên (Admin)';
          if (userRole !== 'SUPER_ADMIN') {
            if (currentEmployeeId) {
              const empDoc = await getDoc(doc(db, 'employees', currentEmployeeId));
              if (empDoc.exists()) {
                const empData = empDoc.data();
                const code = empData.employeeCode || empDoc.id;
                const name = empData.fullName || empData.name || '';
                editorDisplayName = `${code} - ${name}`;
              }
            } else {
               const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', currentUserEmail)));
               editorDisplayName = userSnap.empty ? currentUserEmail : (userSnap.docs[0].data().fullName || currentUserEmail);
            }
          }

          editHistory.push({
            timestamp: new Date(),
            editorName: editorDisplayName,
            changes
          });
        }

        await updateDoc(doc(db, 'shift_reports', editingShiftId), {
          startCash,
          startTransfer,
          endCash,
          endTransfer,
          notes,
          editHistory
        });
        toast.success('Cập nhật ca thành công!');
        setActiveShift(null);
        setEditingShiftId(null);
        fetchData(true);
        closeModal();
      }
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
        fetchData(true);
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
                <th className="p-4 font-semibold text-gray-600 text-sm text-center w-12">STT</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Thời gian</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở / Thu ngân</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Tiền đầu ca (Mặt / CK)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Doanh thu trong ca (Mặt / CK)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Thực tế cuối ca (Mặt / CK)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Chênh lệch (Mặt / CK)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-center">Trạng thái</th>
                {(userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN') && (
                  <th className="p-4"></th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">Đang tải...</td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500 italic">Không có dữ liệu ca làm việc</td>
                </tr>
              ) : (
                reports.map((r, index) => {
                  const varianceCash = (r.endCash ?? 0) - (r.startCash + (r.revenueCash ?? 0));
                  const varianceTransfer = (r.endTransfer ?? 0) - (r.startTransfer + (r.revenueTransfer ?? 0));
                  return (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-sm text-center font-medium text-gray-500">{index + 1}</td>
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
                        <div className="text-green-600">{formatMoney(r.revenueCash || 0)}</div>
                        <div className="text-gray-500 text-xs">{formatMoney(r.revenueTransfer || 0)}</div>
                      </td>
                      <td className="p-4 text-sm font-medium">
                        <div className="text-gray-800">{r.status === 'CLOSED' ? formatMoney(r.endCash || 0) : '---'}</div>
                        <div className="text-gray-500 text-xs">{r.status === 'CLOSED' ? formatMoney(r.endTransfer || 0) : '---'}</div>
                      </td>
                      <td className="p-4">
                        {r.status === 'CLOSED' ? (
                          <div className="flex flex-col gap-1">
                            <span className={`px-2 py-1 inline-block text-center rounded text-[11px] font-bold ${varianceCash > 0 ? 'bg-blue-100 text-blue-700' : varianceCash < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              TM: {varianceCash > 0 ? '+' : ''}{formatMoney(varianceCash)}
                            </span>
                            <span className={`px-2 py-1 inline-block text-center rounded text-[11px] font-bold ${varianceTransfer > 0 ? 'bg-blue-100 text-blue-700' : varianceTransfer < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              CK: {varianceTransfer > 0 ? '+' : ''}{formatMoney(varianceTransfer)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">---</span>
                        )}
                        {r.notes && <div className="text-[10px] text-gray-500 mt-1 max-w-[150px] truncate" title={r.notes}>{r.notes}</div>}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${r.status === 'OPEN' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                          {r.status === 'OPEN' ? 'ĐANG MỞ' : 'ĐÃ CHỐT'}
                        </span>
                        {r.editHistory && r.editHistory.length > 0 && (
                          <div className="mt-2 text-[10px] text-gray-500 bg-gray-100 p-1 rounded max-w-[120px]">
                            <button 
                              onClick={() => setHistoryShift(r)}
                              className="cursor-pointer border-b border-dashed border-gray-400 hover:text-blue-600 transition-colors w-full text-left"
                            >
                              Đã sửa ({r.editHistory.length} lần)
                            </button>
                          </div>
                        )}
                      </td>
                      {(userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN') && (
                        <td className="p-4 text-right flex items-center justify-end gap-2">
                          <button onClick={() => handleEditShift(r)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors" title="Sửa báo cáo">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                          </button>
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
            <div className={`p-4 border-b flex justify-between items-center text-white ${modalMode === 'OPEN' ? 'bg-blue-600' : modalMode === 'EDIT' ? 'bg-orange-500' : 'bg-green-600'}`}>
              <h3 className="font-bold text-lg flex items-center">
                {modalMode === 'OPEN' ? <Plus size={20} className="mr-2" /> : modalMode === 'EDIT' ? <FileText size={20} className="mr-2" /> : <CheckCircle2 size={20} className="mr-2" />}
                {modalMode === 'OPEN' ? 'Mở ca làm việc mới' : modalMode === 'EDIT' ? 'Sửa thông tin ca' : 'Chốt ca làm việc'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              
              {modalMode === 'OPEN' || modalMode === 'EDIT' ? (
                <>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                    <p className="text-sm text-blue-800">Vui lòng kiểm tra và nhập chính xác số tiền quỹ đầu ca.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền mặt đầu ca (VNĐ)</label>
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
                  {modalMode === 'EDIT' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">Tiền mặt THỰC TẾ cuối ca</label>
                        <input 
                          type="text" 
                          value={endCash.toLocaleString('vi-VN')}
                          onChange={(e) => setEndCash(Number(e.target.value.replace(/[^0-9]/g, '')))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-lg font-bold text-gray-800"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tiền tài khoản cuối ca</label>
                        <input 
                          type="text" 
                          value={endTransfer.toLocaleString('vi-VN')}
                          onChange={(e) => setEndTransfer(Number(e.target.value.replace(/[^0-9]/g, '')))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-lg font-bold text-gray-800"
                        />
                      </div>
                    </>
                  )}
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

                  <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 grid grid-cols-2 gap-4 mb-6">
                    <div className="text-center">
                      <p className="text-xs text-yellow-800 mb-1">Tiền mặt lý thuyết</p>
                      <p className="text-lg font-bold text-yellow-700">{formatMoney((activeShift?.startCash || 0) + tempRevenueCash)}</p>
                    </div>
                    <div className="text-center border-l border-yellow-200">
                      <p className="text-xs text-yellow-800 mb-1">Tiền tài khoản lý thuyết</p>
                      <p className="text-lg font-bold text-yellow-700">{formatMoney((activeShift?.startTransfer || 0) + tempRevenueTransfer)}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tiền mặt THỰC TẾ cuối ca {modalMode === 'CLOSE' && <span className="text-red-500">*</span>}</label>
                    <input 
                      type="text" required
                      value={endCash.toLocaleString('vi-VN')}
                      onChange={(e) => setEndCash(Number(e.target.value.replace(/[^0-9]/g, '')))}
                      className="w-full px-4 py-2 border-2 border-green-500 rounded-xl outline-none focus:ring-4 focus:ring-green-100 text-lg font-bold text-gray-800 text-center"
                    />
                    
                    {/* Hiển thị chênh lệch Tiền mặt */}
                    {(() => {
                      const theoretical = (activeShift?.startCash || 0) + tempRevenueCash;
                      const variance = endCash - theoretical;
                      if (variance === 0) return <p className="text-xs text-green-600 mt-1 font-medium text-center">Khớp hoàn toàn!</p>;
                      return <p className={`text-xs mt-1 font-bold text-center ${variance > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {variance > 0 ? 'THỪA' : 'THIẾU'} {formatMoney(Math.abs(variance))}
                      </p>;
                    })()}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tiền tài khoản THỰC TẾ cuối ca</label>
                    <input 
                      type="text" 
                      value={endTransfer.toLocaleString('vi-VN')}
                      onChange={(e) => setEndTransfer(Number(e.target.value.replace(/[^0-9]/g, '')))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl outline-none focus:border-green-500 text-lg font-bold text-gray-800 text-center"
                    />
                    
                    {/* Hiển thị chênh lệch Chuyển khoản */}
                    {(() => {
                      const theoretical = (activeShift?.startTransfer || 0) + tempRevenueTransfer;
                      const variance = endTransfer - theoretical;
                      if (variance === 0) return <p className="text-xs text-green-600 mt-1 font-medium text-center">Khớp hoàn toàn!</p>;
                      return <p className={`text-xs mt-1 font-bold text-center ${variance > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {variance > 0 ? 'THỪA' : 'THIẾU'} {formatMoney(Math.abs(variance))}
                      </p>;
                    })()}
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú {(modalMode === 'CLOSE' || modalMode === 'EDIT') && '(Lý do chênh lệch/chỉnh sửa)'}</label>
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
                  className={`px-8 py-2.5 text-white rounded-xl font-bold transition-colors shadow-sm ${modalMode === 'OPEN' ? 'bg-blue-600 hover:bg-blue-700' : modalMode === 'EDIT' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  {modalMode === 'OPEN' ? 'Xác nhận Mở ca' : modalMode === 'EDIT' ? 'Lưu chỉnh sửa' : 'Hoàn tất Chốt ca'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Lịch sử chỉnh sửa */}
      {historyShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800">Lịch sử chỉnh sửa</h3>
              <button onClick={() => setHistoryShift(null)} className="text-gray-500 hover:text-red-500 transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
              {historyShift.editHistory && historyShift.editHistory.length > 0 ? (
                <div className="space-y-6">
                  {historyShift.editHistory.map((eh, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative">
                      <div className="absolute -left-2 top-4 w-4 h-4 bg-blue-100 rounded-full border-2 border-white shadow-sm"></div>
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-bold text-blue-700 text-sm">
                          {/* Fallback to editorEmail if editorName is undefined in old records */}
                          {(eh as any).editorName || (eh as any).editorEmail}
                        </p>
                        <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded">
                          {eh.timestamp.toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <ul className="space-y-1.5 mt-3">
                        {eh.changes.map((c, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start">
                            <span className="mr-2 text-blue-400 mt-0.5">•</span>
                            <span>{c.replace(/\b\d+\b/g, (m) => Number(m).toLocaleString('vi-VN'))}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500">Chưa có lịch sử chỉnh sửa.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftHandovers;
