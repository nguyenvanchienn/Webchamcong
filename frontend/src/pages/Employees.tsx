import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import { Plus, Edit2, Trash2, X, UserCircle, Shield, Clock, Phone, Building2, CreditCard, CheckCircle, AlertCircle } from 'lucide-react';

interface Employee {
  id: string;
  employeeCode?: string;
  fullName: string;
  email: string;
  phone: string;
  cccd?: string;
  idName?: string;
  dob?: string;
  gender?: string;
  nationality?: string;
  origin?: string;
  residence?: string;
  issueDate?: string;
  address?: string;
  bankName?: string;
  bankAccountNum?: string;
  bankAccountName?: string;
  position?: string;
  cccdFrontUrl?: string;
  cccdBackUrl?: string;
  cccdStatus?: 'UNVERIFIED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  branchId: string;
  branchName: string;
  salaryPerHour: number;
  status: 'ACTIVE' | 'INACTIVE';
}

interface Branch {
  id: string;
  name: string;
}

const Employees: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [viewingSchedules, setViewingSchedules] = useState<any[]>([]);

  useEffect(() => {
    if (viewingEmployee) {
      const fetchSchedules = async () => {
        try {
          const todayStr = new Date().toLocaleDateString('en-CA');
          const q = query(
            collection(db, 'schedules'),
            where('employeeId', '==', viewingEmployee.id),
            where('date', '>=', todayStr)
          );
          const snap = await getDocs(q);
          const sch: any[] = [];
          snap.forEach(d => sch.push(d.data()));
          sch.sort((a, b) => {
            if (a.date !== b.date) return new Date(a.date).getTime() - new Date(b.date).getTime();
            return a.shift.localeCompare(b.shift);
          });
          setViewingSchedules(sch);
        } catch (error) {
          console.error("Lỗi lấy lịch ca:", error);
        }
      };
      fetchSchedules();
    } else {
      setViewingSchedules([]);
    }
  }, [viewingEmployee]);

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    cccd: '',
    idName: '',
    dob: '',
    gender: 'Nam',
    nationality: 'Việt Nam',
    origin: '',
    residence: '',
    issueDate: '',
    address: '',
    bankName: '',
    bankAccountNum: '',
    bankAccountName: '',
    position: 'Nhân viên phục vụ',
    branchId: '',
    salaryPerHour: 25000,
    status: 'ACTIVE'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Load Branches for Select Option
      const branchSnap = await getDocs(collection(db, 'branches'));
      const branchList: Branch[] = [];
      branchSnap.forEach((doc) => branchList.push({ id: doc.id, name: doc.data().name }));
      setBranches(branchList);

      // Load Users to map account emails
      const userSnap = await getDocs(collection(db, 'users'));
      const userEmailMap: Record<string, string> = {};
      userSnap.forEach(doc => {
        const data = doc.data();
        if (data.employeeId && data.email) {
          userEmailMap[data.employeeId] = data.email;
        }
      });

      // Load Employees
      const empSnap = await getDocs(collection(db, 'employees'));
      const empList: Employee[] = [];
      
      const userRole = localStorage.getItem('userRole');
      const currentUserEmployeeId = localStorage.getItem('employeeId');
      let currentUserBranchId = '';

      if (currentUserEmployeeId) {
        empSnap.forEach((doc) => {
          if (doc.id === currentUserEmployeeId) {
            currentUserBranchId = doc.data().branchId;
          }
        });
      }

      empSnap.forEach((doc) => {
        const data = doc.data();
        
        // Ẩn tài khoản của chính người đang đăng nhập
        if (doc.id === currentUserEmployeeId) return;

        // Quản lý cơ sở chỉ được xem nhân viên của cơ sở mình
        if (userRole === 'BRANCH_ADMIN' && data.branchId !== currentUserBranchId) {
           return;
        }

        empList.push({ 
          id: doc.id, 
          ...data,
          email: userEmailMap[doc.id] || data.email 
        } as Employee);
      });
      setEmployees(empList);
      
    } catch (error) {
      console.error("Lỗi lấy dữ liệu:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedBranch = branches.find(b => b.id === formData.branchId);
      const dataToSave = {
        ...formData,
        branchName: selectedBranch?.name || 'Chưa phân bổ'
      };

      if (editingEmployee) {
        // Cập nhật
        const empRef = doc(db, 'employees', editingEmployee.id);
        await updateDoc(empRef, dataToSave);
        
        // Tạo thông báo nếu có thay đổi lương
        if (editingEmployee.salaryPerHour !== dataToSave.salaryPerHour) {
          await addDoc(collection(db, 'notifications'), {
            employeeId: editingEmployee.id,
            title: 'Thay đổi mức lương',
            message: `Mức lương của bạn đã được cập nhật thành ${dataToSave.salaryPerHour.toLocaleString('vi-VN')} đ/giờ.`,
            type: 'SALARY_UPDATE',
            read: false,
            createdAt: new Date()
          });
        }
        
        toast.success('Cập nhật nhân viên thành công!');
      } else {
        // Thêm mới
        const newCode = Math.floor(10000000 + Math.random() * 90000000).toString();
        const newEmpData = { ...dataToSave, employeeCode: newCode };
        const newEmp = await addDoc(collection(db, 'employees'), newEmpData);
        await addDoc(collection(db, 'notifications'), {
          employeeId: newEmp.id,
          title: 'Chào mừng gia nhập',
          message: `Tài khoản nhân viên của bạn đã được tạo thành công!`,
          type: 'SYSTEM',
          read: false,
          createdAt: new Date()
        });
        toast.success('Thêm nhân viên mới thành công!');
      }
      closeModal();
      fetchData();
    } catch (error) {
      console.error("Lỗi lưu nhân viên:", error);
      toast.error('Có lỗi xảy ra khi lưu dữ liệu!');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Xóa nhân viên?',
      text: 'Bạn có chắc chắn muốn xóa hồ sơ nhân viên này không?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Xóa',
      cancelButtonText: 'Hủy'
    });
    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'employees', id));
        toast.success('Đã xóa nhân viên!');
        fetchData();
      } catch (error) {
        console.error("Lỗi xóa nhân viên:", error);
        toast.error('Có lỗi xảy ra khi xóa!');
      }
    }
  };

  const openModal = (employee?: Employee) => {
    if (employee) {
      setEditingEmployee(employee);
      setFormData({
        fullName: employee.fullName,
        email: employee.email || '',
        phone: employee.phone || '',
        cccd: employee.cccd || '',
        idName: employee.idName || employee.fullName || '',
        dob: employee.dob || '',
        gender: employee.gender || 'Nam',
        nationality: employee.nationality || 'Việt Nam',
        origin: employee.origin || '',
        residence: employee.residence || '',
        issueDate: employee.issueDate || '',
        address: employee.address || '',
        bankName: employee.bankName || '',
        bankAccountNum: employee.bankAccountNum || '',
        bankAccountName: employee.bankAccountName || '',
        position: employee.position || 'Nhân viên',
        salaryPerHour: employee.salaryPerHour || 0,
        branchId: employee.branchId || '',
        status: employee.status || 'ACTIVE'
      });
    } else {
      setEditingEmployee(null);
      setFormData({ 
        fullName: '', email: '', phone: '', cccd: '', 
        idName: '', dob: '', gender: 'Nam', nationality: 'Việt Nam', origin: '', residence: '', issueDate: '',
        address: '', bankName: '', bankAccountNum: '', bankAccountName: '', position: 'Nhân viên',
        salaryPerHour: 0, branchId: branches.length > 0 ? branches[0].id : '', 
        status: 'ACTIVE' 
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEmployee(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Danh sách Nhân viên</h2>
          <p className="text-sm text-gray-500">Quản lý hồ sơ nhân sự toàn hệ thống</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center text-sm font-medium transition-colors"
        >
          <Plus size={18} className="mr-2" />
          Thêm Nhân viên
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 font-semibold text-gray-600 text-sm">Họ và Tên</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm">Chức vụ</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở làm việc</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm">Số điện thoại</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm">Lương/giờ</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm">Trạng thái</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">Chưa có nhân viên nào. Hãy thêm mới!</td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-sm font-medium text-gray-800">
                        <button 
                          onClick={() => setViewingEmployee(emp)} 
                          className="hover:text-blue-600 transition-colors text-left font-bold cursor-pointer"
                        >
                          {emp.fullName}
                        </button>
                        {emp.cccdStatus === 'PENDING' && (
                          <span className="ml-2 bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            Cần duyệt CCCD
                          </span>
                        )}
                        <div className="text-xs text-gray-500 font-normal mt-1 flex items-center gap-1">
                          <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono font-bold text-[10px]">
                            ID: {emp.employeeCode || '--------'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 font-normal mt-1">{emp.email || 'Chưa cập nhật email'}</div>
                        <div className="text-xs text-gray-400 font-normal mt-0.5">CCCD: {emp.cccd || 'Chưa cập nhật'}</div>
                      </td>
                      <td className="p-4 text-sm font-medium text-gray-700">{emp.position || 'Nhân viên'}</td>
                      <td className="p-4 text-sm text-blue-600 font-medium">{emp.branchName}</td>
                      <td className="p-4 text-sm text-gray-600">{emp.phone}</td>
                      <td className="p-4 text-sm text-gray-600">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(emp.salaryPerHour)}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          emp.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {emp.status === 'ACTIVE' ? 'Đang làm' : 'Đã nghỉ'}
                        </span>
                      </td>
                      <td className="p-4 flex justify-end space-x-2">
                        <button 
                          onClick={() => openModal(emp)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Sửa"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(emp.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Thêm/Sửa */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 className="font-bold text-lg text-gray-800">
                {editingEmployee ? 'Cập nhật Nhân viên' : 'Thêm Nhân viên mới'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên</label>
                  <input 
                    type="text" required
                    value={formData.fullName}
                    onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input 
                    type="email" required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                  <input 
                    type="tel" required
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                    placeholder="0912345678"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CCCD / CMND</label>
                  <input 
                    type="text"
                    value={formData.cccd}
                    onChange={(e) => setFormData({...formData, cccd: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                    placeholder="00120..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày sinh</label>
                  <input 
                    type="text"
                    value={formData.dob}
                    onChange={(e) => setFormData({...formData, dob: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Họ Tên trên CCCD</label>
                  <input 
                    type="text"
                    value={formData.idName}
                    onChange={(e) => setFormData({...formData, idName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giới tính</label>
                  <select 
                    value={formData.gender}
                    onChange={(e) => setFormData({...formData, gender: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quốc tịch</label>
                  <input 
                    type="text"
                    value={formData.nationality}
                    onChange={(e) => setFormData({...formData, nationality: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày cấp</label>
                  <input 
                    type="text"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({...formData, issueDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quê quán</label>
                  <input 
                    type="text"
                    value={formData.origin}
                    onChange={(e) => setFormData({...formData, origin: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nơi thường trú</label>
                  <input 
                    type="text"
                    value={formData.residence}
                    onChange={(e) => setFormData({...formData, residence: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nơi ở hiện tại</label>
                  <input 
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                    placeholder="Số nhà, đường, quận/huyện..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng</label>
                  <input 
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                    placeholder="VD: MB Bank, VCB..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số tài khoản</label>
                  <input 
                    type="text"
                    value={formData.bankAccountNum}
                    onChange={(e) => setFormData({...formData, bankAccountNum: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên chủ tài khoản</label>
                  <input 
                    type="text"
                    value={formData.bankAccountName}
                    onChange={(e) => setFormData({...formData, bankAccountName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 uppercase"
                    placeholder="NGUYEN VAN A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chức vụ</label>
                  <select 
                    value={formData.position}
                    onChange={(e) => setFormData({...formData, position: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="Quản lý">Quản lý</option>
                    <option value="Trưởng ca">Trưởng ca</option>
                    <option value="Nhân viên">Nhân viên</option>
                    <option value="Nhân viên phục vụ">Nhân viên phục vụ</option>
                    <option value="Thu ngân">Thu ngân</option>
                    <option value="Pha chế">Pha chế</option>
                    <option value="Bảo vệ">Bảo vệ</option>
                    <option value="Tạp vụ">Tạp vụ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cơ sở làm việc</label>
                  <select 
                    required
                    value={formData.branchId}
                    onChange={(e) => setFormData({...formData, branchId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  >
                    <option value="">-- Chọn cơ sở --</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lương cơ bản (VNĐ/giờ)</label>
                  <input 
                    type="text" required
                    value={formData.salaryPerHour.toLocaleString('vi-VN')}
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/[^0-9]/g, '');
                      setFormData({...formData, salaryPerHour: Number(rawValue)});
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE'})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                  >
                    <option value="ACTIVE">Đang làm việc</option>
                    <option value="INACTIVE">Đã nghỉ việc</option>
                  </select>
                </div>
              </div>
              
              <div className="pt-4 mt-4 border-t border-gray-100 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                >
                  {editingEmployee ? 'Cập nhật' : 'Lưu lại'}
                </button>
              </div>
            </form>

            {editingEmployee?.cccdStatus === 'PENDING' && (
              <div className="p-4 bg-yellow-50 border-t border-yellow-200">
                <h4 className="font-bold text-yellow-800 mb-3">Yêu cầu duyệt CCCD</h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-yellow-700 font-medium mb-1">Mặt trước</p>
                    <a href={editingEmployee.cccdFrontUrl} target="_blank" rel="noreferrer">
                      <img src={editingEmployee.cccdFrontUrl} alt="Mặt trước" className="w-full h-32 object-cover rounded-lg border border-yellow-300 hover:opacity-90 cursor-pointer" />
                    </a>
                  </div>
                  <div>
                    <p className="text-xs text-yellow-700 font-medium mb-1">Mặt sau</p>
                    <a href={editingEmployee.cccdBackUrl} target="_blank" rel="noreferrer">
                      <img src={editingEmployee.cccdBackUrl} alt="Mặt sau" className="w-full h-32 object-cover rounded-lg border border-yellow-300 hover:opacity-90 cursor-pointer" />
                    </a>
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button 
                    onClick={async () => {
                      await updateDoc(doc(db, 'employees', editingEmployee.id), { cccdStatus: 'REJECTED' });
                      closeModal();
                      fetchData();
                    }}
                    className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg font-medium text-sm transition-colors"
                  >
                    Từ chối (Yêu cầu tải lại)
                  </button>
                  <button 
                    onClick={async () => {
                      await updateDoc(doc(db, 'employees', editingEmployee.id), { cccdStatus: 'APPROVED' });
                      closeModal();
                      fetchData();
                    }}
                    className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg font-medium text-sm transition-colors"
                  >
                    Phê duyệt hợp lệ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Profile Modal */}
      {viewingEmployee && (
        <div className="fixed inset-0 bg-black/60 z-[100] overflow-y-auto">
          <div className="min-h-screen px-4 text-center">
            <div className="fixed inset-0" onClick={() => setViewingEmployee(null)}></div>
            <span className="inline-block h-screen align-middle" aria-hidden="true">&#8203;</span>
            <div className="inline-block w-full max-w-4xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-transparent rounded-2xl relative z-10">
              <div className="bg-white rounded-xl shadow-2xl overflow-hidden relative">
                <button 
                  onClick={() => setViewingEmployee(null)}
                  className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full p-2 backdrop-blur-sm transition-all z-20"
                >
                  <X size={20} />
                </button>
                
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-32 relative">
                </div>
                <div className="px-6 sm:px-8 pb-8 relative">
                  <div className="-mt-12 mb-4 flex items-end justify-between">
                    <div className="h-24 w-24 bg-white rounded-full p-1 shadow-lg flex items-center justify-center text-blue-600">
                      <UserCircle size={80} />
                    </div>
                    <div className="bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                      <span className="text-xs font-bold text-blue-800 uppercase flex items-center">
                        <Shield size={14} className="mr-1" /> {viewingEmployee.position || 'Nhân viên'}
                      </span>
                    </div>
                  </div>

                  <h2 className="text-2xl font-bold text-gray-800">
                    {viewingEmployee.idName || viewingEmployee.fullName}
                  </h2>
                  <p className="text-gray-500 mt-1">{viewingEmployee.email}</p>

                  <div className="mt-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h3 className="text-lg font-semibold text-gray-800 border-b pb-4 mb-6">Hồ sơ cá nhân & Công việc</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        <div className="flex items-center text-gray-600">
                          <UserCircle size={20} className="mr-4 text-indigo-500 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Họ và Tên</p>
                            <p className="font-medium text-gray-800 text-lg uppercase">{viewingEmployee.idName || viewingEmployee.fullName}</p>
                          </div>
                        </div>

                        <div className="flex items-center text-gray-600">
                          <Clock size={20} className="mr-4 text-blue-500 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Ngày sinh / Giới tính</p>
                            <p className="font-medium text-gray-800 text-lg">{viewingEmployee.dob || '—'} / {viewingEmployee.gender || '—'}</p>
                          </div>
                        </div>

                        <div className="flex items-center text-gray-600">
                          <div className="w-5 h-5 mr-4 border-2 border-green-500 text-green-500 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0">ID</div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Căn cước công dân</p>
                            <p className="font-medium text-gray-800 text-lg flex items-center">
                              {viewingEmployee.cccd || '—'}
                              {viewingEmployee.cccdStatus === 'APPROVED' && <span title="Đã xác thực" className="ml-2 inline-flex"><CheckCircle size={16} className="text-green-500" /></span>}
                              {viewingEmployee.cccdStatus === 'PENDING' && <span title="Đang chờ duyệt" className="ml-2 inline-flex"><Clock size={16} className="text-yellow-500" /></span>}
                              {viewingEmployee.cccdStatus === 'REJECTED' && <span title="Bị từ chối" className="ml-2 inline-flex"><AlertCircle size={16} className="text-red-500" /></span>}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center text-gray-600">
                          <Phone size={20} className="mr-4 text-green-500 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Số điện thoại</p>
                            <p className="font-medium text-gray-800 text-lg">
                              {viewingEmployee.phone || '—'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center text-gray-600 md:col-span-2">
                          <Building2 size={20} className="mr-4 text-orange-500 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Quê quán</p>
                            <p className="font-medium text-gray-800 text-base">{viewingEmployee.origin || '—'}</p>
                          </div>
                        </div>

                        <div className="flex items-center text-gray-600 md:col-span-2">
                          <svg className="w-5 h-5 mr-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Nơi thường trú</p>
                            <p className="font-medium text-gray-800 text-base">{viewingEmployee.residence || viewingEmployee.address || '—'}</p>
                          </div>
                        </div>

                        <div className="flex items-center text-gray-600 md:col-span-2">
                          <CreditCard size={20} className="mr-4 text-purple-500 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Tài khoản ngân hàng</p>
                            {viewingEmployee.bankAccountNum ? (
                              <>
                                <p className="font-medium text-gray-800 text-lg">{viewingEmployee.bankAccountNum} - {viewingEmployee.bankName}</p>
                                <p className="text-sm text-gray-600 font-medium uppercase">{viewingEmployee.bankAccountName}</p>
                              </>
                            ) : (
                              <p className="font-medium text-gray-800 text-lg">—</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center text-gray-600">
                          <Building2 size={20} className="mr-4 text-blue-500 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Cơ sở làm việc</p>
                            <p className="font-medium text-gray-800 text-lg">{viewingEmployee.branchName || '—'}</p>
                          </div>
                        </div>

                        <div className="flex items-center text-gray-600">
                          <div className="w-5 h-5 mr-4 flex items-center justify-center font-bold text-teal-500 text-lg flex-shrink-0">₫</div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Lương cơ bản</p>
                            <p className="font-medium text-gray-800 text-lg">
                              {viewingEmployee.salaryPerHour ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(viewingEmployee.salaryPerHour) + ' / giờ' : '—'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="md:col-span-2 mt-4 pt-4 border-t border-gray-100">
                          <div className="flex items-center text-gray-600 mb-3">
                            <Clock size={20} className="mr-3 text-indigo-500 flex-shrink-0" />
                            <p className="text-sm text-gray-800 uppercase tracking-wider font-bold">Lịch ca sắp tới (từ hôm nay)</p>
                          </div>
                          
                          {viewingSchedules.length === 0 ? (
                            <p className="text-sm text-gray-500 italic ml-8">Nhân viên này chưa có lịch ca nào sắp tới.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-8">
                              {viewingSchedules.map((s, idx) => (
                                <div key={idx} className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3">
                                  <div className="font-medium text-indigo-900 mb-1">{new Date(s.date).toLocaleDateString('vi-VN')}</div>
                                  <div className="text-sm text-indigo-700 flex items-center">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></div>
                                    {s.shift}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;

