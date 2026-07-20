import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE';
  managers?: string[];
}

const Branches: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    status: 'ACTIVE'
  });

  const fetchBranches = async () => {
    setLoading(true);
    try {
      // Get all active BRANCH_ADMINs
      const usersSnap = await getDocs(collection(db, 'users'));
      const adminEmpIds = new Set<string>();
      usersSnap.forEach(u => {
        const d = u.data();
        // Check if the user is an active BRANCH_ADMIN
        if (d.role === 'BRANCH_ADMIN' && d.employeeId && d.status !== 'INACTIVE') {
          adminEmpIds.add(d.employeeId);
        }
      });

      // Map active BRANCH_ADMINs to their branches
      const empsSnap = await getDocs(collection(db, 'employees'));
      const branchManagers: Record<string, string[]> = {};
      empsSnap.forEach(e => {
        const d = e.data();
        // Only include active employees
        if (adminEmpIds.has(e.id) && d.branchId && d.status === 'ACTIVE') {
          if (!branchManagers[d.branchId]) branchManagers[d.branchId] = [];
          branchManagers[d.branchId].push(d.fullName);
        }
      });

      const querySnapshot = await getDocs(collection(db, 'branches'));
      const branchData: Branch[] = [];
      querySnapshot.forEach((doc) => {
        branchData.push({ 
          id: doc.id, 
          ...doc.data(),
          managers: branchManagers[doc.id] || []
        } as Branch);
      });
      setBranches(branchData);
    } catch (error) {
      console.error("Lỗi lấy danh sách cơ sở:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBranch) {
        // Cập nhật
        const branchRef = doc(db, 'branches', editingBranch.id);
        await updateDoc(branchRef, formData);
        toast.success('Cập nhật cơ sở thành công!');
      } else {
        // Thêm mới
        await addDoc(collection(db, 'branches'), formData);
        toast.success('Thêm cơ sở mới thành công!');
      }
      closeModal();
      fetchBranches();
    } catch (error) {
      console.error("Lỗi lưu cơ sở:", error);
      toast.error('Có lỗi xảy ra khi lưu dữ liệu!');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Xóa cơ sở?',
      text: 'Bạn có chắc chắn muốn xóa cơ sở này không?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Xóa',
      cancelButtonText: 'Hủy'
    });
    
    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'branches', id));
        toast.success('Đã xóa cơ sở!');
        fetchBranches();
      } catch (error) {
        console.error("Lỗi xóa cơ sở:", error);
        toast.error('Lỗi khi xóa!');
      }
    }
  };

  const openModal = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setFormData({
        name: branch.name,
        address: branch.address,
        phone: branch.phone || '',
        status: branch.status || 'ACTIVE'
      });
    } else {
      setEditingBranch(null);
      setFormData({ name: '', address: '', phone: '', status: 'ACTIVE' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBranch(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Danh sách Cơ sở</h2>
          <p className="text-sm text-gray-500">Quản lý các chi nhánh/cửa hàng của bạn</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center text-sm font-medium transition-colors"
        >
          <Plus size={18} className="mr-2" />
          Thêm Cơ sở
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>
        ) : (
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-semibold text-gray-600 text-sm">Tên Cơ Sở</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Quản Lý</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Địa Chỉ</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Số Điện Thoại</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Trạng Thái</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {branches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">Chưa có cơ sở nào. Hãy thêm mới!</td>
                </tr>
              ) : (
                branches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 border-b border-gray-100 font-medium text-gray-800">{branch.name}</td>
                    <td className="p-4 border-b border-gray-100 text-gray-600 text-sm">
                      {branch.managers && branch.managers.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {branch.managers.map((m, i) => (
                            <span key={i} className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs font-medium border border-blue-100 whitespace-nowrap">{m}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Chưa có</span>
                      )}
                    </td>
                    <td className="p-4 border-b border-gray-100 text-gray-600 text-sm">{branch.address}</td>
                    <td className="p-4 text-sm text-gray-600">{branch.phone}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        branch.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {branch.status === 'ACTIVE' ? 'Hoạt động' : 'Đóng cửa'}
                      </span>
                    </td>
                    <td className="p-4 flex justify-end space-x-2">
                      <button 
                        onClick={() => openModal(branch)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Sửa"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(branch.id)}
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
        )}
      </div>

      {/* Modal Thêm/Sửa */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 className="font-bold text-lg text-gray-800">
                {editingBranch ? 'Cập nhật Cơ sở' : 'Thêm Cơ sở mới'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên cơ sở <span className="text-red-500">*</span></label>
                <input 
                  type="text" required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="VD: Chi nhánh Quận 1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ <span className="text-red-500">*</span></label>
                <input 
                  type="text" required
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="VD: 123 Lê Lợi, Q1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                <input 
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="VD: 0901234567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                <select 
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="ACTIVE">Hoạt động</option>
                  <option value="INACTIVE">Đóng cửa</option>
                </select>
              </div>
              
              <div className="pt-4 border-t border-gray-100 flex justify-end space-x-3">
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
                  {editingBranch ? 'Cập nhật' : 'Lưu lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Branches;

