import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import { Plus, Edit2, Trash2, X, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet icon
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Map Component to handle clicks and updates
function LocationMarker({ position, setPosition }: { position: [number, number], setPosition: (pos: [number, number]) => void }) {
  const map = useMap();
  
  useEffect(() => {
    map.flyTo(position, map.getZoom());
  }, [position, map]);

  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return (
    <Marker 
      position={position}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          const pos = marker.getLatLng();
          setPosition([pos.lat, pos.lng]);
        }
      }}
    />
  );
}

interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE';
  managers?: string[];
  bankId?: string;
  bankAccount?: string;
  bankAccountName?: string;
  latitude?: number | null;
  longitude?: number | null;
  allowedDistance?: number;
  enableLocationCheck?: boolean;
}

const Branches: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [bankList, setBankList] = useState<{bin: string, shortName: string, name: string}[]>([]);

  useEffect(() => {
    fetch('https://api.vietqr.io/v2/banks')
      .then(res => res.json())
      .then(data => {
        if (data.code === '00') {
          setBankList(data.data);
        }
      })
      .catch(err => console.error('Error fetching banks', err));
  }, []);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    status: 'ACTIVE',
    bankId: '',
    bankAccount: '',
    bankAccountName: '',
    latitude: null as number | null,
    longitude: null as number | null,
    allowedDistance: 200,
    enableLocationCheck: false,
  });

  const fetchBranches = async (silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
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
        await addDoc(collection(db, 'branches'), {
          ...formData,
          managers: [] // Initialize with empty managers array
        });
        toast.success('Thêm cơ sở mới thành công!');
      }
      closeModal();
      fetchBranches(true);
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
        fetchBranches(true);
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
        address: branch.address || '',
        phone: branch.phone || '',
        status: branch.status || 'ACTIVE',
        bankId: branch.bankId || '',
        bankAccount: branch.bankAccount || '',
        bankAccountName: branch.bankAccountName || '',
        latitude: branch.latitude || null,
        longitude: branch.longitude || null,
        allowedDistance: branch.allowedDistance || 200,
        enableLocationCheck: branch.enableLocationCheck ?? false
      });
    } else {
      setEditingBranch(null);
      setFormData({ name: '', address: '', phone: '', status: 'ACTIVE', bankId: '', bankAccount: '', bankAccountName: '', latitude: null, longitude: null, allowedDistance: 200, enableLocationCheck: false });
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`bg-white rounded-xl shadow-xl w-full overflow-hidden flex flex-col max-h-[95vh] transition-all duration-300 ease-in-out ${formData.enableLocationCheck ? 'max-w-4xl' : 'max-w-lg'}`}>
            <div className="flex justify-between items-center p-4 border-b border-gray-200 shrink-0">
              <h3 className="font-bold text-lg text-gray-800">
                {editingBranch ? 'Cập nhật Cơ sở' : 'Thêm Cơ sở mới'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden min-h-0">
              <div className="p-6 overflow-y-auto">
                <div className="flex flex-col md:flex-row gap-8">
                  {/* Cột trái */}
                  <div className="flex-1 space-y-4">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                  <input 
                    type="text" 
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="VD: 0987..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng (Tùy chọn)</label>
                  <input 
                    list="bank-list"
                    value={formData.bankId}
                    onChange={(e) => setFormData({...formData, bankId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-sm"
                    placeholder="VD: MB, VCB..."
                  />
                  <datalist id="bank-list">
                    {bankList.map(bank => (
                      <option key={bank.bin} value={bank.shortName}>{bank.name}</option>
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số tài khoản (Tùy chọn)</label>
                  <input 
                    type="text" 
                    value={formData.bankAccount}
                    onChange={(e) => setFormData({...formData, bankAccount: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Số TK nhận tiền"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên chủ thẻ (Tùy chọn)</label>
                  <input 
                    type="text" 
                    value={formData.bankAccountName}
                    onChange={(e) => setFormData({...formData, bankAccountName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
                    placeholder="VD: NGUYEN VAN A"
                  />
                </div>
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

              <div className="pt-4 mt-2 border-t border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={formData.enableLocationCheck || false}
                    onChange={(e) => setFormData({...formData, enableLocationCheck: e.target.checked})}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-base font-semibold text-blue-800 cursor-pointer">Bật kiểm tra vị trí (Chống đặt ảo)</span>
                </label>
              </div>
            </div>

                  {/* Cột phải */}
                  {formData.enableLocationCheck && (
                    <div className="flex-1 md:pl-6 md:border-l border-gray-200 mt-6 md:mt-0 pt-6 md:pt-0 border-t md:border-t-0">
                        <div className="space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-blue-800">Tọa độ Vị trí (Phục vụ khách Quét QR)</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!navigator.geolocation) {
                              toast.error('Trình duyệt không hỗ trợ GPS');
                              return;
                            }
                            const toastId = toast.loading('Đang lấy vị trí...');
                            navigator.geolocation.getCurrentPosition(
                              (pos) => {
                                setFormData(prev => ({ ...prev, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
                                toast.success('Đã lấy vị trí thành công', { id: toastId });
                              },
                              (err) => {
                                console.error(err);
                                toast.error('Không thể lấy vị trí. Vui lòng cấp quyền!', { id: toastId });
                              },
                              { enableHighAccuracy: true }
                            );
                          }}
                          className="flex items-center gap-1 text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <MapPin size={14} />
                          Lấy Tọa Độ Hiện Tại
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        type="number" 
                        step="any"
                        value={formData.latitude || ''}
                        onChange={(e) => setFormData({...formData, latitude: parseFloat(e.target.value) || null})}
                        className="w-full px-3 py-2 border border-blue-200 rounded-lg outline-none bg-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        placeholder="Vĩ độ"
                      />
                      <input 
                        type="number" 
                        step="any"
                        value={formData.longitude || ''}
                        onChange={(e) => setFormData({...formData, longitude: parseFloat(e.target.value) || null})}
                        className="w-full px-3 py-2 border border-blue-200 rounded-lg outline-none bg-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        placeholder="Kinh độ"
                      />
                    </div>

                    {formData.latitude && formData.longitude && (
                      <div className="border border-blue-200 rounded-lg overflow-hidden h-48 md:h-64 shadow-inner relative z-0">
                        <MapContainer 
                          center={[formData.latitude, formData.longitude]} 
                          zoom={19} 
                          maxZoom={22}
                          scrollWheelZoom={true} 
                          style={{ height: '100%', width: '100%' }}
                        >
                          <TileLayer
                            attribution='&copy; Google Maps'
                            url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                            maxZoom={22}
                          />
                          <LocationMarker 
                            position={[formData.latitude, formData.longitude]} 
                            setPosition={(pos) => setFormData({...formData, latitude: pos[0], longitude: pos[1]})} 
                          />
                        </MapContainer>
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium text-blue-800 mb-1">Giới hạn khoảng cách (mét)</label>
                      <input 
                        type="number" 
                        value={formData.allowedDistance || ''}
                        onChange={(e) => setFormData({...formData, allowedDistance: parseInt(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-blue-200 rounded-lg outline-none bg-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                            <p className="text-xs text-blue-600 mt-1">Khoảng cách lớn nhất cho phép quét mã QR.</p>
                          </div>
                        </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-4 border-t border-gray-200 flex justify-end space-x-3 shrink-0 bg-gray-50">
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

