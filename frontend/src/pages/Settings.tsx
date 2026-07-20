import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';

const Settings: React.FC = () => {
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'general'));
        if (docSnap.exists() && docSnap.data().announcement) {
          setAnnouncement(docSnap.data().announcement);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), { announcement }, { merge: true });
      toast.success('Lưu cấu hình thành công!');
    } catch (error) {
      toast.error('Lỗi khi lưu cấu hình');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 flex items-center">
          <SettingsIcon className="mr-2 text-gray-600" /> Thiết Lập Hệ Thống
        </h2>
        <p className="text-sm text-gray-500 mt-1">Cấu hình các tham số về chấm công, tính lương.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mức phạt đi trễ (VNĐ / phút)</label>
          <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" defaultValue={1000} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Giờ bắt đầu ca sáng</label>
          <input type="time" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" defaultValue="08:00" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Thông báo toàn hệ thống (Gửi đến Nhân viên)</label>
          <textarea 
            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" 
            rows={3}
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="Nhập thông báo gửi đến toàn thể nhân viên..."
          />
        </div>
        <button 
          onClick={handleSave}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {loading ? 'Đang lưu...' : 'Lưu Cấu Hình'}
        </button>
      </div>
    </div>
  );
};

export default Settings;

