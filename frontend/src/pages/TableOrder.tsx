import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { signInAnonymously } from 'firebase/auth';
import { ShoppingCart, Plus, Minus, Search, Image as ImageIcon, Clock, ChefHat, X, Edit2, ChevronDown, ChevronUp, Bell, Send, MessageSquare, Lock, Store, MapPinOff } from 'lucide-react';

function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 1000; // Distance in meters
}
import toast from 'react-hot-toast';

const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.error('Audio play failed', e);
  }
};

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
  description?: string;
  branchId?: string | null;
  hasSizes?: boolean;
  sizes?: { name: string; price: number }[];
}

interface CartItem extends MenuItem {
  quantity: number;
  cartItemId?: string;
  isServed?: boolean;
  selectedSize?: string;
  cancelRequested?: boolean;
}

interface TableOrderDoc {
  id: string;
  branchId: string;
  tableId: string;
  tableName: string;
  items: CartItem[];
  totalAmount: number;
  status: 'UNPAID';
  notifications?: { id: string; message: string; timestamp: number; isRead?: boolean }[];
  customerRequests?: { id: string; message: string; timestamp: number; isCompleted: boolean }[];
}

const TableOrder: React.FC = () => {
  const { branchId, tableId } = useParams<{ branchId: string, tableId: string }>();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeOrder, setActiveOrder] = useState<TableOrderDoc | null>(null);

  const [selectedItemForSize, setSelectedItemForSize] = useState<MenuItem | null>(null);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  
  const [tableName, setTableName] = useState<string>('');
  const [branchName, setBranchName] = useState<string>('');
  const [storeName, setStoreName] = useState<string>(localStorage.getItem('storeName') || 'Tiệm nhà Bơ');
  const [storeNameColor, setStoreNameColor] = useState<string>(localStorage.getItem('storeNameColor') || '#2563eb');
  const [storeNameFont, setStoreNameFont] = useState<string>(localStorage.getItem('storeNameFont') || 'system-ui, sans-serif');
  const [storeLogo, setStoreLogo] = useState<string>(localStorage.getItem('storeLogo') || '');
  const [isLocked, setIsLocked] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [isTooFar, setIsTooFar] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOrderExpanded, setIsOrderExpanded] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!branchId || !tableId) return;
      try {
        // Sign in anonymously first to pass Firebase security rules
        if (!auth.currentUser) {
          try {
            await signInAnonymously(auth);
          } catch (authError) {
            console.error('Anonymous auth failed:', authError);
            toast.error('Lỗi xác thực (Vui lòng bật Anonymous Auth trên Firebase)');
            setLoading(false);
            return;
          }
        }

        // Fetch Table info with snapshot listener
        const tableRef = doc(db, 'tables', tableId);
        onSnapshot(tableRef, (docSnap) => {
          if (docSnap.exists()) {
            setTableName(docSnap.data().name);
            setIsLocked(docSnap.data().isLocked || false);
          } else {
            toast.error('Không tìm thấy thông tin bàn!');
            setLoading(false);
          }
        });

        // Check if there are active employees
        const todayStr = new Date().toLocaleDateString('en-CA');
        const attQ = query(
          collection(db, 'attendance'),
          where('date', '==', todayStr),
          where('branchId', '==', branchId)
        );

        const attSnap = await getDocs(attQ);
        const hasCheckedInEmployees = attSnap.docs.some(d => d.data().checkIn && !d.data().checkOut);

        if (!hasCheckedInEmployees) {
          setIsClosed(true);
          setLoading(false);
          return;
        }

        // Fetch Branch info
        const branchDoc = await getDoc(doc(db, 'branches', branchId));
        if (branchDoc.exists()) {
          const bData = branchDoc.data();
          setBranchName(bData.name);

          // Check Geolocation if branch has coordinates set and location check is enabled
          if (bData.enableLocationCheck === true && bData.latitude && bData.longitude) {
            try {
              const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                if (!navigator.geolocation) {
                  reject(new Error("No geolocation"));
                } else {
                  navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
                }
              });
              const dist = getDistanceFromLatLonInM(bData.latitude, bData.longitude, pos.coords.latitude, pos.coords.longitude);
              const maxDist = bData.allowedDistance || 200;
              if (dist > maxDist) {
                setIsTooFar(true);
                setLoading(false);
                return;
              }
            } catch (err) {
              setLocationError(true);
              setLoading(false);
              return;
            }
          }
        }

        // Fetch settings/general for storeName and storeLogo
        const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          if (data.storeName) { setStoreName(data.storeName); localStorage.setItem('storeName', data.storeName); }
          if (data.storeNameColor) { setStoreNameColor(data.storeNameColor); localStorage.setItem('storeNameColor', data.storeNameColor); }
          if (data.storeNameFont) { setStoreNameFont(data.storeNameFont); localStorage.setItem('storeNameFont', data.storeNameFont); }
          if (data.storeLogo) { setStoreLogo(data.storeLogo); localStorage.setItem('storeLogo', data.storeLogo); }
        }

        // Fetch Menu
        const menuSnap = await getDocs(collection(db, 'menu_items'));
        const items = menuSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as MenuItem))
          .filter(i => i.isAvailable && (!i.branchId || i.branchId === 'all' || i.branchId === branchId));
        setMenuItems(items);

        const cats = Array.from(new Set(items.map(i => i.category)));
        setCategories(['Tất cả', ...cats]);
      } catch (error) {
        console.error(error);
        toast.error('Có lỗi xảy ra khi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [branchId, tableId]);

  useEffect(() => {
    if (!branchId || !tableId) return;
    const q = query(
      collection(db, 'active_table_orders'), 
      where('tableId', '==', tableId),
      where('status', '==', 'UNPAID')
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const orderData = snap.docs[0].data();
        setActiveOrder({ id: snap.docs[0].id, ...orderData } as TableOrderDoc);
      } else {
        setActiveOrder(null);
      }
    });
    return () => unsub();
  }, [branchId, tableId]);

  const prevNotificationsCount = useRef(0);
  useEffect(() => {
    if (activeOrder?.notifications) {
      const currentCount = activeOrder.notifications.length;
      if (currentCount > prevNotificationsCount.current && prevNotificationsCount.current > 0) {
        let playedSound = false;
        const newNotifs = activeOrder.notifications.slice(prevNotificationsCount.current);
        newNotifs.forEach(n => {
          if (!n.isRead) {
            toast(n.message, { 
              icon: '🔔', 
              duration: 5000, 
              style: { background: '#fff3cd', color: '#856404', fontWeight: 'bold', border: '1px solid #ffeeba' } 
            });
            if (!playedSound) {
              playNotificationSound();
              playedSound = true;
            }
          }
        });
      }
      prevNotificationsCount.current = currentCount;
    } else {
      prevNotificationsCount.current = 0;
    }
  }, [activeOrder?.notifications]);

  const handleSendRequest = async () => {
    if (!requestText.trim() || !activeOrder) return;
    setIsSendingRequest(true);
    try {
      const newRequest = {
        id: Date.now().toString(),
        message: requestText.trim(),
        timestamp: Date.now(),
        isCompleted: false
      };
      const existingRequests = activeOrder.customerRequests || [];
      await updateDoc(doc(db, 'active_table_orders', activeOrder.id), {
        customerRequests: [...existingRequests, newRequest]
      });
      setRequestText('');
      toast.success('Đã gửi yêu cầu đến thu ngân!');
    } catch (error) {
      toast.error('Có lỗi xảy ra khi gửi yêu cầu');
    } finally {
      setIsSendingRequest(false);
    }
  };

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'Tất cả' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addToCart = (item: MenuItem, selectedSize?: string, customPrice?: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id && i.selectedSize === selectedSize);
      if (existing) {
        return prev.map(i => (i.id === item.id && i.selectedSize === selectedSize) ? { ...i, quantity: i.quantity + 1 } : i);
      }
      const newItem: any = { 
        ...item, 
        quantity: 1, 
        cartItemId: Date.now().toString() + Math.random().toString(36).substring(2),
        price: customPrice !== undefined ? customPrice : item.price 
      };
      if (selectedSize) newItem.selectedSize = selectedSize;
      return [...prev, newItem];
    });
  };

  const updateCartItemSize = (cartItemId: string, newSize: string, newPrice: number) => {
    setCart(prev => {
      const newCart = [...prev];
      const targetIndex = newCart.findIndex(i => i.cartItemId === cartItemId);
      if (targetIndex === -1) return prev;
      
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
      return newCart;
    });
  };

  const updateQuantity = (cartItemId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartItemId === cartItemId || item.id === cartItemId) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || !branchId || !tableId) return;
    setIsSubmitting(true);
    try {
      if (activeOrder) {
        // Fetch latest order to prevent race condition where POS updated isServed
        const orderRef = doc(db, 'active_table_orders', activeOrder.id);
        const orderSnap = await getDoc(orderRef);
        const latestItems = orderSnap.exists() ? orderSnap.data().items : [...activeOrder.items];

        const existingItems = [...latestItems];
        cart.forEach(cartItem => {
          for (let i = 0; i < cartItem.quantity; i++) {
            existingItems.push({
              ...cartItem,
              quantity: 1,
              cartItemId: Date.now().toString() + Math.random().toString(36).substring(2, 9),
              isServed: false
            });
          }
        });
        
        const newTotal = existingItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        await updateDoc(doc(db, 'active_table_orders', activeOrder.id), {
          items: existingItems,
          totalAmount: newTotal,
          updatedAt: serverTimestamp(),
          hasNewItems: true // Flag to notify POS
        });
        
        setActiveOrder({
          ...activeOrder,
          items: existingItems,
          totalAmount: newTotal
        });
      } else {
        // Create new active order
        const newOrder = {
          branchId,
          tableId,
          tableName,
          items: cart.flatMap(item => 
            Array.from({ length: item.quantity }, () => ({
              ...item,
              quantity: 1,
              cartItemId: Date.now().toString() + Math.random().toString(36).substring(2, 9),
              isServed: false
            }))
          ),
          totalAmount: cartTotal,
          status: 'UNPAID',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          hasNewItems: true
        };
        const docRef = await addDoc(collection(db, 'active_table_orders'), newOrder);
        setActiveOrder({ id: docRef.id, ...newOrder } as any);
        
        // Update table status
        await updateDoc(doc(db, 'tables', tableId), { status: 'OCCUPIED' });
      }
      
      setCart([]);
      toast.success('Gửi gọi món thành công! Thu ngân đã nhận được đơn của bạn.', { duration: 4000 });
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi gửi gọi món');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestCancel = async (cartItemId: string) => {
    if (!activeOrder || !cartItemId) return;
    try {
      const newItems = activeOrder.items.map(item => 
        item.cartItemId === cartItemId 
          ? { ...item, cancelRequested: true } 
          : item
      );
      
      await updateDoc(doc(db, 'active_table_orders', activeOrder.id), {
        items: newItems,
        hasNewItems: true // notify POS
      });
      toast.success('Đã gửi yêu cầu huỷ món đến thu ngân!');
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra khi gửi yêu cầu huỷ');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <ChefHat size={48} className="text-blue-500 animate-bounce mb-4" />
        <h2 className="text-xl font-bold text-gray-700">Đang tải Menu...</h2>
      </div>
    );
  }

  if (!tableName) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold text-red-600">Không tìm thấy bàn!</h2>
        <p className="text-gray-500 mt-2">Vui lòng quét lại mã QR trên bàn của bạn.</p>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center max-w-sm w-full">
          <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mb-6">
            <Lock size={40} />
          </div>
          <h2 className="text-2xl font-black text-gray-800 text-center mb-3">Tạm Dừng Phục Vụ</h2>
          <p className="text-gray-500 text-center font-medium">Bàn này hiện đang tạm dừng phục vụ. Vui lòng liên hệ nhân viên để được hỗ trợ.</p>
        </div>
      </div>
    );
  }

  if (isClosed) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center max-w-sm w-full">
          <div className="w-20 h-20 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center mb-6">
            <Store size={40} />
          </div>
          <h2 className="text-2xl font-black text-gray-800 text-center mb-3">Chưa Mở Cửa</h2>
          <p className="text-gray-500 text-center font-medium">Cơ sở hiện tại chưa đến giờ làm việc hoặc không có nhân viên trực. Vui lòng quay lại sau.</p>
        </div>
      </div>
    );
  }

  if (isTooFar) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center max-w-sm w-full">
          <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-6">
            <MapPinOff size={40} />
          </div>
          <h2 className="text-2xl font-black text-gray-800 text-center mb-3">Bạn Không Ở Quán?</h2>
          <p className="text-gray-500 text-center font-medium mb-4">Hệ thống phát hiện bạn đang ở khoảng cách quá xa so với cơ sở này.</p>
          <p className="text-sm text-gray-400 text-center">Vui lòng quét mã QR khi đang có mặt trực tiếp tại quán để gọi món.</p>
        </div>
      </div>
    );
  }

  if (locationError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center max-w-sm w-full">
          <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mb-6">
            <MapPinOff size={40} />
          </div>
          <h2 className="text-2xl font-black text-gray-800 text-center mb-3">Cần Quyền Vị Trí</h2>
          <p className="text-gray-500 text-center font-medium mb-4">Để gọi món, vui lòng cho phép trình duyệt truy cập vị trí của bạn nhằm xác nhận bạn đang ở quán.</p>
          <button onClick={() => window.location.reload()} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors w-full">
            Thử Lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto shadow-2xl relative pb-24">
      {/* Header */}
      <div className="bg-white px-4 pt-6 pb-4 sticky top-0 z-20 shadow-sm rounded-b-2xl">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {storeLogo ? (
                <img src={storeLogo} alt="Logo" className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl object-contain shadow-sm" />
              ) : (
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                  <ChefHat size={28} />
                </div>
              )}
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight" style={{ color: storeNameColor, fontFamily: storeNameFont }}>
                {storeName}
              </h1>
            </div>
            {branchName && (
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <ChefHat size={14} />
                {branchName.toLowerCase().includes('cơ sở') ? branchName : `Cơ sở ${branchName}`}
              </p>
            )}
            <p className="text-sm font-medium text-blue-600 flex items-center gap-1 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              Bạn đang ngồi tại: <span className="font-bold text-lg ml-1">{tableName}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={async () => {
              setShowNotificationsModal(true);
              if (activeOrder && activeOrder.notifications?.some(n => !n.isRead)) {
                const newNotifs = activeOrder.notifications.map(n => ({ ...n, isRead: true }));
                await updateDoc(doc(db, 'active_table_orders', activeOrder.id), {
                  notifications: newNotifs
                });
              }
            }} className="relative p-2 bg-white rounded-full shadow-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              <Bell size={20} />
              {activeOrder?.notifications && activeOrder.notifications.filter(n => !n.isRead).length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold shadow-sm border border-white">
                  {activeOrder.notifications.filter(n => !n.isRead).length}
                </span>
              )}
            </button>

            <button onClick={() => setShowRequestModal(true)} className="p-2 bg-orange-50 rounded-full shadow-sm border border-orange-100 text-orange-600 hover:bg-orange-100 transition-colors">
              <MessageSquare size={20} />
            </button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm món ăn, đồ uống..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-gray-700"
          />
        </div>
        
        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto mt-4 pb-1 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors shadow-sm ${
                selectedCategory === cat 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Already Ordered Items (if any) */}
      {activeOrder && activeOrder.items.length > 0 && (
        <div className="px-4 py-4 bg-orange-50 border-b border-orange-100">
          <button 
            onClick={() => setIsOrderExpanded(!isOrderExpanded)}
            className="w-full flex items-center justify-between"
          >
            <h3 className="text-sm font-bold text-orange-800 flex items-center gap-2">
              <Clock size={16} /> Các món bàn bạn đã gọi
            </h3>
            <div className="text-orange-800">
              {isOrderExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </button>
          
          {isOrderExpanded && (
            <div className="space-y-2 mt-3 animate-slide-up">
              {activeOrder.items.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-1 text-sm border-b border-orange-100/50 pb-2 last:border-0 last:pb-0">
                  <div className="flex justify-between items-center">
                    <span className={`font-medium ${item.isServed ? 'text-gray-400 line-through' : 'text-orange-900'}`}>
                      {item.quantity}x {item.name} {item.selectedSize ? `(${item.selectedSize})` : ''}
                    </span>
                    <span className={`${item.isServed ? 'text-gray-400 line-through' : 'text-orange-700 font-bold'}`}>{new Intl.NumberFormat('vi-VN').format(item.price * item.quantity)}đ</span>
                  </div>
                  {!item.isServed && (
                    <div className="flex justify-end mt-1">
                      {item.cancelRequested ? (
                        <span className="text-[11px] font-bold text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Clock size={10} /> Đang chờ huỷ...
                        </span>
                      ) : (
                        <button 
                          onClick={() => {
                            if(window.confirm(`Bạn muốn yêu cầu huỷ món ${item.name}?`)) {
                              if(item.cartItemId) handleRequestCancel(item.cartItemId);
                            }
                          }}
                          className="text-[11px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
                        >
                          <X size={12} /> Yêu cầu huỷ
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-3 pt-2 border-t border-orange-200 flex justify-between items-center font-black text-orange-900">
            <span>Tạm tính:</span>
            <span>{new Intl.NumberFormat('vi-VN').format(activeOrder.totalAmount)}đ</span>
          </div>
        </div>
      )}

      {/* Menu List */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="grid grid-cols-1 gap-4">
          {filteredItems.map(item => (
            <div key={item.id} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex gap-3">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-24 h-24 rounded-xl object-cover" />
              ) : (
                <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 shrink-0">
                  <ImageIcon size={24} />
                </div>
              )}
              <div className="flex-1 flex flex-col justify-between py-1">
                <div>
                  <h3 className="font-bold text-gray-800 leading-tight mb-1">{item.name}</h3>
                  {item.description && (
                    <p className="text-[11px] text-gray-500 line-clamp-2 mb-1.5 leading-relaxed">{item.description}</p>
                  )}
                  <p className="text-blue-600 font-black text-sm">
                    {new Intl.NumberFormat('vi-VN').format(item.price)}đ
                  </p>
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={() => {
                      if (item.hasSizes && item.sizes && item.sizes.length > 0) {
                        setSelectedItemForSize(item);
                        setShowSizeModal(true);
                      } else {
                        addToCart(item);
                      }
                    }}
                    className="w-8 h-8 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              Không tìm thấy món nào!
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] p-4 rounded-t-3xl z-30 max-w-md mx-auto animate-slide-up">
          <div className="max-h-[40vh] overflow-y-auto mb-4 space-y-3 pr-2 custom-scrollbar">
            <div className="flex justify-between items-center mb-2 border-b border-gray-100 pb-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Món Vừa Chọn:</h3>
              <button 
                onClick={() => setCart([])} 
                className="text-red-500 font-bold text-sm px-3 py-1 bg-red-50 rounded-lg active:scale-95 transition-transform"
              >
                Hủy bỏ
              </button>
            </div>
            {cart.map(item => (
              <div key={item.cartItemId} className="flex justify-between items-center">
                <div className="flex-1">
                  <div className="font-bold text-gray-800 text-sm truncate pr-2 flex items-center flex-wrap">
                    <span className="mr-1">{item.name}</span>
                    {item.hasSizes && item.sizes && item.sizes.length > 0 ? (
                      <span 
                        className="inline-flex items-center text-blue-600 cursor-pointer hover:text-blue-800 transition-colors group/edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemForSize(item);
                          setEditingCartItemId(item.cartItemId || null);
                          setShowSizeModal(true);
                        }}
                        title="Đổi kích cỡ"
                      >
                        {item.selectedSize ? `(${item.selectedSize})` : ''}
                        <Edit2 size={12} className="ml-1 opacity-50 group-hover/edit:opacity-100" />
                      </span>
                    ) : (
                      item.selectedSize ? <span className="text-gray-600">({item.selectedSize})</span> : null
                    )}
                  </div>
                  <div className="text-blue-600 font-bold text-xs">{new Intl.NumberFormat('vi-VN').format(item.price)}đ</div>
                </div>
                <div className="flex items-center gap-3 bg-gray-100 rounded-full p-1 shrink-0">
                  <button onClick={() => updateQuantity(item.cartItemId as string, -1)} className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-gray-600 shadow-sm"><Minus size={14}/></button>
                  <span className="font-bold text-sm w-4 text-center">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.cartItemId as string, 1)} className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-gray-600 shadow-sm"><Plus size={14}/></button>
                </div>
              </div>
            ))}
          </div>
          
          <button 
            onClick={handleSubmitOrder}
            disabled={isSubmitting}
            className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl flex justify-between items-center px-6 hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all disabled:opacity-70"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart size={20} />
              <span>Gửi Món ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
            </div>
            <span className="text-lg">
              {new Intl.NumberFormat('vi-VN').format(cartTotal)}đ
            </span>
          </button>
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
            
            <h3 className="text-xl font-black text-gray-800 mb-1">
              {editingCartItemId ? 'Đổi kích cỡ' : 'Chọn kích cỡ'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">{selectedItemForSize.name}</p>
            
            <div className="space-y-3 mb-2">
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

      {/* Notifications Modal */}
      {showNotificationsModal && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex flex-col justify-end"
          onClick={() => setShowNotificationsModal(false)}
        >
          <div 
            className="bg-gray-50 rounded-t-[32px] p-6 max-h-[80vh] overflow-y-auto animate-slide-up pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                <Bell size={24} className="text-red-500" /> Thông báo
              </h3>
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {activeOrder?.notifications && activeOrder.notifications.length > 0 ? (
              <div className="space-y-3">
                {activeOrder.notifications.map((notif, idx) => (
                  <div key={notif.id || idx} className="bg-white border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm flex flex-col gap-1">
                    <p className="text-sm text-gray-800 font-medium leading-snug">{notif.message}</p>
                    <span className="text-[10px] font-bold text-gray-400">{new Date(notif.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-10">Bạn chưa có thông báo nào.</p>
            )}
          </div>
        </div>
      )}

      {/* Requests Modal */}
      {showRequestModal && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex flex-col justify-end"
          onClick={() => setShowRequestModal(false)}
        >
          <div 
            className="bg-orange-50 rounded-t-[32px] p-6 max-h-[85vh] overflow-y-auto animate-slide-up pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-orange-900 flex items-center gap-2">
                <MessageSquare size={24} className="text-orange-600" /> Gửi yêu cầu
              </h3>
              <button
                onClick={() => setShowRequestModal(false)}
                className="p-2 text-orange-400 hover:text-orange-600 bg-orange-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex gap-2 mb-6">
              <input 
                type="text" 
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                placeholder="Ví dụ: cho em xin cái ống hút..."
                className="flex-1 bg-white border border-orange-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
              <button 
                onClick={handleSendRequest}
                disabled={!requestText.trim() || isSendingRequest}
                className="bg-orange-600 text-white px-5 py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2 hover:bg-orange-700 transition-colors shadow-md shadow-orange-200"
              >
                <Send size={18} /> Gửi
              </button>
            </div>
            
            {activeOrder?.customerRequests && activeOrder.customerRequests.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-orange-800 mb-3 uppercase tracking-wide opacity-70">
                  Lịch sử yêu cầu
                </h4>
                <div className="space-y-3">
                  {activeOrder.customerRequests.map((req, idx) => (
                    <div key={req.id || idx} className="bg-white p-3 rounded-xl flex items-center gap-3 text-sm border border-orange-100 shadow-sm">
                      <div className={`w-2 h-2 shrink-0 rounded-full ${req.isCompleted ? 'bg-green-500' : 'bg-orange-500 animate-pulse'}`}></div>
                      <div className="flex-1 flex flex-col">
                        <span className={req.isCompleted ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'}>{req.message}</span>
                        <span className="text-[10px] font-bold text-gray-400 mt-0.5">{new Date(req.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${req.isCompleted ? 'bg-gray-100 text-gray-500' : 'bg-orange-100 text-orange-700'}`}>
                        {req.isCompleted ? 'Đã xong' : 'Đang chờ'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TableOrder;
