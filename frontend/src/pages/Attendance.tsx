import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { Clock, Edit2, Check, X } from 'lucide-react';

interface Employee {
  id: string;
  fullName: string;
  employeeCode?: string;
  branchName: string;
  branchId?: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  branchName: string;
  branchId?: string;
  date: string;
  checkIn: Date | null;
  checkOut: Date | null;
  status: string;
  shiftStr?: string;
}

const Attendance: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterDate, setFilterDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [filterBranchId, setFilterBranchId] = useState('');
  const [branches, setBranches] = useState<any[]>([]);

  // Manual check-in form
  const [selectedEmp, setSelectedEmp] = useState('');
  
  // Edit mode state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCheckIn, setEditCheckIn] = useState<string>('');
  const [editCheckOut, setEditCheckOut] = useState<string>('');

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const userRole = localStorage.getItem('userRole');
      const currentUserEmployeeId = localStorage.getItem('employeeId');

      // 1. Get Employees
      const empSnap = await getDocs(collection(db, 'employees'));
      const empList: Employee[] = [];
      let currentUserBranchId = '';

      if (userRole === 'SUPER_ADMIN') {
        const branchSnap = await getDocs(collection(db, 'branches'));
        const brs: any[] = [];
        branchSnap.forEach(b => brs.push({ id: b.id, name: b.data().name }));
        setBranches(brs);
        if (brs.length > 0) {
          setFilterBranchId(prev => prev || 'ALL');
        }
      }

      if (currentUserEmployeeId) {
        empSnap.forEach((doc) => {
          if (doc.id === currentUserEmployeeId) {
            currentUserBranchId = doc.data().branchId;
          }
        });
      }

      empSnap.forEach(d => {
        const data = d.data();
        
        // Hide self
        if (d.id === currentUserEmployeeId) return;

        // Branch admin can only see their own branch's employees
        if (userRole === 'BRANCH_ADMIN' && data.branchId !== currentUserBranchId) {
           return;
        }

        empList.push({ id: d.id, fullName: data.fullName, employeeCode: data.employeeCode, branchName: data.branchName, branchId: data.branchId });
      });
      setEmployees(empList);

      // 2. Get attendance for the selected date
      const attQuery = query(collection(db, 'attendance'), where('date', '==', filterDate));
      const attSnap = await getDocs(attQuery);
      
      const schQuery = query(collection(db, 'schedules'), where('date', '==', filterDate));
      const schSnap = await getDocs(schQuery);
      const schList: any[] = [];
      schSnap.forEach(d => schList.push({ id: d.id, ...d.data() }));
      
      const rawAtts: any[] = [];
      attSnap.forEach(d => {
        rawAtts.push({ 
          id: d.id, 
          ...d.data(), 
          checkIn: d.data().checkIn?.toDate(), 
          checkOut: d.data().checkOut?.toDate() 
        });
      });

      const attList: AttendanceRecord[] = [];
      
      empList.forEach(emp => {
        if (emp.id === currentUserEmployeeId) return;
        if (userRole === 'BRANCH_ADMIN' && emp.branchId !== currentUserBranchId) return;

        const myAtts = rawAtts
          .filter(a => a.employeeId === emp.id)
          .sort((a, b) => (a.checkIn?.getTime() || 0) - (b.checkIn?.getTime() || 0));
          
        const myShifts = schList
          .filter(s => s.employeeId === emp.id)
          .sort((a, b) => {
             const mA = a.shift.match(/\((\d{2}):(\d{2})/);
             const mB = b.shift.match(/\((\d{2}):(\d{2})/);
             const tA = mA ? parseInt(mA[1]) * 60 + parseInt(mA[2]) : 0;
             const tB = mB ? parseInt(mB[1]) * 60 + parseInt(mB[2]) : 0;
             return tA - tB;
          });
          
        const todayStr = new Date().toLocaleDateString('en-CA');
        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();

        const rowCount = Math.max(myAtts.length, myShifts.length, 1);
        
        for (let i = 0; i < rowCount; i++) {
          const att = myAtts[i];
          const shift = myShifts[i];
          
          let calcStatus = 'Không có mặt';
          if (!shift) {
            calcStatus = att ? 'Có mặt' : 'Không có mặt';
          } else {
            let shiftStartM = 0;
            const match = shift.shift.match(/\((\d{2}):(\d{2})/);
            if (match) {
              shiftStartM = parseInt(match[1]) * 60 + parseInt(match[2]);
            }
            if (!att) {
              if (filterDate > todayStr) calcStatus = 'Chưa tới ca';
              else if (filterDate < todayStr) calcStatus = 'Vắng mặt';
              else {
                if (nowM > shiftStartM + 15) calcStatus = 'Vắng mặt';
                else calcStatus = 'Chưa check-in';
              }
            } else {
              let isLate = false;
              if (att.checkIn) {
                const inM = att.checkIn.getHours() * 60 + att.checkIn.getMinutes();
                if (inM > shiftStartM + 15) isLate = true;
              }
              if (!att.checkOut) calcStatus = isLate ? 'Đang làm (Đi muộn)' : 'Đang làm (Đúng giờ)';
              else calcStatus = isLate ? 'Hoàn thành (Đi muộn)' : 'Hoàn thành (Đúng giờ)';
            }
          }

          attList.push({
            id: att?.id || `temp-${emp.id}-${i}`,
            employeeId: emp.id,
            employeeName: emp.fullName,
            employeeCode: emp.employeeCode,
            branchName: emp.branchName,
            branchId: emp.branchId,
            date: filterDate,
            checkIn: att?.checkIn || null,
            checkOut: att?.checkOut || null,
            status: calcStatus,
            shiftStr: shift ? shift.shift : 'Không có ca'
          });
        }
      });

      setRecords(attList);
    } catch (error) {
      console.error("Lỗi lấy dữ liệu chấm công:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [filterDate]);

  const handleCheckIn = async () => {
    if (!selectedEmp) {
      toast.error('Vui lòng chọn nhân viên!');
      return;
    }
    
    const emp = employees.find(e => e.id === selectedEmp);
    if (!emp) return;

    // Kiểm tra xem đã check-in hôm nay nhưng chưa check-out chưa
    const today = new Date().toLocaleDateString('en-CA');
    const existing = records.find(r => r.employeeId === selectedEmp && r.date === today && !r.checkOut);
    
    if (existing) {
      toast.error('Nhân viên này đang trong ca làm việc, chưa Check-out!');
      return;
    }

    try {
      await addDoc(collection(db, 'attendance'), {
        employeeId: emp.id,
        employeeName: emp.fullName,
        branchName: emp.branchName,
        branchId: emp.branchId || null,
        date: today,
        checkIn: new Date(),
        checkOut: null,
        status: 'PRESENT' // Có mặt
      });
      toast.success('Check-in thành công!');
      fetchAttendance();
    } catch (error) {
      toast.error('Lỗi Check-in!');
      toast.error('Lỗi Check-in!');
      console.error(error);
    }
  };

  const handleEdit = (record: AttendanceRecord) => {
    setEditingId(record.id);
    setEditCheckIn(record.checkIn ? record.checkIn.toTimeString().slice(0, 5) : '');
    setEditCheckOut(record.checkOut ? record.checkOut.toTimeString().slice(0, 5) : '');
  };

  const handleSaveEdit = async (record: AttendanceRecord) => {
    try {
      const updates: any = {};
      if (editCheckIn) {
        const [h, m] = editCheckIn.split(':');
        // fallback to new Date() if somehow date is malformed
        const baseDateIn = record.checkIn ? new Date(record.checkIn) : new Date(record.date + 'T00:00:00');
        baseDateIn.setHours(parseInt(h), parseInt(m), 0);
        updates.checkIn = baseDateIn;
      }
      if (editCheckOut) {
        const [h, m] = editCheckOut.split(':');
        const baseDateOut = record.checkOut ? new Date(record.checkOut) : (record.checkIn ? new Date(record.checkIn) : new Date(record.date + 'T00:00:00'));
        baseDateOut.setHours(parseInt(h), parseInt(m), 0);
        updates.checkOut = baseDateOut;
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'attendance', record.id), updates);
        toast.success('Cập nhật giờ thành công!');
        fetchAttendance();
      }
      setEditingId(null);
    } catch (error) {
      toast.error('Lỗi cập nhật giờ!');
    }
  };

  const handleCheckOut = async (recordId: string, employeeId: string) => {
    try {
      const now = new Date();
      await updateDoc(doc(db, 'attendance', recordId), {
        checkOut: now
      });

      // Lấy thông tin record và lương để cộng tiền
      const record = records.find(r => r.id === recordId);
      if (record && record.checkIn) {
        const empDoc = await getDoc(doc(db, 'employees', employeeId));
        if (empDoc.exists()) {
           const salaryPerHour = empDoc.data().salaryPerHour || 0;
           const diffMs = now.getTime() - record.checkIn.getTime();
           const hours = diffMs / (1000 * 60 * 60);
           const earned = Math.round(hours * salaryPerHour);

           // Tính tổng tiền hiện tại của nhân viên
           const attQuery = query(collection(db, 'attendance'), where('employeeId', '==', employeeId));
           const attSnap = await getDocs(attQuery);
           let totalEarned = 0;
           attSnap.forEach(d => {
              const data = d.data();
              if (data.checkIn && data.checkOut) {
                 const inTime = data.checkIn.toDate();
                 const outTime = data.checkOut.toDate();
                 const h = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
                 totalEarned += Math.round(h * salaryPerHour);
              }
           });

           const formattedEarned = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(earned);
           const formattedTotal = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalEarned);

           await addDoc(collection(db, 'notifications'), {
             employeeId: employeeId,
             title: 'Hoàn thành ca làm việc',
             message: `Bạn vừa được cộng ${formattedEarned} vào tài khoản. Tổng thu nhập hiện tại đã tăng lên ${formattedTotal}.`,
             type: 'MONEY_ADD',
             read: false,
             createdAt: new Date()
           });
        }
      }

      toast.success('Check-out thành công!');
      fetchAttendance();
    } catch (error) {
      toast.error('Lỗi Check-out!');
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Quản lý Chấm công</h2>
          <div className="flex items-center gap-3 mt-2">
            <input 
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded outline-none focus:ring-1 focus:ring-blue-500 text-sm"
            />
            {localStorage.getItem('userRole') === 'SUPER_ADMIN' && (
              <select
                value={filterBranchId}
                onChange={(e) => setFilterBranchId(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-gray-50"
              >
                <option value="ALL">Tất cả cơ sở</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
          <select 
            value={selectedEmp} 
            onChange={(e) => setSelectedEmp(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg outline-none"
          >
            <option value="">-- Chọn nhân viên --</option>
            {employees
              .filter(e => localStorage.getItem('userRole') !== 'SUPER_ADMIN' || filterBranchId === 'ALL' || e.branchId === filterBranchId)
              .map(e => (
                <option key={e.id} value={e.id}>
                  [{e.employeeCode || 'No ID'}] {e.fullName} - {e.branchName}
                </option>
              ))}
          </select>
          <button 
            onClick={handleCheckIn}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
          >
            Check-In Ngay
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Đang tải dữ liệu chấm công...</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-semibold text-gray-600 text-sm">Nhân viên</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Ngày làm</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Ca làm việc</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Giờ Vào (Check-in)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Giờ Ra (Check-out)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Tổng giờ làm</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Trạng thái</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {records.filter(r => localStorage.getItem('userRole') !== 'SUPER_ADMIN' || filterBranchId === 'ALL' || r.branchId === filterBranchId).length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">Chưa có ai chấm công ngày này.</td>
                </tr>
              ) : (
                records
                  .filter(r => localStorage.getItem('userRole') !== 'SUPER_ADMIN' || filterBranchId === 'ALL' || r.branchId === filterBranchId)
                  .map((record) => (
                  <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4 text-sm font-medium text-gray-800">
                      [{record.employeeCode || 'No ID'}] {record.employeeName}
                    </td>
                    <td className="p-4 text-sm text-gray-600">{record.branchName}</td>
                    <td className="p-4 text-sm text-gray-600">{new Date(record.date).toLocaleDateString('vi-VN')}</td>
                    <td className="p-4 text-sm text-gray-600">
                      {record.shiftStr || 'Không có ca'}
                    </td>
                    <td className="p-4 text-sm text-green-600 font-medium">
                      {editingId === record.id ? (
                        <input 
                          type="time" 
                          value={editCheckIn} 
                          onChange={e => setEditCheckIn(e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 outline-none text-black w-32" 
                        />
                      ) : (
                        <div className="flex items-center">
                          <Clock size={16} className="mr-1" />
                          {record.checkIn ? record.checkIn.toLocaleTimeString('vi-VN') : '--:--'}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-orange-600 font-medium">
                      {editingId === record.id ? (
                        <input 
                          type="time" 
                          value={editCheckOut} 
                          onChange={e => setEditCheckOut(e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 outline-none text-black w-32" 
                        />
                      ) : record.checkOut ? (
                        <div className="flex items-center">
                          <Clock size={16} className="mr-1" />
                          {record.checkOut.toLocaleTimeString('vi-VN')}
                        </div>
                      ) : '--:--'}
                    </td>
                    <td className="p-4 text-sm text-blue-600 font-medium">
                      {(() => {
                        if (record.checkIn && record.checkOut) {
                          const diff = record.checkOut.getTime() - record.checkIn.getTime();
                          const hrs = Math.floor(diff / (1000 * 60 * 60));
                          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                          const secs = Math.floor((diff % (1000 * 60)) / 1000);
                          return `${hrs} giờ ${mins} phút ${secs} giây`;
                        }
                        return '--';
                      })()}
                    </td>
                    <td className="p-4">
                      {(() => {
                        let colorClass = 'bg-green-100 text-green-700';
                        if (record.status.includes('Vắng mặt')) colorClass = 'bg-red-100 text-red-700';
                        else if (record.status.includes('Chưa') || record.status.includes('Không')) colorClass = 'bg-gray-100 text-gray-700';
                        else if (record.status.includes('muộn')) colorClass = 'bg-orange-100 text-orange-700';
                        
                        return (
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold flex items-center w-max ${colorClass}`}>
                            {record.status}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="p-4 flex justify-end items-center gap-2">
                      {editingId === record.id ? (
                        <>
                          <button onClick={() => handleSaveEdit(record)} className="text-green-600 hover:bg-green-50 p-1.5 rounded-lg"><Check size={18}/></button>
                          <button onClick={() => setEditingId(null)} className="text-gray-500 hover:bg-gray-50 p-1.5 rounded-lg"><X size={18}/></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleEdit(record)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg" title="Sửa giờ">
                            <Edit2 size={16} />
                          </button>
                          {record.checkIn && !record.checkOut && (
                            <button 
                              onClick={() => handleCheckOut(record.id, record.employeeId)}
                              className="text-sm bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1.5 rounded-lg font-medium transition-colors"
                            >
                              Cho ra ca (Check-out)
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Attendance;
