import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '../config/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, updatePassword, createUserWithEmailAndPassword } from 'firebase/auth';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import { Plus, Trash2, X, ShieldAlert, Eye, EyeOff, Edit2, Key, LogOut } from 'lucide-react';

interface UserAccount {
  id: string;
  email: string;
  role: string;
  status: string;
  employeeId: string | null;
  branchId: string | null;
}

interface Employee {
  id: string;
  fullName: string;
  employeeCode?: string;
  branchId?: string;
  position?: string;
}

const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<UserAccount | null>(null);
  const [filterBranchId, setFilterBranchId] = useState<string>('all');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    role: 'EMPLOYEE',
    employeeId: '',
    branchId: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  const userRole = localStorage.getItem('userRole');
  const userBranchId = localStorage.getItem('branchId');

  // Đổi mật khẩu Modal
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordFormData, setPasswordFormData] = useState({ id: '', email: '', oldPassword: '', password: '', confirmPassword: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get employees for dropdown and mapping
      const empSnap = await getDocs(collection(db, 'employees'));
      const empList: Employee[] = [];
      const empBranchMap: Record<string, string> = {};
      empSnap.forEach((doc) => {
        const data = doc.data();
        empList.push({ 
          id: doc.id, 
          fullName: data.fullName, 
          employeeCode: data.employeeCode,
          branchId: data.branchId,
          position: data.position
        });
        if (data.branchId) empBranchMap[doc.id] = data.branchId;
      });
      setEmployees(empList);

      // Get users
      const userSnap = await getDocs(collection(db, 'users'));
      const userList: UserAccount[] = [];
      
      let actualUserBranchId = userBranchId;
      if (!actualUserBranchId && localStorage.getItem('employeeId')) {
        actualUserBranchId = empBranchMap[localStorage.getItem('employeeId') || ''] || '';
        if (actualUserBranchId) {
          localStorage.setItem('branchId', actualUserBranchId);
        }
      }

      userSnap.forEach((doc) => {
        const data = doc.data();
        if (data.role !== 'SUPER_ADMIN') {
          if (userRole === 'BRANCH_ADMIN') {
            if (data.role === 'KIOSK') return;
            const accBranchId = data.branchId || (data.employeeId ? empBranchMap[data.employeeId] : null);
            if (accBranchId === actualUserBranchId) {
              userList.push({ id: doc.id, ...data } as UserAccount);
            }
          } else {
            userList.push({ id: doc.id, ...data } as UserAccount);
          }
        }
      });
      setAccounts(userList);

      const branchSnap = await getDocs(collection(db, 'branches'));
      const brList: any[] = [];
      branchSnap.forEach((doc) => brList.push({ id: doc.id, name: doc.data().name }));
      setBranches(brList);

    } catch (error) {
      console.error("Lỗi lấy danh sách tài khoản:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const currentBranchId = localStorage.getItem('branchId');

    if (editingAccount) {
      try {
        await updateDoc(doc(db, 'users', editingAccount.id), {
          role: formData.role,
          employeeId: formData.employeeId || null,
          branchId: userRole === 'BRANCH_ADMIN' ? currentBranchId : (formData.branchId || null)
        });
        toast.success('Cập nhật quyền hạn thành công!');
        closeModal();
        fetchData();
      } catch (error: any) {
        toast.error('Lỗi: ' + error.message);
      }
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự!');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Mật khẩu nhập lại không khớp!');
      return;
    }

    try {
      const secondaryApp = initializeApp(firebaseConfig, 'SecondaryAppCreateUser-' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, formData.email, formData.password);
      
      const needsPasswordChange = !['SUPER_ADMIN', 'ADMIN', 'KIOSK', 'POS'].includes(formData.role);

      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: formData.email,
        role: formData.role,
        employeeId: formData.employeeId || null,
        branchId: userRole === 'BRANCH_ADMIN' ? currentBranchId : (formData.branchId || null),
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        requirePasswordChange: needsPasswordChange
      });
      
      await secondaryAuth.signOut();

      toast.success('Tạo tài khoản thành công!');
      closeModal();
      fetchData();
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Xóa tài khoản?',
      text: 'Hành động này sẽ vô hiệu hóa tài khoản và xóa khỏi danh sách. Bạn có chắc chắn không?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Xóa',
      cancelButtonText: 'Hủy'
    });

    if (result.isConfirmed) {
      try {
        // We cannot delete the Auth user from client SDK easily without their password.
        // So we delete the Firestore document to effectively disable their access and hide them.
        import('firebase/firestore').then(({ deleteDoc, doc }) => {
           deleteDoc(doc(db, 'users', id)).then(() => {
             toast.success('Đã xóa tài khoản khỏi hệ thống!');
             fetchData();
           });
        });
      } catch (error) {
        console.error("Lỗi xóa tài khoản:", error);
        toast.error('Lỗi khi xóa tài khoản!');
      }
    }
  };

  const handleForceLogout = async (id: string, email: string) => {
    const result = await Swal.fire({
      title: 'Đăng xuất thiết bị?',
      text: `Bạn có chắc chắn muốn ép đăng xuất tài khoản ${email} trên tất cả thiết bị?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Đăng xuất',
      cancelButtonText: 'Hủy'
    });

    if (result.isConfirmed) {
      try {
        await updateDoc(doc(db, 'users', id), { forceLogout: true });
        toast.success(`Đã gửi lệnh đăng xuất tới ${email}`);
      } catch (error) {
        console.error("Lỗi đăng xuất từ xa:", error);
        toast.error('Lỗi khi gửi lệnh đăng xuất!');
      }
    }
  };

  const openPasswordModal = (acc: UserAccount) => {
    setPasswordFormData({ id: acc.id, email: acc.email, oldPassword: '', password: '', confirmPassword: '' });
    setIsPasswordModalOpen(true);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordFormData.password !== passwordFormData.confirmPassword) {
      toast.error('Mật khẩu nhập lại không khớp!');
      return;
    }
    if (passwordFormData.password.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự!');
      return;
    }
    if (!passwordFormData.oldPassword) {
      toast.error('Vui lòng nhập mật khẩu cũ!');
      return;
    }
    
    try {
      // Dùng secondary app để đổi mật khẩu ngay trên frontend (bỏ qua Backend)
      const secondaryApp = initializeApp(firebaseConfig, 'SecondaryAppForPasswordChange');
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCred = await signInWithEmailAndPassword(secondaryAuth, passwordFormData.email, passwordFormData.oldPassword);
      await updatePassword(userCred.user, passwordFormData.password);
      await secondaryAuth.signOut();
      
      toast.success('Đã đổi mật khẩu thành công!');
      setIsPasswordModalOpen(false);
    } catch (error: any) {
      console.error("Lỗi đổi mật khẩu:", error);
      if (error.code === 'auth/invalid-credential') {
        toast.error('Mật khẩu cũ không chính xác!');
      } else {
        toast.error('Lỗi khi đổi mật khẩu!');
      }
    }
  };

  const openModal = (account?: UserAccount) => {
    const currentBranchId = localStorage.getItem('branchId') || '';
    if (account) {
      setEditingAccount(account);
      setFormData({
        email: account.email,
        password: '',
        confirmPassword: '',
        role: account.role,
        employeeId: account.employeeId || '',
        branchId: account.branchId || ''
      });
    } else {
      setEditingAccount(null);
      setFormData({
        email: '',
        password: '',
        confirmPassword: '',
        role: 'EMPLOYEE',
        employeeId: '',
        branchId: userRole === 'BRANCH_ADMIN' ? currentBranchId : (branches.length > 0 ? branches[0].id : '')
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingAccount(null);
    setFormData({ email: '', password: '', confirmPassword: '', role: 'EMPLOYEE', employeeId: '', branchId: '' });
    setShowPassword(false);
  };

  const availableEmployees = employees.filter(emp => {
    if (formData.role === 'BRANCH_ADMIN') {
      if (emp.position !== 'Quản lý') return false;
    } else if (formData.role === 'EMPLOYEE') {
      if (emp.position !== 'Nhân viên') return false;
    } else if (formData.role === 'CASHIER') {
      if (emp.position !== 'Thu ngân') return false;
    } else if (formData.role === 'BARTENDER') {
      if (emp.position !== 'Pha chế') return false;
    } else if (formData.role === 'KITCHEN') {
      if (emp.position !== 'Bếp') return false;
    } else if (formData.role === 'GUARD') {
      if (emp.position !== 'Bảo vệ') return false;
    }

    if (editingAccount && editingAccount.employeeId === emp.id) return true;
    return !accounts.some(acc => acc.employeeId === emp.id && acc.role === formData.role);
  });

  const availableBranchesForDevice = branches.filter(b => {
    if (editingAccount && editingAccount.branchId === b.id && editingAccount.role === formData.role) return true;
    return !accounts.some(acc => acc.branchId === b.id && acc.role === formData.role);
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Quản lý Tài khoản</h2>
          <p className="text-sm text-gray-500">Cấp tài khoản đăng nhập cho Quản lý cơ sở và Nhân viên</p>
        </div>
        <div className="flex items-center space-x-4">
          {userRole === 'SUPER_ADMIN' && (
            <select
              value={filterBranchId}
              onChange={(e) => setFilterBranchId(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
            >
              <option value="all">Tất cả cơ sở</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <button 
            onClick={() => openModal()}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} className="mr-2" />
            Cấp Tài khoản
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>
        ) : (
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-semibold text-gray-600 text-sm">STT</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Tài khoản (Email)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Quyền hạn</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Liên kết Hồ sơ</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.filter(acc => {
                if (filterBranchId === 'all') return true;
                if (acc.branchId && acc.branchId === filterBranchId) return true;
                if (acc.employeeId) {
                  const emp = employees.find(e => e.id === acc.employeeId);
                  if (emp && emp.branchId === filterBranchId) return true;
                }
                return false;
              }).length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">Chưa có tài khoản nào.</td>
                </tr>
              ) : (
                accounts.filter(acc => {
                  if (filterBranchId === 'all') return true;
                  if (acc.branchId && acc.branchId === filterBranchId) return true;
                  if (acc.employeeId) {
                    const emp = employees.find(e => e.id === acc.employeeId);
                    if (emp && emp.branchId === filterBranchId) return true;
                  }
                  return false;
                }).map((acc, index) => (
                <tr key={acc.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4 text-sm text-gray-600 font-medium">{index + 1}</td>
                  <td className="p-4 text-sm font-medium text-gray-800">{acc.email}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      acc.role === 'SUPER_ADMIN' ? 'bg-red-100 text-red-700' : 
                      acc.role === 'BRANCH_ADMIN' ? 'bg-purple-100 text-purple-700' : 
                      acc.role === 'KIOSK' ? 'bg-yellow-100 text-yellow-700' : 
                      acc.role === 'POS' ? 'bg-pink-100 text-pink-700' : 
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {acc.role === 'KIOSK' ? 'Máy điểm danh' : acc.role === 'POS' ? 'Máy Order' : acc.role}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-600 font-medium">
                    {acc.branchId 
                      ? (branches.find(b => b.id === acc.branchId)?.name || 'Cơ sở không tồn tại') 
                      : (acc.employeeId 
                         ? (branches.find(b => b.id === employees.find(e => e.id === acc.employeeId)?.branchId)?.name || 'Không xác định') 
                         : 'Tất cả cơ sở'
                        )}
                  </td>
                  <td className="p-4 text-sm text-gray-600">
                    {acc.role === 'SUPER_ADMIN' ? 'Toàn quyền hệ thống' : 
                     acc.role === 'KIOSK' ? 'Dùng chung cho cơ sở' :
                     acc.role === 'POS' ? 'Dùng chung cho cơ sở (Menu)' :
                     (employees.find(e => e.id === acc.employeeId) 
                        ? `${employees.find(e => e.id === acc.employeeId)?.employeeCode || 'No ID'} - ${employees.find(e => e.id === acc.employeeId)?.fullName}`
                        : 'Chưa liên kết')}
                  </td>
                  <td className="p-4 flex justify-end space-x-2">
                    {acc.role !== 'SUPER_ADMIN' && (
                      <>
                        <button 
                          onClick={() => openModal(acc)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Sửa quyền hạn"
                        >
                          <Edit2 size={18} />
                        </button>
                        
                        {['KIOSK', 'POS'].includes(acc.role) && (
                          <>
                            <button 
                              onClick={() => openPasswordModal(acc)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Đổi mật khẩu"
                            >
                              <Key size={18} />
                            </button>
                            <button 
                              onClick={() => handleForceLogout(acc.id, acc.email)}
                              className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              title="Đăng xuất thiết bị"
                            >
                              <LogOut size={18} />
                            </button>
                          </>
                        )}

                        <button 
                          onClick={() => handleDelete(acc.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa tài khoản"
                        >
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800 flex items-center">
                <ShieldAlert className="mr-2 text-blue-600" size={20} />
                {editingAccount ? 'Chỉnh sửa Quyền hạn' : 'Cấp Tài khoản mới'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4" autoComplete="off">
              {editingAccount ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản (Email)</label>
                  <input 
                    type="email" disabled
                    value={formData.email}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Đăng nhập <span className="text-red-500">*</span></label>
                    <input 
                      type="email" required
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="nhanvien@chamcong.com"
                      autoComplete="new-email"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} required minLength={6}
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none pr-10"
                        placeholder="Ít nhất 6 ký tự"
                        autoComplete="new-password"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nhập lại Mật khẩu <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} required minLength={6}
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none pr-10"
                        placeholder="Nhập lại mật khẩu"
                        autoComplete="new-password"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại quyền hạn</label>
                <select 
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="EMPLOYEE">Nhân viên</option>
                  <option value="CASHIER">Thu ngân</option>
                  <option value="BARTENDER">Pha chế</option>
                  <option value="KITCHEN">Bếp</option>
                  <option value="GUARD">Bảo vệ</option>
                  {userRole === 'SUPER_ADMIN' && <option value="BRANCH_ADMIN">Quản lý cơ sở</option>}
                  {userRole === 'SUPER_ADMIN' && <option value="KIOSK">Thiết bị điểm danh (Kiosk)</option>}
                  <option value="POS">Máy Order (Menu)</option>
                </select>
              </div>

              {['KIOSK', 'POS'].includes(formData.role) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cơ sở áp dụng <span className="text-red-500">*</span></label>
                  <select 
                    required
                    disabled={userRole === 'BRANCH_ADMIN'}
                    value={formData.branchId}
                    onChange={(e) => setFormData({...formData, branchId: e.target.value})}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none ${userRole === 'BRANCH_ADMIN' ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
                  >
                    <option value="" disabled>-- Chọn cơ sở --</option>
                    {availableBranchesForDevice.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {!['KIOSK', 'POS'].includes(formData.role) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Liên kết Hồ sơ Nhân viên</label>
                  <select 
                    required
                    value={formData.employeeId}
                    onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  >
                    <option value="" disabled>-- Chọn hồ sơ tương ứng --</option>
                    {availableEmployees.map(e => (
                      <option key={e.id} value={e.id}>
                        [{e.employeeCode || 'Chưa có ID'}] {e.fullName}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Liên kết với hồ sơ để ghi nhận thông tin đúng người.</p>
                </div>
              )}

              <div className="pt-4 flex justify-end space-x-3">
                <button 
                  type="button" onClick={closeModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
                >
                  {editingAccount ? 'Cập nhật' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-bold text-gray-800">Đổi Mật Khẩu</h3>
              <button 
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="p-6 space-y-4">
              <p className="text-sm text-gray-600 mb-4">Đổi mật khẩu cho tài khoản: <strong>{passwordFormData.email}</strong></p>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu hiện tại (Cũ)</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all pr-10"
                    value={passwordFormData.oldPassword}
                    onChange={(e) => setPasswordFormData({...passwordFormData, oldPassword: e.target.value})}
                    placeholder="Nhập mật khẩu hiện tại..."
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all pr-10"
                    value={passwordFormData.password}
                    onChange={(e) => setPasswordFormData({...passwordFormData, password: e.target.value})}
                    placeholder="Nhập mật khẩu mới..."
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all pr-10"
                    value={passwordFormData.confirmPassword}
                    onChange={(e) => setPasswordFormData({...passwordFormData, confirmPassword: e.target.value})}
                    placeholder="Nhập lại mật khẩu mới..."
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;

