import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, X, Image as ImageIcon } from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc, deleteField, collection, getDocs, addDoc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { TimeInput24 } from '../components/TimeInput24';

const calculateHoursWorked = (data: any): number => {
  if (!data.checkIn) return 0;
  if (data.logs && data.logs.length > 0) {
    let totalMs = 0;
    let lastIn: Date | null = null;
    for (const log of data.logs) {
      if (log.action === 'CHECK_IN') {
        lastIn = log.time?.toDate ? log.time.toDate() : new Date(log.time);
      } else if (log.action === 'CHECK_OUT' && lastIn) {
        const outTime = log.time?.toDate ? log.time.toDate() : new Date(log.time);
        totalMs += outTime.getTime() - lastIn.getTime();
        lastIn = null;
      }
    }
    if (lastIn && !data.checkOut) {
      totalMs += Date.now() - lastIn.getTime();
    }
    return totalMs / (1000 * 60 * 60);
  }
  const inTime = data.checkIn?.toDate ? data.checkIn.toDate() : new Date(data.checkIn);
  if (!data.checkOut) {
    return Math.max(0, Date.now() - inTime.getTime()) / (1000 * 60 * 60);
  }
  const outTime = data.checkOut?.toDate ? data.checkOut.toDate() : new Date(data.checkOut);
  return Math.max(0, outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
};

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 500;
        const MAX_HEIGHT = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const Settings: React.FC = () => {
  const [penaltyMap, setPenaltyMap] = useState<Record<string, number>>({});
  const [lateGracePeriodMap, setLateGracePeriodMap] = useState<Record<string, number>>({});
  const [dbPenaltyMap, setDbPenaltyMap] = useState<Record<string, number>>({});
  const [dbLateGracePeriodMap, setDbLateGracePeriodMap] = useState<Record<string, number>>({});
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [graceString, setGraceString] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [bonusTargetType, setBonusTargetType] = useState('ALL');
  const [bonusTargetId, setBonusTargetId] = useState('');
  const [bonusEmployeeBranchId, setBonusEmployeeBranchId] = useState('ALL');
  const [bonusAmount, setBonusAmount] = useState<number>(0);
  const [bonusReason, setBonusReason] = useState<string>('');
  const [bonusType, setBonusType] = useState<string>('BONUS');
  const [bonusLoading, setBonusLoading] = useState<boolean>(false);
  const [employees, setEmployees] = useState<any[]>([]);

  // Branding States
  const [storeName, setStoreName] = useState(localStorage.getItem('storeName') || 'Tiệm nhà Bơ');
  const [storeNameColor, setStoreNameColor] = useState(localStorage.getItem('storeNameColor') || '#2563eb');
  const [storeNameFont, setStoreNameFont] = useState(localStorage.getItem('storeNameFont') || 'system-ui, sans-serif');
  const [storeLogo, setStoreLogo] = useState(localStorage.getItem('storeLogo') || '');
  const [localLogoFile, setLocalLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState(localStorage.getItem('storeLogo') || '');
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  const userRole = localStorage.getItem('userRole') || 'EMPLOYEE';
  const employeeId = localStorage.getItem('employeeId');
  const [userBranchId, setUserBranchId] = useState('');

  useEffect(() => {
    // Only update graceString from db state when branch changes or db state changes
    const secs = dbLateGracePeriodMap[selectedBranch] !== undefined ? dbLateGracePeriodMap[selectedBranch] : (dbLateGracePeriodMap['ALL'] ?? 900);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    setGraceString(`${m}:${s.toString().padStart(2, '0')}`);
  }, [selectedBranch, dbLateGracePeriodMap]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'general'));
        let pm: Record<string, number> = { ALL: 0 };
        let sm: Record<string, number> = { ALL: 0 };
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (typeof data.latePenalty === 'number') {
            pm = { ALL: data.latePenalty };
          } else if (typeof data.latePenalty === 'object') {
            pm = { ...pm, ...data.latePenalty };
          }
          if (typeof data.lateGracePeriod === 'number') {
            sm = { ALL: data.lateGracePeriod };
          } else if (typeof data.lateGracePeriod === 'object') {
            sm = { ...sm, ...data.lateGracePeriod };
          }
          if (data.storeName) { setStoreName(data.storeName); localStorage.setItem('storeName', data.storeName); }
          if (data.storeNameColor) { setStoreNameColor(data.storeNameColor); localStorage.setItem('storeNameColor', data.storeNameColor); }
          if (data.storeNameFont) { setStoreNameFont(data.storeNameFont); localStorage.setItem('storeNameFont', data.storeNameFont); }
          if (data.storeLogo) {
            setStoreLogo(data.storeLogo);
            setLogoPreview(data.storeLogo);
            localStorage.setItem('storeLogo', data.storeLogo);
          }
        }
        setPenaltyMap(pm);
        setLateGracePeriodMap(sm);
        setDbPenaltyMap(pm);
        setDbLateGracePeriodMap(sm);

        const branchSnap = await getDocs(collection(db, 'branches'));
        const brs: any[] = [];
        branchSnap.forEach(b => brs.push({ id: b.id, name: b.data().name }));
        setBranches(brs);

        const empSnap = await getDocs(collection(db, 'employees'));
        const emps: any[] = [];
        let myBranch = '';
        empSnap.forEach(e => {
          const data = e.data();
          emps.push({
            id: e.id,
            fullName: data.fullName,
            branchId: data.branchId,
            employeeCode: data.employeeCode,
            position: data.position || 'Khác'
          });
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
      await setDoc(doc(db, 'settings', 'general'), {
        latePenalty: penaltyMap,
        lateGracePeriod: lateGracePeriodMap
      }, { merge: true });
      setDbPenaltyMap(penaltyMap);
      setDbLateGracePeriodMap(lateGracePeriodMap);
      toast.success('Lưu cấu hình thành công!');
    } catch (error) {
      toast.error('Lỗi khi lưu cấu hình');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBranchConfig = async () => {
    setLoading(true);
    try {
      const newPenaltyMap = { ...penaltyMap };
      const newShiftStartTimeMap = { ...lateGracePeriodMap };
      delete newPenaltyMap[selectedBranch];
      delete newShiftStartTimeMap[selectedBranch];

      await updateDoc(doc(db, 'settings', 'general'), {
        [`latePenalty.${selectedBranch}`]: deleteField(),
        [`lateGracePeriod.${selectedBranch}`]: deleteField()
      });

      setPenaltyMap(newPenaltyMap);
      setLateGracePeriodMap(newShiftStartTimeMap);
      setDbPenaltyMap(newPenaltyMap);
      setDbLateGracePeriodMap(newShiftStartTimeMap);
      toast.success('Đã xóa cấu hình!');
    } catch (error) {
      toast.error('Lỗi khi xóa cấu hình');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLocalLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleSaveBranding = async () => {
    if (!storeName.trim()) {
      toast.error('Tên quán không được để trống');
      return;
    }
    setIsSavingBranding(true);
    try {
      let finalLogo = storeLogo;
      if (localLogoFile) {
        finalLogo = await compressImage(localLogoFile);
      }
      
      await setDoc(doc(db, 'settings', 'general'), {
        storeName: storeName,
        storeNameColor: storeNameColor,
        storeNameFont: storeNameFont,
        storeLogo: finalLogo
      }, { merge: true });
      
      setStoreLogo(finalLogo);
      localStorage.setItem('storeName', storeName);
      localStorage.setItem('storeNameColor', storeNameColor);
      localStorage.setItem('storeNameFont', storeNameFont);
      localStorage.setItem('storeLogo', finalLogo);
      toast.success('Đã cập nhật thông tin thương hiệu!');
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra khi lưu thông tin');
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleAddBonus = async () => {
    setShowConfirmModal(false);
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
        let currentBalance = 0;
        try {
          const attQ = query(collection(db, 'attendance'), where('employeeId', '==', emp.id), where('isPaid', '==', false));
          const attSnap = await getDocs(attQ);
          attSnap.forEach(d => {
            const hours = calculateHoursWorked(d.data());
            currentBalance += hours * (emp.salaryPerHour || 0);
          });

          const bonusQ = query(collection(db, 'bonuses'), where('employeeId', '==', emp.id), where('isPaid', '==', false));
          const bonusSnap = await getDocs(bonusQ);
          bonusSnap.forEach(d => {
            const val = d.data().amount || 0;
            if (d.data().type === 'DEDUCT') currentBalance -= val;
            else currentBalance += val;
          });
        } catch (e) {
          console.error("Lỗi tính balance:", e);
        }

        let newBalance = currentBalance;
        if (bonusType === 'DEDUCT') newBalance -= bonusAmount;
        else newBalance += bonusAmount;

        // Add to bonuses collection
        promises.push(addDoc(collection(db, 'bonuses'), {
          employeeId: emp.id,
          amount: bonusAmount,
          reason: bonusReason,
          type: bonusType,
          month: month,
          isPaid: false,
          createdAt: new Date()
        }));

        // Send notification
        const isBonus = bonusType === 'BONUS';
        promises.push(addDoc(collection(db, 'notifications'), {
          employeeId: emp.id,
          title: isBonus ? 'Nhận thưởng đột xuất' : 'Bị trừ tiền / Phạt',
          message: isBonus
            ? `Bạn vừa được thưởng ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(bonusAmount)} với lý do: ${bonusReason}.\nSố dư hiện tại (Tạm tính): ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(newBalance)}`
            : `Tài khoản của bạn vừa bị trừ ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(bonusAmount)} với lý do: ${bonusReason}.\nSố dư hiện tại (Tạm tính): ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(newBalance)}`,
          type: isBonus ? 'MONEY_ADD' : 'MONEY_DEDUCT',
          read: false,
          createdAt: new Date()
        }));
      }

      await Promise.all(promises);
      toast.success(`Đã ${bonusType === 'BONUS' ? 'thưởng' : 'phạt'} cho ${targetEmployees.length} nhân viên!`);
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
        <p className="text-sm text-gray-500 mt-1">Cấu hình các tham số về chấm công, tính lương và thương hiệu.</p>
      </div>

      {userRole === 'SUPER_ADMIN' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4 max-w-2xl">
          <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3">Thông tin thương hiệu (Toàn hệ thống)</h3>
          
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên quán / Thương hiệu</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                placeholder="VD: Tiệm nhà Bơ"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kiểu chữ</label>
              <select
                className="w-48 px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                value={storeNameFont}
                onChange={e => setStoreNameFont(e.target.value)}
                style={{ fontFamily: storeNameFont }}
              >
                <option value="system-ui, sans-serif" style={{ fontFamily: 'system-ui, sans-serif' }}>Mặc định hệ thống</option>
                <option value="Arial, Helvetica, sans-serif" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>Arial</option>
                <option value="Verdana, Geneva, sans-serif" style={{ fontFamily: 'Verdana, Geneva, sans-serif' }}>Verdana</option>
                <option value="Tahoma, Geneva, sans-serif" style={{ fontFamily: 'Tahoma, Geneva, sans-serif' }}>Tahoma</option>
                <option value="'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', Arial, sans-serif" style={{ fontFamily: "'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', Arial, sans-serif" }}>Trebuchet MS</option>
                <option value="'Times New Roman', Times, serif" style={{ fontFamily: "'Times New Roman', Times, serif" }}>Times New Roman</option>
                <option value="Georgia, serif" style={{ fontFamily: 'Georgia, serif' }}>Georgia</option>
                <option value="'Courier New', Courier, monospace" style={{ fontFamily: "'Courier New', Courier, monospace" }}>Courier New</option>
                <option value="'Comic Sans MS', cursive, sans-serif" style={{ fontFamily: "'Comic Sans MS', cursive, sans-serif" }}>Comic Sans (Viết tay)</option>
                <option value="Impact, Charcoal, sans-serif" style={{ fontFamily: 'Impact, Charcoal, sans-serif' }}>Impact (Nét đậm)</option>
                <option value="'Brush Script MT', cursive" style={{ fontFamily: "'Brush Script MT', cursive" }}>Brush Script (Nghệ thuật)</option>
                <option value="'Palatino Linotype', 'Book Antiqua', Palatino, serif" style={{ fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" }}>Palatino Linotype</option>
                <option value="'Arial Black', Gadget, sans-serif" style={{ fontFamily: "'Arial Black', Gadget, sans-serif" }}>Arial Black</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Màu tên quán</label>
              <input
                type="color"
                className="w-14 h-10 p-0.5 border border-gray-300 rounded-lg cursor-pointer bg-white"
                value={storeNameColor}
                onChange={e => setStoreNameColor(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo thương hiệu</label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => {
                      setLogoPreview('');
                      setLocalLogoFile(null);
                      setStoreLogo('');
                    }}
                    className="absolute top-1 right-1 bg-white/80 rounded-full p-0.5 text-gray-600 hover:text-red-500 hover:bg-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 bg-gray-50 border border-gray-200 border-dashed rounded-xl flex items-center justify-center text-gray-400">
                  <ImageIcon size={24} />
                </div>
              )}
              
              <div className="flex-1">
                <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 inline-block transition-colors text-sm">
                  Tải ảnh lên
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
                </label>
                <p className="text-xs text-gray-500 mt-2">Nên dùng ảnh vuông tỉ lệ 1:1, nền trong suốt. Ảnh sẽ tự động được thu nhỏ.</p>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleSaveBranding}
              disabled={isSavingBranding}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {isSavingBranding ? 'Đang lưu...' : 'Lưu Thông Tin Thương Hiệu'}
            </button>
          </div>
        </div>
      )}

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
          <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian châm chước đi trễ (phút:giây)</label>
          <TimeInput24
            value={graceString}
            onChange={val => {
              setGraceString(val);
              if (val.includes(':')) {
                const [mStr, sStr] = val.split(':');
                const m = parseInt(mStr) || 0;
                const s = parseInt(sStr) || 0;
                setLateGracePeriodMap(prev => ({ ...prev, [selectedBranch]: m * 60 + s }));
              } else {
                const m = parseInt(val) || 0;
                setLateGracePeriodMap(prev => ({ ...prev, [selectedBranch]: m * 60 }));
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 bg-white"
          />
        </div>

        <div className="flex items-center gap-3">
          {(() => {
            const isPenaltyModified = penaltyMap[selectedBranch] !== dbPenaltyMap[selectedBranch];
            const isGraceModified = lateGracePeriodMap[selectedBranch] !== dbLateGracePeriodMap[selectedBranch];
            const isModified = isPenaltyModified || isGraceModified;
            const hasCustomConfig = dbPenaltyMap[selectedBranch] !== undefined || dbLateGracePeriodMap[selectedBranch] !== undefined;

            if (isModified) {
              return (
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  {loading ? 'Đang lưu...' : 'Lưu Cấu Hình Mới'}
                </button>
              );
            } else if (hasCustomConfig) {
              return (
                <button
                  onClick={handleDeleteBranchConfig}
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  {loading ? 'Đang xóa...' : 'Xóa Cấu Hình'}
                </button>
              );
            } else {
              return (
                <button
                  onClick={handleSave}
                  disabled={loading || !isModified}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Tạo Cấu Hình Riêng
                </button>
              );
            }
          })()}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4 max-w-2xl">
        <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3">Thưởng / Phạt Đột Xuất</h3>
        <p className="text-xs text-gray-500">Khoản thưởng/phạt sẽ được cộng/trừ trực tiếp vào bảng lương tháng này của nhân viên.</p>

        <div className="flex flex-col sm:flex-row gap-4 mb-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={bonusType === 'BONUS'} onChange={() => setBonusType('BONUS')} className="text-blue-600" />
                <span>Cộng tiền (Thưởng)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={bonusType === 'DEDUCT'} onChange={() => setBonusType('DEDUCT')} className="text-red-600" />
                <span>Trừ tiền (Phạt)</span>
              </label>
            </div>
          </div>
        </div>

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
            <>
              {bonusTargetType === 'EMPLOYEE' && userRole === 'SUPER_ADMIN' && (
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chọn Cơ sở</label>
                  <select
                    value={bonusEmployeeBranchId}
                    onChange={e => { setBonusEmployeeBranchId(e.target.value); setBonusTargetId(''); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                  >
                    <option value="ALL">Tất cả cơ sở</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Chọn {bonusTargetType === 'BRANCH' ? 'Cơ sở' : 'Nhân viên'}</label>
                <select
                  value={bonusTargetId}
                  onChange={e => setBonusTargetId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                >
                  <option value="">-- Chọn --</option>
                  {bonusTargetType === 'BRANCH' && branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  {bonusTargetType === 'EMPLOYEE' && (() => {
                    const filteredEmps = employees.filter(e => {
                      if (userRole !== 'SUPER_ADMIN') return e.branchId === userBranchId;
                      if (bonusEmployeeBranchId === 'ALL') return true;
                      return e.branchId === bonusEmployeeBranchId;
                    });

                    const groupedEmps = filteredEmps.reduce((acc, emp) => {
                      const pos = emp.position || 'Khác';
                      if (!acc[pos]) acc[pos] = [];
                      acc[pos].push(emp);
                      return acc;
                    }, {} as Record<string, typeof employees>);

                    const roleOrder = ['Quản lý', 'Thu ngân', 'Pha chế', 'Bếp', 'Nhân viên', 'Bảo vệ', 'Khác'];

                    return Object.entries(groupedEmps)
                      .sort(([posA], [posB]) => {
                        const idxA = roleOrder.indexOf(posA);
                        const idxB = roleOrder.indexOf(posB);
                        return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
                      })
                      .map(([pos, empsList]) => (
                        <optgroup key={pos} label={pos}>
                          {(empsList as typeof employees).map(e => (
                            <option key={e.id} value={e.id}>
                              [{e.employeeCode || 'No ID'}] {e.fullName}
                            </option>
                          ))}
                        </optgroup>
                      ));
                  })()}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VNĐ)</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Lý do</label>
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
          onClick={() => {
            if (!bonusAmount || !bonusReason) {
              toast.error('Vui lòng nhập số tiền và lý do');
              return;
            }
            setShowConfirmModal(true);
          }} 
          disabled={bonusLoading}
          className={`px-4 py-2 rounded-lg font-medium transition-colors text-white ${bonusType === 'DEDUCT' ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300' : 'bg-green-600 hover:bg-green-700 disabled:bg-green-300'}`}
        >
          {bonusLoading ? 'Đang xử lý...' : (bonusType === 'DEDUCT' ? 'Xác Nhận Phạt' : 'Xác Nhận Thưởng')}
        </button>
      </div>

                {
                  showConfirmModal && (
                    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[100]">
                      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Xác Nhận {bonusType === 'BONUS' ? 'Thưởng' : 'Phạt'}</h3>
                        <p className="text-gray-600 mb-6">
                          Bạn có chắc chắn muốn xác nhận khoản {bonusType === 'BONUS' ? 'thưởng' : 'phạt'} <strong>{bonusAmount.toLocaleString('vi-VN')} VNĐ</strong> này không?
                        </p>
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => setShowConfirmModal(false)}
                            className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            Hủy
                          </button>
                          <button
                            onClick={handleAddBonus}
                            className={`px-4 py-2 text-white font-medium rounded-lg transition-colors ${bonusType === 'BONUS' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                          >
                            Đồng ý
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }

    </div>
          );
};

          export default Settings;
