import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, updateDoc, doc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { Bell, Check, Clock, UserCog, Wallet, Info, TrendingUp, TrendingDown, Megaphone, Plus, X, Edit2 } from 'lucide-react';

interface Notification {
  id: string;
  employeeId: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: any;
}

const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const currentEmployeeId = localStorage.getItem('employeeId');
  const userRole = localStorage.getItem('userRole');
  const currentUserBranchId = localStorage.getItem('branchId');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);
  const [newNotif, setNewNotif] = useState({ title: '', message: '', expiresAt: '', targetBranchId: 'ALL' });
  const [sending, setSending] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    if (userRole === 'SUPER_ADMIN') {
      const fetchBranches = async () => {
        try {
          const snap = await getDocs(collection(db, 'branches'));
          const list: any[] = [];
          snap.forEach(d => list.push({ id: d.id, ...d.data() }));
          setBranches(list);
        } catch (err) {
          console.error(err);
        }
      };
      fetchBranches();
    }
  }, [userRole]);

  useEffect(() => {
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'BRANCH_ADMIN') return;
    const fetchAnns = async () => {
      try {
        const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach(d => {
          const data = d.data();
          if (userRole === 'BRANCH_ADMIN') {
            if (data.createdByRole === 'SUPER_ADMIN' || (!data.createdByRole && data.targetBranchId === 'ALL')) return;
            if (data.targetBranchId !== 'ALL' && data.targetBranchId !== currentUserBranchId) return;
          }
          list.push({ id: d.id, ...data });
        });
        setAnnouncements(list);
      } catch (err) {
        console.error(err);
      }
    };
    fetchAnns();
  }, [userRole, currentUserBranchId]);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!currentEmployeeId && userRole !== 'SUPER_ADMIN') {
        setLoading(false);
        return;
      }
      
      try {
        const list: Notification[] = [];
        
        // Fetch personal notifications
        if (currentEmployeeId) {
          const q = query(
            collection(db, 'notifications'),
            where('employeeId', '==', currentEmployeeId),
            orderBy('createdAt', 'desc')
          );
          const snap = await getDocs(q);
          snap.forEach(d => list.push({ id: d.id, ...d.data() } as Notification));
        }

        // Fetch announcements
        const qAnn = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
        const snapAnn = await getDocs(qAnn);
        
        const now = new Date();
        snapAnn.forEach(d => {
          const data = d.data();
          
          // Check expiration
          let isExpired = false;
          if (data.expiresAt) {
            const expDate = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
            if (now > expDate) isExpired = true;
          }
          if (isExpired) return;

          // Check branch target (for employees and branch admins)
          if (userRole !== 'SUPER_ADMIN') {
             if (data.targetBranchId !== 'ALL' && data.targetBranchId !== currentUserBranchId) return;
          }
          
          list.push({
            id: d.id,
            employeeId: currentEmployeeId || 'admin',
            title: data.title,
            message: data.message,
            type: 'ANNOUNCEMENT',
            read: true, // Announcements are always "read"
            createdAt: data.createdAt
          });
        });

        // Sort combined list by createdAt desc
        list.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
          return dateB - dateA;
        });

        setNotifications(list);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [currentEmployeeId, userRole, currentUserBranchId]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
      setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'announcements', id));
      setAnnouncements(announcements.filter(a => a.id !== id));
      toast.success('Đã xóa thông báo chung!');
    } catch (err) {
      toast.error('Có lỗi khi xóa!');
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotif.title || !newNotif.message) {
      toast.error('Vui lòng nhập đầy đủ tiêu đề và nội dung');
      return;
    }
    
    setSending(true);
    try {
      const targetBranchId = userRole === 'SUPER_ADMIN' ? newNotif.targetBranchId : currentUserBranchId;
      const targetBranchName = userRole === 'SUPER_ADMIN' 
        ? (newNotif.targetBranchId === 'ALL' ? 'Toàn hệ thống' : branches.find(b => b.id === newNotif.targetBranchId)?.name || 'Chi nhánh')
        : 'Chi nhánh của bạn';

      let expiresAtDate = null;
      if (newNotif.expiresAt) {
        expiresAtDate = new Date(newNotif.expiresAt);
        expiresAtDate.setHours(23, 59, 59, 999); // Hết ngày đó
      }

      const docData = {
         title: newNotif.title,
         message: newNotif.message,
         targetBranchId,
         targetBranchName,
         expiresAt: expiresAtDate,
         updatedAt: new Date()
      };
      
      if (editingAnnId) {
        await updateDoc(doc(db, 'announcements', editingAnnId), docData);
        toast.success('Đã cập nhật thông báo chung!');
        setAnnouncements(announcements.map(a => a.id === editingAnnId ? { ...a, ...docData } : a));
      } else {
        const newDocData = { ...docData, createdAt: new Date(), createdBy: currentEmployeeId, createdByRole: userRole };
        const docRef = await addDoc(collection(db, 'announcements'), newDocData);
        toast.success('Đã tạo thông báo chung thành công!');
        setAnnouncements([{ id: docRef.id, ...newDocData }, ...announcements]);
      }
      
      setIsModalOpen(false);
      setEditingAnnId(null);
      setNewNotif({ title: '', message: '', expiresAt: '', targetBranchId: 'ALL' });
    } catch (err) {
      console.error(err);
      toast.error('Có lỗi xảy ra khi lưu thông báo');
    } finally {
      setSending(false);
    }
  };

  const handleOpenEditModal = (a: any) => {
    setEditingAnnId(a.id);
    setNewNotif({
      title: a.title,
      message: a.message,
      targetBranchId: a.targetBranchId || 'ALL',
      expiresAt: a.expiresAt ? (a.expiresAt.toDate ? a.expiresAt.toDate().toISOString().split('T')[0] : new Date(a.expiresAt).toISOString().split('T')[0]) : ''
    });
    setIsModalOpen(true);
  };

  const handleOpenCreateModal = () => {
    setEditingAnnId(null);
    setNewNotif({ title: '', message: '', expiresAt: '', targetBranchId: 'ALL' });
    setIsModalOpen(true);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'SALARY_UPDATE': return <Wallet className="text-green-500" size={24} />;
      case 'PROFILE_UPDATE': return <UserCog className="text-blue-500" size={24} />;
      case 'MONEY_ADD': return <TrendingUp className="text-green-500" size={24} />;
      case 'MONEY_SUB': return <TrendingDown className="text-red-500" size={24} />;
      case 'ANNOUNCEMENT': return <Megaphone className="text-orange-500" size={24} />;
      case 'SYSTEM': return <Info className="text-blue-500" size={24} />;
      default: return <Info className="text-gray-500" size={24} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center">
            <Bell className="mr-2 text-blue-600" /> Thông báo
          </h2>
          <p className="text-gray-500 mt-1 text-sm">Cập nhật các thay đổi liên quan đến tài khoản và lương</p>
        </div>
        
        {(userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN') && (
           <button 
             onClick={handleOpenCreateModal} 
             className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold shadow-sm transition-colors flex items-center gap-2"
           >
             <Plus size={18} /> Gửi thông báo chung
           </button>
        )}
      </div>

      {(userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN') && announcements.length > 0 && (
        <div className="bg-orange-50 border border-orange-100 p-6 rounded-xl shadow-sm">
          <h3 className="text-lg font-bold text-orange-900 mb-4 flex items-center">
            <Megaphone className="mr-2 text-orange-600" /> Quản lý Thông báo Banner
          </h3>
          <div className="grid gap-3">
            {announcements.map(a => (
              <div key={a.id} className="bg-white p-4 rounded-lg shadow-sm border border-orange-100 flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-gray-800">{a.title}</h4>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-1">{a.message}</p>
                  <p className="text-xs text-orange-600 mt-2 font-medium">
                    Hết hạn: {a.expiresAt ? (a.expiresAt.toDate ? a.expiresAt.toDate().toLocaleDateString('vi-VN') : new Date(a.expiresAt).toLocaleDateString('vi-VN')) : 'Không bao giờ'} 
                    <span className="mx-2">•</span> Phạm vi: {a.targetBranchName || (a.targetBranchId === 'ALL' ? 'Toàn hệ thống' : 'Chi nhánh')}
                  </p>
                </div>
                <div className="flex ml-4 flex-shrink-0">
                  <button 
                    onClick={() => handleOpenEditModal(a)}
                    className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-2 rounded-lg transition-colors mr-1"
                    title="Sửa thông báo"
                  >
                    <Edit2 size={20} />
                  </button>
                  <button 
                    onClick={() => handleDeleteAnnouncement(a.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
                    title="Xóa thông báo"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Đang tải thông báo...</div>
        ) : notifications.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center bg-gray-50/50">
            <Bell size={48} className="text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium">Bạn chưa có thông báo nào.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map(notif => (
              <div 
                key={notif.id} 
                className={`p-5 flex gap-4 transition-colors ${notif.read ? 'bg-white' : 'bg-blue-50/50'}`}
              >
                <div className={`p-3 rounded-full h-fit flex-shrink-0 ${notif.read ? 'bg-gray-100' : 'bg-white shadow-sm'}`}>
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h4 className={`text-base ${notif.read ? 'font-medium text-gray-700' : 'font-bold text-gray-900'}`}>
                      {notif.title}
                    </h4>
                    <span className="text-xs text-gray-500 flex items-center whitespace-nowrap ml-4">
                      <Clock size={12} className="mr-1" />
                      {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleString('vi-VN') : ''}
                    </span>
                  </div>
                  <p className={`mt-1 text-sm ${notif.read ? 'text-gray-500' : 'text-gray-700'}`}>
                    {notif.message}
                  </p>
                  
                  {!notif.read && (
                    <button 
                      onClick={() => markAsRead(notif.id)}
                      className="mt-3 text-sm flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      <Check size={16} className="mr-1" /> Đánh dấu đã đọc
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 className="font-bold text-lg text-gray-800">
                {editingAnnId ? 'Cập nhật thông báo chung' : 'Gửi thông báo chung'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSendNotification} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
                <input 
                  type="text" required
                  value={newNotif.title}
                  onChange={(e) => setNewNotif({...newNotif, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  placeholder="Nhập tiêu đề thông báo..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung</label>
                <textarea 
                  required rows={4}
                  value={newNotif.message}
                  onChange={(e) => setNewNotif({...newNotif, message: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 resize-none"
                  placeholder="Nhập nội dung chi tiết..."
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày hết hạn hiển thị (Tùy chọn)</label>
                <input 
                  type="date"
                  value={newNotif.expiresAt}
                  onChange={(e) => setNewNotif({...newNotif, expiresAt: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-gray-700"
                />
                <p className="text-xs text-gray-500 mt-1">Nếu để trống, thông báo sẽ hiển thị mãi cho đến khi bạn xóa.</p>
              </div>

              {userRole === 'SUPER_ADMIN' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phạm vi hiển thị</label>
                  <select
                    value={newNotif.targetBranchId}
                    onChange={(e) => setNewNotif({...newNotif, targetBranchId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-gray-700"
                  >
                    <option value="ALL">Toàn hệ thống (Tất cả cơ sở)</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-sm text-orange-800 flex">
                <Info size={18} className="mr-2 flex-shrink-0 mt-0.5" />
                <p>Thông báo sẽ được gửi đến <b>{userRole === 'SUPER_ADMIN' ? (newNotif.targetBranchId === 'ALL' ? 'toàn bộ nhân viên trên hệ thống' : 'nhân viên thuộc cơ sở đã chọn') : 'tất cả nhân viên trong cơ sở của bạn'}</b>.</p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  disabled={sending}
                  className={`px-4 py-2 text-white rounded-lg flex items-center font-medium ${sending ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} transition-colors`}
                >
                  {sending ? 'Đang lưu...' : (editingAnnId ? 'Cập nhật' : 'Gửi thông báo')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;

