import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { TimeInput24 } from '../components/TimeInput24';

import { collection, getDocs, addDoc } from 'firebase/firestore';

const Settings: React.FC = () => {
  const [penaltyMap, setPenaltyMap] = useState<Record<string, number>>({});
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [bonusTargetType, setBonusTargetType] = useState('ALL');
  const [bonusTargetId, setBonusTargetId] = useState('');
  const [bonusAmount, setBonusAmount] = useState(0);
  const [bonusReason, setBonusReason] = useState('');
  const [bonusLoading, setBonusLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  
  const userRole = localStorage.getItem('userRole') || 'EMPLOYEE';
  const employeeId = localStorage.getItem('employeeId');
  const [userBranchId, setUserBranchId] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'general'));
        let pm: Record<string, number> = { ALL: 1000 };
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (typeof data.latePenalty === 'number') {
            pm = { ALL: data.latePenalty };
          } else if (typeof data.latePenalty === 'object') {
            pm = { ...pm, ...data.latePenalty };
          }
        }
        setPenaltyMap(pm);

        const branchSnap = await getDocs(collection(db, 'branches'));
        const brs: any[] = [];
        branchSnap.forEach(b => brs.push({ id: b.id, name: b.data().name }));
        setBranches(brs);

        const empSnap = await getDocs(collection(db, 'employees'));
        const emps: any[] = [];
        let myBranch = '';
        empSnap.forEach(e => {
            const data = e.data();
            emps.push({ id: e.id, fullName: data.fullName, branchId: data.branchId });
            if (e.id === employeeId) myBranch = data.branchId;
        });
        setEmployees(emps);
        setUserBranchId(myBranch);

        if (userRole === 'BRANCH_ADMIN') {
            setSelectedBranch(myBranch);
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
      await setDoc(doc(db, 'settings', 'general'), { latePenalty: penaltyMap }, { merge: true });
      toast.success('Lưu cấu hình thành công!');
    } catch (error) {
      toast.error('Lỗi khi lưu cấu hình');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  const handleBonus = async () => {
    if (!bonusAmount || !bonusReason) {
      toast.error('Vui lòng nhập số tiền và lý do thưởng');
      return;
    }
    setBonusLoading(true);
    try {
      const month = new Date().toISOString().substring(0, 7); // current month
      const promises: any[] = [];
      let targetEmployees: any[] = [];

      if (bonusTargetType === 'ALL') {
        targetEmployees = userRole === 'BRANCH_ADMIN' ? employees.filter(e => e.branchId === userBranchId) : employees;
      } else if (bonusTargetType === 'BRANCH') {
        if (!bonusTargetId) {
          toast.error('Vui lòng chọn cơ sở');
          setBonusLoading(false);
          return;
        }
        targetEmployees = employees.filter(e => e.branchId === bonusTargetId);
      } else if (bonusTargetType === 'EMPLOYEE') {
        if (!bonusTargetId) {
          toast.error('Vui lòng chọn nhân viên');
          setBonusLoading(false);
          return;
        }
        targetEmployees = employees.filter(e => e.id === bonusTargetId);
      }

      if (targetEmployees.length === 0) {
        toast.error('Không tìm thấy nhân viên nào phù hợp');
        setBonusLoading(false);
        return;
      }

      for (const emp of targetEmployees) {
        // Add to bonuses collection
        promises.push(addDoc(collection(db, 'bonuses'), {
          employeeId: emp.id,
          amount: bonusAmount,
          reason: bonusReason,
          month: month,
          createdAt: new Date()
        }));

        // Send notification
        promises.push(addDoc(collection(db, 'notifications'), {
          employeeId: emp.id,
          title: 'Nhận thưởng đột xuất',
          message: `Bạn vừa được thưởng ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(bonusAmount)} với lý do: ${bonusReason}.`,
          type: 'MONEY_ADD',
          read: false,
          createdAt: new Date()
        }));
      }

      await Promise.all(promises);
      toast.success(`Đã thưởng cho ${targetEmployees.length} nhân viên!`);
      setBonusAmount(0);
      setBonusReason('');
      setBonusTargetId('');
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra khi thưởng');
    } finally {
      setBonusLoading(false);
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
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cơ sở áp dụng</label>
            <select 
              value={selectedBranch} 
              onChange={e => setSelectedBranch(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
              disabled={userRole === 'BRANCH_ADMIN'}
            >
              {userRole === 'SUPER_ADMIN' && <option value="ALL">Tất cả cơ sở (Mặc định)</option>}
              {branches.filter(b => userRole === 'SUPER_ADMIN' || b.id === userBranchId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Mức phạt đi trễ (VNĐ / phút)</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" 
              value={(penaltyMap[selectedBranch] || 0) === 0 ? '' : (penaltyMap[selectedBranch] || 0).toLocaleString('vi-VN')} 
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                const num = parseInt(val) || 0;
                setPenaltyMap(prev => ({ ...prev, [selectedBranch]: num }));
              }} 
              placeholder="0"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Giờ bắt đầu ca sáng</label>
          <TimeInput24 
            value="08:00" 
            onChange={() => {}} 
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 bg-white" 
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4 max-w-2xl">
        <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3">Thưởng Đột Xuất / Lễ Tết</h3>
        <p className="text-xs text-gray-500">Khoản thưởng sẽ được cộng trực tiếp vào bảng lương tháng này của nhân viên.</p>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Đối tượng áp dụng</label>
            <select 
              value={bonusTargetType} 
              onChange={e => { setBonusTargetType(e.target.value); setBonusTargetId(''); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
            >
              <option value="ALL">{userRole === 'SUPER_ADMIN' ? 'Toàn bộ nhân viên' : 'Tất cả nhân viên thuộc cơ sở này'}</option>
              {userRole === 'SUPER_ADMIN' && <option value="BRANCH">Theo cơ sở</option>}
              <option value="EMPLOYEE">Nhân viên cụ thể</option>
            </select>
          </div>
          
          {bonusTargetType !== 'ALL' && (
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Chọn {bonusTargetType === 'BRANCH' ? 'Cơ sở' : 'Nhân viên'}</label>
              <select 
                value={bonusTargetId} 
                onChange={e => setBonusTargetId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
              >
                <option value="">-- Chọn --</option>
                {bonusTargetType === 'BRANCH' && branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                {bonusTargetType === 'EMPLOYEE' && employees.filter(e => userRole === 'SUPER_ADMIN' || e.branchId === userBranchId).map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền thưởng (VNĐ)</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" 
              value={bonusAmount === 0 ? '' : bonusAmount.toLocaleString('vi-VN')} 
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setBonusAmount(parseInt(val) || 0);
              }} 
              placeholder="0"
            />
          </div>
          <div className="flex-[2]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Lý do thưởng</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" 
              value={bonusReason} 
              onChange={e => setBonusReason(e.target.value)} 
              placeholder="VD: Thưởng lễ 2/9, Nhân viên xuất sắc..."
            />
          </div>
        </div>

        <button 
          onClick={handleBonus}
          disabled={bonusLoading}
          className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {bonusLoading ? 'Đang xử lý...' : 'Thưởng ngay'}
        </button>
      </div>
    </div>
  );
};

export default Settings;

