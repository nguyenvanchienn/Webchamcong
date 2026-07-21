import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ShoppingCart, Plus, Minus, Search, Image as ImageIcon, Clock, ChefHat } from 'lucide-react';
import toast from 'react-hot-toast';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
  description?: string;
}

interface CartItem extends MenuItem {
  quantity: number;
}

interface TableOrderDoc {
  id: string;
  branchId: string;
  tableId: string;
  tableName: string;
  items: CartItem[];
  totalAmount: number;
  status: 'UNPAID';
}

const TableOrder: React.FC = () => {
  const { branchId, tableId } = useParams<{ branchId: string, tableId: string }>();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeOrder, setActiveOrder] = useState<TableOrderDoc | null>(null);
  
  const [tableName, setTableName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!branchId || !tableId) return;
      try {
        // Fetch Table info
        const tableDoc = await getDoc(doc(db, 'tables', tableId));
        if (tableDoc.exists()) {
          setTableName(tableDoc.data().name);
        } else {
          toast.error('Không tìm thấy thông tin bàn!');
          setLoading(false);
          return;
        }

        // Fetch Menu
        const menuSnap = await getDocs(collection(db, 'menu_items'));
        const items = menuSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)).filter(i => i.isAvailable);
        setMenuItems(items);

        const cats = Array.from(new Set(items.map(i => i.category)));
        setCategories(['Tất cả', ...cats]);

        // Fetch Active Order for this table
        const q = query(
          collection(db, 'active_table_orders'), 
          where('tableId', '==', tableId),
          where('status', '==', 'UNPAID')
        );
        const orderSnap = await getDocs(q);
        if (!orderSnap.empty) {
          const orderData = orderSnap.docs[0].data();
          setActiveOrder({ id: orderSnap.docs[0].id, ...orderData } as TableOrderDoc);
        }
      } catch (error) {
        console.error(error);
        toast.error('Có lỗi xảy ra khi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [branchId, tableId]);

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'Tất cả' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
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
        // Append to existing order
        const existingItems = [...activeOrder.items];
        cart.forEach(cartItem => {
          const ex = existingItems.find(i => i.id === cartItem.id);
          if (ex) {
            ex.quantity += cartItem.quantity;
          } else {
            existingItems.push(cartItem);
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
          items: cart,
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto shadow-2xl relative pb-24">
      {/* Header */}
      <div className="bg-white px-4 pt-6 pb-4 sticky top-0 z-20 shadow-sm rounded-b-2xl">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-black text-gray-800 tracking-tight">Gọi món</h1>
            <p className="text-sm font-medium text-blue-600 flex items-center gap-1 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              Bạn đang ngồi tại: <span className="font-bold text-lg ml-1">{tableName}</span>
            </p>
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
          <h3 className="text-sm font-bold text-orange-800 flex items-center gap-2 mb-3">
            <Clock size={16} /> Các món bàn bạn đã gọi
          </h3>
          <div className="space-y-2">
            {activeOrder.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm">
                <span className="font-medium text-orange-900">{item.quantity}x {item.name}</span>
                <span className="text-orange-700 font-bold">{new Intl.NumberFormat('vi-VN').format(item.price * item.quantity)}đ</span>
              </div>
            ))}
          </div>
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
                  <p className="text-blue-600 font-black text-sm">
                    {new Intl.NumberFormat('vi-VN').format(item.price)}đ
                  </p>
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={() => addToCart(item)}
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
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Món Vừa Chọn Thêm:</h3>
            {cart.map(item => (
              <div key={item.id} className="flex justify-between items-center">
                <div className="flex-1">
                  <div className="font-bold text-gray-800 text-sm truncate pr-2">{item.name}</div>
                  <div className="text-blue-600 font-bold text-xs">{new Intl.NumberFormat('vi-VN').format(item.price)}đ</div>
                </div>
                <div className="flex items-center gap-3 bg-gray-100 rounded-full p-1 shrink-0">
                  <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-gray-600 shadow-sm"><Minus size={14}/></button>
                  <span className="font-bold text-sm w-4 text-center">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-gray-600 shadow-sm"><Plus size={14}/></button>
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
    </div>
  );
};

export default TableOrder;
