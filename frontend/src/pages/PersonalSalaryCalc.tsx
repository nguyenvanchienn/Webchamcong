import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, collection, addDoc, query, where, onSnapshot, deleteDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Calculator, Clock, DollarSign, Coffee, Plus, Trash2, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
interface PersonalTimeRecord {
  id: string;
  startTime: string;
  endTime: string;
  breakHours: number;
  breakTimeStr?: string;
  hours: number;
  amount: number;
  note?: string;
  createdAt: any;
}

const getLocalDatetimeLocal = (date: Date) => {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

const NumberInputForTime = ({ value, min, max, onChange, onComplete, inputRef }: { 
  value: string, min: number, max: number, onChange: (v: string) => void, onComplete?: () => void, inputRef?: React.Ref<HTMLInputElement>
}) => {
  const [localVal, setLocalVal] = useState(value);
  
  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={localVal}
      onChange={(e) => {
        let val = e.target.value.replace(/\D/g, ''); // Chỉ cho phép nhập số
        let shouldComplete = false;
        if (val.length >= 2) {
           val = val.slice(0, 2);
           shouldComplete = true;
        }
        let num = parseInt(val);
        if (!isNaN(num) && num > max) {
          val = max.toString();
          shouldComplete = true;
        }
        setLocalVal(val);
        if (shouldComplete && onComplete) {
          setTimeout(onComplete, 10);
        }
      }}
      onFocus={(e) => e.target.select()}
      onClick={(e) => (e.target as HTMLInputElement).select()}
      onBlur={() => {
        let v = parseInt(localVal);
        if (isNaN(v)) v = parseInt(value) || 0;
        if (v < min) v = min;
        if (v > max) v = max;
        onChange(v.toString().padStart(2, '0'));
      }}
      className="w-6 text-center outline-none font-medium text-gray-800 bg-transparent hover:text-blue-600 focus:text-blue-600 transition-colors"
      placeholder="00"
    />
  );
};

const CustomDateTimePicker = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
  const datePart = value.split('T')[0] || '';
  const timePart = value.split('T')[1] || '00:00';
  const [hour, minute] = timePart.split(':');
  const minuteRef = useRef<HTMLInputElement>(null);
  const hourRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2 w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all bg-white">
      <input 
        type="date" 
        value={datePart} 
        onChange={(e) => onChange(`${e.target.value}T${hour}:${minute}`)} 
        className="outline-none font-medium text-gray-800 bg-transparent flex-1 cursor-pointer" 
      />
      <div className="flex items-center border-l-2 border-gray-100 pl-3">
        <NumberInputForTime
          value={hour}
          min={0}
          max={23}
          onChange={(val) => onChange(`${datePart}T${val}:${minute}`)}
          onComplete={() => minuteRef.current?.focus()}
          inputRef={hourRef}
        />
        <span className="text-gray-600 font-bold mx-0.5">:</span>
        <NumberInputForTime
          value={minute}
          min={0}
          max={59}
          onChange={(val) => onChange(`${datePart}T${hour}:${val}`)}
          inputRef={minuteRef}
        />
        <div className="relative ml-1.5 flex items-center justify-center">
          <Clock 
            size={16} 
            className="text-gray-500 cursor-pointer hover:text-blue-600 transition-colors" 
          />
          <input
            type="time"
            value={`${hour}:${minute}`}
            onChange={(e) => {
              if (e.target.value) {
                onChange(`${datePart}T${e.target.value}`);
              }
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>
      </div>
    </div>
  );
};

const PersonalSalaryCalc: React.FC = () => {
  const [startTime, setStartTime] = useState<string>(getLocalDatetimeLocal(new Date()).split('T')[0] + 'T00:00');
  const [endTime, setEndTime] = useState<string>(getLocalDatetimeLocal(new Date()).split('T')[0] + 'T00:00');
  const [breakHoursInput, setBreakHoursInput] = useState<string>('0');
  const [breakMinutesInput, setBreakMinutesInput] = useState<string>('0');
  
  const [salaryPerHour, setSalaryPerHour] = useState<number>(0);
  const [records, setRecords] = useState<PersonalTimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  
  const [noteInput, setNoteInput] = useState<string>('');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const breakMinuteRef = useRef<HTMLInputElement>(null);
  const breakHourRef = useRef<HTMLInputElement>(null);

  const employeeId = localStorage.getItem('employeeId');
  const userRole = localStorage.getItem('userRole') || 'EMPLOYEE';
  const [enablePersonalSalaryCalc, setEnablePersonalSalaryCalc] = useState<boolean>(true);
  
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);
  const [pendingToggleVal, setPendingToggleVal] = useState<boolean>(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'general'));
        if (docSnap.exists() && docSnap.data().enablePersonalSalaryCalc !== undefined) {
          setEnablePersonalSalaryCalc(docSnap.data().enablePersonalSalaryCalc);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    const fetchSalary = async () => {
      if (!employeeId) {
        setLoading(false);
        return;
      }
      try {
        const empDoc = await getDoc(doc(db, 'employees', employeeId));
        if (empDoc.exists()) {
          const data = empDoc.data();
          setSalaryPerHour(data.salaryPerHour || 0);
        }
      } catch (error) {
        console.error('Error fetching employee salary:', error);
        toast.error('Lỗi khi tải thông tin lương cơ bản');
      }
    };

    fetchSalary();
  }, [employeeId]);

  useEffect(() => {
    if (!employeeId) return;
    
    const q = query(
      collection(db, 'personal_time_records'),
      where('employeeId', '==', employeeId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: PersonalTimeRecord[] = [];
      snapshot.forEach(d => {
        data.push({ id: d.id, ...d.data() } as PersonalTimeRecord);
      });
      // Sắp xếp client-side để tránh lỗi missing composite index
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      setRecords(data);
      setLoading(false);
    }, (error) => {
      console.error("Lỗi khi lấy dữ liệu:", error);
      setLoading(false);
      toast.error("Không thể tải danh sách ca làm");
    });

    return () => unsubscribe();
  }, [employeeId]);

  const calculateTotal = (sTime: string, eTime: string, bHoursStr: string, bMinsStr: string) => {
    if (!sTime || !eTime) return { hours: 0, amount: 0 };
    const start = new Date(sTime);
    const end = new Date(eTime);
    let totalMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    if (totalMinutes < 0) totalMinutes = 0;
    
    const bHours = parseInt(bHoursStr, 10) || 0;
    const bMins = parseInt(bMinsStr, 10) || 0;
    const bTotalMinutes = (bHours * 60) + bMins;
    
    let workedMinutes = totalMinutes - bTotalMinutes;
    if (workedMinutes < 0) workedMinutes = 0;
    const workedHours = workedMinutes / 60;
    const amount = workedHours * salaryPerHour;
    return { hours: workedHours, amount: Math.ceil(amount) };
  };

  const handleAddRecord = async () => {
    if (!employeeId) {
      toast.error('Tài khoản của bạn không được liên kết với nhân viên nào nên không thể lưu.');
      return;
    }
    if (!startTime || !endTime) {
      toast.error('Vui lòng chọn thời gian đầy đủ');
      return;
    }
    const { hours, amount } = calculateTotal(startTime, endTime, breakHoursInput, breakMinutesInput);
    if (hours <= 0) {
      toast.error('Thời gian làm việc không hợp lệ (phải > 0)');
      return;
    }
    
    setAdding(true);
    try {
      const payload = {
        employeeId,
        startTime,
        endTime,
        breakHours: (parseInt(breakHoursInput) || 0) + (parseInt(breakMinutesInput) || 0) / 60,
        breakTimeStr: `${(parseInt(breakHoursInput) || 0).toString().padStart(2, '0')}:${(parseInt(breakMinutesInput) || 0).toString().padStart(2, '0')}`,
        hours,
        amount,
        note: noteInput.trim(),
        createdAt: serverTimestamp()
      };

      if (editingRecordId) {
        await updateDoc(doc(db, 'personal_time_records', editingRecordId), {
           ...payload,
           createdAt: records.find(r => r.id === editingRecordId)?.createdAt || serverTimestamp() // Giữ nguyên createdAt cũ
        });
        toast.success('Đã cập nhật ca làm');
      } else {
        await addDoc(collection(db, 'personal_time_records'), payload);
        toast.success('Đã thêm ca làm');
      }

      // Reset về mặc định
      setStartTime(getLocalDatetimeLocal(new Date()));
      setEndTime(getLocalDatetimeLocal(new Date(Date.now() + 8 * 60 * 60 * 1000)));
      setBreakHoursInput('0');
      setBreakMinutesInput('0');
      setNoteInput('');
      setEditingRecordId(null);
    } catch (e) {
      console.error(e);
      toast.error('Có lỗi xảy ra');
    } finally {
      setAdding(false);
    }
  };

  const handleEditRecord = (record: PersonalTimeRecord) => {
    setEditingRecordId(record.id);
    setStartTime(record.startTime);
    setEndTime(record.endTime);
    if (record.breakTimeStr) {
      const [h, m] = record.breakTimeStr.split(':');
      setBreakHoursInput(parseInt(h).toString());
      setBreakMinutesInput(parseInt(m).toString());
    } else {
      setBreakHoursInput('0');
      setBreakMinutesInput('0');
    }
    setNoteInput(record.note || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRecord = async (id: string) => {
    const result = await Swal.fire({
      title: 'Xóa ca làm?',
      text: 'Bạn có chắc chắn muốn xóa ca làm này?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Xóa',
      cancelButtonText: 'Hủy'
    });
    
    if (!result.isConfirmed) return;

    try {
      await deleteDoc(doc(db, 'personal_time_records', id));
      toast.success('Đã xóa ca làm');
    } catch (e) {
      console.error(e);
      toast.error('Lỗi khi xóa');
    }
  };

  const handleDeleteAllRecords = async () => {
    if (records.length === 0) return;
    
    const result = await Swal.fire({
      title: 'Xóa tất cả?',
      text: 'Bạn có chắc chắn muốn xóa TOÀN BỘ danh sách ca làm đã lưu? Hành động này không thể hoàn tác.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Xóa tất cả',
      cancelButtonText: 'Hủy'
    });
    
    if (!result.isConfirmed) return;

    try {
      const promises = records.map(r => deleteDoc(doc(db, 'personal_time_records', r.id)));
      await Promise.all(promises);
      toast.success('Đã xóa toàn bộ ca làm');
    } catch (e) {
      console.error(e);
      toast.error('Lỗi khi xóa');
    }
  };

  const currentCalc = calculateTotal(startTime, endTime, breakHoursInput, breakMinutesInput);
  const totalHours = records.reduce((sum, r) => sum + r.hours, 0);
  const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);

  const formatDateTime = (dtStr: string) => {
    const d = new Date(dtStr);
    return d.toLocaleString('vi-VN', { 
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-3">
          <Calculator className="text-blue-600" size={28} />
          Ước tính lương cá nhân
        </h1>
        {userRole === 'SUPER_ADMIN' && (
          <label className="flex items-center gap-3 cursor-pointer bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={enablePersonalSalaryCalc}
                onChange={(e) => {
                  setPendingToggleVal(e.target.checked);
                  setShowToggleConfirm(true);
                }}
              />
              <div className={`block w-12 h-7 rounded-full transition-colors ${enablePersonalSalaryCalc ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${enablePersonalSalaryCalc ? 'transform translate-x-5' : ''}`}></div>
            </div>
            <span className="text-sm font-semibold text-gray-700 hidden sm:block">Cho phép nhân viên sử dụng</span>
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="order-2 lg:order-1 lg:col-span-2 space-y-6">
          {/* Box nhập liệu */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Clock size={20} />
                </div>
                <h2 className="font-bold text-gray-800 text-lg">Nhập thời gian (Thủ công)</h2>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Thời gian bắt đầu</label>
                <CustomDateTimePicker 
                  value={startTime}
                  onChange={setStartTime}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Thời gian kết thúc</label>
                <CustomDateTimePicker 
                  value={endTime}
                  onChange={setEndTime}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-1 flex items-center gap-1">
                <Coffee size={16} /> Thời gian nghỉ giải lao
              </label>
              <div className="inline-flex items-center border-2 border-gray-100 rounded-xl px-4 py-3 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all bg-white">
                <NumberInputForTime
                  value={breakHoursInput.padStart(2, '0')}
                  min={0}
                  max={23}
                  onChange={(val) => setBreakHoursInput(val)}
                  onComplete={() => breakMinuteRef.current?.focus()}
                  inputRef={breakHourRef}
                />
                <span className="text-gray-600 font-bold mx-0.5">:</span>
                <NumberInputForTime
                  value={breakMinutesInput.padStart(2, '0')}
                  min={0}
                  max={59}
                  onChange={(val) => setBreakMinutesInput(val)}
                  inputRef={breakMinuteRef}
                />
                <div className="relative ml-1.5 flex items-center justify-center">
                  <Clock 
                    size={16} 
                    className="text-gray-500 cursor-pointer hover:text-blue-600 transition-colors" 
                  />
                  <input
                    type="time"
                    value={`${breakHoursInput.padStart(2, '0')}:${breakMinutesInput.padStart(2, '0')}`}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [h, m] = e.target.value.split(':');
                        setBreakHoursInput(h);
                        setBreakMinutesInput(m);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <span className="text-gray-400">📝</span> Ghi chú (Không bắt buộc)
              </label>
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Ví dụ: Tăng ca tối, làm bù..."
                className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all bg-white outline-none font-medium text-gray-800"
              />
            </div>
            
            <div className="flex items-center justify-between bg-blue-50 p-4 rounded-xl border border-blue-100 mt-6">
               <div>
                  <p className="text-sm text-blue-800 mb-1">Ước tính cho ca đang nhập:</p>
                  <p className="font-bold text-blue-900 text-lg">
                    {currentCalc.hours.toFixed(2)} giờ = {new Intl.NumberFormat('vi-VN').format(currentCalc.amount)} đ
                  </p>
               </div>
               <button
                 onClick={handleAddRecord}
                 disabled={adding || currentCalc.hours <= 0}
                 className={`flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-bold transition-colors disabled:opacity-50 shadow-md ${editingRecordId ? 'bg-green-600 hover:bg-green-700 shadow-green-500/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'}`}
               >
                 {editingRecordId ? (
                   <>Cập nhật</>
                 ) : (
                   <><Plus size={18} />Thêm vào danh sách</>
                 )}
               </button>
               {editingRecordId && (
                 <button
                   onClick={() => {
                     setEditingRecordId(null);
                     setStartTime(getLocalDatetimeLocal(new Date()));
                     setEndTime(getLocalDatetimeLocal(new Date(Date.now() + 8 * 60 * 60 * 1000)));
                     setBreakHoursInput('0');
                     setBreakMinutesInput('0');
                     setNoteInput('');
                   }}
                   className="ml-3 text-sm text-gray-500 hover:text-gray-700 font-medium underline"
                 >
                   Hủy sửa
                 </button>
               )}
            </div>
          </div>

          {/* Danh sách đã lưu */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                    <CalendarDays size={20} />
                  </div>
                  <h2 className="font-bold text-gray-800 text-lg">Danh sách đã lưu</h2>
                </div>
                {records.length > 0 && (
                  <button
                    onClick={handleDeleteAllRecords}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors font-medium"
                  >
                    <Trash2 size={14} />
                    Xóa tất cả
                  </button>
                )}
              </div>
              
              {records.length === 0 ? (
                <div className="text-center text-gray-400 py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  Chưa có ca làm nào được lưu.
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {records.map(record => (
                    <div key={record.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-100 hover:border-blue-200 transition-colors gap-3">
                       <div className="space-y-1">
                          <div className="font-bold text-gray-800 text-sm">
                            {formatDateTime(record.startTime)} <span className="text-gray-400 font-normal mx-1">đến</span> {formatDateTime(record.endTime)}
                          </div>
                          <div className="text-xs text-gray-500">
                            Giải lao: {record.breakTimeStr ? record.breakTimeStr : `${record.breakHours} giờ`} • <span className="text-blue-600 font-bold">{record.hours.toFixed(2)} giờ</span>
                          </div>
                          {record.note && (
                             <div className="text-xs text-gray-600 italic border-l-2 border-blue-200 pl-2 mt-1">
                               {record.note}
                             </div>
                           )}
                       </div>
                       <div className="flex items-center gap-2 self-end sm:self-auto">
                          <div className="font-black text-gray-800 text-right mr-2">
                             {new Intl.NumberFormat('vi-VN').format(record.amount)} đ
                          </div>
                          <button
                            onClick={() => handleEditRecord(record)}
                            className="p-2 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Sửa ca này"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(record.id)}
                            className="p-2 text-gray-400 hover:bg-red-100 hover:text-red-500 rounded-lg transition-colors"
                            title="Xóa ca này"
                          >
                             <Trash2 size={16} />
                          </button>
                       </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        {/* Tổng kết */}
        <div className="order-1 lg:order-2 bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-3xl shadow-xl text-white flex flex-col justify-center space-y-8 relative overflow-hidden h-fit sticky top-6">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <DollarSign size={120} />
          </div>
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>

          <div className="relative z-10 p-5 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20">
            <p className="text-blue-100 font-medium mb-1">Mức lương cơ bản</p>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(salaryPerHour)} <span className="text-sm font-normal text-blue-200">/ giờ</span>
            </div>
          </div>

          <div className="relative z-10">
            <p className="text-blue-100 font-medium mb-1">Tổng thời gian (Tất cả ca lưu)</p>
            <div className="text-4xl font-black flex items-baseline gap-2">
              {totalHours.toFixed(2)} <span className="text-xl font-medium text-blue-200">Giờ</span>
            </div>
          </div>

          <div className="relative z-10">
            <p className="text-blue-100 font-medium mb-2 uppercase tracking-wider text-sm">Ước tính tổng thu nhập</p>
            <div className="text-5xl font-black text-yellow-300 drop-shadow-sm">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
            </div>
            <p className="text-xs text-blue-200 mt-3 flex items-center gap-1 bg-black/20 p-2 rounded-lg inline-flex">
              <span className="bg-yellow-400 w-2 h-2 rounded-full animate-pulse shrink-0"></span>
              Đây chỉ là số liệu ước tính cá nhân (không lưu vào bảng lương hệ thống).
            </p>
          </div>
        </div>
      </div>

      {showToggleConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-xl font-bold text-gray-800 mb-3">Xác nhận</h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
              Bạn có chắc chắn muốn <span className="font-bold">{pendingToggleVal ? 'BẬT' : 'TẮT'}</span> chức năng "Tự tính lương" cho toàn bộ nhân viên không?
            </p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setShowToggleConfirm(false)}
                className="px-4 py-2.5 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={async () => {
                  setShowToggleConfirm(false);
                  const val = pendingToggleVal;
                  setEnablePersonalSalaryCalc(val);
                  try {
                    await setDoc(doc(db, 'settings', 'general'), { enablePersonalSalaryCalc: val }, { merge: true });
                    toast.success(val ? 'Đã BẬT chức năng Tự tính lương' : 'Đã TẮT chức năng Tự tính lương');
                  } catch (err) {
                    console.error(err);
                    toast.error('Có lỗi xảy ra khi lưu thiết lập');
                  }
                }}
                className={`px-5 py-2.5 font-semibold rounded-lg text-white transition-colors ${pendingToggleVal ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalSalaryCalc;
