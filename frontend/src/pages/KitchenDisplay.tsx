import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, doc, updateDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { ChefHat, CheckCircle, Clock, X, Maximize, Minimize, MessageSquare, Trash2, Monitor } from 'lucide-react';
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

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);

    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1046.5, ctx.currentTime);
      gain2.gain.setValueAtTime(0, ctx.currentTime);
      gain2.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.5);
    }, 150);
  } catch (e) {
    // Ignore error
  }
};

const KitchenDisplay: React.FC = () => {
  const [takeawayOrders, setTakeawayOrders] = useState<any[]>([]);
  const [takeawayError, setTakeawayError] = useState<string | null>(null);
  const [tableOrders, setTableOrders] = useState<any[]>([]);
  const [storeName, setStoreName] = useState('Hệ thống Quản lý');
  const [storeNameColor, setStoreNameColor] = useState<string>('#2563eb');
  const [storeNameFont, setStoreNameFont] = useState<string>('system-ui, sans-serif');
  const [storeLogo, setStoreLogo] = useState<string | null>(null);
  const [branchName, setBranchName] = useState<string>('Tất cả cơ sở');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [actionModal, setActionModal] = useState<{
    type: 'REJECT_REQUEST' | 'REJECT_CANCEL' | 'DELETE_ITEM' | 'FINISH_ORDER';
    orderId: string;
    itemId?: string;
    reqId?: string;
    itemName?: string;
    reqMessage?: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [prevPendingIds, setPrevPendingIds] = useState<string>('');
  const navigate = useNavigate();
  const branchId = localStorage.getItem('branchId');
  const userRole = localStorage.getItem('userRole');

  const seenMapRef = useRef<Record<string, number>>({});
  const initialLoadRef = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => { initialLoadRef.current = false; }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const getHighlightStatus = (id: string) => {
    if (!seenMapRef.current[id]) {
      seenMapRef.current[id] = initialLoadRef.current ? 0 : Date.now();
    }
    return seenMapRef.current[id] > 0 && (now - seenMapRef.current[id]) < 5000;
  };

  useEffect(() => {
    if (userRole !== 'KITCHEN_SCREEN' && userRole !== 'SUPER_ADMIN') {
      toast.error('Bạn không có quyền truy cập màn hình bếp!');
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

    // Fetch recent orders and filter PENDING locally to avoid any index issues
    const qOrders = query(
      collection(db, 'orders'),
      where('kitchenStatus', '==', 'PENDING')
    );
    const unsubOrders = onSnapshot(qOrders, (snap) => {
      const ordersData = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((o: any) => o.branchId === branchId);
      setTakeawayOrders(ordersData);
      setTakeawayError(null);
    }, (error) => {
      console.error("Takeaway orders query failed:", error);
      setTakeawayError(error.message);
    });

    // Listen to Active Table Orders
    const qTables = query(
      collection(db, 'active_table_orders'),
      where('branchId', '==', branchId)
    );
    const unsubTables = onSnapshot(qTables, (snap) => {
      const tablesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Only keep tables that have at least one item not served
      const activeTables = tablesData.filter(t => (t as any).items?.some((i: any) => !i.isServed));
      setTableOrders(activeTables);
    });

    return () => {
      unsubOrders();
      unsubTables();
    };
  }, [branchId, navigate, userRole]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { });
      }
    }
  };

  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }
    navigate('/dashboard');
  };



  const markTableOrderDone = async (orderId: string) => {
    const order = tableOrders.find(o => o.id === orderId);
    if (!order) return;
    const newItems = order.items.map((item: any) => ({ ...item, isServed: true }));

    try {
      await updateDoc(doc(db, 'active_table_orders', orderId), {
        items: newItems
      });
    } catch (error) {
      console.error('Lỗi khi cập nhật:', error);
      toast.error('Có lỗi xảy ra');
    }
  };



  const markTakeawayOrderDone = async (orderId: string) => {
    const order = takeawayOrders.find(o => o.id === orderId);
    if (!order) return;
    const newItems = order.items.map((item: any) => ({ ...item, isServed: true }));

    try {
      await updateDoc(doc(db, 'orders', orderId), {
        items: newItems,
        kitchenStatus: 'DONE'
      });
    } catch (error) {
      console.error('Lỗi khi cập nhật:', error);
    }
  };

  // Sort orders based on the oldest unserved item or uncompleted request
  const getOldestPendingTimestamp = (order: any) => {
    let oldest = Infinity;

    if (order.customerRequests) {
      for (const req of order.customerRequests) {
        if (!req.isCompleted && req.timestamp < oldest) oldest = req.timestamp;
      }
    }

    if (order.items) {
      for (const item of order.items) {
        if (!item.isServed) {
          if (item.cartItemId) {
            const tsStr = item.cartItemId.substring(0, 13);
            const ts = parseInt(tsStr, 10);
            if (!isNaN(ts) && ts > 1600000000000 && ts < oldest) {
              oldest = ts;
            }
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

  useEffect(() => {
    const currentIds: string[] = [];
    allOrders.forEach(o => {
      currentIds.push(o.id);
      if (o.customerRequests) {
        o.customerRequests.filter((r: any) => !r.isCompleted).forEach((r: any) => currentIds.push(r.id));
      }
      if (o.items) {
        o.items.filter((i: any) => !i.isServed).forEach((i: any) => currentIds.push(i.cartItemId || `${i.menuItemId}-${i.selectedSize}`));
        o.items.filter((i: any) => i.cancelRequested).forEach((i: any) => currentIds.push(`cancel-${i.cartItemId || i.menuItemId}`));
      }
    });
    const currentPendingStr = currentIds.join(',');

    const prevArr = prevPendingIds.split(',').filter(Boolean);
    const currArr = currentPendingStr.split(',').filter(Boolean);

    const hasNewItems = currArr.some(id => !prevArr.includes(id));

    if (hasNewItems && prevPendingIds !== '') {
      playNotificationSound();
    }

    setPrevPendingIds(currentPendingStr);
  }, [allOrders, prevPendingIds]);

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          {storeLogo ? (
            <img src={storeLogo} alt="Logo" className="w-10 h-10 object-contain rounded-md bg-white p-1" />
          ) : (
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <ChefHat size={24} className="text-white" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold"
                style={{ fontFamily: storeNameFont, color: storeNameColor }}>
              {storeName.toUpperCase()}
            </h1>
            <p className="text-sm text-gray-400 font-medium">{branchName}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {takeawayError && <div className="text-red-500 font-bold bg-red-100 px-2 py-1 rounded">Lỗi: {takeawayError}</div>}
          <div className="text-center px-4 py-1 bg-gray-700 rounded-lg border border-gray-600">
            <p className="text-xs text-gray-400">Đang chờ xử lý</p>
            <p className="text-xl font-black text-orange-400">{allOrders.length} Đơn</p>
          </div>
          <button
            onClick={() => window.open('/order-tracking', '_blank')}
            className="p-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white"
            title="Mở màn hình theo dõi cho khách"
          >
            <Monitor size={24} />
          </button>
          <button
            onClick={handleToggleFullscreen}
            className="p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-gray-300"
            title="Toàn màn hình"
          >
            {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
          </button>
          <button
            onClick={handleClose}
            className="p-3 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-white"
            title="Đóng (Về Quản trị)"
          >
            <X size={24} />
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 p-4 overflow-y-auto overflow-x-hidden">
        {allOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4">
            <ChefHat size={80} className="opacity-20" />
            <p className="text-2xl font-bold">Không có đơn hàng nào đang chờ</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 pb-4">
            {allOrders.map((order: any, orderIndex: number) => {
              const isInProgress = orderIndex === 0;
              const isNewOrder = getHighlightStatus(`order-${order.id}`);
              
              return (
              <div 
                key={order.id} 
                className={`bg-gray-800 rounded-2xl shadow-xl border overflow-hidden flex flex-col transition-all duration-500 ${
                  isNewOrder ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)] animate-pulse' :
                  isInProgress ? 'border-orange-500 shadow-orange-500/20' : 'border-gray-700'
                }`}
              >
                  {/* Card Header */}
                  <div className={`p-4 flex flex-col border-b ${isInProgress
                      ? 'border-orange-500/30 bg-orange-900/20'
                      : order.type === 'TABLE' ? 'border-blue-500/20 bg-blue-900/20' : 'border-purple-500/20 bg-purple-900/20'
                    }`}>
                    <div className="flex justify-between items-center mb-2 w-full">
                      <div className="flex items-center gap-4">
                        <span className={`w-14 h-14 rounded-xl flex items-center justify-center font-black text-3xl shadow-inner ${order.type === 'TABLE' ? 'bg-blue-500/20 text-blue-400 border-2 border-blue-500/30' : 'bg-purple-500/20 text-purple-400 border-2 border-purple-500/30'}`}>
                          {orderIndex + 1}
                        </span>
                        <h3 className={`font-black text-3xl ${isInProgress ? 'text-orange-400' : order.type === 'TABLE' ? 'text-blue-400' : 'text-purple-400'
                          }`}>
                          {order.type === 'TABLE' ? order.tableName : `#${order.orderCode || ''}`}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1 text-gray-400 bg-gray-900 px-2 py-1 rounded-md text-sm font-medium">
                        <Clock size={14} />
                        {formatTime(order.createdAt || order.updatedAt)}
                      </div>
                    </div>
                    {order.customerRequests && order.customerRequests.some((r: any) => !r.isCompleted) && (
                      <div className="mt-2 text-orange-300 text-sm font-bold flex items-center gap-1">
                        <MessageSquare size={16} /> Có yêu cầu từ khách!
                      </div>
                    )}
                  </div>

                  {/* Card Body - Items */}
                  <div className="p-4">

                    {/* Requests rendering */}
                    {order.customerRequests?.filter((r: any) => !r.isCompleted).length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 mb-4">
                        {order.customerRequests.filter((r: any) => !r.isCompleted).map((req: any, idx: number) => {
                          const isNewReq = getHighlightStatus(`req-${req.id || idx}`);
                          return (
                          <div key={req.id || idx} className={`border rounded-xl p-3 transition-all flex flex-col gap-2 duration-500 ${
                            isNewReq ? 'bg-green-900/40 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)] animate-pulse' : 'bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/30'
                          }`}>
                            <div className="flex justify-between items-start gap-2">
                              <p className={`font-bold leading-tight ${isNewReq ? 'text-green-300' : 'text-orange-300'}`}>
                                {req.message}
                              </p>
                              <span className="text-[10px] text-orange-400 shrink-0 font-medium">
                                {new Date(req.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex justify-end gap-2 mt-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionModal({
                                    type: 'REJECT_REQUEST',
                                    orderId: order.id,
                                    reqId: req.id,
                                    reqMessage: req.message
                                  });
                                }}
                                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold transition-colors"
                              >
                                Từ chối
                              </button>
                              <button
                                onClick={async () => {
                                  const newReqs = [...order.customerRequests];
                                  const reqIndex = newReqs.findIndex(r => r.id === req.id);
                                  if (reqIndex !== -1) newReqs[reqIndex].isCompleted = true;
                                  await updateDoc(doc(db, 'active_table_orders', order.id), {
                                    customerRequests: newReqs
                                  });
                                }}
                                className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-colors"
                              >
                                Đã xong
                              </button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                      {order.items.map((item: any) => {
                        const isTakeaway = order.type === 'TAKEAWAY';
                        const itemId = isTakeaway ? `${item.menuItemId}-${item.selectedSize}` : item.cartItemId;

                        const isNewItem = !item.isServed && getHighlightStatus(`item-${itemId}`);

                        return (
                          <div
                            key={itemId}
                            className={`border rounded-xl p-3 transition-all duration-500 group flex flex-col gap-2 ${isNewItem
                                ? 'bg-green-900/40 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)] animate-pulse'
                                : item.cancelRequested
                                  ? 'bg-red-900/30 border-red-500/50'
                                  : item.isServed
                                    ? 'bg-gray-800 border-gray-700 opacity-60 cursor-pointer active:scale-95'
                                    : 'bg-gray-700 hover:bg-gray-600 border-gray-600 cursor-pointer active:scale-95'
                              }`}
                            onClick={async () => {
                              if (item.cancelRequested) return; // Prevent normal click when cancelling

                              // Toggle isServed
                              const newIsServed = !item.isServed;
                              if (isTakeaway) {
                                // Takeaway logic
                                const orderRef = takeawayOrders.find(o => o.id === order.id);
                                if (!orderRef) return;
                                const newItems = orderRef.items.map((i: any) => {
                                  if (i.menuItemId === item.menuItemId && i.selectedSize === (item.selectedSize || null)) {
                                    return { ...i, isServed: newIsServed };
                                  }
                                  return i;
                                });
                                const isAllDone = newItems.every((i: any) => i.isServed);
                                try {
                                  await updateDoc(doc(db, 'orders', order.id), {
                                    items: newItems,
                                    kitchenStatus: isAllDone ? 'DONE' : 'PENDING'
                                  });
                                } catch (e) {
                                  toast.error('Lỗi khi cập nhật');
                                }
                              } else {
                                // Table logic
                                const orderRef = tableOrders.find(o => o.id === order.id);
                                if (!orderRef) return;
                                const newItems = orderRef.items.map((i: any) =>
                                  i.cartItemId === item.cartItemId ? { ...i, isServed: newIsServed } : i
                                );
                                try {
                                  await updateDoc(doc(db, 'active_table_orders', order.id), {
                                    items: newItems
                                  });
                                } catch (e) {
                                  toast.error('Lỗi khi cập nhật');
                                }
                              }
                            }}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={`font-black text-xl text-white w-8 h-8 flex items-center justify-center rounded-md border ${item.cancelRequested ? 'bg-red-900/50 border-red-500/50' : item.isServed ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-gray-900 border-gray-600'
                                    }`}>
                                    {item.quantity}
                                  </span>
                                  <div>
                                    <p className={`font-bold text-lg leading-tight transition-colors ${item.cancelRequested
                                        ? 'text-red-300 line-through opacity-70'
                                        : item.isServed
                                          ? 'text-gray-500 line-through'
                                          : 'text-gray-100 group-hover:text-orange-300'
                                      }`}>
                                      {item.name}
                                    </p>
                                    {item.selectedSize && (
                                      <p className={`text-sm font-medium ${item.cancelRequested ? 'text-red-400/70' : item.isServed ? 'text-gray-500 line-through' : 'text-orange-400'}`}>Cỡ: {item.selectedSize}</p>
                                    )}
                                    <p className="text-[10px] font-bold text-gray-500 mt-0.5">
                                      {(() => {
                                        if (item.cartItemId) {
                                          const t = parseInt(item.cartItemId.substring(0, 13));
                                          if (!isNaN(t) && t > 1600000000000) {
                                            return new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                                          }
                                        }
                                        return formatTime(order.createdAt || order.updatedAt);
                                      })()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              {!item.cancelRequested && (
                                <div className="flex items-center gap-1 ml-2 shrink-0">
                                  {!isTakeaway && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActionModal({
                                          type: 'DELETE_ITEM',
                                          orderId: order.id,
                                          itemId: item.cartItemId,
                                          itemName: item.name,
                                          reqMessage: undefined
                                        });
                                      }}
                                      className="w-10 h-10 rounded-full border-2 border-red-500/30 flex items-center justify-center text-red-500/50 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500 transition-all group/del"
                                      title="Huỷ món này"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  )}

                                  <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${item.isServed
                                      ? 'border-green-500 bg-green-500/20 text-green-500'
                                      : 'border-gray-500 text-gray-500 group-hover:border-green-500 group-hover:bg-green-500/20 group-hover:text-green-500'
                                    }`}>
                                    <CheckCircle size={20} />
                                  </div>
                                </div>
                              )}
                            </div>

                            {item.cancelRequested && (
                              <div className="mt-1 flex flex-col gap-2 border-t border-red-500/30 pt-2">
                                <div className="text-red-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                  Khách yêu cầu huỷ món này!
                                </div>
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActionModal({
                                        type: 'REJECT_CANCEL',
                                        orderId: order.id,
                                        itemId: item.cartItemId,
                                        itemName: item.name
                                      });
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold transition-colors"
                                  >
                                    Từ chối huỷ
                                  </button>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      // Đồng ý huỷ (xoá món)
                                      const newItems = order.items.filter((i: any) => i.cartItemId !== item.cartItemId);
                                      const newTotal = newItems.reduce((sum: number, i: any) => sum + (i.price * i.quantity), 0);

                                      await updateDoc(doc(db, 'active_table_orders', order.id), {
                                        items: newItems,
                                        totalAmount: newTotal,
                                        notifications: arrayUnion({
                                          id: Date.now().toString(),
                                          message: `Bếp đã đồng ý huỷ món ${item.name}`,
                                          timestamp: Date.now()
                                        })
                                      });
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
                                  >
                                    Đồng ý huỷ
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="p-3 border-t border-gray-700 bg-gray-800 flex justify-end">
                    <button
                      onClick={() => {
                        setActionModal({ type: 'FINISH_ORDER', orderId: order.id });
                      }}
                      className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={24} />
                      Hoàn thành đơn này
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Action Modal (Reject Request or Reject Cancel) */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-center text-red-400 mb-2">
              {actionModal.type === 'DELETE_ITEM' ? 'Xác nhận huỷ món' :
                actionModal.type === 'FINISH_ORDER' ? 'Xác nhận hoàn thành' : 'Xác nhận từ chối'}
            </h3>
            <p className="text-gray-400 text-center mb-6 text-sm">
              {actionModal.type === 'FINISH_ORDER'
                ? 'Hãy kiểm tra lại hoá đơn. Bạn có chắc chắn muốn hoàn thành đơn này không?'
                : `Bạn có chắc chắn muốn ${actionModal.type === 'REJECT_REQUEST' ? `từ chối yêu cầu "${actionModal.reqMessage}"` : actionModal.type === 'REJECT_CANCEL' ? `từ chối yêu cầu huỷ món "${actionModal.itemName}"` : `huỷ món "${actionModal.itemName}"`} không?`}
            </p>

            {actionModal.type !== 'FINISH_ORDER' && (
              <div className="mb-6">
                <input
                  type="text"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={`Lý do ${actionModal.type === 'DELETE_ITEM' ? 'huỷ món' : 'từ chối'} (không bắt buộc)...`}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm focus:border-red-500 outline-none text-white placeholder-gray-500"
                  autoFocus
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setActionModal(null); setActionReason(''); }}
                className="flex-1 py-3 bg-gray-700 text-gray-300 font-bold rounded-xl hover:bg-gray-600 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={async () => {
                  try {
                    const order = allOrders.find(o => o.id === actionModal.orderId);
                    if (!order) return;

                    const reasonStr = actionReason.trim() ? `. Lý do: ${actionReason.trim()}` : '';

                    if (actionModal.type === 'REJECT_REQUEST') {
                      const newReqs = order.customerRequests.filter((r: any) => r.id !== actionModal.reqId);
                      await updateDoc(doc(db, 'active_table_orders', actionModal.orderId), {
                        customerRequests: newReqs,
                        notifications: arrayUnion({
                          id: Date.now().toString(),
                          message: `Bếp đã từ chối yêu cầu: "${actionModal.reqMessage}"${reasonStr}`,
                          timestamp: Date.now()
                        })
                      });
                      toast.success('Đã từ chối yêu cầu');
                    } else if (actionModal.type === 'REJECT_CANCEL') {
                      const newItems = [...order.items];
                      const idx = newItems.findIndex((i: any) => i.cartItemId === actionModal.itemId);
                      if (idx !== -1) {
                        newItems[idx].cancelRequested = false;
                        await updateDoc(doc(db, 'active_table_orders', actionModal.orderId), {
                          items: newItems,
                          notifications: arrayUnion({
                            id: Date.now().toString(),
                            message: `Bếp đã từ chối yêu cầu huỷ món ${actionModal.itemName}${reasonStr}`,
                            timestamp: Date.now()
                          })
                        });
                        toast.success('Đã từ chối huỷ món');
                      }
                    } else if (actionModal.type === 'DELETE_ITEM') {
                      if (order.type === 'TAKEAWAY') {
                        const newItems = order.items.filter((i: any) => !(i.menuItemId === actionModal.itemId && (i.selectedSize || null) === actionModal.reqMessage));
                        const isAllDone = newItems.length > 0 && newItems.every((i: any) => i.isServed);
                        await updateDoc(doc(db, 'orders', actionModal.orderId), {
                          items: newItems,
                          kitchenStatus: newItems.length === 0 ? 'DONE' : (isAllDone ? 'DONE' : 'PENDING')
                        });
                        toast.success('Đã huỷ món');
                      } else {
                        const newItems = order.items.filter((i: any) => i.cartItemId !== actionModal.itemId);
                        const newTotal = newItems.reduce((sum: number, i: any) => sum + (i.price * i.quantity), 0);
                        await updateDoc(doc(db, 'active_table_orders', actionModal.orderId), {
                          items: newItems,
                          totalAmount: newTotal,
                          notifications: arrayUnion({
                            id: Date.now().toString(),
                            message: `Bếp đã huỷ món ${actionModal.itemName}${reasonStr}`,
                            timestamp: Date.now()
                          })
                        });
                        toast.success('Đã huỷ món');
                      }
                    } else if (actionModal.type === 'FINISH_ORDER') {
                      if (order.type === 'TAKEAWAY') await markTakeawayOrderDone(actionModal.orderId);
                      else await markTableOrderDone(actionModal.orderId);
                      toast.success('Đã hoàn thành đơn');
                    }
                  } catch (e) {
                    toast.error('Có lỗi xảy ra');
                  }
                  setActionModal(null);
                  setActionReason('');
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.1); 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2); 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.3); 
        }
      `}</style>
    </div>
  );
};

export default KitchenDisplay;
