import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Plus, Trash2, X, Download, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';

interface Table {
  id: string;
  branchId: string;
  name: string;
  status: 'AVAILABLE' | 'OCCUPIED';
  createdAt: any;
}

interface Branch {
  id: string;
  name: string;
}

const TableManager: React.FC = () => {
  const [tables, setTables] = useState<Table[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tableName, setTableName] = useState('');
  const [viewingQR, setViewingQR] = useState<Table | null>(null);
  const [tableToDelete, setTableToDelete] = useState<Table | null>(null);

  const userRole = localStorage.getItem('userRole');
  const userBranchId = localStorage.getItem('branchId');

  useEffect(() => {
    const fetchBranchesAndTables = async () => {
      try {
        let branchList: Branch[] = [];
        if (userRole === 'SUPER_ADMIN') {
          const branchSnap = await getDocs(collection(db, 'branches'));
          branchList = branchSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
          setBranches(branchList);
          if (branchList.length > 0) {
            setSelectedBranch(branchList[0].id);
          }
        } else if (userBranchId) {
          setSelectedBranch(userBranchId);
        }
      } catch (error) {
        console.error(error);
        toast.error('Lỗi tải dữ liệu cơ sở');
      } finally {
        setLoading(false);
      }
    };
    fetchBranchesAndTables();
  }, [userRole, userBranchId]);

  useEffect(() => {
    if (!selectedBranch) return;
    const fetchTables = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'tables'), where('branchId', '==', selectedBranch));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Table));
        // Sort by name
        list.sort((a, b) => a.name.localeCompare(b.name));
        setTables(list);
      } catch (error) {
        console.error(error);
        toast.error('Lỗi tải danh sách bàn');
      } finally {
        setLoading(false);
      }
    };
    fetchTables();
  }, [selectedBranch]);

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableName.trim() || !selectedBranch) return;

    try {
      const newTable = {
        name: tableName.trim(),
        branchId: selectedBranch,
        status: 'AVAILABLE',
        createdAt: new Date()
      };
      const docRef = await addDoc(collection(db, 'tables'), newTable);
      setTables([...tables, { id: docRef.id, ...newTable } as Table].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success('Thêm bàn thành công');
      setIsModalOpen(false);
      setTableName('');
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi thêm bàn');
    }
  };

  const confirmDeleteTable = async () => {
    if (!tableToDelete) return;
    try {
      await deleteDoc(doc(db, 'tables', tableToDelete.id));
      setTables(tables.filter(t => t.id !== tableToDelete.id));
      toast.success('Đã xóa bàn');
      setTableToDelete(null);
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi xóa bàn');
    }
  };

  const getQRUrl = (tableId: string) => {
    const origin = window.location.origin;
    return `${origin}/order/${selectedBranch}/${tableId}`;
  };

  const downloadQR = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Add padding and white background
      canvas.width = img.width + 40;
      canvas.height = img.height + 40;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `QR_${viewingQR?.name}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (loading && branches.length === 0) return <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>;

  return (
    <div className="p-6 h-full flex flex-col bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Quản lý Bàn & Mã QR</h1>
          <p className="text-gray-500 mt-1">Tạo bàn và in mã QR để khách quét gọi món tại bàn</p>
        </div>
        <div className="flex items-center gap-4">
          {userRole === 'SUPER_ADMIN' && (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 outline-none bg-white font-medium"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={!selectedBranch}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
          >
            <Plus size={20} />
            <span>Thêm Bàn</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {tables.map(table => (
          <div key={table.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col items-center group hover:shadow-md transition-shadow">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{table.name}</h3>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4 relative cursor-pointer group/qr" onClick={() => setViewingQR(table)}>
              <QRCodeSVG value={getQRUrl(table.id)} size={120} />
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-xl opacity-0 group-hover/qr:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-2">
                <QrCode size={32} />
                <span className="font-medium text-sm">Xem QR Lớn</span>
              </div>
            </div>
            
            <div className="flex gap-2 w-full mt-auto">
              <button onClick={() => setViewingQR(table)} className="flex-1 py-2 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-colors flex justify-center">
                Mã QR
              </button>
              <button onClick={() => setTableToDelete(table)} className="p-2 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors">
                <Trash2 size={20} />
              </button>
            </div>
          </div>
        ))}
        {tables.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100 shadow-sm border-dashed">
            Chưa có bàn nào ở cơ sở này. Hãy thêm bàn để bắt đầu.
          </div>
        )}
      </div>

      {/* Add Table Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">Thêm Bàn Mới</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:bg-gray-200 p-2 rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddTable} className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tên bàn (VD: Bàn 1, Bàn Ngoài Sân...)</label>
                <input 
                  type="text" 
                  value={tableName} 
                  onChange={e => setTableName(e.target.value)} 
                  required 
                  autoFocus
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="Nhập tên bàn..." 
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">Hủy</button>
                <button type="submit" className="flex-1 py-3 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">Lưu thông tin</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View QR Modal */}
      {viewingQR && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col items-center p-8 relative">
            <button onClick={() => setViewingQR(null)} className="absolute top-4 right-4 text-gray-400 hover:bg-gray-100 p-2 rounded-full"><X size={24} /></button>
            <h2 className="text-3xl font-black text-gray-800 mb-2">{viewingQR.name}</h2>
            <p className="text-gray-500 mb-8 text-center text-sm">Quét mã QR dưới đây để xem Menu và Gọi món</p>
            
            <div className="bg-white p-4 rounded-2xl border-4 border-blue-100 shadow-xl mb-8">
              <QRCodeSVG id="qr-code-svg" value={getQRUrl(viewingQR.id)} size={240} level="H" />
            </div>
            
            <button onClick={downloadQR} className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 text-lg shadow-md shadow-blue-500/30">
              <Download size={24} />
              Tải Xuống Mã QR
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {tableToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-slide-up">
            <div className="flex justify-center mb-4 text-red-500 bg-red-50 w-16 h-16 rounded-full items-center mx-auto">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-center text-gray-800 mb-2">Xác nhận xoá bàn</h3>
            <p className="text-gray-600 text-center mb-6 text-sm">
              Bạn có chắc chắn muốn xóa <span className="font-bold text-gray-800">{tableToDelete.name}</span> không? Các hóa đơn liên quan sẽ không bị ảnh hưởng, nhưng mã QR cũ sẽ không dùng được nữa.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setTableToDelete(null)}
                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={confirmDeleteTable}
                className="flex-1 py-3 px-4 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30"
              >
                Xóa Bàn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableManager;
