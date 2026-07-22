import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Plus, Edit2, Trash2, X, Image as ImageIcon, Camera } from 'lucide-react';
import toast from 'react-hot-toast';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl: string;
  isAvailable: boolean;
  description?: string;
  subCategory?: string;
  branchId?: string | null;
}

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
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const MenuManager: React.FC = () => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [viewingItem, setViewingItem] = useState<MenuItem | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [filterBranch, setFilterBranch] = useState<string>('all');
  
  const userRole = localStorage.getItem('userRole');
  const userBranchId = localStorage.getItem('branchId');
  const [isUploading, setIsUploading] = useState(false);
  const [priceText, setPriceText] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [localImageFile, setLocalImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    price: 0,
    category: 'Đồ uống',
    imageUrl: '',
    isAvailable: true,
    description: '',
    subCategory: '',
    branchId: 'all'
  });

  const predefinedCategories = ['Đồ uống', 'Đồ ăn', 'Tráng miệng', 'Khác'];

  const fetchItems = async () => {
    try {
      if (userRole === 'SUPER_ADMIN') {
        const branchSnap = await getDocs(collection(db, 'branches'));
        const brs: any[] = [];
        branchSnap.forEach(b => brs.push({ id: b.id, name: b.data().name }));
        setBranches(brs);
      }

      const snap = await getDocs(collection(db, 'menu_items'));
      const list: MenuItem[] = [];
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (userRole === 'BRANCH_ADMIN') {
          if (data.branchId === userBranchId) {
            list.push({ id: doc.id, ...data } as MenuItem);
          }
        } else {
          list.push({ id: doc.id, ...data } as MenuItem);
        }
      });
      setItems(list);
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi tải danh sách thực đơn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const openModal = (item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
      const isCustomCat = !['Đồ uống', 'Đồ ăn', 'Tráng miệng'].includes(item.category);
      setFormData({
        name: item.name,
        price: item.price,
        category: isCustomCat ? 'Khác' : item.category,
        imageUrl: item.imageUrl || '',
        isAvailable: item.isAvailable,
        description: item.description || '',
        subCategory: item.subCategory || '',
        branchId: item.branchId || 'all'
      });
      setCustomCategory(isCustomCat ? item.category : '');
      setPriceText(item.price ? new Intl.NumberFormat('vi-VN').format(item.price) : '0');
      setPreviewUrl(item.imageUrl || '');
      setLocalImageFile(null);
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        price: 0,
        category: 'Đồ uống',
        imageUrl: '',
        isAvailable: true,
        description: '',
        subCategory: '',
        branchId: 'all'
      });
      setCustomCategory('');
      setPriceText('');
      setPreviewUrl('');
      setLocalImageFile(null);
    }
    setIsModalOpen(true);
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    if (!rawValue) {
      setPriceText('');
      setFormData({ ...formData, price: 0 });
      return;
    }
    const num = parseInt(rawValue, 10);
    setPriceText(new Intl.NumberFormat('vi-VN').format(num));
    setFormData({ ...formData, price: num });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setLocalImageFile(null);
    setPreviewUrl('');
    setFormData(prev => ({ ...prev, imageUrl: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || formData.price <= 0) {
      toast.error('Vui lòng nhập tên và giá hợp lệ');
      return;
    }

    setIsUploading(true);
    
    try {
      let imageUrl = formData.imageUrl;
      if (localImageFile) {
        imageUrl = await compressImage(localImageFile);
      }
      
      const payload: any = {
        name: formData.name,
        price: formData.price,
        category: formData.category === 'Khác' ? customCategory : formData.category,
        imageUrl: imageUrl,
        isAvailable: formData.isAvailable,
        description: formData.description,
        subCategory: formData.subCategory
      };

      if (editingItem) {
        if (userRole === 'SUPER_ADMIN') {
           payload.branchId = formData.branchId === 'all' ? null : formData.branchId;
        }
        await updateDoc(doc(db, 'menu_items', editingItem.id), payload);
        toast.success('Đã cập nhật món ăn');
      } else {
        if (userRole === 'BRANCH_ADMIN') {
           payload.branchId = userBranchId;
        } else {
           payload.branchId = formData.branchId === 'all' ? null : formData.branchId;
        }
        await addDoc(collection(db, 'menu_items'), payload);
        toast.success('Đã thêm món ăn mới');
      }
      setIsModalOpen(false);
      fetchItems();
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa món này?')) {
      try {
        await deleteDoc(doc(db, 'menu_items', id));
        toast.success('Đã xóa món');
        fetchItems();
      } catch (error) {
        toast.error('Lỗi khi xóa món');
      }
    }
  };

  if (loading) return <div className="p-8 text-center">Đang tải dữ liệu...</div>;

  const displayedItems = items.filter(item => {
    if (userRole === 'SUPER_ADMIN' && filterBranch !== 'all') {
      return item.branchId === filterBranch || !item.branchId || item.branchId === 'all';
    }
    return true;
  });

  return (
    <div className="p-6 h-full flex flex-col bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Quản lý Thực đơn (Menu)</h1>
        <div className="flex gap-4 items-center">
          {userRole === 'SUPER_ADMIN' && (
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 outline-none bg-white font-medium shadow-sm"
            >
              <option value="all">Tất cả cơ sở</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm"
          >
            <Plus size={20} />
            <span>Thêm món mới</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 p-0">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm border-b border-gray-200">
              <tr>
                <th className="p-4 font-semibold text-gray-600 w-12 text-center">STT</th>
                <th className="p-4 font-semibold text-gray-600 w-28">Hình</th>
                <th className="p-4 font-semibold text-gray-600">Tên món</th>
                <th className="p-4 font-semibold text-gray-600">Danh mục</th>
                <th className="p-4 font-semibold text-gray-600 text-right">Giá bán</th>
                <th className="p-4 font-semibold text-gray-600 text-center">Trạng thái</th>
                <th className="p-4 font-semibold text-gray-600 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500 italic">Chưa có món nào trong thực đơn</td></tr>
              ) : (
                displayedItems.map((item, index) => (
                  <tr key={item.id} onClick={() => setViewingItem(item)} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors cursor-pointer group">
                    <td className="p-4 text-center font-medium text-gray-500">{index + 1}</td>
                    <td className="p-4 py-2">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-20 h-20 rounded-lg object-cover shadow-sm border border-gray-200 group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 border border-gray-200 group-hover:bg-gray-200 transition-colors">
                          <ImageIcon size={28} />
                        </div>
                      )}
                    </td>
                    <td className="p-4 font-bold text-gray-800">{item.name}</td>
                    <td className="p-4 text-gray-600">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium border border-gray-200">{item.category}</span>
                        {item.subCategory && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold border border-blue-100 ml-1">{item.subCategory}</span>}
                      </div>
                    </td>
                    <td className="p-4 font-bold text-blue-600 text-right text-lg">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price)}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${item.isAvailable ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {item.isAvailable ? 'Đang bán' : 'Hết hàng'}
                      </span>
                    </td>
                    <td className="p-4 flex gap-2 justify-end">
                      <button 
                        onClick={(e) => { e.stopPropagation(); openModal(item); }}
                        className={`p-2 rounded-lg transition-colors ${
                          (userRole === 'BRANCH_ADMIN' && !item.branchId) 
                            ? 'text-gray-400 bg-gray-100 cursor-not-allowed' 
                            : 'text-blue-600 hover:bg-blue-50'
                        }`}
                        title={(userRole === 'BRANCH_ADMIN' && !item.branchId) ? "Không có quyền sửa món chung" : "Sửa"}
                        disabled={userRole === 'BRANCH_ADMIN' && !item.branchId}
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        className={`p-2 rounded-lg transition-colors ${
                          (userRole === 'BRANCH_ADMIN' && !item.branchId) 
                            ? 'text-gray-400 bg-gray-100 cursor-not-allowed' 
                            : 'text-red-600 hover:bg-red-50'
                        }`}
                        title={(userRole === 'BRANCH_ADMIN' && !item.branchId) ? "Không có quyền xóa món chung" : "Xóa"}
                        disabled={userRole === 'BRANCH_ADMIN' && !item.branchId}
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
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="text-xl font-bold text-gray-800">{editingItem ? 'Sửa món ăn/nước uống' : 'Thêm món mới'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:bg-gray-200 hover:text-gray-700 p-2 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-2 gap-5 overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tên món <span className="text-red-500">*</span></label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm" placeholder="VD: Cà phê sữa đá" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Danh mục chính</label>
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm font-medium text-gray-700">
                  {predefinedCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {formData.category === 'Khác' && (
                  <input type="text" value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Nhập tên danh mục..." className="w-full mt-2 px-4 py-3 border border-blue-300 bg-blue-50/30 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm" />
                )}
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Danh mục phụ (Tùy chọn)</label>
                <input type="text" value={formData.subCategory} onChange={e => setFormData({...formData, subCategory: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm" placeholder="VD: Trà, Sữa, Nước ép..." />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Giá bán (VNĐ) <span className="text-red-500">*</span></label>
                <input type="text" value={priceText} onChange={handlePriceChange} required className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-bold text-blue-600 text-lg" placeholder="VD: 100.000" />
              </div>
              <div className="flex flex-col justify-end">
                <label className="block text-sm font-semibold text-gray-700 mb-1 invisible">Trạng thái</label>
                <div className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200 h-[52px]">
                  <input type="checkbox" id="isAvailable" checked={formData.isAvailable} onChange={e => setFormData({...formData, isAvailable: e.target.checked})} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                  <label htmlFor="isAvailable" className="text-sm font-bold text-gray-700 cursor-pointer select-none flex-1">Đang bán (Hiển thị trên POS)</label>
                </div>
              </div>

              {userRole === 'SUPER_ADMIN' && (
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Áp dụng cho cơ sở</label>
                  <select 
                    value={formData.branchId} 
                    onChange={e => setFormData({...formData, branchId: e.target.value})} 
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm font-medium text-gray-700"
                  >
                    <option value="all">Tất cả cơ sở</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Hình ảnh (Tải lên hoặc Chụp)</label>
                <div className="flex flex-wrap items-center gap-3">
                  {previewUrl ? (
                    <div className="relative group shrink-0">
                      <img src={previewUrl} alt="Preview" className="w-20 h-20 rounded-xl object-cover border border-gray-200 shadow-sm" />
                      <button type="button" onClick={handleRemoveImage} className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full p-1 shadow-md border border-gray-100 hover:bg-red-50 hover:scale-110 transition-all opacity-0 group-hover:opacity-100 z-10">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 bg-gray-50 rounded-xl border border-gray-200 border-dashed flex items-center justify-center text-gray-400 shrink-0">
                      <Camera size={24} />
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" onChange={handleImageSelect} disabled={isUploading} className="flex-1 min-w-[200px] px-4 py-3 border border-gray-300 rounded-xl outline-none shadow-sm text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50" />
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Mô tả món ăn</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm" placeholder="VD: Thơm ngon, đậm đà..." rows={2}></textarea>
              </div>

              <div className="col-span-2 pt-2 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors" disabled={isUploading}>Hủy bỏ</button>
                <button type="submit" className="flex-1 py-3 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-md shadow-blue-500/30 transition-all hover:-translate-y-0.5 disabled:opacity-50" disabled={isUploading}>
                  {isUploading ? 'Đang tải ảnh...' : 'Lưu thông tin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setViewingItem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up relative" onClick={e => e.stopPropagation()}>
            <div className="relative h-48 bg-gray-100 overflow-hidden group">
              {viewingItem.imageUrl ? (
                <img onClick={() => setZoomedImage(viewingItem.imageUrl)} src={viewingItem.imageUrl} alt={viewingItem.name} className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" title="Bấm để phóng to" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <ImageIcon size={48} />
                </div>
              )}
              <button onClick={() => setViewingItem(null)} className="absolute top-4 right-4 bg-black/50 text-white hover:bg-black/70 p-2 rounded-full transition-colors"><X size={20} /></button>
              <div className="absolute bottom-4 right-4">
                <span className={`px-3 py-1 rounded-full text-sm font-bold shadow-sm ${viewingItem.isAvailable ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                  {viewingItem.isAvailable ? 'Đang bán' : 'Hết hàng'}
                </span>
              </div>
            </div>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 pr-4">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2 leading-tight">{viewingItem.name}</h2>
                  <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                    <span className="font-medium bg-gray-100 px-2 py-0.5 rounded-md text-gray-700 border border-gray-200">{viewingItem.category}</span>
                    {viewingItem.subCategory && <span className="font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md border border-blue-100">{viewingItem.subCategory}</span>}
                  </div>
                </div>
                <div className="text-2xl font-black text-blue-600 shrink-0">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(viewingItem.price)}
                </div>
              </div>
              
              {viewingItem.description ? (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Mô tả món ăn</h3>
                  <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{viewingItem.description}</p>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center">
                  <span className="text-gray-400 text-sm italic">Không có mô tả</span>
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button onClick={() => { setViewingItem(null); openModal(viewingItem); }} className="flex-1 py-3 px-4 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-2">
                  <Edit2 size={18} />
                  Chỉnh sửa món này
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {zoomedImage && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in" onClick={() => setZoomedImage(null)}>
          <img src={zoomedImage} alt="Phóng to" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()} />
          <button onClick={() => setZoomedImage(null)} className="absolute top-6 right-6 bg-white/10 text-white hover:bg-white/30 hover:text-white p-3 rounded-full transition-all">
            <X size={28} />
          </button>
        </div>
      )}
    </div>
  );
};

export default MenuManager;
