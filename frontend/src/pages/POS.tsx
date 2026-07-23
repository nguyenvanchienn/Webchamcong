import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, getDoc, addDoc, serverTimestamp, query, where, doc, runTransaction, onSnapshot, updateDoc, setDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Plus, Minus, Receipt, CheckCircle, Printer, LogOut, Lock, X, Grip, LayoutDashboard, Store, Coffee, QrCode, ClipboardCheck, MonitorSmartphone, MonitorOff, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl: string;
  isAvailable: boolean;
  description?: string;
  subCategory?: string;
  branchId?: string | null;
  hasSizes?: boolean;
  sizes?: { name: string; price: number }[];
}

interface CartItem extends MenuItem {
  quantity: number;
  cartItemId: string;
  isServed?: boolean;
  selectedSize?: string;
}

interface ActiveTableOrder {
  id: string;
  tableId: string;
  tableName: string;
  items: CartItem[];
  totalAmount: number;
  hasNewItems?: boolean;
  createdAt?: any;
  updatedAt?: any;
  notifications?: any[];
  customerRequests?: any[];
}


const POS: React.FC = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Tất cả');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [billModalData, setBillModalData] = useState<any | null>(null);
  const [storeName, setStoreName] = useState<string>('Bơ Food');
  const [storeAddress, setStoreAddress] = useState<string | null>(null);
  const [storePhone, setStorePhone] = useState<string | null>(null);
  const [storeBankId, setStoreBankId] = useState<string | null>(null);
  const [storeBankAccount, setStoreBankAccount] = useState<string | null>(null);
  const [storeBankAccountName, setStoreBankAccountName] = useState<string | null>(null);
  const [cashierName, setCashierName] = useState<string | null>(null);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [amountTendered, setAmountTendered] = useState<string>('');

  const [showSidebar, setShowSidebar] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);

  const [selectedItemForSize, setSelectedItemForSize] = useState<MenuItem | null>(null);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutPassword, setLogoutPassword] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false);
  const [newExitPassword, setNewExitPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [activeTableOrders, setActiveTableOrders] = useState<ActiveTableOrder[]>([]);
  const [showTableOrdersModal, setShowTableOrdersModal] = useState(false);
  const [currentTableOrderId, setCurrentTableOrderId] = useState<string | null>(null);
  const [currentTableId, setCurrentTableId] = useState<string | null>(null);
  const [currentTableName, setCurrentTableName] = useState<string | null>(null);
  const [pendingOrderCode, setPendingOrderCode] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'ITEM' | 'REQUEST'; orderId: string; tableId: string; tableName: string; itemIndex?: number; itemName?: string; orderItems?: any[]; reqId?: string; reqMessage?: string; requests?: any[] } | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');

  const navigate = useNavigate();

  const [isSyncToCustomerEnabled, setIsSyncToCustomerEnabled] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<any>(null);
  const isSyncingScroll = useRef(false);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const isSyncEnabledRef = useRef(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'general'));
        if (docSnap.exists() && docSnap.data().customerOrderExitPassword) {
          setNewExitPassword(docSnap.data().customerOrderExitPassword);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchSettings();
  }, []);

  const activeOrdersRef = React.useRef<ActiveTableOrder[]>([]);
  useEffect(() => {
    activeOrdersRef.current = activeTableOrders;
  }, [activeTableOrders]);

  useEffect(() => {
    const notifyTimer = setInterval(() => {
      const orders = activeOrdersRef.current;
      const waitingOrders = orders.filter(o => o.items.some(i => !i.isServed));

      if (waitingOrders.length > 0) {
        waitingOrders.slice(0, 3).forEach(o => {
          const unservedCount = o.items.filter(i => !i.isServed).reduce((sum, i) => sum + i.quantity, 0);
          toast(`${o.tableName} có ${unservedCount} món chưa được lên!`, { icon: '⏳', duration: 4000, style: { background: '#fff3cd', color: '#856404', fontWeight: 'bold', border: '1px solid #ffeeba' } });
        });
        if (waitingOrders.length > 3) {
          toast(`Và ${waitingOrders.length - 3} bàn khác đang chờ...`, { duration: 4000 });
        }
      }
    }, 180000); // 3 phút một lần thông báo đơn hàng chưa được giao
    return () => clearInterval(notifyTimer);
  }, []);


  const formatElapsedTime = (startMillis: number) => {
    if (!startMillis) return '';
    const diff = Math.floor((now - startMillis) / 1000);
    if (diff < 60) return 'Vừa xong';

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}p`;
    }
    return `${minutes} phút`;
  };

  const updatePosState = async (updates: any) => {
    const branchId = localStorage.getItem('branchId');
    if (!branchId) return;
    try {
      await setDoc(doc(db, 'active_pos_sessions', branchId), updates, { merge: true });
    } catch (e) {
      console.error("Error updating POS state", e);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingScroll.current || !isSyncToCustomerEnabled) return;
    const scrollTop = e.currentTarget.scrollTop;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      updatePosState({ scrollPosition: scrollTop });
    }, 150);
  };

  useEffect(() => {
    const branchId = localStorage.getItem('branchId');
    if (!branchId) return;

    const sessionRef = doc(db, 'active_pos_sessions', branchId);

    const initSession = async () => {
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) {
        await setDoc(sessionRef, { cart: [], showPaymentModal: false, paymentMethod: 'CASH', amountTendered: '0', currentTableOrderId: null, currentTableId: null, currentTableName: null });
      }
    };
    initSession();

    const unsub = onSnapshot(sessionRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCart(data.cart || []);
        setShowPaymentModal(data.showPaymentModal || false);
        setPaymentMethod(data.paymentMethod || 'CASH');
        setAmountTendered(data.amountTendered || '0');
        setCurrentTableOrderId(data.currentTableOrderId || null);
        setCurrentTableId(data.currentTableId || null);
        setCurrentTableName(data.currentTableName || null);
        setPendingOrderCode(data.pendingOrderCode || null);

        // Chỉ đồng bộ Danh mục & Cuộn nếu đang BẬT đồng bộ
        if (isSyncEnabledRef.current) {
          if (data.activeCategory) {
            setActiveCategory(data.activeCategory);
          }
          if (data.scrollPosition !== undefined && scrollRef.current) {
            if (Math.abs(scrollRef.current.scrollTop - data.scrollPosition) > 5) {
              isSyncingScroll.current = true;
              scrollRef.current.scrollTop = data.scrollPosition;
              setTimeout(() => { isSyncingScroll.current = false; }, 50);
            }
          }
        }
      }
    });

    return () => unsub();
  }, []);

  // Khi toggle bật/tắt đồng bộ, cập nhật lên DB và sync lại trạng thái hiện tại
  useEffect(() => {
    isSyncEnabledRef.current = isSyncToCustomerEnabled;
    if (isSyncToCustomerEnabled) {
      updatePosState({
        isSyncEnabled: true,
        activeCategory,
        scrollPosition: scrollRef.current?.scrollTop || 0
      });
    } else {
      updatePosState({ isSyncEnabled: false });
    }
  }, [isSyncToCustomerEnabled]);

  useEffect(() => {
    const branchId = localStorage.getItem('branchId');
    if (!branchId) return;

    const q = query(
      collection(db, 'active_table_orders'),
      where('branchId', '==', branchId),
      where('status', '==', 'UNPAID')
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActiveTableOrder));

      // Sort tables: 
      // 1. Tables with unserved items at the top
      // 2. Sort unserved tables by the timestamp of their OLDEST unserved item
      list.sort((a, b) => {
        const aItems = a.items || [];
        const bItems = b.items || [];
        const aUnserved = aItems.filter(i => !i.isServed);
        const bUnserved = bItems.filter(i => !i.isServed);

        const aHasUnserved = aUnserved.length > 0;
        const bHasUnserved = bUnserved.length > 0;

        if (aHasUnserved && !bHasUnserved) return -1;
        if (!aHasUnserved && bHasUnserved) return 1;

        if (aHasUnserved && bHasUnserved) {
          const getOldestUnservedTime = (unservedItems: CartItem[]) => {
            return Math.min(...unservedItems.map(i => {
              const ts = parseInt(i.cartItemId?.substring(0, 13) || '');
              return isNaN(ts) ? Infinity : ts;
            }));
          };
          return getOldestUnservedTime(aUnserved) - getOldestUnservedTime(bUnserved);
        }

        // Both have NO unserved items (or both are fully served)
        const getTime = (dateObj: any) => {
          if (!dateObj) return Infinity; // Put new/pending orders at the bottom
          if (typeof dateObj.toMillis === 'function') return dateObj.toMillis();
          if (dateObj.seconds) return dateObj.seconds * 1000;
          return Infinity;
        };

        const timeA = getTime(a.updatedAt);
        const timeB = getTime(b.updatedAt);
        return timeB - timeA; // Descending (most recently served at the top of the "served" group)
      });

      setActiveTableOrders(list);

      const newItems = list.filter(o => o.hasNewItems);
      if (newItems.length > 0) {
        newItems.forEach(table => {
          toast.success(`Bàn ${table.tableName} vừa gọi món!`, {
            icon: '🔔',
            duration: 5000,
            style: { border: '1px solid #3b82f6', padding: '16px', color: '#1d4ed8' }
          });
          // Acknowledge
          updateDoc(doc(db, 'active_table_orders', table.id), { hasNewItems: false });
        });
      }
    });
    return () => unsub();
  }, []);

  // Tự động đóng bàn sau 5 phút nếu không có món và không có yêu cầu chưa xử lý
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      activeTableOrders.forEach(async (order) => {
        if (order.items && order.items.length === 0) {
          const hasPendingRequests = order.customerRequests?.some((r: any) => !r.isCompleted);
          if (!hasPendingRequests) {
            const updatedTime = order.updatedAt?.toMillis?.() || (order.updatedAt?.seconds ? order.updatedAt.seconds * 1000 : 0);
            // 5 phút = 300,000 ms
            if (updatedTime > 0 && (now - updatedTime) > 300000) {
              try {
                await deleteDoc(doc(db, 'active_table_orders', order.id));
                await updateDoc(doc(db, 'tables', order.tableId), { status: 'AVAILABLE' });
                toast.success(`Đã tự động đóng bàn trống: ${order.tableName}`, { duration: 3000 });
              } catch (e) {
                console.error('Lỗi tự động đóng bàn', e);
              }
            }
          }
        }
      });
    }, 60000); // Check every phút

    return () => clearInterval(interval);
  }, [activeTableOrders]);

  const getActiveCashierName = async (branchIdStr: string) => {
    try {
      // 1. Kiểm tra xem có ca nào đang MỞ (OPEN) ở cơ sở này không
      // Thu ngân nào mở bàn giao ca thì trên bill lưu tên và id thu ngân đó
      const shiftQ = query(
        collection(db, 'shift_reports'),
        where('branchId', '==', branchIdStr),
        where('status', '==', 'OPEN')
      );
      const shiftSnap = await getDocs(shiftQ);
      if (!shiftSnap.empty) {
        // Có ca đang mở, lấy tên thu ngân mở ca (đã có sẵn ID 8 số trong cashierName)
        const openShifts = shiftSnap.docs.map(d => d.data());
        // Lấy ca mở gần nhất nếu có nhiều ca (thường chỉ có 1)
        openShifts.sort((a, b) => {
          const timeA = a.startTime?.toMillis ? a.startTime.toMillis() : 0;
          const timeB = b.startTime?.toMillis ? b.startTime.toMillis() : 0;
          return timeB - timeA;
        });
        if (openShifts[0].cashierName) {
          return openShifts[0].cashierName;
        }
      }

      // 2. Trường hợp KHÔNG có thu ngân nào bàn giao ca (không có ca OPEN)
      // Ghi tên tất cả thu ngân đang check-in trong ca đó
      const todayStr = new Date().toLocaleDateString('en-CA');
      const attQ = query(collection(db, 'attendance'), where('date', '==', todayStr), where('branchId', '==', branchIdStr));
      const attSnap = await getDocs(attQ);

      const checkedInEmployeeIds = attSnap.docs
        .map(d => (d.data().checkIn && !d.data().checkOut) ? d.data().employeeId : null)
        .filter(Boolean);

      if (checkedInEmployeeIds.length > 0) {
        const activeCashiers: string[] = [];
        for (const id of checkedInEmployeeIds) {
          const empDoc = await getDoc(doc(db, 'employees', id as string));
          if (empDoc.exists()) {
            const pos = (empDoc.data().position || '').toLowerCase();
            // Lọc những ai là thu ngân / quản lý
            if (pos.includes('thu ngân') || pos.includes('cashier') || pos.includes('quản lý') || pos.includes('manager')) {
              const code = empDoc.data().employeeCode || empDoc.id;
              const name = empDoc.data().fullName || empDoc.data().name || '';
              activeCashiers.push(`${code} - ${name}`);
            }
          }
        }
        if (activeCashiers.length > 0) return activeCashiers.join(' & ');

        // Nếu không có ai có chức danh thu ngân/quản lý, lấy tạm người đầu tiên đang check-in
        const firstEmpDoc = await getDoc(doc(db, 'employees', checkedInEmployeeIds[0] as string));
        if (firstEmpDoc.exists()) {
          const code = firstEmpDoc.data().employeeCode || firstEmpDoc.id;
          const name = firstEmpDoc.data().fullName || firstEmpDoc.data().name || '';
          return `${code} - ${name}`;
        }
      }

      // 3. Nếu không có thu ngân check in, ghi null
      return null;
    } catch (e) {
      console.error("Lỗi lấy thông tin thu ngân", e);
      return null;
    }
  };

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const q = query(collection(db, 'menu_items'), where('isAvailable', '==', true));
        const snap = await getDocs(q);
        const branchId = localStorage.getItem('branchId');
        const items = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as MenuItem))
          .filter(item => !item.branchId || item.branchId === 'all' || item.branchId === branchId);
        setMenuItems(items);

        const cats = Array.from(new Set(items.map(i => i.category)));
        setCategories(['Tất cả', ...cats]);

        // Fetch Store Name and Cashier Name
        if (branchId) {
          try {
            const branchDoc = await getDoc(doc(db, 'branches', branchId));
            if (branchDoc.exists()) {
              const data = branchDoc.data();
              setStoreName(data.name);
              setStoreAddress(data.address || null);
              setStorePhone(data.phone || null);
              setStoreBankId(data.bankId || null);
              setStoreBankAccount(data.bankAccount || null);
              setStoreBankAccountName(data.bankAccountName || null);
            }
            const activeName = await getActiveCashierName(branchId);
            setCashierName(activeName);
          } catch (e) {
            console.error("Error fetching branch/cashier info", e);
          }
        }

      } catch (error) {
        toast.error('Lỗi khi tải thực đơn');
      } finally {
        setLoading(false);
      }
    };
    fetchMenu();
  }, []);

  const addToCart = (item: MenuItem, selectedSize?: string, customPrice?: number) => {
    const newCart = [...cart];
    const existing = newCart.find(i => i.id === item.id && i.selectedSize === selectedSize);
    if (existing) {
      existing.quantity += 1;
    } else {
      const newItem: any = {
        ...item,
        quantity: 1,
        cartItemId: Date.now().toString() + Math.random().toString(36).substring(2),
        price: customPrice !== undefined ? customPrice : item.price
      };
      if (selectedSize) newItem.selectedSize = selectedSize;
      newCart.push(newItem);
    }
    updatePosState({ cart: newCart });
  };

  const updateCartItemSize = (cartItemId: string, newSize: string, newPrice: number) => {
    const newCart = [...cart];
    const targetIndex = newCart.findIndex(i => i.cartItemId === cartItemId);
    if (targetIndex === -1) return;

    const target = { ...newCart[targetIndex] };
    newCart.splice(targetIndex, 1);

    const existingIndex = newCart.findIndex(i => i.id === target.id && i.selectedSize === newSize);
    if (existingIndex !== -1) {
      newCart[existingIndex] = { ...newCart[existingIndex], quantity: newCart[existingIndex].quantity + target.quantity };
    } else {
      target.selectedSize = newSize;
      target.price = newPrice;
      newCart.push(target);
    }
    updatePosState({ cart: newCart });
  };

  const updateQuantity = (cartItemId: string, delta: number) => {
    const newCart = cart.map(i => {
      if (i.cartItemId === cartItemId) {
        const newQ = i.quantity + delta;
        return newQ > 0 ? { ...i, quantity: newQ } : i;
      }
      return i;
    });
    updatePosState({ cart: newCart });
  };

  const removeFromCart = (cartItemId: string) => {
    const newCart = cart.filter(i => i.cartItemId !== cartItemId);
    updatePosState({ cart: newCart });
  };



  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleSaveTableOrder = async () => {
    if (!currentTableOrderId || cart.length === 0) return;
    setIsProcessing(true);
    try {
      const orderRef = doc(db, 'active_table_orders', currentTableOrderId);
      const snap = await getDoc(orderRef);

      if (snap.exists()) {
        const latestItems = snap.data().items || [];
        const newItems = [...latestItems];

        // Calculate differences
        for (const cartItem of cart) {
          const existingCount = latestItems.filter((i: any) => i.id === cartItem.id).length;
          const targetCount = cartItem.quantity;

          if (targetCount > existingCount) {
            // Add new items
            const diff = targetCount - existingCount;
            for (let i = 0; i < diff; i++) {
              newItems.push({
                ...cartItem,
                quantity: 1,
                cartItemId: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                isServed: false
              });
            }
          } else if (targetCount < existingCount) {
            // Remove items (prefer unserved first)
            let diff = existingCount - targetCount;
            for (let i = newItems.length - 1; i >= 0 && diff > 0; i--) {
              if (newItems[i].id === cartItem.id && !newItems[i].isServed) {
                newItems.splice(i, 1);
                diff--;
              }
            }
            // If still need to remove, just remove from the end
            for (let i = newItems.length - 1; i >= 0 && diff > 0; i--) {
              if (newItems[i].id === cartItem.id) {
                newItems.splice(i, 1);
                diff--;
              }
            }
          }
        }

        // Remove items that are completely gone from cart
        const cartIds = cart.map(c => c.id);
        for (let i = newItems.length - 1; i >= 0; i--) {
          if (!cartIds.includes(newItems[i].id)) {
            newItems.splice(i, 1);
          }
        }

        const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        await updateDoc(orderRef, {
          items: newItems,
          totalAmount: newTotal,
          updatedAt: serverTimestamp()
        });

        toast.success('Đã lưu đơn bàn!');
        // Clear cart to return to default POS view
        setCart([]);
        setCurrentTableOrderId(null);
        setCurrentTableId(null);
        setCurrentTableName(null);
        updatePosState({ cart: [], currentTableOrderId: null, currentTableId: null, currentTableName: null });
      }
    } catch (e) {
      console.error(e);
      toast.error('Lỗi khi lưu đơn');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const tendered = paymentMethod === 'CASH' ? parseInt(amountTendered || '0', 10) : totalAmount;
      const change = paymentMethod === 'CASH' ? tendered - totalAmount : 0;

      // Dynamically re-check active cashier to ensure accuracy
      const branchIdStr = localStorage.getItem('branchId');
      let finalCashierName = cashierName;
      if (branchIdStr) {
        const activeName = await getActiveCashierName(branchIdStr);
        if (activeName) finalCashierName = activeName;
      }

      // Use the pre-generated order code
      const nextOrderCodeStr = pendingOrderCode || Date.now().toString();

      // Group items for the bill
      const groupedItems: any[] = [];
      cart.forEach(item => {
        const existing = groupedItems.find(i => i.menuItemId === item.id && i.selectedSize === item.selectedSize);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          groupedItems.push({
            menuItemId: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            selectedSize: item.selectedSize || null
          });
        }
      });

      const orderData = {
        orderCode: nextOrderCodeStr,
        items: groupedItems,
        totalAmount,
        paymentMethod,
        amountTendered: tendered,
        changeAmount: change,
        createdAt: serverTimestamp(),
        cashierEmail: finalCashierName || null, // Store cashierName in this field for display
        branchId: localStorage.getItem('branchId') || null,
        status: 'COMPLETED',
        tableName: currentTableName || null
      };

      const docRef = await addDoc(collection(db, 'orders'), orderData);

      if (currentTableOrderId && currentTableId) {
        await updateDoc(doc(db, 'active_table_orders', currentTableOrderId), { status: 'PAID', paidAt: serverTimestamp() });
        await updateDoc(doc(db, 'tables', currentTableId), { status: 'AVAILABLE' });
      }

      // Hiển thị modal in bill
      setBillModalData({
        orderId: docRef.id,
        ...orderData,
        createdAt: new Date() // for immediate display
      });

      setCart([]);
      setShowPaymentModal(false);
      setAmountTendered('');
      setCurrentTableOrderId(null);
      setCurrentTableId(null);
      setCurrentTableName(null);
      setPendingOrderCode(null);
      updatePosState({ cart: [], showPaymentModal: false, amountTendered: '0', currentTableOrderId: null, currentTableId: null, currentTableName: null, pendingOrderCode: null });
      toast.success('Thanh toán thành công!');
    } catch (error) {
      toast.error('Lỗi khi thanh toán');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById('bill-receipt');
    if (printContent) {
      const printWindow = window.open("", "", "width=600,height=800");
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>In Hóa Đơn</title>
              <script src="https://cdn.tailwindcss.com"></script>
              <style>
                @media print {
                  body { padding: 0 !important; margin: 0 !important; }
                  @page { margin: 0; }
                }
              </style>
            </head>
            <body class="p-8 font-mono text-sm text-gray-800">
              ${printContent.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      }
    }
  };

  const filteredMenu = activeCategory === 'Tất cả'
    ? menuItems
    : menuItems.filter(i => i.category === activeCategory);

  if (loading) return <div className="p-8 text-center text-gray-500 font-medium">Đang tải máy POS...</div>;

  const handleLogout = async () => {
    if (!logoutPassword) {
      toast.error('Vui lòng nhập mật khẩu để đăng xuất');
      return;
    }
    setIsLoggingOut(true);
    try {
      if (auth.currentUser && auth.currentUser.email) {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, logoutPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await signOut(auth);
        localStorage.clear();
        navigate('/login');
      } else {
        toast.error('Không tìm thấy phiên đăng nhập');
      }
    } catch (error) {
      toast.error('Mật khẩu không chính xác!');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const unservedTablesCount = activeTableOrders.filter(order => order.items.some(item => !item.isServed)).length;
  const pendingRequestsCount = activeTableOrders.reduce((sum, order) => {
    return sum + (order.customerRequests?.filter((r: any) => !r.isCompleted).length || 0);
  }, 0);

  return (
    <div className="flex flex-col lg:flex-row w-screen h-[100dvh] overflow-hidden bg-gray-100 relative">
      {/* Cột trái: Menu */}
      <div className="flex-1 flex flex-col p-2 lg:p-4 h-full">
        <div className="mb-4 overflow-x-auto whitespace-nowrap pb-2 flex items-center gap-2 custom-scrollbar">
          <button
            onClick={() => setShowSidebar(true)}
            className="w-10 h-10 flex shrink-0 items-center justify-center bg-white border border-gray-200 text-gray-600 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
          >
            <Grip size={22} />
          </button>

          <button
            onClick={() => setShowTableOrdersModal(true)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors border ${activeTableOrders.length > 0 ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Coffee size={18} className={unservedTablesCount > 0 ? 'animate-pulse' : ''} />
            Bàn gọi món
            {unservedTablesCount > 0 && (
              <span className="bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-full text-xs ml-1" title="Bàn có món chưa lên">
                {unservedTablesCount}
              </span>
            )}
            {pendingRequestsCount > 0 && (
              <span className="bg-orange-500 text-white w-5 h-5 flex items-center justify-center rounded-full text-xs ml-1" title="Số lượng yêu cầu từ khách">
                {pendingRequestsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsSyncToCustomerEnabled(!isSyncToCustomerEnabled)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors border ${isSyncToCustomerEnabled ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'}`}
            title={isSyncToCustomerEnabled ? 'Đang đồng bộ màn hình khách' : 'Đã tắt đồng bộ màn hình khách'}
          >
            {isSyncToCustomerEnabled ? <MonitorSmartphone size={18} /> : <MonitorOff size={18} />}
            {isSyncToCustomerEnabled ? 'Đồng bộ KH' : 'Tắt đồng bộ'}
          </button>

          <div className="w-px h-8 bg-gray-300 mx-2 shrink-0"></div>

          {categories.map(c => (
            <button
              key={c}
              onClick={() => {
                setActiveCategory(c);
                if (isSyncToCustomerEnabled) {
                  updatePosState({ activeCategory: c });
                }
              }}
              className={`px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm ${activeCategory === c
                ? 'bg-blue-600 text-white shadow-blue-500/30'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pr-2 pb-16"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredMenu.map(item => (
              <div
                key={item.id}
                onClick={() => {
                  if (item.hasSizes && item.sizes && item.sizes.length > 0) {
                    setSelectedItemForSize(item);
                    setShowSizeModal(true);
                  } else {
                    addToCart(item);
                  }
                }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition-all hover:-translate-y-1 group active:scale-95"
              >
                <div className="h-32 bg-gray-100 relative overflow-hidden">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gradient-to-br from-gray-50 to-gray-200">
                      <span className="text-xs font-bold uppercase tracking-wider">{item.category}</span>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold text-gray-700 shadow-sm">
                    {item.category}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-gray-800 leading-tight mb-1 line-clamp-2" title={item.name}>{item.name}</h3>
                  {item.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2 leading-relaxed" title={item.description}>{item.description}</p>
                  )}
                  <div className="text-blue-600 font-black text-lg mt-auto">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Nút nổi Giỏ hàng trên Mobile */}
      <div className="lg:hidden fixed bottom-4 right-4 z-40">
        <button
          onClick={() => setShowMobileCart(true)}
          className="bg-blue-600 text-white p-4 rounded-full shadow-2xl flex items-center justify-center relative hover:bg-blue-700 transition-colors"
        >
          <ShoppingCart size={24} />
          {cart.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border-2 border-white">
              {cart.reduce((a, b) => a + b.quantity, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Cột phải: Giỏ hàng */}
      <div className={`fixed inset-0 lg:static w-full lg:w-96 h-full bg-white shadow-xl flex-col border-t lg:border-t-0 lg:border-l border-gray-200 z-50 lg:z-10 transition-transform duration-300 ${showMobileCart ? 'translate-y-0 flex' : 'translate-y-full lg:translate-y-0 hidden lg:flex'}`}>
        <div className="p-4 lg:p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-gray-800">
            <ShoppingCart size={24} className="text-blue-600" />
            <h2 className="text-xl font-black">Giỏ Hàng {currentTableName ? `(${currentTableName})` : ''}</h2>
          </div>
          <div className="flex items-center gap-3">
            {cart.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors flex items-center gap-1"
                title="Xóa tất cả"
              >
                <Trash2 size={16} />
                <span className="text-xs font-bold hidden sm:inline">Xóa hết</span>
              </button>
            )}
            <button
              onClick={() => setShowMobileCart(false)}
              className="lg:hidden text-gray-500 hover:bg-gray-200 p-1.5 rounded-lg ml-2"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30">
          {currentTableName && (
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center justify-between">
              <span className="text-blue-800 font-bold text-sm">Đang xử lý đơn: {currentTableName}</span>
              <button
                onClick={() => {
                  setCart([]);
                  setCurrentTableOrderId(null);
                  setCurrentTableId(null);
                  setCurrentTableName(null);
                  updatePosState({ cart: [], currentTableOrderId: null, currentTableId: null, currentTableName: null });
                }}
                className="text-xs bg-white text-blue-600 px-3 py-1.5 rounded-lg font-bold shadow-sm hover:bg-blue-100"
              >
                Hủy Đơn Bàn
              </button>
            </div>
          )}
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                <ShoppingCart size={40} className="text-gray-300" />
              </div>
              <p className="font-medium text-gray-500">Giỏ hàng trống</p>
              <p className="text-sm text-center px-8 leading-relaxed">Hãy bấm vào các món ăn bên trái để thêm vào hóa đơn thanh toán.</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.cartItemId} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-3 group relative overflow-hidden">
                <div className="flex justify-between items-start pr-6">
                  <h4 className="font-bold text-gray-800 leading-tight flex items-center flex-wrap">
                    <span className="mr-1">{item.name}</span>
                    {item.hasSizes && item.sizes && item.sizes.length > 0 ? (
                      <span
                        className="inline-flex items-center text-blue-600 cursor-pointer hover:text-blue-800 transition-colors group/edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemForSize(item);
                          setEditingCartItemId(item.cartItemId);
                          setShowSizeModal(true);
                        }}
                        title="Đổi kích cỡ"
                      >
                        {item.selectedSize ? `(${item.selectedSize})` : ''}
                        <Edit2 size={14} className="ml-1 opacity-50 group-hover/edit:opacity-100" />
                      </span>
                    ) : (
                      item.selectedSize ? <span className="text-gray-600">({item.selectedSize})</span> : null
                    )}
                  </h4>
                  <div className="font-bold text-blue-600 shrink-0">
                    {new Intl.NumberFormat('vi-VN').format(item.price)}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
                    <button
                      onClick={() => updateQuantity(item.cartItemId, -1)}
                      className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    ><Minus size={16} strokeWidth={3} /></button>
                    <span className="w-10 text-center font-black text-gray-800 text-lg">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.cartItemId, 1)}
                      className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    ><Plus size={16} strokeWidth={3} /></button>
                  </div>
                  <div className="font-black text-gray-800 text-lg">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price * item.quantity)}
                  </div>
                </div>

                <button
                  onClick={() => removeFromCart(item.cartItemId)}
                  className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors p-1"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-5 border-t border-gray-200 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-end mb-5">
            <span className="text-gray-500 font-medium">Tổng thanh toán</span>
            <span className="text-3xl font-black text-blue-600">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
            </span>
          </div>
          <div className="flex gap-2">
            {currentTableOrderId && (
              <button
                onClick={handleSaveTableOrder}
                disabled={cart.length === 0 || isProcessing}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg shadow-orange-500/30 transition-all active:scale-[0.98]"
              >
                {isProcessing ? 'Đang lưu...' : (
                  <>
                    <Store size={20} />
                    <span>Lưu đơn</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={async () => {
                setIsProcessing(true);
                let code = "";
                try {
                  const counterRef = doc(db, 'metadata', 'orderCounter');
                  code = await runTransaction(db, async (transaction) => {
                    const counterDoc = await transaction.get(counterRef);
                    let currentCode = 9999999;
                    if (counterDoc.exists() && counterDoc.data().lastOrderCode) {
                      currentCode = counterDoc.data().lastOrderCode;
                    }
                    const newCode = currentCode + 1;
                    transaction.set(counterRef, { lastOrderCode: newCode }, { merge: true });
                    return newCode.toString();
                  });
                } catch (e) {
                  console.error("Lỗi tạo mã đơn:", e);
                  code = "DH" + Date.now().toString().slice(-6);
                }
                setIsProcessing(false);
                setPendingOrderCode(code);
                setPaymentMethod('CASH');
                setAmountTendered('0');
                setShowPaymentModal(true);
                updatePosState({ paymentMethod: 'CASH', amountTendered: '0', showPaymentModal: true, pendingOrderCode: code });
              }}
              disabled={cart.length === 0 || isProcessing}
              className={`flex flex-col items-center justify-center gap-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] ${currentTableOrderId ? 'flex-[2]' : 'w-full flex-row text-lg'}`}
            >
              {isProcessing ? 'Đang xử lý...' : (
                <>
                  <Receipt size={currentTableOrderId ? 20 : 24} />
                  <span>Thanh toán</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Chọn phương thức thanh toán */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h3 className="font-bold text-xl text-gray-800">Thanh toán đơn hàng</h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  updatePosState({ showPaymentModal: false });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              <div className="flex gap-4 mb-6">
                <button
                  onClick={() => {
                    setPaymentMethod('CASH');
                    setAmountTendered('0');
                    updatePosState({ paymentMethod: 'CASH', amountTendered: '0' });
                  }}
                  className={`flex-1 py-3 rounded-xl border-2 font-bold transition-all ${paymentMethod === 'CASH'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                >
                  Tiền mặt
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('TRANSFER');
                    updatePosState({ paymentMethod: 'TRANSFER' });
                  }}
                  className={`flex-1 py-3 rounded-xl border-2 font-bold transition-all ${paymentMethod === 'TRANSFER'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                >
                  Chuyển khoản
                </button>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl mb-6 flex justify-between items-center border border-gray-200">
                <span className="text-gray-600 font-medium">Tổng thanh toán:</span>
                <span className="text-2xl font-black text-blue-600">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
                </span>
              </div>

              {paymentMethod === 'CASH' ? (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <label className="block text-sm font-medium text-gray-700">Khách đưa (VNĐ):</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setAmountTendered(totalAmount.toString());
                            updatePosState({ amountTendered: totalAmount.toString() });
                          }}
                          className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                          Khách đưa đủ
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={amountTendered ? new Intl.NumberFormat('vi-VN').format(parseInt(amountTendered, 10)) : ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setAmountTendered(val);
                        updatePosState({ amountTendered: val });
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xl font-bold text-gray-800"
                      placeholder="0"
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-between items-center p-4 bg-green-50 rounded-xl border border-green-100">
                    <span className="text-green-800 font-medium">Tiền trả lại:</span>
                    <span className={`text-xl font-black ${parseInt(amountTendered || '0') - totalAmount >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                        Math.max(0, parseInt(amountTendered || '0') - totalAmount)
                      )}
                    </span>
                  </div>
                  {parseInt(amountTendered || '0') - totalAmount < 0 && (
                    <p className="text-red-500 text-sm text-center font-medium mt-2">Khách đưa chưa đủ tiền!</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center animate-fade-in space-y-2">
                  {storeBankId && storeBankAccount ? (
                    <>
                      <div className="w-64 h-64 bg-white p-2 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center relative overflow-hidden shadow-sm">
                        <img
                          src={`https://img.vietqr.io/image/${storeBankId}-${storeBankAccount}-compact2.png?amount=${totalAmount}&addInfo=Thanh toan don hang ${pendingOrderCode || ''}&accountName=${storeBankAccountName || ''}`}
                          alt="QR Code Thanh Toán"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-gray-800 font-bold text-lg uppercase">{storeBankId} - {storeBankAccount}</p>
                        {storeBankAccountName && <p className="text-blue-600 font-bold text-sm uppercase">{storeBankAccountName}</p>}
                        <p className="text-gray-500 font-medium text-sm mt-2">Quét mã QR để thanh toán chính xác<br />số tiền <strong className="text-black">{new Intl.NumberFormat('vi-VN').format(totalAmount)}đ</strong></p>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-10">
                      <QrCode size={48} className="text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">Chưa cấu hình tài khoản ngân hàng<br />cho cơ sở này.</p>
                      <p className="text-xs text-gray-400 mt-2">Vui lòng báo Quản lý vào mục Cơ sở để thiết lập.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-white flex gap-3 shrink-0">
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  updatePosState({ showPaymentModal: false });
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleCheckout}
                disabled={isProcessing || (paymentMethod === 'CASH' && parseInt(amountTendered || '0') < totalAmount)}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30 transition-all flex justify-center items-center gap-2"
              >
                {isProcessing ? 'Đang xử lý...' : (
                  <>
                    <CheckCircle size={20} />
                    Xác nhận
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xuất Bill */}
      {billModalData && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-w-md w-full max-h-[90vh]">
            <div className="p-6 bg-green-500 text-white flex flex-col items-center justify-center pb-8 rounded-b-[40px] shadow-sm z-10 relative">
              <button
                onClick={() => setBillModalData(null)}
                className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-3 shadow-lg">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <h2 className="text-2xl font-black mb-1">Thanh toán thành công!</h2>
              <p className="text-green-100 font-medium">Hóa đơn #{billModalData.orderCode || billModalData.orderId.slice(-6).toUpperCase()}</p>
            </div>

            <div className="flex-1 overflow-auto bg-gray-50 p-6 -mt-6 pt-10">
              {/* Vùng để in bill */}
              <div id="bill-receipt" className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm font-mono text-sm text-gray-800">
                <div className="text-center mb-6">
                  <h1 className="text-xl font-bold mb-1 uppercase">TIỆM NHÀ BƠ</h1>
                  <p className="text-gray-500 text-xs">HÓA ĐƠN THANH TOÁN</p>
                </div>

                <div className="border-t border-b border-dashed border-gray-300 py-3 mb-4 space-y-1 text-xs">
                  <div className="flex justify-between"><span>Mã ĐH:</span> <strong>#{billModalData.orderCode || billModalData.orderId.slice(-6).toUpperCase()}</strong></div>
                  <div className="flex justify-between"><span>Ngày:</span> <strong>{billModalData.createdAt.toLocaleString('vi-VN')}</strong></div>
                  <div className="flex justify-between"><span>Cơ sở:</span> <strong>{storeName}</strong></div>
                  <div className="flex justify-between"><span>Thu ngân:</span> <strong>{billModalData.cashierEmail}</strong></div>
                </div>

                <table className="w-full mb-4 text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-2 w-2/5">Tên món</th>
                      <th className="py-2 text-center">Size</th>
                      <th className="py-2 text-center">SL</th>
                      <th className="py-2 text-right">Đơn giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billModalData.items.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b border-dashed border-gray-100">
                        <td className="py-2 pr-2 font-medium">
                          {item.name.replace(/\s*\([^)]*\)/g, '')}
                        </td>
                        <td className="py-2 text-center text-gray-500 font-bold">{item.selectedSize || '-'}</td>
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
                    <strong>{billModalData.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}</strong>
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

                {storeAddress && (
                  <div className="text-left mt-4 text-xs text-gray-600 border-t border-dashed border-gray-300 pt-4 space-y-1">
                    <p>Địa chỉ: {storeAddress}</p>
                    {storePhone && <p>Hotline: {storePhone}</p>}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-dashed border-gray-300 flex justify-between items-center">
                  <div className="text-center text-xs text-gray-500 italic flex-1 mr-2">
                    <p>Cảm ơn quý khách đã ủng hộ!</p>
                    <p className="flex items-center justify-center gap-1">Hẹn gặp lại <span className="text-base leading-none">♡</span></p>
                  </div>

                  {storeBankId && storeBankAccount && (
                    <div className="flex flex-col items-center justify-center">
                      <img
                        src={`https://img.vietqr.io/image/${storeBankId}-${storeBankAccount}-qr_only.png?amount=${billModalData.totalAmount}&addInfo=Thanh toan don ${billModalData.orderCode || billModalData.orderId.slice(-6).toUpperCase()}&accountName=${storeBankAccountName || ''}`}
                        alt="Mã QR Thanh Toán"
                        className="w-16 h-16 object-contain"
                      />
                      <p className="text-[9px] mt-1 text-gray-500 text-center uppercase font-medium">Quét thanh toán</p>
                    </div>
                  )}
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
              <button
                onClick={handlePrint}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-colors"
              >
                <Printer size={20} /> In Hóa Đơn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác nhận Xóa giỏ hàng */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-slide-up">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 size={32} className="text-red-500" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-center text-gray-800 mb-2">Xóa toàn bộ giỏ hàng?</h3>
            <p className="text-gray-500 text-center mb-6 text-sm">Thao tác này sẽ xóa toàn bộ món ăn đang có trong giỏ hàng. Khách hàng cũng sẽ thấy giỏ hàng bị xóa. Bạn có chắc chắn không?</p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  updatePosState({ cart: [], currentTableOrderId: null, currentTableId: null, currentTableName: null });
                  setCurrentTableOrderId(null);
                  setCurrentTableId(null);
                  setCurrentTableName(null);
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors"
              >
                Xóa hết
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Danh sách bàn đang gọi món */}
      {showTableOrdersModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
                <Coffee size={24} className="text-orange-500" />
                Bàn Khách Đang Gọi
              </h3>
              <button onClick={() => setShowTableOrdersModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
              {activeTableOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-500 flex flex-col items-center">
                  <Store size={48} className="text-gray-300 mb-4" />
                  <p className="font-medium text-lg">Không có bàn nào đang gọi món</p>
                  <p className="text-sm mt-2">Các bàn mới gọi món hoặc đang ăn sẽ hiển thị ở đây.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...activeTableOrders].sort((a, b) => {
                    const getOldestPendingTimestamp = (order: ActiveTableOrder) => {
                      let oldest = Infinity;
                      if (order.customerRequests) {
                        for (const req of order.customerRequests) {
                          if (!req.isCompleted && req.timestamp < oldest) oldest = req.timestamp;
                        }
                      }
                      if (order.items) {
                        for (const item of order.items) {
                          if (!item.isServed && item.cartItemId) {
                            const ts = parseInt(item.cartItemId.substring(0, 13));
                            if (!isNaN(ts) && ts < oldest) oldest = ts;
                          }
                        }
                      }
                      return oldest;
                    };

                    const oldestA = getOldestPendingTimestamp(a);
                    const oldestB = getOldestPendingTimestamp(b);
                    const hasPendingA = oldestA !== Infinity;
                    const hasPendingB = oldestB !== Infinity;

                    if (hasPendingA && hasPendingB) return oldestA - oldestB;
                    if (hasPendingA) return -1;
                    if (hasPendingB) return 1;

                    return (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0);
                  }).map(order => (
                    <div
                      key={order.id}
                      className={`bg-white border-2 rounded-2xl p-4 cursor-pointer transition-all ${currentTableOrderId === order.id ? 'border-blue-500 shadow-md ring-4 ring-blue-50' : 'border-transparent shadow-sm hover:shadow-md hover:border-gray-200'
                        }`}
                      onClick={async () => {
                        // Mark as read if it has new items
                        if (order.hasNewItems) {
                          await updateDoc(doc(db, 'active_table_orders', order.id), { hasNewItems: false });
                        }

                        // Group items for the POS cart sidebar
                        const groupedCart: any[] = [];
                        order.items.forEach(item => {
                          const existing = groupedCart.find(i => i.id === item.id);
                          if (existing) {
                            existing.quantity += item.quantity;
                          } else {
                            // Use a single cartItemId for the grouped item in POS sidebar
                            groupedCart.push({ ...item, cartItemId: item.cartItemId || Date.now().toString() });
                          }
                        });

                        updatePosState({
                          cart: groupedCart,
                          currentTableOrderId: order.id,
                          currentTableId: order.tableId,
                          currentTableName: order.tableName
                        });
                        setCurrentTableOrderId(order.id);
                        setCurrentTableId(order.tableId);
                        setCurrentTableName(order.tableName);
                        setShowTableOrdersModal(false);
                      }}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-lg text-gray-800 flex items-center gap-2">
                              {order.tableName}
                              {order.hasNewItems && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" title="Có món mới"></span>}
                              {order.customerRequests?.some((r: any) => !r.isCompleted) && (
                                <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-bounce shadow-sm font-bold" title="Có yêu cầu mới">
                                  {order.customerRequests.filter((r: any) => !r.isCompleted).length} yêu cầu
                                </span>
                              )}
                            </h4>
                            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                              {(() => {
                                const ts = order.createdAt || order.updatedAt;
                                if (!ts) return '';
                                let millis = 0;
                                if (typeof ts.toMillis === 'function') millis = ts.toMillis();
                                else if (ts.seconds) millis = ts.seconds * 1000;
                                return millis ? formatElapsedTime(millis) : '';
                              })()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 font-medium">{order.items.reduce((s, i) => s + i.quantity, 0)} món ăn/nước</p>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-blue-600">
                            {new Intl.NumberFormat('vi-VN').format(order.totalAmount)}đ
                          </span>
                        </div>
                      </div>

                      {/* Hiển thị Customer Requests */}
                      {order.customerRequests && order.customerRequests.length > 0 && (
                        <div className="bg-orange-50 rounded-lg p-3 text-sm text-orange-900 mt-2 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                          <div className="font-bold flex items-center gap-1"><Coffee size={14} /> Yêu cầu từ khách:</div>
                          {order.customerRequests.map((req: any, idx: number) => (
                            <div key={req.id || idx} className="flex justify-between items-start gap-2 border-b border-orange-100 last:border-0 pb-2 last:pb-0">
                              <div className="flex flex-col">
                                <span className={req.isCompleted ? 'line-through text-gray-400' : 'font-medium'}>
                                  {req.message}
                                </span>
                                <span className="text-[10px] font-bold text-orange-400">
                                  {new Date(req.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                {!req.isCompleted && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const newReqs = [...(order.customerRequests || [])];
                                      newReqs[idx].isCompleted = true;
                                      await updateDoc(doc(db, 'active_table_orders', order.id), {
                                        customerRequests: newReqs
                                      });
                                    }}
                                    className="text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded hover:bg-orange-300 whitespace-nowrap font-bold"
                                  >
                                    Đã xong
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setItemToDelete({
                                      type: 'REQUEST',
                                      orderId: order.id,
                                      tableId: order.tableId,
                                      tableName: order.tableName,
                                      reqId: req.id,
                                      reqMessage: req.message,
                                      requests: order.customerRequests
                                    });
                                  }}
                                  className="text-red-400 hover:text-red-600 transition-opacity p-1 -mr-1"
                                  title="Xóa yêu cầu này"
                                >
                                  <X size={16} strokeWidth={3} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 flex flex-col gap-2 mt-2" onClick={e => e.stopPropagation()}>
                        {order.items.map((item, idx) => (
                          <div key={item.cartItemId || idx} className="flex items-center justify-between group">
                            <div className="flex items-start gap-3 flex-1">
                              <input
                                type="checkbox"
                                checked={item.isServed || false}
                                onChange={async (e) => {
                                  const newItems = [...order.items];
                                  newItems[idx].isServed = e.target.checked;
                                  await updateDoc(doc(db, 'active_table_orders', order.id), {
                                    items: newItems
                                  });
                                }}
                                className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mt-0.5 cursor-pointer shrink-0"
                              />
                              <div className="flex flex-col">
                                <span className={`${item.isServed ? 'line-through text-gray-400' : 'font-medium text-gray-800'}`}>
                                  {item.quantity}x {item.name} {item.selectedSize ? `(${item.selectedSize})` : ''}
                                </span>
                                <span className="text-[10px] font-bold text-gray-400">
                                  {(() => {
                                    if (!item.cartItemId) return '';
                                    const t = parseInt(item.cartItemId.substring(0, 13));
                                    return isNaN(t) ? '' : new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                                  })()}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToDelete({
                                  type: 'ITEM',
                                  orderId: order.id,
                                  tableId: order.tableId,
                                  tableName: order.tableName,
                                  itemIndex: idx,
                                  itemName: item.name,
                                  orderItems: order.items
                                });
                              }}
                              className="text-red-400 hover:text-red-600 transition-opacity p-1 -mr-2"
                              title="Xóa món này"
                            >
                              <X size={18} strokeWidth={3} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-400 uppercase">
                          {currentTableOrderId === order.id ? 'Đang xử lý' : 'Nhấn để thanh toán'}
                        </span>
                        {order.items.length === 0 && (!order.customerRequests || order.customerRequests.every((r: any) => r.isCompleted)) ? (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (window.confirm('Bàn này không có món nào. Bạn muốn kết thúc bàn?')) {
                                try {
                                  await deleteDoc(doc(db, 'active_table_orders', order.id));
                                  await updateDoc(doc(db, 'tables', order.tableId), { status: 'AVAILABLE' });
                                  toast.success(`Đã đóng ${order.tableName}`);
                                } catch (err) {
                                  toast.error('Lỗi khi đóng bàn');
                                }
                              }
                            }}
                            className="bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors flex items-center gap-1"
                            title="Bàn trống, nhấn để dọn bàn"
                          >
                            <Trash2 size={14} /> Đóng bàn
                          </button>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                            <CheckCircle size={16} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác nhận Xóa món */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-slide-up">
            <div className="flex justify-center mb-4 text-red-500 bg-red-50 w-16 h-16 rounded-full items-center mx-auto">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-center text-gray-800 mb-2">
              Xác nhận xoá {itemToDelete.type === 'ITEM' ? 'món' : 'yêu cầu'}
            </h3>
            <p className="text-gray-600 text-center mb-6 text-sm">
              Bạn có chắc chắn muốn xoá <span className="font-bold text-gray-800">{itemToDelete.type === 'ITEM' ? itemToDelete.itemName : itemToDelete.reqMessage}</span> khỏi đơn của <span className="font-bold text-blue-600">{itemToDelete.tableName}</span> không?
            </p>

            <div className="mb-6">
              <input
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Lý do huỷ (không bắt buộc)..."
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setItemToDelete(null); setDeleteReason(''); }}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  try {
                    if (itemToDelete.type === 'ITEM') {
                      const { orderId, tableName, itemIndex, itemName, orderItems } = itemToDelete;
                      const newItems = [...(orderItems || [])];
                      newItems.splice(itemIndex as number, 1);

                      const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                      await updateDoc(doc(db, 'active_table_orders', orderId), {
                        items: newItems,
                        totalAmount: newTotal,
                        updatedAt: serverTimestamp(),
                        notifications: arrayUnion({
                          id: Date.now().toString(),
                          message: `Món ${itemName} đã bị huỷ${deleteReason.trim() ? `. Lý do: ${deleteReason.trim()}` : ''}`,
                          timestamp: Date.now()
                        })
                      });
                      
                      if (newItems.length === 0) {
                        toast.success(`Đã xoá món cuối cùng của bàn ${tableName}`);
                      } else {
                        toast.success('Đã xoá món');
                      }
                    } else if (itemToDelete.type === 'REQUEST') {
                      const { orderId, reqId, reqMessage, requests } = itemToDelete;
                      const newReqs = (requests || []).filter(r => r.id !== reqId);
                      await updateDoc(doc(db, 'active_table_orders', orderId), {
                        customerRequests: newReqs,
                        notifications: arrayUnion({
                          id: Date.now().toString(),
                          message: `Yêu cầu "${reqMessage}" đã bị huỷ${deleteReason.trim() ? `. Lý do: ${deleteReason.trim()}` : ''}`,
                          timestamp: Date.now()
                        })
                      });
                      toast.success('Đã xoá yêu cầu');
                    }
                  } catch (e) {
                    toast.error('Có lỗi xảy ra');
                  }
                  setItemToDelete(null);
                  setDeleteReason('');
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Xác nhận xoá
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác nhận Đăng xuất */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex justify-center mb-4 text-red-500">
              <Lock size={48} />
            </div>
            <h3 className="text-xl font-bold text-center text-gray-800 mb-2">Đăng xuất Máy Order</h3>
            <p className="text-gray-500 text-center mb-6 text-sm">Vui lòng nhập mật khẩu của tài khoản Máy Order để khóa máy và đăng xuất.</p>

            <input
              type="password"
              placeholder="Nhập mật khẩu..."
              value={logoutPassword}
              onChange={(e) => setLogoutPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogout()}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl mb-6 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-center text-lg tracking-widest"
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setShowLogoutModal(false); setLogoutPassword(''); }}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                disabled={isLoggingOut}
              >
                Hủy
              </button>
              <button
                onClick={handleLogout}
                disabled={!logoutPassword || isLoggingOut}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:bg-gray-300 transition-colors"
              >
                {isLoggingOut ? 'Đang XL...' : 'Đăng xuất'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar ẩn */}
      {showSidebar && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm transition-opacity" onClick={() => setShowSidebar(false)}></div>
          <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-2xl z-50 flex flex-col border-r border-gray-200 animate-slide-right">

            <div className="h-20 flex flex-col items-center justify-center border-b border-gray-200 relative">
              <h1 className="text-2xl font-bold text-blue-600">Tiệm Nhà Bơ</h1>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-widest mt-1">MÁY ORDER</span>

              <button onClick={() => setShowSidebar(false)} className="absolute right-2 top-2 p-1.5 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              <nav className="space-y-1 px-2">
                <div className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative bg-blue-50 text-blue-700 cursor-default">
                  <span className="mr-3 relative text-blue-700"><ShoppingCart size={20} /></span>
                  <span className="flex-1">Bán hàng (POS)</span>
                </div>

                <div
                  onClick={() => {
                    navigate('/customer-order');
                    if (!document.fullscreenElement) {
                      document.documentElement.requestFullscreen().catch(() => { });
                    }
                  }}
                  className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1"
                >
                  <span className="mr-3 relative text-gray-400"><Store size={20} /></span>
                  <span className="flex-1">Màn hình Khách Order</span>
                </div>

                <div
                  onClick={() => {
                    navigate('/dashboard/orders');
                    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
                  }}
                  className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1"
                >
                  <span className="mr-3 relative text-gray-400"><Receipt size={20} /></span>
                  <span className="flex-1">Lịch sử Hóa đơn</span>
                </div>

                <div
                  onClick={() => {
                    navigate('/dashboard/tables');
                    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
                  }}
                  className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1"
                >
                  <span className="mr-3 relative text-gray-400"><QrCode size={20} /></span>
                  <span className="flex-1">Quản lý Bàn / QR</span>
                </div>

                <div
                  onClick={() => {
                    navigate('/dashboard/shift-handovers');
                    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
                  }}
                  className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1"
                >
                  <span className="mr-3 relative text-gray-400"><ClipboardCheck size={20} /></span>
                  <span className="flex-1">Bàn giao ca</span>
                </div>

                {localStorage.getItem('userRole') !== 'POS' && (
                  <div
                    onClick={() => {
                      navigate('/dashboard');
                      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
                    }}
                    className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1"
                  >
                    <span className="mr-3 relative text-gray-400"><LayoutDashboard size={20} /></span>
                    <span className="flex-1">Quay lại Dashboard</span>
                  </div>
                )}

                {localStorage.getItem('userRole') === 'POS' && (
                  <div
                    onClick={() => {
                      setShowSidebar(false);
                      setShowSetPasswordModal(true);
                    }}
                    className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1 border-t border-gray-100"
                  >
                    <span className="mr-3 relative text-gray-400"><Lock size={20} /></span>
                    <span className="flex-1">Cài mật khẩu Màn hình Khách</span>
                  </div>
                )}
              </nav>
            </div>

            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => { setShowSidebar(false); setShowLogoutModal(true); }}
                className="flex items-center w-full py-2 px-4 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              >
                <LogOut size={20} className="mr-3" />
                <span>Đăng xuất</span>
              </button>
            </div>

          </div>
        </>
      )}

      {/* Cài đặt mật khẩu Màn hình khách */}
      {showSetPasswordModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 animate-scale-up">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Mật khẩu Màn hình Khách</h3>
            <p className="text-sm text-gray-600 mb-4">Thiết lập mật khẩu để mở khóa menu ẩn ở màn hình Khách Order (Để trống nếu không cần).</p>
            <input
              type="text"
              placeholder="Nhập mật khẩu..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none mb-6 text-center text-lg tracking-widest"
              value={newExitPassword}
              onChange={(e) => setNewExitPassword(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowSetPasswordModal(false)}
                className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  setIsSavingPassword(true);
                  try {
                    await setDoc(doc(db, 'settings', 'general'), {
                      customerOrderExitPassword: newExitPassword
                    }, { merge: true });
                    toast.success('Lưu mật khẩu thành công!');
                    setShowSetPasswordModal(false);
                  } catch (error) {
                    toast.error('Lỗi khi lưu mật khẩu');
                  } finally {
                    setIsSavingPassword(false);
                  }
                }}
                disabled={isSavingPassword}
                className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
              >
                {isSavingPassword ? 'Đang lưu...' : 'Lưu lại'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chọn Size Modal */}
      {showSizeModal && selectedItemForSize && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-scale-up relative">
            <button
              onClick={() => {
                setShowSizeModal(false);
                setSelectedItemForSize(null);
                setEditingCartItemId(null);
              }}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded-full transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-xl font-bold text-gray-800 mb-1">
              {editingCartItemId ? 'Đổi kích cỡ' : 'Chọn kích cỡ'}
            </h3>
            <p className="text-sm text-gray-500 mb-5">{selectedItemForSize.name}</p>

            <div className="space-y-3 mb-6">
              {selectedItemForSize.sizes?.map((sz, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (editingCartItemId) {
                      updateCartItemSize(editingCartItemId, sz.name, sz.price);
                    } else {
                      addToCart(selectedItemForSize, sz.name, sz.price);
                    }
                    setShowSizeModal(false);
                    setSelectedItemForSize(null);
                    setEditingCartItemId(null);
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors group text-left"
                >
                  <span className="font-semibold text-gray-700 group-hover:text-blue-700">{sz.name}</span>
                  <span className="font-bold text-blue-600">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(sz.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ẩn vùng in CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #bill-receipt, #bill-receipt * {
            visibility: visible;
          }
          #bill-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
};

export default POS;
