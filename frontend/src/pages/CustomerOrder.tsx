import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ShoppingCart, Trash2, Plus, Minus, Store, X, LayoutDashboard, Receipt } from 'lucide-react';
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
}

interface CartItem extends MenuItem {
  quantity: number;
  cartItemId: string;
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
  
  const [showSidebar, setShowSidebar] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
      } else {
        // Init if not exists
        setDoc(sessionRef, { cart: [], showPaymentModal: false, paymentMethod: 'CASH', amountTendered: '0' });
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const q = query(collection(db, 'menu_items'), where('isAvailable', '==', true));
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem));
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
  }, []);

  const updatePosState = async (updates: any) => {
    const branchId = localStorage.getItem('branchId');
    if (!branchId) return;
    try {
      await updateDoc(doc(db, 'active_pos_sessions', branchId), updates);
    } catch (e) {
      console.error("Error updating POS state", e);
    }
  };

  const addToCart = (item: MenuItem) => {
    const newCart = [...cart];
    const existing = newCart.find(i => i.id === item.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      newCart.push({ ...item, quantity: 1, cartItemId: Date.now().toString() });
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
    <div className="flex w-screen h-screen overflow-hidden bg-gray-50">
      {/* Cột trái: Menu */}
      <div className="flex-1 flex flex-col p-6 h-full pointer-events-auto">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onDoubleClick={() => setShowSidebar(true)}
            className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Store size={28} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-gray-800 tracking-tight">Xin chào Quý khách!</h1>
            <p className="text-gray-500 font-medium">Vui lòng chọn món ăn bên dưới</p>
          </div>
        </div>

        <div className="mb-6 overflow-x-auto whitespace-nowrap pb-2 flex gap-3">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-sm border-2 ${activeCategory === c
                ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/30'
                : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-100 hover:border-gray-200'
                }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-2 pb-16 custom-scrollbar">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredMenu.map(item => (
              <div
                key={item.id}
                onClick={() => addToCart(item)}
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

      {/* Cột phải: Giỏ hàng */}
      <div className="w-[400px] bg-white shadow-2xl flex flex-col border-l border-gray-100 z-10 rounded-l-[2rem] overflow-hidden pointer-events-auto">
        <div className="p-6 border-b border-gray-100 bg-gradient-to-b from-blue-50/50 to-white flex items-center justify-between">
          <div className="flex items-center gap-3 text-gray-800">
            <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
              <ShoppingCart size={24} />
            </div>
            <h2 className="text-2xl font-black">Món đã chọn</h2>
          </div>
          <span className="bg-blue-600 text-white font-bold px-3 py-1 rounded-full text-sm shadow-sm shadow-blue-500/20">
            {cart.reduce((a, b) => a + b.quantity, 0)}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/50 custom-scrollbar">
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
                  <h4 className="font-bold text-gray-800 text-lg leading-tight">{item.name}</h4>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full p-8 flex flex-col items-center animate-slide-up relative">
            
            {paymentMethod === 'TRANSFER' ? (
              <div className="flex flex-col items-center w-full">
                <h2 className="text-2xl font-black text-blue-600 mb-6">Quét mã QR để thanh toán</h2>
                <div className="w-64 h-64 bg-gray-100 p-3 rounded-2xl border-4 border-blue-100 flex items-center justify-center relative overflow-hidden bg-white mb-6">
                  <img 
                    src={`https://img.vietqr.io/image/MB-0372578549-compact.png?amount=${totalAmount}&addInfo=Thanh toan don hang`} 
                    alt="QR Code Thanh Toán" 
                    className="w-full h-full object-contain mix-blend-multiply" 
                  />
                </div>
                <div className="text-center">
                  <p className="text-gray-800 font-bold text-xl mb-1">MB Bank - 0372578549</p>
                  <p className="text-gray-500 font-medium">Số tiền: <span className="text-blue-600 font-black">{new Intl.NumberFormat('vi-VN').format(totalAmount)}đ</span></p>
                </div>
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
              <h1 className="text-2xl font-bold text-blue-600">Chấm Công Pro</h1>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-widest mt-1">POS Khách</span>
              
              <button onClick={() => setShowSidebar(false)} className="absolute right-2 top-2 p-1.5 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto py-4">
              <nav className="space-y-1 px-2">
                <div 
                  onClick={() => navigate('/pos')}
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
                  onClick={() => navigate('/dashboard/orders')}
                  className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1"
                >
                  <span className="mr-3 relative text-gray-400"><Receipt size={20} /></span>
                  <span className="flex-1">Lịch sử Hóa đơn</span>
                </div>

                {localStorage.getItem('userRole') !== 'POS' && (
                  <div 
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center py-3 px-4 text-sm font-medium rounded-lg transition-colors relative text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer mt-1"
                  >
                    <span className="mr-3 relative text-gray-400"><LayoutDashboard size={20} /></span>
                    <span className="flex-1">Quay lại Dashboard</span>
                  </div>
                )}
              </nav>
            </div>
          </div>
        </>
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
