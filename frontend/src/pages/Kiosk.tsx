import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Clock, CheckCircle, Search, User } from 'lucide-react';
import { auth } from '../config/firebase';

interface Employee {
  id: string;
  fullName: string;
  employeeCode?: string;
  branchName: string;
}

interface Attendance {
  id: string;
  employeeId: string;
  checkIn: Date | null;
  checkOut: Date | null;
}

const Kiosk: React.FC = () => {
  const navigate = useNavigate();
  const branchId = localStorage.getItem('branchId');
  const userRole = localStorage.getItem('userRole');

  const [currentTime, setCurrentTime] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(false);

  // Lắng nghe lệnh đăng xuất từ xa
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), async (docSnap) => {
      if (docSnap.exists() && docSnap.data().forceLogout) {
        await updateDoc(docSnap.ref, { forceLogout: false });
        await auth.signOut();
        localStorage.clear();
        navigate('/login');
      }
    });
    return () => unsub();
  }, [navigate]);

  // Cập nhật đồng hồ
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Lấy danh sách nhân viên của cơ sở này
  useEffect(() => {
    if (userRole !== 'KIOSK' && userRole !== 'SUPER_ADMIN') {
      navigate('/dashboard');
      return;
    }

    const fetchEmployees = async () => {
      try {
        let q = collection(db, 'employees');
        if (branchId) {
          q = query(collection(db, 'employees'), where('branchId', '==', branchId)) as any;
        }
        const snap = await getDocs(q);
        const list: Employee[] = [];
        snap.forEach(d => {
          if (d.data().status === 'ACTIVE') {
            list.push({ id: d.id, ...d.data() } as Employee);
          }
        });
        setEmployees(list);
      } catch (err) {
        console.error(err);
        toast.error('Lỗi khi tải danh sách nhân viên');
      }
    };

    fetchEmployees();
  }, [branchId, userRole, navigate]);

  // Kiểm tra trạng thái chấm công của nhân viên được chọn
  useEffect(() => {
    const checkStatus = async () => {
      if (!selectedEmp) {
        setTodayAttendance(null);
        return;
      }
      setLoading(true);
      try {
        const todayStr = new Date().toLocaleDateString('en-CA');
        const q = query(
          collection(db, 'attendance'),
          where('employeeId', '==', selectedEmp.id),
          where('date', '==', todayStr)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docData = snap.docs[0];
          const data = docData.data();
          setTodayAttendance({
            id: docData.id,
            employeeId: data.employeeId,
            checkIn: data.checkIn ? data.checkIn.toDate() : null,
            checkOut: data.checkOut ? data.checkOut.toDate() : null
          });
        } else {
          setTodayAttendance(null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, [selectedEmp]);

  const handleAction = async () => {
    if (!selectedEmp) return;
    setLoading(true);
    try {
      const todayStr = new Date().toLocaleDateString('en-CA');
      
      if (!todayAttendance) {
        // Chưa có => Check In
        await addDoc(collection(db, 'attendance'), {
          employeeId: selectedEmp.id,
          employeeName: selectedEmp.fullName,
          branchName: selectedEmp.branchName,
          branchId: branchId || null,
          date: todayStr,
          checkIn: new Date(),
          checkOut: null,
          status: 'PRESENT'
        });
        toast.success(`Check-in thành công cho ${selectedEmp.fullName}`);
      } else if (todayAttendance && !todayAttendance.checkOut) {
        // Đã check in => Check Out
        await updateDoc(doc(db, 'attendance', todayAttendance.id), {
          checkOut: new Date()
        });
        toast.success(`Check-out thành công cho ${selectedEmp.fullName}`);
      }
      
      // Reset về trạng thái ban đầu
      setSelectedEmp(null);
      setSearchTerm('');
    } catch (err) {
      console.error(err);
      toast.error('Có lỗi xảy ra!');
  const filteredEmployees = employees.filter(e => 
    e.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (e.employeeCode && e.employeeCode.includes(searchTerm))
  );

  return (
    <div className="min-h-screen bg-blue-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm p-3 md:p-4 flex justify-center sm:justify-start items-center">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg hidden sm:block">
            <CheckCircle size={24} />
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-lg md:text-xl font-bold text-gray-800">Hệ Thống Điểm Danh Tự Động</h1>
            <p className="text-xs md:text-sm text-gray-500">Thiết bị điểm danh dùng chung</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {/* Đồng hồ */}
        <div className="text-center mb-8 md:mb-12">
          <div className="text-5xl sm:text-6xl md:text-7xl font-mono font-bold text-blue-900 drop-shadow-sm flex flex-col sm:flex-row items-center justify-center gap-2 md:gap-4">
            <Clock className="text-blue-500 w-12 h-12 md:w-16 md:h-16 hidden sm:block" />
            {currentTime.toLocaleTimeString('vi-VN', { hour12: false })}
          </div>
          <div className="text-sm sm:text-lg md:text-2xl text-gray-600 mt-2 md:mt-4 font-medium uppercase tracking-wide px-2">
            {currentTime.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Khung điểm danh */}
        <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl overflow-hidden border border-gray-100 transition-all duration-300">
          {!selectedEmp ? (
            <div className="p-8">
              <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">Bạn là ai?</h2>
              
              <div className="relative mb-6">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Nhập tên hoặc Mã số để tìm..."
                  className="w-full pl-11 pr-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {filteredEmployees.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">Không tìm thấy nhân viên nào</div>
                ) : (
                  filteredEmployees.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => setSelectedEmp(emp)}
                      className="w-full flex items-center p-4 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-colors text-left"
                    >
                      <div className="bg-blue-100 text-blue-600 p-3 rounded-full mr-4">
                        <User size={24} />
                      </div>
                      <div>
                        <div className="font-bold text-gray-800 text-lg">{emp.fullName}</div>
                        <div className="text-sm text-gray-500 font-mono">ID: {emp.employeeCode || emp.id.substring(0,6)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <button 
                onClick={() => { setSelectedEmp(null); setSearchTerm(''); }}
                className="text-blue-500 hover:text-blue-700 font-medium text-sm mb-6 inline-flex items-center"
              >
                ← Quay lại danh sách
              </button>

              <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <User size={48} />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">{selectedEmp.fullName}</h2>
              <p className="text-gray-500 font-mono mb-8">ID: {selectedEmp.employeeCode || selectedEmp.id.substring(0,6)}</p>

              {loading ? (
                <div className="py-4 text-gray-500 font-medium">Đang kiểm tra dữ liệu...</div>
              ) : (
                <div className="space-y-4">
                  {!todayAttendance ? (
                    <button 
                      onClick={handleAction}
                      className="w-full py-5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl text-2xl font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
                    >
                      BẮT ĐẦU CA LÀM (CHECK-IN)
                    </button>
                  ) : todayAttendance && !todayAttendance.checkOut ? (
                    <button 
                      onClick={handleAction}
                      className="w-full py-5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl text-2xl font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
                    >
                      KẾT THÚC CA (CHECK-OUT)
                    </button>
                  ) : (
                    <div className="py-6 bg-green-50 border border-green-200 rounded-xl">
                      <div className="text-green-600 font-bold flex flex-col items-center justify-center gap-2">
                        <CheckCircle size={40} />
                        <span className="text-xl">BẠN ĐĐ HOÀN THÀNH CA LÀM HÔM NAY</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #CBD5E1;
          border-radius: 20px;
        }
      `}</style>
    </div>
  );
};

export default Kiosk;


