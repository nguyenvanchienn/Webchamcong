import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ShoppingCart, Trash2, Plus, Minus, Store, X, LayoutDashboard, Receipt, QrCode, ClipboardCheck, LogOut, Lock, Edit2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl: string;
  isAvailable: boolean;
  description?: string;
  branchId?: string | null;
  hasSizes?: boolean;
  sizes?: { name: string; price: number }[];
}

interface CartItem extends MenuItem {
  quantity: number;
  cartItemId: string;
  isServed?: boolean;
  selectedSize?: string;
  cancelRequested?: boolean;
}

const CustomerOrder: React.FC = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Tất cả');
  
  // Synced states
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [amountTendered, setAmountTendered] = useState<string>('0');
  const [pendingOrderCode, setPendingOrderCode] = useState<string | null>(null);
  
  const [showSidebar, setShowSidebar] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [showExitPasswordModal, setShowExitPasswordModal] = useState(false);
  const [exitPasswordInput, setExitPasswordInput] = useState('');
  const [requiredExitPassword, setRequiredExitPassword] = useState('');

  const [selectedItemForSize, setSelectedItemForSize] = useState<MenuItem | null>(null);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);

  const [storeBankId, setStoreBankId] = useState<string | null>(null);
  const [storeBankAccount, setStoreBankAccount] = useState<string | null>(null);
  const [storeBankAccountName, setStoreBankAccountName] = useState<string | null>(null);

  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false);
  const [newExitPassword, setNewExitPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  
  const [branchName, setBranchName] = useState<string>('');
  const [storeName, setStoreName] = useState<string>('Tiệm nhà Bơ');
  const [storeLogo, setStoreLogo] = useState<string>('');
  
  const navigate = useNavigate();

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<any>(null);
  const isSyncingScroll = useRef(false);
  const isSyncEnabledRef = useRef(true);

  useEffect(() => {
    const branchId = localStorage.getItem('branchId');
    if (!branchId) return;

    const sessionRef = doc(db, 'active_pos_sessions', branchId);

    const initSession = async () => {
      try {
        await getDocs(query(collection(db, 'active_pos_sessions')));
        // if not exists, we let POS init it, or we init here
      } catch (e) {
        console.error(e);
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
        setPendingOrderCode(data.pendingOrderCode || null);
        
        isSyncEnabledRef.current = data.isSyncEnabled !== false; // mặc định true nếu chưa set
        
        if (isSyncEnabledRef.current) {
          if (data.activeCategory) {
             setActiveCategory(data.activeCategory);
          }
          if (data.scrollPosition !== undefined && scrollRef.current) {
             // allow small margin of error (e.g. < 5px) to prevent bouncing
             if (Math.abs(scrollRef.current.scrollTop - data.scrollPosition) > 5) {
               isSyncingScroll.current = true;
               scrollRef.current.scrollTop = data.scrollPosition;
               setTimeout(() => { isSyncingScroll.current = false; }, 50);
             }
          }
        }
      } else {
        // Init if not exists
        setDoc(sessionRef, { cart: [], showPaymentModal: false, paymentMethod: 'CASH', amountTendered: '0', activeCategory: 'Tất cả', isSyncEnabled: true });
      }
    });

    return () => unsub();
  }, []);

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
      } catch (error) {
        toast.error('Lỗi khi tải thực đơn');
      } finally {
        setLoading(false);
      }
    };

    fetchMenu();

      const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'general'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.customerOrderExitPassword) {
            setRequiredExitPassword(data.customerOrderExitPassword);
            setNewExitPassword(data.customerOrderExitPassword);
          }
          if (data.storeName) setStoreName(data.storeName);
          if (data.storeLogo) setStoreLogo(data.storeLogo);
        }
      } catch (e) {
        console.error('Error fetching settings:', e);
      }

      const branchId = localStorage.getItem('branchId');
      if (branchId) {
        try {
          const branchDoc = await getDoc(doc(db, 'branches', branchId));
          if (branchDoc.exists()) {
            const data = branchDoc.data();
            setBranchName(data.name || '');
            setStoreBankId(data.bankId || null);
            setStoreBankAccount(data.bankAccount || null);
            setStoreBankAccountName(data.bankAccountName || null);
          }
        } catch (e) {
          console.error("Error fetching branch info", e);
        }
      }
    };
    fetchSettings();
  }, []);

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
    if (isSyncingScroll.current || !isSyncEnabledRef.current) return;
    const scrollTop = e.currentTarget.scrollTop;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      updatePosState({ scrollPosition: scrollTop });
    }, 150);
  };

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

  const filteredMenu = activeCategory === 'Tất cả'
    ? menuItems
    : menuItems.filter(i => i.category === activeCategory);

  if (loading) return <div className="p-8 text-center text-gray-500 font-medium">Đang tải thực đơn...</div>;

  return (
    <div className="flex flex-col md:flex-row w-screen h-[100dvh] overflow-hidden bg-gray-50">
      {/* Cột trái: Menu */}
      <div className="flex-1 flex flex-col p-3 md:p-6 h-full pointer-events-auto">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onDoubleClick={() => {
              if (requiredExitPassword) {
                setShowExitPasswordModal(true);
              } else {
                setShowSidebar(true);
              }
            }}
            className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg hover:bg-blue-700 transition-colors cursor-pointer overflow-hidden p-0 border-0"
          >
            {storeLogo ? (
              <img src={storeLogo} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <Store size={28} />
            )}
          </button>
          <div className="flex-1">
            {branchName && (
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                {storeLogo ? (
                  <img src={storeLogo} alt="Logo" className="w-3.5 h-3.5 rounded-sm object-cover" />
                ) : (
                  <Store size={12} />
                )} 
                {storeName} - {branchName.toLowerCase().includes('cơ sở') ? branchName : `Cơ sở ${branchName}`}
              </p>
            )}
            <h1 className="text-2xl font-black text-gray-800 tracking-tight">Xin chào Quý khách!</h1>
            <p className="text-gray-500 font-medium">Vui lòng chọn món ăn bên dưới</p>
          </div>
        </div>

        <div className="mb-6 overflow-x-auto whitespace-nowrap pb-2 flex gap-3">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => {
                setActiveCategory(c);
                if (isSyncEnabledRef.current) {
                  updatePosState({ activeCategory: c });
                }
              }}
              className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-sm border-2 ${activeCategory === c
                ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/30'
                : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-100 hover:border-gray-200'
                }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pr-2 pb-24 custom-scrollbar"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
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
                className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-xl transition-all hover:-translate-y-2 group active:scale-95 flex flex-col h-full"
              >
                <div className="h-40 sm:h-48 bg-gray-100 relative overflow-hidden shrink-0">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gradient-to-br from-gray-50 to-gray-200">
                      <span className="text-sm font-bold uppercase tracking-wider">{item.category}</span>
                    </div>
                  )}
                  <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs font-bold text-blue-700 shadow-sm border border-white/20">
                    {item.category}
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-gray-800 text-lg leading-tight mb-2 line-clamp-2">{item.name}</h3>
                  {item.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3 leading-relaxed">{item.description}</p>
                  )}
                  <div className="text-blue-600 font-black text-xl mt-auto">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Nút nổi Giỏ hàng trên Mobile */}
      <div className="md:hidden fixed bottom-4 right-4 z-40">
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
      <div className={`fixed inset-0 md:static w-full md:w-[350px] lg:w-[400px] h-full bg-white shadow-2xl flex flex-col border-t md:border-t-0 md:border-l border-gray-100 z-50 md:z-10 transition-transform duration-300 ${showMobileCart ? 'translate-y-0 flex' : 'translate-y-full md:translate-y-0 hidden md:flex'}`}>
        <div className="p-4 md:p-6 border-b border-gray-100 bg-gradient-to-b from-blue-50/50 to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-gray-800">
            <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
              <ShoppingCart size={24} />
            </div>
            <h2 className="text-xl md:text-2xl font-black">Món đã chọn</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-blue-600 text-white font-bold px-3 py-1 rounded-full text-sm shadow-sm shadow-blue-500/20">
              {cart.reduce((a, b) => a + b.quantity, 0)}
            </span>
            <button
              onClick={() => setShowMobileCart(false)}
              className="md:hidden text-gray-500 hover:bg-gray-200 p-1.5 rounded-lg"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 bg-gray-50/50 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                <ShoppingCart size={48} className="text-gray-300" />
              </div>
              <p className="font-bold text-gray-500 text-lg">Chưa có món nào</p>
              <p className="text-center px-8 text-gray-400 leading-relaxed">Hãy chọn các món ăn ngon miệng từ thực đơn bên trái nhé!</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.cartItemId} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-3 group relative overflow-hidden hover:border-blue-200 transition-colors">
                <div className="flex justify-between items-start pr-8">
                  <h4 className="font-bold text-gray-800 text-lg leading-tight flex items-center flex-wrap">
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
                        <Edit2 size={16} className="ml-1 opacity-50 group-hover/edit:opacity-100" />
                      </span>
                    ) : (
                      item.selectedSize ? <span className="text-gray-600">({item.selectedSize})</span> : null
                    )}
                  </h4>
                </div>

                <div className="flex justify-between items-center mt-1">
                  <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-200">
                    <button
                      onClick={() => updateQuantity(item.cartItemId, -1)}
                      className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    ><Minus size={20} strokeWidth={2.5} /></button>
                    <span className="w-12 text-center font-black text-gray-800 text-xl">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.cartItemId, 1)}
                      className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    ><Plus size={20} strokeWidth={2.5} /></button>
                  </div>
                  <div className="font-black text-blue-600 text-xl">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price * item.quantity)}
                  </div>
                </div>

                <button
                  onClick={() => removeFromCart(item.cartItemId)}
                  className="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors p-1.5 bg-gray-50 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-white shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-end mb-2">
            <span className="text-gray-500 font-bold text-lg">Tạm tính</span>
            <span className="text-4xl font-black text-blue-600 tracking-tight">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
            </span>
          </div>
          {/* Removed the 'GỬI ĐƠN HÀNG' button */}
          <div className="text-center text-gray-400 font-medium text-sm mt-4 pb-2">
            Đơn hàng của bạn sẽ được xử lý tại quầy
          </div>
        </div>
      </div>

      {/* Sync Payment Modal directly from POS State */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full p-8 flex flex-col items-center animate-slide-up relative">
            
            {paymentMethod === 'TRANSFER' ? (
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
                      <p className="text-gray-500 font-medium">Chưa cấu hình tài khoản ngân hàng<br/>cho cơ sở này.</p>
                      <p className="text-xs text-gray-400 mt-2">Vui lòng báo Quản lý vào mục Cơ sở để thiết lập.</p>
                    </div>
                  )}
                </div>
            ) : (
              <div className="flex flex-col items-center w-full">
                <h2 className="text-2xl font-black text-gray-800 mb-8">Thanh toán bằng Tiền mặt</h2>
                <div className="w-full space-y-4">
                  <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl">
                    <span className="text-gray-500 font-medium text-lg">Tổng hóa đơn:</span>
                    <span className="text-2xl font-black text-blue-600">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl">
                    <span className="text-gray-500 font-medium text-lg">Tiền khách đưa:</span>
                    <span className="text-2xl font-black text-gray-800">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(parseInt(amountTendered || '0'))}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-green-50 p-4 rounded-2xl border border-green-100">
                    <span className="text-green-700 font-bold text-lg">Tiền trả lại:</span>
                    <span className={`text-2xl font-black ${parseInt(amountTendered || '0') - totalAmount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                        Math.max(0, parseInt(amountTendered || '0') - totalAmount)
                      )}
                    </span>
                  </div>
                  {parseInt(amountTendered || '0') - totalAmount < 0 && (
                    <p className="text-red-500 text-lg text-center font-bold mt-4 animate-pulse">Khách đưa chưa đủ tiền!</p>
                  )}
                </div>
                <div className="mt-8 text-gray-400 font-medium text-center w-full">
                  Vui lòng giao dịch với Thu ngân
                </div>
              </div>
            )}
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
                <div 
                  onClick={() => {
                    navigate('/pos');
                    if (!document.fullscreenElement) {
                      document.documentElement.requestFullscreen().catch(() => {});
                    }
                  }}
                  className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1"
                >
                  <span className="mr-3 relative text-gray-400"><ShoppingCart size={20} /></span>
                  <span className="flex-1">Bán hàng (POS)</span>
                </div>
                
                <div className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative bg-blue-50 text-blue-700 cursor-default">
                  <span className="mr-3 relative text-blue-700"><Store size={20} /></span>
                  <span className="flex-1">Màn hình Khách Order</span>
                </div>
                
                <div 
                  onClick={() => {
                    navigate('/dashboard/orders');
                    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                  }}
                  className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1"
                >
                  <span className="mr-3 relative text-gray-400"><Receipt size={20} /></span>
                  <span className="flex-1">Lịch sử Hóa đơn</span>
                </div>

                <div 
                  onClick={() => {
                    navigate('/dashboard/tables');
                    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                  }}
                  className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1"
                >
                  <span className="mr-3 relative text-gray-400"><QrCode size={20} /></span>
                  <span className="flex-1">Quản lý Bàn / QR</span>
                </div>

                <div 
                  onClick={() => {
                    navigate('/dashboard/shift-handovers');
                    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
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
                      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
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
                onClick={() => navigate('/pos')}
                className="flex items-center w-full py-2 px-4 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                title="Về màn hình POS để Đăng xuất"
              >
                <LogOut size={20} className="mr-3" />
                <span>Đăng xuất</span>
              </button>
            </div>

          </div>
        </>
      )}

      {/* Exit Password Modal */}
      {showExitPasswordModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Nhập mật khẩu</h3>
              <button onClick={() => {
                setShowExitPasswordModal(false);
                setExitPasswordInput('');
              }} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">Vui lòng nhập mật khẩu để mở khóa menu điều khiển.</p>
              
              <input
                type="password"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all font-medium mb-6 text-center text-xl tracking-[0.3em]"
                placeholder="••••••"
                value={exitPasswordInput}
                onChange={e => setExitPasswordInput(e.target.value)}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (exitPasswordInput === requiredExitPassword) {
                      setShowExitPasswordModal(false);
                      setExitPasswordInput('');
                      setShowSidebar(true);
                    } else {
                      toast.error('Mật khẩu không chính xác!');
                      setExitPasswordInput('');
                    }
                  }
                }}
              />
              
              <button
                onClick={() => {
                  if (exitPasswordInput === requiredExitPassword) {
                    setShowExitPasswordModal(false);
                    setExitPasswordInput('');
                    setShowSidebar(true);
                  } else {
                    toast.error('Mật khẩu không chính xác!');
                    setExitPasswordInput('');
                  }
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-bold transition-all shadow-lg shadow-blue-600/30 active:scale-[0.98]"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
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
                    setRequiredExitPassword(newExitPassword);
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
                  className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all group text-left shadow-sm active:scale-[0.98]"
                >
                  <span className="font-bold text-gray-700 group-hover:text-blue-700">{sz.name}</span>
                  <span className="font-black text-blue-600">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(sz.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #E2E8F0;
          border-radius: 20px;
        }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background-color: #CBD5E1;
        }
      `}</style>
    </div>
  );
};

export default CustomerOrder;
