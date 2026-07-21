import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { CircleDollarSign, Receipt, TrendingUp, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, FileText, Trash2, Edit2, Minus, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  isAvailable: boolean;
}

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
  editCount?: number;
  lastEditedBy?: string;
  editHistory?: { editedAt: string; editedBy: string; oldAmount?: number; newAmount?: number; note?: string }[];
  deletedBy?: string;
  deletedAt?: string;
}

interface Branch {
  id: string;
  name: string;
  address?: string;
}

const Revenue: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const userRole = localStorage.getItem('userRole');
  const userBranchId = localStorage.getItem('branchId');
  const [selectedBranch, setSelectedBranch] = useState<string>(userRole === 'SUPER_ADMIN' ? 'all' : (userBranchId || 'all'));
  const [filterMode, setFilterMode] = useState<'day'|'week'|'month'>('day');
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [cashierNameMap, setCashierNameMap] = useState<Record<string, string>>({});
  const [branchAddressMap, setBranchAddressMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [billModalData, setBillModalData] = useState<any | null>(null);
  const [isEditBillMode, setIsEditBillMode] = useState(false);
  const [billEditItems, setBillEditItems] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedItemToAdd, setSelectedItemToAdd] = useState<string>('');
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, requireInput?: boolean, onConfirm: (input?: string) => void} | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

  // Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseReason, setExpenseReason] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);



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

        // Fetch Menu Items
        const menuSnap = await getDocs(collection(db, 'menu_items'));
        const mItems = menuSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
        setMenuItems(mItems);
      } catch (error) {
        console.error(error);
        toast.error('Lỗi khi tải dữ liệu doanh thu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [showExpenseModal, billModalData === null]); // Refetch when modal closes to update list

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
      const editorName = userRole === 'SUPER_ADMIN' ? 'Admin' : `${localStorage.getItem('employeeId') || ''} - ${cashierNameMap[auth.currentUser?.email || ''] || 'Quản lý'}`.replace(/^ - | - $/g, '');

      if (editingExpenseId) {
        const expenseRef = doc(db, 'orders', editingExpenseId);
        const existingOrder = orders.find(o => o.id === editingExpenseId);
        const newCount = (existingOrder?.editCount || 0) + 1;
        
        const newHistory = [...(existingOrder?.editHistory || []), { 
          editedAt: new Date().toISOString(), 
          editedBy: editorName,
          oldAmount: existingOrder?.totalAmount || 0,
          newAmount: Number(expenseAmount.replace(/\./g, ''))
        }];

        await updateDoc(expenseRef, {
          items: [{ name: expenseReason, quantity: 1, price: Number(expenseAmount.replace(/\./g, '')) }],
          totalAmount: Number(expenseAmount.replace(/\./g, '')),
          note: expenseNote,
          editCount: newCount,
          lastEditedBy: editorName,
          editHistory: newHistory
        });
        toast.success('Đã cập nhật phiếu chi');
      } else {
        if (selectedBranch === 'all' && branches.length > 0) {
          const promises = branches.map(async (branch, idx) => {
            const expenseData = {
              orderCode: 'CHI-' + (Date.now() + idx).toString().slice(-6),
              items: [{ name: expenseReason, quantity: 1, price: Number(expenseAmount.replace(/\./g, '')) }],
              totalAmount: Number(expenseAmount.replace(/\./g, '')),
              createdAt: serverTimestamp(),
              cashierEmail: editorName,
              employeeId: localStorage.getItem('employeeId') || 'Unknown',
              status: 'COMPLETED',
              branchId: branch.id,
              type: 'EXPENSE',
              note: expenseNote,
              editCount: 0
            };
            return addDoc(collection(db, 'orders'), expenseData);
          });
          await Promise.all(promises);
          toast.success(`Đã tạo ${branches.length} phiếu chi cho tất cả cơ sở`);
        } else {
          const expenseData = {
            orderCode: 'CHI-' + Date.now().toString().slice(-6),
            items: [{ name: expenseReason, quantity: 1, price: Number(expenseAmount.replace(/\./g, '')) }],
            totalAmount: Number(expenseAmount.replace(/\./g, '')),
            createdAt: serverTimestamp(),
            cashierEmail: editorName,
            employeeId: localStorage.getItem('employeeId') || 'Unknown',
            status: 'COMPLETED',
            branchId: selectedBranch !== 'all' ? selectedBranch : (userBranchId || null),
            type: 'EXPENSE',
            note: expenseNote,
            editCount: 0
          };
          await addDoc(collection(db, 'orders'), expenseData);
          toast.success('Đã tạo phiếu chi');
        }
      }
      
      setShowExpenseModal(false);
      setEditingExpenseId(null);
      setExpenseReason('');
      setExpenseAmount('');
      setExpenseNote('');
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi lưu phiếu chi');
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const openEditExpense = (expense: Order) => {
    if (userRole === 'POS') return; // Only managers/admins can edit
    setExpenseReason(expense.items[0]?.name || '');
    setExpenseAmount(new Intl.NumberFormat('vi-VN').format(expense.totalAmount));
    setExpenseNote(expense.note || '');
    setEditingExpenseId(expense.id);
    setShowExpenseModal(true);
  };

  const handleDeleteBill = () => {
    if (!billModalData) return;
    setConfirmInput('');
    setConfirmDialog({
      isOpen: true,
      requireInput: true,
      message: 'Bạn có chắc chắn muốn XÓA hóa đơn này không? Vui lòng nhập lý do xóa để ghi nhận vào lịch sử.',
      onConfirm: async (reason?: string) => {
        try {
          const editorName = userRole === 'SUPER_ADMIN' ? 'Admin' : `${localStorage.getItem('employeeId') || ''} - ${cashierNameMap[auth.currentUser?.email || ''] || 'Quản lý'}`.replace(/^ - | - $/g, '');
          const newCount = (billModalData.editCount || 0) + 1;
          const newHistory = [...(billModalData.editHistory || []), { 
            editedAt: new Date().toISOString(), 
            editedBy: editorName,
            oldAmount: billModalData.totalAmount,
            newAmount: 0,
            note: `XÓA - Lý do: ${reason || 'Không có'}`
          }];
          
          await updateDoc(doc(db, 'orders', billModalData.id), {
            totalAmount: 0,
            deletedBy: editorName,
            deletedAt: new Date().toISOString(),
            editCount: newCount,
            editHistory: newHistory
          });
          toast.success('Đã xóa hóa đơn');
          setBillModalData(null);
        } catch (error) {
          console.error(error);
          toast.error('Lỗi khi xóa hóa đơn');
        }
      }
    });
  };

  const handleDeleteExpense = () => {
    if (!editingExpenseId) return;
    setConfirmInput('');
    setConfirmDialog({
      isOpen: true,
      requireInput: true,
      message: 'Bạn có chắc chắn muốn XÓA phiếu chi này không? Vui lòng nhập lý do xóa để ghi nhận vào lịch sử.',
      onConfirm: async (reason?: string) => {
        try {
          const editorName = userRole === 'SUPER_ADMIN' ? 'Admin' : `${localStorage.getItem('employeeId') || ''} - ${cashierNameMap[auth.currentUser?.email || ''] || 'Quản lý'}`.replace(/^ - | - $/g, '');
          const existingOrder = orders.find(o => o.id === editingExpenseId);
          const newCount = (existingOrder?.editCount || 0) + 1;
          const newHistory = [...(existingOrder?.editHistory || []), { 
            editedAt: new Date().toISOString(), 
            editedBy: editorName,
            oldAmount: existingOrder?.totalAmount || 0,
            newAmount: 0,
            note: `XÓA - Lý do: ${reason || 'Không có'}`
          }];
          
          await updateDoc(doc(db, 'orders', editingExpenseId), {
            totalAmount: 0,
            deletedBy: editorName,
            deletedAt: new Date().toISOString(),
            editCount: newCount,
            editHistory: newHistory
          });
          toast.success('Đã xóa phiếu chi');
          setShowExpenseModal(false);
          setEditingExpenseId(null);
          setExpenseReason('');
          setExpenseAmount('');
          setExpenseNote('');
        } catch (error) {
          console.error(error);
          toast.error('Lỗi khi xóa phiếu chi');
        }
      }
    });
  };

  const handleSaveBillEdit = async () => {
    if (!billModalData) return;
    try {
      const newTotal = billEditItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const newEditCount = (billModalData.editCount || 0) + 1;
      const editorName = userRole === 'SUPER_ADMIN' ? 'Admin' : `${localStorage.getItem('employeeId') || ''} - ${cashierNameMap[auth.currentUser?.email || ''] || 'Quản lý'}`.replace(/^ - | - $/g, '');
      const newHistory = [...(billModalData.editHistory || []), { 
        editedAt: new Date().toISOString(), 
        editedBy: editorName,
        oldAmount: billModalData.totalAmount,
        newAmount: newTotal
      }];

      await updateDoc(doc(db, 'orders', billModalData.id), {
        items: billEditItems,
        totalAmount: newTotal,
        editCount: newEditCount,
        lastEditedBy: editorName,
        editHistory: newHistory
      });
      toast.success('Đã lưu thay đổi hóa đơn');
      setBillModalData({ ...billModalData, items: billEditItems, totalAmount: newTotal, editCount: newEditCount, lastEditedBy: editorName, editHistory: newHistory });
      setIsEditBillMode(false);
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi lưu hóa đơn');
    }
  };

  const handleBillItemQuantity = (index: number, delta: number) => {
    const newItems = [...billEditItems];
    newItems[index].quantity += delta;
    if (newItems[index].quantity <= 0) {
      newItems.splice(index, 1);
    }
    setBillEditItems(newItems);
  };

  const handleAddBillItem = () => {
    if (!selectedItemToAdd) return;
    const menuItem = menuItems.find(i => i.id === selectedItemToAdd);
    if (menuItem) {
      const existingItemIndex = billEditItems.findIndex(i => i.id === menuItem.id || i.menuItemId === menuItem.id);
      if (existingItemIndex >= 0) {
        handleBillItemQuantity(existingItemIndex, 1);
      } else {
        setBillEditItems([...billEditItems, { ...menuItem, menuItemId: menuItem.id, quantity: 1 }]);
      }
    }
    setSelectedItemToAdd('');
  };

  const incomeOrders = filteredOrders.filter(o => o.type !== 'EXPENSE');
  const expenseOrders = filteredOrders.filter(o => o.type === 'EXPENSE');

  const formatEditorName = (editor: string | undefined) => {
    if (!editor) return '';
    if (!editor.includes('@')) return editor;
    if (editor === 'admin@gmail.com' || editor.toLowerCase().includes('admin')) return 'Admin';
    return cashierNameMap[editor] || 'Quản lý';
  };

  const totalIncome = incomeOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalExpense = expenseOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const profit = totalIncome - totalExpense;
  
  const totalOrders = incomeOrders.length;
  



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
            onClick={() => {
              setEditingExpenseId(null);
              setExpenseReason('');
              setExpenseAmount('');
              setExpenseNote('');
              setShowExpenseModal(true);
            }}
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
            <p className="text-sm font-medium text-gray-500 mb-1">Thực thu</p>
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
                  const canEdit = isExpense && userRole !== 'POS' && !order.deletedBy;
                  
                  return (
                    <tr 
                      key={order.id} 
                      onClick={() => {
                        if (canEdit) openEditExpense(order);
                        else {
                          setBillModalData({ ...order, cashierName, branchAddress: order.branchId ? branchAddressMap[order.branchId] : null });
                          setIsEditBillMode(false);
                        }
                      }}
                      className={`border-b border-gray-100 transition-colors ${isExpense ? 'bg-red-50' : 'hover:bg-gray-50'} cursor-pointer ${canEdit ? 'hover:bg-red-100' : ''} ${order.deletedBy ? 'opacity-70' : ''}`}
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
                        {order.deletedBy && (
                          <span className="block text-[11px] text-red-500 font-bold mt-1">
                            (Đã xóa bởi {formatEditorName(order.deletedBy)})
                          </span>
                        )}
                        {!order.deletedBy && order.editCount && order.editCount > 0 ? (
                          <span className="block text-[10px] text-gray-400 font-medium mt-1">
                            (Đã sửa {order.editCount} lần - Xem chi tiết)
                          </span>
                        ) : null}
                      </td>
                      <td className={`p-4 font-bold text-right text-lg ${isExpense ? 'text-red-600' : 'text-gray-800'} ${order.deletedBy ? 'line-through text-gray-400' : ''}`}>
                        {isExpense && !order.deletedBy ? '-' : ''}{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.totalAmount)}
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
              <h2 className="text-2xl font-black mb-1">
                {billModalData.type === 'EXPENSE' ? 'Chi tiết Phiếu Chi' : 'Chi tiết Hóa đơn'}
              </h2>
              <p className="text-blue-100 font-medium">#{billModalData.orderCode || billModalData.id.slice(-6).toUpperCase()}</p>
            </div>

            <div className="flex-1 overflow-auto bg-gray-50 p-6 -mt-6 pt-10">
              <div id="bill-receipt" className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm font-mono text-sm text-gray-800">
                <div className="text-center mb-6">
                  <h1 className="text-xl font-bold mb-1 uppercase">TIỆM NHÀ BƠ</h1>
                  <p className="text-gray-500 text-xs">{billModalData.type === 'EXPENSE' ? 'PHIẾU CHI' : 'HÓA ĐƠN THANH TOÁN'}</p>
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
                      {isEditBillMode && <th className="py-2 text-right w-8"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(isEditBillMode ? billEditItems : billModalData.items)?.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b border-dashed border-gray-100">
                        <td className="py-2 pr-2 font-medium">{item.name}</td>
                        <td className="py-2 text-center">
                          {isEditBillMode ? (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleBillItemQuantity(idx, -1)} className="p-0.5 bg-gray-100 rounded text-gray-600 hover:bg-gray-200"><Minus size={12} /></button>
                              <span className="w-4 text-center">{item.quantity}</span>
                              <button onClick={() => handleBillItemQuantity(idx, 1)} className="p-0.5 bg-gray-100 rounded text-gray-600 hover:bg-gray-200"><Plus size={12} /></button>
                            </div>
                          ) : (
                            item.quantity
                          )}
                        </td>
                        <td className="py-2 text-right">{new Intl.NumberFormat('vi-VN').format(item.price)}</td>
                        {isEditBillMode && (
                          <td className="py-2 text-right">
                            <button onClick={() => {
                              const newItems = [...billEditItems];
                              newItems.splice(idx, 1);
                              setBillEditItems(newItems);
                            }} className="text-red-500 hover:text-red-700 p-0.5"><X size={14} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {isEditBillMode && (
                  <div className="mb-4 flex gap-2">
                    <select
                      value={selectedItemToAdd}
                      onChange={(e) => setSelectedItemToAdd(e.target.value)}
                      className="flex-1 border border-gray-300 rounded p-1 text-sm outline-none"
                    >
                      <option value="">-- Chọn món để thêm --</option>
                      {menuItems.filter(m => m.isAvailable).map(m => (
                        <option key={m.id} value={m.id}>{m.name} - {new Intl.NumberFormat('vi-VN').format(m.price)}đ</option>
                      ))}
                    </select>
                    <button onClick={handleAddBillItem} className="bg-blue-600 text-white px-2 py-1 rounded text-sm hover:bg-blue-700 font-medium whitespace-nowrap">Thêm</button>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-300 font-bold text-lg">
                  <span>TỔNG CỘNG:</span>
                  <span>
                    {isEditBillMode 
                      ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(billEditItems.reduce((sum, item) => sum + (item.price * item.quantity), 0))
                      : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(billModalData.totalAmount)
                    }
                  </span>
                </div>

                {!isEditBillMode && billModalData.editCount && billModalData.editCount > 0 && (
                  <div className="mt-4 pt-3 border-t border-dashed border-gray-300 text-xs">
                    <p className="font-semibold text-gray-700 mb-1">Lịch sử chỉnh sửa ({billModalData.editCount} lần):</p>
                    <ul className="space-y-1 text-gray-500">
                      {(() => {
                        const history = [];
                        const missingCount = billModalData.editCount - (billModalData.editHistory?.length || 0);
                        for (let i = 0; i < missingCount; i++) {
                          history.push({ editedAt: null, editedBy: billModalData.lastEditedBy });
                        }
                        if (billModalData.editHistory) history.push(...billModalData.editHistory);
                        
                        return history.map((h: any, i: number) => (
                          <li key={i}>
                            - Lần {i + 1}: {h.editedAt ? new Date(h.editedAt).toLocaleString('vi-VN') : 'Trước đây'} bởi <strong>{formatEditorName(h.editedBy)}</strong>
                            {h.oldAmount !== undefined && h.newAmount !== undefined && (
                              <span className="block text-gray-400 ml-3">
                                {h.note?.startsWith('XÓA') 
                                  ? `(${h.note}, giảm từ ${new Intl.NumberFormat('vi-VN').format(h.oldAmount)}đ)` 
                                  : `(Sửa từ ${new Intl.NumberFormat('vi-VN').format(h.oldAmount)}đ -> ${new Intl.NumberFormat('vi-VN').format(h.newAmount)}đ)`}
                              </span>
                            )}
                          </li>
                        ));
                      })()}
                    </ul>
                  </div>
                )}

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
              {isEditBillMode ? (
                <>
                  <button
                    onClick={() => setIsEditBillMode(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    Hủy sửa
                  </button>
                  <button
                    onClick={handleSaveBillEdit}
                    className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors"
                  >
                    Lưu Hóa đơn
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setBillModalData(null)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    Đóng
                  </button>
                  {userRole !== 'POS' && (
                    <>
                      <button
                        onClick={() => handleDeleteBill()}
                        className="py-3 px-4 bg-red-100 text-red-600 font-bold rounded-xl hover:bg-red-200 transition-colors flex items-center justify-center"
                        title="Xóa hóa đơn"
                      >
                        <Trash2 size={20} />
                      </button>
                      <button
                        onClick={() => {
                          setBillEditItems(JSON.parse(JSON.stringify(billModalData.items || [])));
                          setIsEditBillMode(true);
                        }}
                        className="py-3 px-4 bg-blue-100 text-blue-600 font-bold rounded-xl hover:bg-blue-200 transition-colors flex items-center justify-center"
                        title="Sửa hóa đơn"
                      >
                        <Edit2 size={20} />
                      </button>
                    </>
                  )}
                </>
              )}
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
                <h2 className="text-xl font-bold">{editingExpenseId ? 'Sửa Phiếu Chi' : 'Thêm Phiếu Chi'}</h2>
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
                    type="text"
                    inputMode="numeric"
                    value={expenseAmount}
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/\D/g, '');
                      const formattedValue = rawValue ? new Intl.NumberFormat('vi-VN').format(Number(rawValue)) : '';
                      setExpenseAmount(formattedValue);
                    }}
                    placeholder="Nhập số tiền..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    required
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
                {editingExpenseId && (() => {
                  const editingOrder = orders.find(o => o.id === editingExpenseId);
                  if (editingOrder?.editCount && editingOrder.editCount > 0) {
                    return (
                      <div className="mt-4 pt-3 border-t border-dashed border-gray-300 text-xs">
                        <p className="font-semibold text-gray-700 mb-1">Lịch sử chỉnh sửa ({editingOrder.editCount} lần):</p>
                        <ul className="space-y-1 text-gray-500">
                          {(() => {
                            const history = [];
                            const missingCount = editingOrder.editCount - (editingOrder.editHistory?.length || 0);
                            for (let i = 0; i < missingCount; i++) {
                              history.push({ editedAt: null, editedBy: editingOrder.lastEditedBy });
                            }
                            if (editingOrder.editHistory) history.push(...editingOrder.editHistory);
                            
                            return history.map((h: any, i: number) => (
                              <li key={i}>
                                - Lần {i + 1}: {h.editedAt ? new Date(h.editedAt).toLocaleString('vi-VN') : 'Trước đây'} bởi <strong>{formatEditorName(h.editedBy)}</strong>
                                {h.oldAmount !== undefined && h.newAmount !== undefined && (
                                  <span className="block text-gray-400 ml-3">
                                    {h.note?.startsWith('XÓA') 
                                      ? `(${h.note}, giảm từ ${new Intl.NumberFormat('vi-VN').format(h.oldAmount)}đ)` 
                                      : `(Sửa từ ${new Intl.NumberFormat('vi-VN').format(h.oldAmount)}đ -> ${new Intl.NumberFormat('vi-VN').format(h.newAmount)}đ)`}
                                  </span>
                                )}
                              </li>
                            ));
                          })()}
                        </ul>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="flex gap-3 mt-8">
                {editingExpenseId && (
                  <button
                    type="button"
                    onClick={handleDeleteExpense}
                    className="py-3 px-4 bg-red-100 text-red-600 font-bold rounded-xl hover:bg-red-200 transition-colors flex items-center justify-center"
                    title="Xóa Phiếu Chi"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
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

      {/* Custom Confirm Dialog */}
      {confirmDialog?.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-slide-up">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Xác nhận</h3>
            <p className="text-gray-600 mb-4">{confirmDialog.message}</p>
            {confirmDialog.requireInput && (
              <input
                type="text"
                placeholder="Nhập lý do xóa (bắt buộc)..."
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none mb-6 text-sm"
                autoFocus
              />
            )}
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => {
                  setConfirmDialog(null);
                  setConfirmInput('');
                }}
                className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (confirmDialog.requireInput && !confirmInput.trim()) {
                    toast.error("Vui lòng nhập lý do xóa!");
                    return;
                  }
                  confirmDialog.onConfirm(confirmInput.trim());
                  setConfirmDialog(null);
                  setConfirmInput('');
                }}
                className="flex-1 py-2.5 px-4 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors"
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Revenue;
