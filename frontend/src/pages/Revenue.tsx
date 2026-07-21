import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { CircleDollarSign, Receipt, TrendingUp, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

interface Order {
  id: string;
  orderCode?: string;
  items: any[];
  totalAmount: number;
  createdAt: any;
  cashierEmail: string;
  employeeId: string;
  status: string;
  branchId?: string;
  type?: 'INCOME' | 'EXPENSE';
  note?: string;
}

interface Branch {
  id: string;
  name: string;
  address?: string;
}

const Revenue: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<'day'|'week'|'month'>('day');
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [cashierNameMap, setCashierNameMap] = useState<Record<string, string>>({});
  const [branchAddressMap, setBranchAddressMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [billModalData, setBillModalData] = useState<any | null>(null);

  // Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseReason, setExpenseReason] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const userRole = localStorage.getItem('userRole');
  const userBranchId = localStorage.getItem('branchId');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Branches
        const branchSnap = await getDocs(collection(db, 'branches'));
        const branchList: Branch[] = [];
        const branchMap: Record<string, string> = {};
        const addressMap: Record<string, string> = {};
        branchSnap.forEach(doc => {
          branchList.push({ id: doc.id, name: doc.data().name, address: doc.data().address });
          branchMap[doc.id] = doc.data().name;
          if (doc.data().address) addressMap[doc.id] = doc.data().address;
        });
        setBranches(branchList);
        setBranchAddressMap(addressMap);

        // Fetch Users & Employees for Cashier Name Mapping
        const userSnap = await getDocs(collection(db, 'users'));
        const userEmailMap: Record<string, string> = {};
        userSnap.forEach(doc => {
          const data = doc.data();
          if (data.email && data.employeeId) {
            userEmailMap[data.email] = data.employeeId;
          }
        });

        const empSnap = await getDocs(collection(db, 'employees'));
        const nameMap: Record<string, string> = {};
        empSnap.forEach(doc => {
          const data = doc.data();
          const name = data.fullName;
          if (data.email) nameMap[data.email] = name;
          // Also map by user email if linked
          const userEmail = Object.keys(userEmailMap).find(email => userEmailMap[email] === doc.id);
          if (userEmail) nameMap[userEmail] = name;
        });
        setCashierNameMap(nameMap);

        // Fetch Orders
        const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          branchName: doc.data().branchId ? branchMap[doc.data().branchId] || 'Chưa rõ' : 'Chưa rõ'
        } as Order & { branchName: string }));
        setOrders(list);
      } catch (error) {
        console.error(error);
        toast.error('Lỗi khi tải dữ liệu doanh thu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [showExpenseModal]); // Refetch when modal closes to update list

  const filteredOrders = orders.filter(o => {
    if (userRole !== 'SUPER_ADMIN' && o.branchId !== userBranchId) {
      return false;
    }
    if (userRole === 'SUPER_ADMIN' && selectedBranch !== 'all' && o.branchId !== selectedBranch) {
      return false;
    }

    if (!o.createdAt) return false;
    
    const orderDate = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);

    if (filterMode === 'day') {
      const startOfDay = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);
      return orderDate >= startOfDay && orderDate < endOfDay;
    }
    if (filterMode === 'week') {
      const day = refDate.getDay() === 0 ? 7 : refDate.getDay();
      const startOfWeek = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() - day + 1);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      return orderDate >= startOfWeek && orderDate < endOfWeek;
    }
    if (filterMode === 'month') {
      const startOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      const endOfMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);
      return orderDate >= startOfMonth && orderDate < endOfMonth;
    }

    return true;
  });

  const navigateDate = (dir: number) => {
    const newDate = new Date(refDate);
    if (filterMode === 'day') {
      newDate.setDate(newDate.getDate() + dir);
    } else if (filterMode === 'week') {
      newDate.setDate(newDate.getDate() + dir * 7);
    } else if (filterMode === 'month') {
      newDate.setMonth(newDate.getMonth() + dir);
    }
    setRefDate(newDate);
  };

  const renderDateDisplay = () => {
    if (filterMode === 'day') {
      const dateStr = refDate.toLocaleDateString('en-CA');
      return (
        <input 
          type="date"
          value={dateStr}
          onChange={(e) => {
            if (e.target.value) setRefDate(new Date(e.target.value));
          }}
          className="border-none outline-none bg-transparent text-sm font-medium text-gray-700 cursor-pointer w-full text-center"
        />
      );
    }
    if (filterMode === 'week') {
      const day = refDate.getDay() === 0 ? 7 : refDate.getDay();
      const start = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() - day + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return (
        <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
          {start.toLocaleDateString('vi-VN', {day: '2-digit', month: '2-digit'})} - {end.toLocaleDateString('vi-VN')}
        </span>
      );
    }
    if (filterMode === 'month') {
      const monthStr = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}`;
      return (
        <input 
          type="month"
          value={monthStr}
          onChange={(e) => {
            if (e.target.value) {
              const [y, m] = e.target.value.split('-');
              setRefDate(new Date(parseInt(y), parseInt(m) - 1, 1));
            }
          }}
          className="border-none outline-none bg-transparent text-sm font-medium text-gray-700 cursor-pointer w-full text-center"
        />
      );
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseReason.trim() || !expenseAmount) return;

    setIsSubmittingExpense(true);
    try {
      const expenseData = {
        orderCode: 'CHI-' + Date.now().toString().slice(-6),
        items: [{ name: expenseReason, quantity: 1, price: Number(expenseAmount) }],
        totalAmount: Number(expenseAmount),
        createdAt: serverTimestamp(),
        cashierEmail: auth.currentUser?.email || 'Unknown',
        employeeId: 'Unknown',
        status: 'COMPLETED',
        branchId: selectedBranch !== 'all' ? selectedBranch : (userBranchId || null),
        type: 'EXPENSE',
        note: expenseNote
      };

      await addDoc(collection(db, 'orders'), expenseData);
      toast.success('Đã tạo phiếu chi');
      setShowExpenseModal(false);
      setExpenseReason('');
      setExpenseAmount('');
      setExpenseNote('');
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi tạo phiếu chi');
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const incomeOrders = filteredOrders.filter(o => o.type !== 'EXPENSE');
  const expenseOrders = filteredOrders.filter(o => o.type === 'EXPENSE');

  const totalIncome = incomeOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalExpense = expenseOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const profit = totalIncome - totalExpense;
  
  const totalOrders = incomeOrders.length;
  
  // Calculate today's stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOrders = filteredOrders.filter(o => {
    if (!o.createdAt) return false;
    const date = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
    return date >= today;
  });
  
  const todayIncome = todayOrders.filter(o => o.type !== 'EXPENSE').reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const todayExpense = todayOrders.filter(o => o.type === 'EXPENSE').reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const todayProfit = todayIncome - todayExpense;

  if (loading) return <div className="p-8 text-center text-gray-500">Đang tải dữ liệu doanh thu...</div>;

  return (
    <div className="p-6 flex flex-col bg-gray-50 min-h-full">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Báo cáo Doanh thu & Hóa đơn</h1>
          <p className="text-gray-500 mt-1">Quản lý lịch sử bán hàng và dòng tiền</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Thời gian:</label>
            <select 
              value={filterMode}
              onChange={(e) => {
                setFilterMode(e.target.value as any);
                setRefDate(new Date());
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-700 min-w-[130px]"
            >
              <option value="day">Theo ngày</option>
              <option value="week">Theo tuần</option>
              <option value="month">Theo tháng</option>
            </select>
            
            <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-lg px-1 py-1 h-[42px]">
              <button onClick={() => navigateDate(-1)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600 transition-colors">
                <ChevronLeft size={18} />
              </button>
              
              <div className="px-2 flex items-center justify-center min-w-[130px]">
                 {renderDateDisplay()}
              </div>

              <button onClick={() => navigateDate(1)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          
          {userRole === 'SUPER_ADMIN' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">Cơ sở:</label>
              <select 
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-700 min-w-[200px]"
              >
                <option value="all">Tất cả cơ sở</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowExpenseModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm transition-colors font-medium ml-2"
          >
            <Plus size={18} />
            <span>Thêm Phiếu Chi</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
            <CircleDollarSign size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Tổng Thu</p>
            <h3 className="text-2xl font-black text-blue-600">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalIncome)}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center text-red-600">
            <FileText size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Tổng Chi</p>
            <h3 className="text-2xl font-black text-red-600">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalExpense)}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-green-600">
            <TrendingUp size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Lợi Nhuận</p>
            <h3 className="text-2xl font-black text-green-600">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(profit)}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
            <Receipt size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Số Hóa đơn Bán</p>
            <h3 className="text-2xl font-black text-gray-800">
              {totalOrders} <span className="text-base font-normal text-gray-500">đơn</span>
            </h3>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-8">
        <div className="p-5 border-b border-gray-100 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-800">Lịch sử Hóa đơn gần đây</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
              <tr>
                <th className="p-4 font-semibold text-gray-600">STT</th>
                <th className="p-4 font-semibold text-gray-600">Mã Đơn</th>
                <th className="p-4 font-semibold text-gray-600">Cơ sở</th>
                <th className="p-4 font-semibold text-gray-600">Thời gian</th>
                <th className="p-4 font-semibold text-gray-600">Thu ngân</th>
                <th className="p-4 font-semibold text-gray-600">Chi tiết món</th>
                <th className="p-4 font-semibold text-gray-600 text-right">Tổng tiền</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500 italic">Chưa có hóa đơn nào</td></tr>
              ) : (
                filteredOrders.map((order, index) => {
                  const dateObj = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                  const dateStr = !isNaN(dateObj.getTime()) ? `${dateObj.toLocaleDateString('vi-VN')} ${dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Chưa rõ';
                  let cashierName = 'null';
                  if (order.cashierEmail && order.cashierEmail !== 'null') {
                    if (order.cashierEmail.includes('@')) {
                      cashierName = cashierNameMap[order.cashierEmail] || 'null';
                    } else {
                      cashierName = order.cashierEmail;
                    }
                  }
                  
                  const isExpense = order.type === 'EXPENSE';
                  
                  return (
                    <tr 
                      key={order.id} 
                      onClick={() => !isExpense && setBillModalData({ ...order, cashierName, branchAddress: order.branchId ? branchAddressMap[order.branchId] : null })}
                      className={`border-b border-gray-100 transition-colors ${isExpense ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50 cursor-pointer'}`}
                    >
                      <td className="p-4 text-gray-600 font-medium">{filteredOrders.length - index}</td>
                      <td className={`p-4 font-mono font-medium ${isExpense ? 'text-red-600' : 'text-blue-600'}`}>
                        {isExpense && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs mr-2 font-bold">[CHI]</span>}
                        #{order.orderCode || order.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="p-4 text-gray-600">{(order as any).branchName}</td>
                      <td className="p-4 text-gray-600 flex items-center gap-2">
                        <CalendarIcon size={14} className="text-gray-400" />
                        {dateStr}
                      </td>
                      <td className="p-4 text-gray-600">{cashierName}</td>
                      <td className="p-4 text-sm text-gray-500 max-w-xs truncate">
                        {order.items?.map(i => isExpense ? i.name : `${i.quantity}x ${i.name}`).join(', ')}
                        {order.note && <span className="block text-xs text-gray-400 mt-0.5">Ghi chú: {order.note}</span>}
                      </td>
                      <td className={`p-4 font-bold text-right text-lg ${isExpense ? 'text-red-600' : 'text-gray-800'}`}>
                        {isExpense ? '-' : ''}{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.totalAmount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Xuất Bill */}
      {billModalData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-w-md w-full max-h-[90vh]">
            <div className="p-6 bg-blue-500 text-white flex flex-col items-center justify-center pb-8 rounded-b-[40px] shadow-sm z-10 relative">
              <button
                onClick={() => setBillModalData(null)}
                className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-3 shadow-lg">
                <Receipt size={32} className="text-blue-500" />
              </div>
              <h2 className="text-2xl font-black mb-1">Chi tiết Hóa đơn</h2>
              <p className="text-blue-100 font-medium">#{billModalData.orderCode || billModalData.id.slice(-6).toUpperCase()}</p>
            </div>

            <div className="flex-1 overflow-auto bg-gray-50 p-6 -mt-6 pt-10">
              <div id="bill-receipt" className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm font-mono text-sm text-gray-800">
                <div className="text-center mb-6">
                  <h1 className="text-xl font-bold mb-1 uppercase">TIỆM NHÀ BƠ</h1>
                  <p className="text-gray-500 text-xs">HÓA ĐƠN THANH TOÁN</p>
                </div>

                <div className="border-t border-b border-dashed border-gray-300 py-3 mb-4 space-y-1 text-xs">
                  <div className="flex justify-between"><span>Mã ĐH:</span> <strong>#{billModalData.orderCode || billModalData.id.slice(-6).toUpperCase()}</strong></div>
                  <div className="flex justify-between">
                    <span>Ngày:</span> 
                    <strong>
                      {(() => {
                        const dateObj = billModalData.createdAt?.toDate ? billModalData.createdAt.toDate() : new Date(billModalData.createdAt);
                        return !isNaN(dateObj.getTime()) ? `${dateObj.toLocaleDateString('vi-VN')} ${dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Chưa rõ';
                      })()}
                    </strong>
                  </div>
                  <div className="flex justify-between"><span>Cơ sở:</span> <strong>{billModalData.branchName}</strong></div>
                  <div className="flex justify-between"><span>Thu ngân:</span> <strong>{billModalData.cashierName}</strong></div>
                </div>

                <table className="w-full mb-4 text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-2 w-1/2">Tên món</th>
                      <th className="py-2 text-center">SL</th>
                      <th className="py-2 text-right">Đơn giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billModalData.items?.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b border-dashed border-gray-100">
                        <td className="py-2 pr-2 font-medium">{item.name}</td>
                        <td className="py-2 text-center">{item.quantity}</td>
                        <td className="py-2 text-right">{new Intl.NumberFormat('vi-VN').format(item.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-300 font-bold text-lg">
                  <span>TỔNG CỘNG:</span>
                  <span>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(billModalData.totalAmount)}</span>
                </div>

                <div className="mt-4 pt-4 border-t border-dashed border-gray-300 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Hình thức:</span>
                    <strong>{billModalData.paymentMethod === 'CASH' ? 'Tiền mặt' : billModalData.paymentMethod === 'TRANSFER' ? 'Chuyển khoản' : 'Không xác định'}</strong>
                  </div>
                  {billModalData.paymentMethod === 'CASH' && (
                    <>
                      <div className="flex justify-between">
                        <span>Khách đưa:</span>
                        <strong>{new Intl.NumberFormat('vi-VN').format(billModalData.amountTendered || 0)} đ</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Tiền trả lại:</span>
                        <strong>{new Intl.NumberFormat('vi-VN').format(billModalData.changeAmount || 0)} đ</strong>
                      </div>
                    </>
                  )}
                </div>
                
                {billModalData.branchAddress && (
                  <div className="text-left mt-4 text-xs text-gray-600 border-t border-dashed border-gray-300 pt-4">
                    <p>Địa chỉ: {billModalData.branchAddress}</p>
                  </div>
                )}

                <div className="text-center mt-4 text-xs text-gray-500">
                  <p>Cảm ơn quý khách đã ủng hộ!</p>
                  <p>Hẹn gặp lại</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setBillModalData(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-slide-up">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-red-50 rounded-t-2xl">
              <div className="flex items-center gap-3 text-red-600">
                <FileText size={24} />
                <h2 className="text-xl font-bold">Thêm Phiếu Chi</h2>
              </div>
            </div>
            
            <form onSubmit={handleAddExpense} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Lý do chi (VD: Nhập đá, Trả tiền điện...)</label>
                  <input
                    type="text"
                    value={expenseReason}
                    onChange={(e) => setExpenseReason(e.target.value)}
                    placeholder="Nhập lý do chi..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Số tiền chi (VNĐ)</label>
                  <input
                    type="number"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="Nhập số tiền..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    required
                    min="1000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Ghi chú thêm (Không bắt buộc)</label>
                  <textarea
                    value={expenseNote}
                    onChange={(e) => setExpenseNote(e.target.value)}
                    placeholder="Ghi chú chi tiết (nếu có)..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none min-h-[80px]"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                  disabled={isSubmittingExpense}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense || !expenseReason || !expenseAmount}
                  className="flex-1 py-3 px-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:bg-gray-300 disabled:shadow-none"
                >
                  {isSubmittingExpense ? 'Đang lưu...' : 'Lưu Phiếu Chi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Revenue;
