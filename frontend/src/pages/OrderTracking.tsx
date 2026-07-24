import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { ChefHat } from 'lucide-react';
import toast from 'react-hot-toast';

const OrderTracking: React.FC = () => {
  const [takeawayOrders, setTakeawayOrders] = useState<any[]>([]);
  const [tableOrders, setTableOrders] = useState<any[]>([]);
  const [storeName, setStoreName] = useState('Hệ thống Quản lý');
  const [storeNameColor, setStoreNameColor] = useState<string>('#2563eb');
  const [storeNameFont, setStoreNameFont] = useState<string>('system-ui, sans-serif');
  const [storeLogo, setStoreLogo] = useState<string | null>(null);
  const [branchName, setBranchName] = useState<string>('Tất cả cơ sở');
  
  const navigate = useNavigate();
  const branchId = localStorage.getItem('branchId');
  const userRole = localStorage.getItem('userRole');

  useEffect(() => {
    if (userRole !== 'KITCHEN_SCREEN' && userRole !== 'SUPER_ADMIN') {
      toast.error('Bạn không có quyền truy cập màn hình này!');
      navigate('/dashboard');
      return;
    }

    const fetchStoreInfo = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          if (data.storeName) setStoreName(data.storeName);
          if (data.storeLogo) setStoreLogo(data.storeLogo);
          if (data.storeNameColor) setStoreNameColor(data.storeNameColor);
          if (data.storeNameFont) setStoreNameFont(data.storeNameFont);
        }
        if (branchId) {
          const branchSnap = await getDoc(doc(db, 'branches', branchId));
          if (branchSnap.exists()) {
            setBranchName(branchSnap.data().name);
          }
        }
      } catch (error) {
        console.error('Error fetching store info:', error);
      }
    };
    fetchStoreInfo();

    if (!branchId) return;

    // Fetch recent orders
    const qOrders = query(
      collection(db, 'orders'),
      where('kitchenStatus', '==', 'PENDING')
    );
    const unsubOrders = onSnapshot(qOrders, (snap) => {
      const ordersData = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((o: any) => o.branchId === branchId);
      setTakeawayOrders(ordersData);
    });

    // Listen to Active Table Orders
    const qTables = query(
      collection(db, 'active_table_orders'),
      where('branchId', '==', branchId)
    );
    const unsubTables = onSnapshot(qTables, (snap) => {
      const tablesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const activeTables = tablesData.filter(t => (t as any).items?.some((i: any) => !i.isServed));
      setTableOrders(activeTables);
    });

    return () => {
      unsubOrders();
      unsubTables();
    };
  }, [branchId, navigate, userRole]);

  const getOldestPendingTimestamp = (order: any) => {
    let oldest = Infinity;
    if (order.items) {
      for (const item of order.items) {
        if (!item.isServed && !item.cancelRequested) {
          if (item.cartItemId) {
            const ts = parseInt(item.cartItemId.substring(0, 13), 10);
            if (ts < oldest) oldest = ts;
          } else {
            let ts = Date.now();
            if (order.createdAt) {
              if (order.createdAt.toMillis) ts = order.createdAt.toMillis();
              else if (order.createdAt.seconds) ts = order.createdAt.seconds * 1000;
            }
            if (ts < oldest) oldest = ts;
          }
        }
      }
    }

    if (oldest === Infinity) {
      if (order.createdAt?.toMillis) return order.createdAt.toMillis();
      if (order.createdAt?.seconds) return order.createdAt.seconds * 1000;
      return Date.now();
    }
    return oldest;
  };

  const allOrders = [
    ...takeawayOrders.map(o => ({ ...o, type: 'TAKEAWAY' })),
    ...tableOrders.map(o => ({ ...o, type: 'TABLE' }))
  ].sort((a, b) => getOldestPendingTimestamp(a) - getOldestPendingTimestamp(b));

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          {storeLogo ? (
            <img src={storeLogo} alt="Logo" className="w-12 h-12 object-contain rounded-xl bg-white p-1" />
          ) : (
            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center">
              <ChefHat size={30} className="text-white" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-black"
                style={{ fontFamily: storeNameFont, color: storeNameColor }}>
              {storeName.toUpperCase()}
            </h1>
            <p className="text-lg text-gray-400 font-medium">{branchName}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-center px-6 py-2 bg-gray-700 rounded-xl border border-gray-600">
            <p className="text-sm text-gray-400 uppercase tracking-widest font-bold">ĐANG CHỜ XỬ LÝ</p>
            <p className="text-3xl font-black text-orange-400">{allOrders.length} ĐƠN</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto overflow-x-hidden">
        {allOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4">
            <ChefHat size={120} className="opacity-20" />
            <p className="text-4xl font-black text-gray-600">Hiện chưa có đơn hàng nào</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {allOrders.map((order: any, orderIndex: number) => {
              const isInProgress = orderIndex === 0;
              
              return (
              <div 
                key={order.id} 
                className={`bg-gray-800 rounded-2xl shadow-xl border overflow-hidden flex flex-col transition-all duration-500 ${
                  isInProgress ? 'border-orange-500 shadow-orange-500/20 scale-[1.01]' : 'border-gray-700'
                }`}
              >
                  <div className={`p-6 flex items-center justify-between ${isInProgress
                      ? 'border-orange-500/30 bg-orange-900/20'
                      : order.type === 'TABLE' ? 'border-blue-500/20 bg-blue-900/20' : 'border-purple-500/20 bg-purple-900/20'
                    }`}>
                    
                    <div className="flex items-center gap-8">
                      <span className={`w-20 h-20 rounded-2xl flex items-center justify-center font-black text-5xl shadow-inner ${
                        order.type === 'TABLE' ? 'bg-blue-500/20 text-blue-400 border-2 border-blue-500/30' : 'bg-purple-500/20 text-purple-400 border-2 border-purple-500/30'
                      }`}>
                        {orderIndex + 1}
                      </span>
                      
                      <h3 className={`font-black text-5xl ${isInProgress ? 'text-orange-400' : order.type === 'TABLE' ? 'text-blue-400' : 'text-purple-400'
                        }`}>
                        {order.type === 'TABLE' ? order.tableName : `#${order.orderCode || ''}`}
                      </h3>
                    </div>

                    {isInProgress && (
                      <div className="bg-orange-500 text-white font-black px-8 py-3 rounded-2xl text-3xl animate-pulse shadow-[0_0_20px_rgba(249,115,22,0.6)] tracking-widest">
                        ĐANG LÀM...
                      </div>
                    )}
                  </div>
              </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default OrderTracking;
