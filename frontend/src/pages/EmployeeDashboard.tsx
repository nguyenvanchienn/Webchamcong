import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CalendarDays, Clock, CheckCircle2, UserCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import Swal from 'sweetalert2';

interface WeekDate {
  dateStr: string;
  dayName: string;
  displayDate: string;
}

interface Schedule {
  id: string;
  employeeId: string | null;
  employeeName: string;
  date: string;
  shift: string;
  salaryMultiplier?: number;
}

interface EnhancedSchedule {
  id: string;
  date: string;
  shift: string;
  salaryMultiplier?: number;
  status: 'PENDING' | 'PRESENT' | 'WORKING' | 'ABSENT' | 'FUTURE';
  attendance: Attendance | null;
  coworkers: { name: string; statusStr: string; isMe: boolean }[];
}

interface Attendance {
  id: string;
  date: string;
  checkIn: Date | null;
  checkOut: Date | null;
}

const EmployeeDashboard: React.FC = () => {
  const employeeId = localStorage.getItem('employeeId');
  
  const [employeeInfo, setEmployeeInfo] = useState<any>(null);
  const [weeklySchedules, setWeeklySchedules] = useState<EnhancedSchedule[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekDates, setWeekDates] = useState<WeekDate[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [systemAnnouncement, setSystemAnnouncement] = useState<any>(null);
  const [workingDuration, setWorkingDuration] = useState<string>('00:00:00');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (todayAttendance && todayAttendance.checkIn && !todayAttendance.checkOut) {
      const calcDuration = () => {
        const now = new Date();
        const diff = Math.max(0, Math.floor((now.getTime() - todayAttendance.checkIn!.getTime()) / 1000));
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setWorkingDuration(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      };
      calcDuration();
      interval = setInterval(calcDuration, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [todayAttendance]);

  const fetchData = async () => {
    if (!employeeId) return;
    setLoading(true);
    
    try {
      // 1. Lấy thông tin nhân viên và thông báo hệ thống
      const empDoc = await getDoc(doc(db, 'employees', employeeId));
      let empData: any = null;
      if (empDoc.exists()) {
        empData = { id: empDoc.id, ...empDoc.data() };
        setEmployeeInfo(empData);
      }

      // Lấy thông báo (announcements)
      const annQuery = query(collection(db, 'announcements'));
      const annSnap = await getDocs(annQuery);
      let activeAnn: any = null;
      // Convert to array and sort by createdAt desc manually since we didn't index
      const annList: any[] = [];
      annSnap.forEach(d => annList.push({ id: d.id, ...d.data() }));
      annList.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      
      for (const data of annList) {
        if (data.targetBranchId !== 'ALL' && empData && data.targetBranchId !== empData.branchId) continue;
        if (data.expiresAt) {
          const expiresDate = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
          if (expiresDate < new Date()) continue; // Đã hết hạn
        }
        activeAnn = data;
        break; // Lấy cái mới nhất hợp lệ
      }
      setSystemAnnouncement(activeAnn);

      // 2. Lấy tuần hiện tại
      const curr = new Date();
      const dayOfWeek = curr.getDay() === 0 ? 7 : curr.getDay(); // CN là 7
      const firstDay = curr.getDate() - dayOfWeek + 1 + (weekOffset * 7);
      
      const dates = [];
      for(let i = 0; i < 7; i++) {
        const nextDate = new Date(curr.getFullYear(), curr.getMonth(), firstDay + i);
        const dateStr = nextDate.toLocaleDateString('en-CA'); 
        dates.push({
          dateStr,
          dayName: i === 6 ? 'CN' : `Thứ ${i + 2}`,
          displayDate: nextDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
        });
      }
      setWeekDates(dates);

      const startOfWeek = dates[0].dateStr;
      const endOfWeek = dates[6].dateStr;
      const todayStr = curr.toLocaleDateString('en-CA');

      const schQuery = query(
        collection(db, 'schedules'), 
        where('date', '>=', startOfWeek),
        where('date', '<=', endOfWeek)
      );
      const schSnap = await getDocs(schQuery);
      
      // Lấy thời gian mở xem trước / mở đăng ký từ settings
      const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
      let visibleAfter = null;
      if (settingsDoc.exists()) {
         const data = settingsDoc.data();
         const previewTime = data.previewTimes?.[startOfWeek];
         const openTime = data.openTimes?.[startOfWeek];
         visibleAfter = previewTime || openTime;
      }

      const allSchList: Schedule[] = [];
      if (!visibleAfter || new Date() >= new Date(visibleAfter)) {
         schSnap.forEach(d => allSchList.push({ id: d.id, ...d.data() } as Schedule));
      }

      // 4. Lấy tất cả chấm công trong tuần này (để xác định trạng thái đồng nghiệp)
      const attQuery = query(
        collection(db, 'attendance'),
        where('date', '>=', startOfWeek),
        where('date', '<=', endOfWeek)
      );
      const attSnap = await getDocs(attQuery);
      const allAttendances: any[] = [];
      attSnap.forEach(d => {
        const attData = d.data();
        allAttendances.push({
          id: d.id,
          ...attData,
          checkIn: attData.checkIn ? attData.checkIn.toDate() : null,
          checkOut: attData.checkOut ? attData.checkOut.toDate() : null,
        });
      });

      const myAttendances: Attendance[] = [];
      let todayAtt: Attendance | null = null;
      
      // Sắp xếp các record chấm công của TÔI theo thời gian
      const sortedMyAttendances = allAttendances
        .filter(a => a.employeeId === employeeId)
        .sort((a, b) => {
          const tA = a.checkIn ? a.checkIn.getTime() : 0;
          const tB = b.checkIn ? b.checkIn.getTime() : 0;
          return tA - tB;
        });

      sortedMyAttendances.forEach(a => {
        myAttendances.push(a);
        if (a.date === todayStr) {
          todayAtt = a;
        }
      });
      setTodayAttendance(todayAtt);

      const matchAttendance = (empId: string, dateStr: string, shiftStr: string) => {
        const shiftsForDay = allSchList.filter(s => s.employeeId === empId && s.date === dateStr);
        shiftsForDay.sort((a, b) => {
          const mA = a.shift.match(/\((\d{2}):(\d{2})/);
          const mB = b.shift.match(/\((\d{2}):(\d{2})/);
          const tA = mA ? parseInt(mA[1]) * 60 + parseInt(mA[2]) : 0;
          const tB = mB ? parseInt(mB[1]) * 60 + parseInt(mB[2]) : 0;
          return tA - tB;
        });

        const shiftIndex = shiftsForDay.findIndex(s => s.shift === shiftStr);

        const attsForDay = allAttendances
          .filter(a => a.employeeId === empId && a.date === dateStr)
          .sort((a, b) => {
            const tA = a.checkIn ? a.checkIn.getTime() : 0;
            const tB = b.checkIn ? b.checkIn.getTime() : 0;
            return tA - tB;
          });

        return attsForDay[shiftIndex] || null;
      };

      const getStatusStr = (att: any, shiftDate: string, shiftStr: string) => {
         if (shiftDate > todayStr) return 'Chưa tới ca';
         if (!att) {
           if (shiftDate === todayStr) {
             const match = shiftStr.match(/\((\d{2}):(\d{2})/);
             if (match) {
               const shiftM = parseInt(match[1]) * 60 + parseInt(match[2]);
               const now = new Date();
               const nowM = now.getHours() * 60 + now.getMinutes();
               if (nowM < shiftM - 30) return 'Chưa tới ca';
             }
             return 'Chưa Check-in';
           }
           return 'Vắng mặt';
         }
         
         let isLate = false;
         const inTime = att.checkIn;
         if (inTime) {
            const match = shiftStr.match(/\((\d{2}):(\d{2})/);
            if (match) {
               const shiftM = parseInt(match[1]) * 60 + parseInt(match[2]);
               const inM = inTime.getHours() * 60 + inTime.getMinutes();
               if (inM > shiftM + 15) isLate = true;
            }
         }
         
         if (!att.checkOut) {
            return isLate ? 'Đang làm (Đi muộn)' : 'Đang làm (Đúng giờ)';
         } else {
            return isLate ? 'Hoàn thành (Đi muộn)' : 'Hoàn thành (Đúng giờ)';
         }
      };

      // 5. Build danh sách EnhancedSchedule cho TÔI
      const myShifts = allSchList.filter(s => s.employeeId === employeeId);
      
      const enhancedList: EnhancedSchedule[] = myShifts.map(myShift => {
        // Tìm những người cùng ca (bao gồm cả mình)
        const allPeopleOnShift = allSchList
          .filter(s => s.date === myShift.date && s.shift === myShift.shift && s.employeeId !== null);
          
        const coworkers = allPeopleOnShift.map(s => {
          const personAtt = matchAttendance(s.employeeId || '', myShift.date, myShift.shift);
          return {
            name: s.employeeName,
            statusStr: getStatusStr(personAtt, myShift.date, myShift.shift),
            isMe: s.employeeId === employeeId
          };
        });

        // Khớp attendance
        const att = matchAttendance(employeeId || '', myShift.date, myShift.shift);
        
        let status: 'PENDING' | 'PRESENT' | 'WORKING' | 'ABSENT' | 'FUTURE' = 'FUTURE';
        if (myShift.date > todayStr) {
          status = 'FUTURE';
        } else if (myShift.date === todayStr) {
          if (!att) status = 'PENDING';
          else if (!att.checkOut) status = 'WORKING';
          else status = 'PRESENT';
        } else {
          // Past
          if (!att) status = 'ABSENT';
          else if (!att.checkOut) status = 'WORKING'; // Quên check-out
          else status = 'PRESENT';
        }

        return {
          ...myShift,
          attendance: att || null,
          status,
          coworkers,
          salaryMultiplier: myShift.salaryMultiplier || 1
        };
      });

      enhancedList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setWeeklySchedules(enhancedList);

    } catch (error) {
      console.error("Lỗi lấy dữ liệu cá nhân:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [employeeId, weekOffset]);

  const getDynamicHoursRange = () => {
    let start = 8;
    let end = 12; // Default covers up to 12:00 at least
    
    if (weeklySchedules.length > 0) {
      let minH = 24;
      let maxH = 0;
      weeklySchedules.forEach(sch => {
        const match = sch.shift.match(/\((\d{2}):\d{2} - (\d{2}):\d{2}\)/);
        if (match) {
          const h1 = parseInt(match[1]);
          const h2 = parseInt(match[2]);
          if (h1 < minH) minH = h1;
          if (h2 > maxH) maxH = h2;
        }
      });
      if (minH < 24 && minH < start) start = minH;
      if (maxH > 0 && maxH > end) end = maxH;
    }
    
    return { START_HOUR: start, END_HOUR: end };
  };

  const { START_HOUR, END_HOUR } = getDynamicHoursRange();
  const HOUR_HEIGHT = 60; // 60px
  const hoursList = Array.from({length: END_HOUR - START_HOUR + 1}, (_, i) => START_HOUR + i);

  const getEventStyle = (shiftStr: string) => {
    // Sáng (08:00 - 12:00)
    const match = shiftStr.match(/\((\d{2}):\d{2} - (\d{2}):\d{2}\)/);
    if (!match) return { top: 0, height: 60 };
    
    const startH = parseInt(match[1]);
    const endH = parseInt(match[2]);
    
    const top = Math.max(0, (startH - START_HOUR)) * HOUR_HEIGHT;
    const height = (endH - startH) * HOUR_HEIGHT;
    return { top: `${top}px`, height: `${height}px` };
  };

  const getShiftTime = (shiftStr: string) => {
    const match = shiftStr.match(/\((.*?)\)/);
    return match ? match[1] : shiftStr;
  };

  const getShiftName = (shiftStr: string) => {
    const name = shiftStr.split(' (')[0];
    return name.toLowerCase().includes('ca') ? name : `Ca ${name}`;
  };

  const handleViewCoworkers = (sch: EnhancedSchedule) => {
    let html = `<div class="text-left text-sm mt-4">`;
    const totalMembers = sch.coworkers.length;
    
    html += `<div class="font-bold text-gray-700 border-b pb-2 mb-3 flex items-center"><span class="mr-2">👥</span> Thành viên ca làm (${totalMembers}):</div>`;
    html += `<ul class="space-y-3 text-gray-700">`;
    
    // Sort alphabetically
    const sortedCoworkers = [...sch.coworkers].sort((a, b) => a.name.localeCompare(b.name, 'vi-VN'));
    
    sortedCoworkers.forEach((person, index) => {
      const isMe = person.isMe;
      const statusColor = person.statusStr.includes('Đúng giờ') ? 'text-green-600' :
                          person.statusStr.includes('Đi muộn') ? 'text-orange-500' :
                          person.statusStr.includes('Vắng mặt') ? 'text-red-500' :
                          person.statusStr.includes('Đang làm') ? 'text-blue-600' :
                          'text-gray-500';
                          
      html += `
        <li class="flex flex-col bg-gray-50 p-2 rounded-lg border border-gray-100">
          <div class="flex justify-between items-center">
            <span class="${isMe ? 'font-bold text-green-700' : 'font-medium text-gray-800'}">
              ${index + 1}. ${person.name} ${isMe ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-1 border border-green-200">Bạn</span>' : ''}
            </span>
          </div>
          ${isMe ? `
          <div class="text-xs mt-1.5 font-medium ${statusColor} flex items-center">
             <span class="mr-1">👉</span> Trạng thái: ${person.statusStr}
          </div>
          ` : ''}
        </li>
      `;
    });
    html += `</ul>`;
    
    html += `</div>`;

    Swal.fire({
      title: `${getShiftName(sch.shift)}`,
      html: html,
      confirmButtonText: 'Đóng',
      confirmButtonColor: '#253e7a'
    });
  };

  // Nhân viên không được tự check-in / check-out để tránh gian lận. Quản lý sẽ thực hiện việc này.

  if (loading) return <div className="p-8 text-center text-gray-500">Đang tải dữ liệu cá nhân...</div>;
  if (!employeeInfo) return <div className="p-8 text-center text-red-500">Tài khoản này chưa được liên kết với Hồ sơ nhân viên nào! Vui lòng liên hệ Quản lý.</div>;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'Chào buổi sáng';
    if (hour >= 11 && hour < 14) return 'Chào buổi trưa';
    if (hour >= 14 && hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  };

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-800">
          Chào mừng {employeeInfo.fullName} đến với Hệ thống Chấm Công Pro
        </h1>
        <p className="text-gray-600 mt-1 font-medium">
          {getGreeting()}, chúc bạn một ca làm việc hiệu quả!
        </p>
      </div>
      {/* Thông báo chung */}
      {systemAnnouncement && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-xl shadow-sm">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <h3 className="text-sm font-bold text-yellow-800 break-words">{systemAnnouncement.title || 'Thông báo từ Ban Quản Lý'}</h3>
              <div className="mt-2 text-sm text-yellow-700 whitespace-pre-wrap break-words">
                <p>{systemAnnouncement.message}</p>
              </div>
              {systemAnnouncement.createdAt && (
                <div className="mt-2 text-xs text-yellow-600 italic">
                  {new Date(systemAnnouncement.createdAt?.toDate ? systemAnnouncement.createdAt.toDate() : systemAnnouncement.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white shadow-md flex items-center justify-between">
        <div className="flex items-center">
          <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center text-blue-600 mr-4 shadow-sm">
            <UserCircle size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{employeeInfo.fullName}</h2>
            <p className="text-blue-100 mt-1 text-sm">Cơ sở: {employeeInfo.branchName}</p>
            <p className="text-blue-100 mt-1 text-sm">Mã NV: {employeeInfo.employeeCode || employeeInfo.id}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-blue-100">Lương cơ bản / Giờ</p>
          <p className="text-2xl font-bold">
            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(employeeInfo.salaryPerHour)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chấm công Block */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center text-center">
          <h3 className="text-lg font-bold text-gray-800 mb-4 w-full border-b pb-2">Chấm công hôm nay</h3>
          <div className="mb-6 text-gray-500 font-medium">
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          
          {(() => {
            if (todayAttendance) {
              if (todayAttendance.checkOut) {
                return (
                  <div className="p-4 bg-gray-50 rounded-lg w-full">
                    <p className="text-green-600 font-bold flex items-center justify-center mb-2">
                      <CheckCircle2 className="mr-2" /> Hoàn thành ca làm
                    </p>
                    <p className="text-sm text-gray-600">Check-in: {todayAttendance.checkIn?.toLocaleTimeString('vi-VN')}</p>
                    <p className="text-sm text-gray-600 mt-1">Check-out: {todayAttendance.checkOut?.toLocaleTimeString('vi-VN')}</p>
                  </div>
                );
              } else {
                return (
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg w-full flex flex-col items-center justify-center">
                    <p className="text-blue-600 font-bold mb-2 flex items-center text-lg">
                      <Clock className="mr-2" size={24} />
                      Đang làm việc
                    </p>
                    <div className="text-4xl font-mono font-bold text-blue-700 my-3 tracking-wider bg-blue-100 px-6 py-2 rounded-xl shadow-inner border border-blue-200">
                      {workingDuration}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">Vào ca lúc: <span className="font-semibold">{todayAttendance.checkIn?.toLocaleTimeString('vi-VN')}</span></p>
                    <p className="text-xs text-blue-500 mt-2 text-center italic">Vui lòng gặp Quản lý để được Check-out khi kết thúc ca.</p>
                  </div>
                );
              }
            }

            // No attendance yet. Check if they have a shift today.
            const todayStr = new Date().toLocaleDateString('en-CA');
            const todayShifts = weeklySchedules.filter(s => s.date === todayStr);

            if (todayShifts.length === 0) {
              return (
                <div className="p-6 bg-gray-50 rounded-xl w-full border border-gray-100 flex flex-col items-center justify-center">
                  <CalendarDays size={40} className="text-gray-300 mb-3" />
                  <p className="text-gray-600 font-medium text-center">Hôm nay bạn không có ca làm việc</p>
                </div>
              );
            }

            return (
              <div className="p-6 bg-green-50 border border-green-100 rounded-xl w-full flex flex-col items-center justify-center text-center">
                <Clock size={40} className="text-green-500 mb-3" />
                <p className="text-green-700 font-bold text-lg">Bạn có ca làm việc hôm nay</p>
                <div className="flex flex-wrap justify-center gap-2 mt-2 mb-3">
                  {todayShifts.map(s => (
                    <span key={s.id} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold border border-green-200">
                      {s.shift}
                    </span>
                  ))}
                </div>
                <p className="text-gray-600 text-sm mt-2">Vui lòng đến cơ sở và gặp Quản lý để được Check-in vào ca.</p>
              </div>
            );
          })()}
        </div>

        {/* Lịch làm việc Block */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-center p-4 bg-white border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 flex items-center">
              <CalendarDays className="mr-2 text-[#253e7a]" />
              Lịch cá nhân
            </h3>
            <div className="flex items-center space-x-2">
              <button onClick={() => setWeekOffset(prev => prev - 1)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => setWeekOffset(prev => prev + 1)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Days Header */}
              <div className="flex bg-white border-b border-gray-200">
                <div className="w-16 flex-shrink-0 border-r border-gray-200 p-2 flex flex-col items-center justify-center bg-gray-50/30">
                  <Clock size={16} className="text-gray-400 mb-1" />
                  <span className="text-[10px] text-gray-500 font-medium uppercase">Giờ VN</span>
                </div>
                <div className="flex flex-1">
                  {weekDates.map(d => {
                    const isToday = d.dateStr === new Date().toLocaleDateString('en-CA');
                    return (
                      <div key={d.dateStr} className={`flex-1 p-2 border-r border-gray-200 text-center last:border-r-0 ${isToday ? 'bg-blue-50/50' : ''}`}>
                        <div className={`font-bold text-sm ${isToday ? 'text-blue-700' : 'text-gray-800'}`}>{d.displayDate}</div>
                        <div className={`text-xs ${isToday ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>{d.dayName}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Body */}
              {weeklySchedules.length === 0 ? (
                <div className="p-16 flex flex-col items-center justify-center bg-white min-h-[400px]">
                  <div className="p-8 border border-dashed border-gray-300 rounded-xl text-center bg-gray-50">
                    <CalendarDays size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 text-sm font-medium">Hiện tại chưa có lịch cá nhân nào trong tuần này</p>
                  </div>
                </div>
              ) : (
                <div className="flex bg-white relative pb-8">
                  {/* Time Labels */}
                  <div className="w-16 flex-shrink-0 border-r border-gray-200 relative bg-gray-50/30">
                    {hoursList.map(h => (
                      <div key={h} className="h-[60px] text-[11px] font-bold text-gray-700 text-center pr-2 relative -top-2">
                        {h}:00
                      </div>
                    ))}
                  </div>
                  
                  {/* Days Columns */}
                  <div className="flex flex-1 relative bg-white">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col">
                      {hoursList.map(h => (
                        <div key={h} className="h-[60px] border-b border-gray-100 w-full"></div>
                      ))}
                    </div>
                    
                    {/* Event Columns */}
                    {weekDates.map(d => {
                      const dayShifts = weeklySchedules.filter(s => s.date === d.dateStr);
                      const isToday = d.dateStr === new Date().toLocaleDateString('en-CA');
                      return (
                        <div key={d.dateStr} className={`flex-1 relative border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-blue-50/20' : ''}`}>
                          {dayShifts.map(sch => {
                            const style = getEventStyle(sch.shift);
                            let bgClass = "bg-[#253e7a] text-white"; // default dark blue
                            if (sch.status === 'WORKING') bgClass = "bg-orange-500 text-white";
                            else if (sch.status === 'PRESENT') bgClass = "bg-green-600 text-white";
                            else if (sch.status === 'ABSENT') bgClass = "bg-red-500 text-white";
                            else if (sch.status === 'PENDING') bgClass = "bg-yellow-500 text-white";
                            
                            return (
                              <div 
                                key={sch.id}
                                onClick={() => handleViewCoworkers(sch)}
                                className={`absolute left-1 right-1 rounded-md p-2 overflow-hidden shadow-sm flex flex-col z-10 hover:z-20 transition-all cursor-pointer hover:shadow-md ${bgClass}`}
                                style={{ top: style.top, height: style.height, minHeight: '40px' }}
                              >
                                <div className="font-bold text-xs truncate flex items-center gap-1">
                                  {getShiftName(sch.shift)}
                                  {(sch.salaryMultiplier && sch.salaryMultiplier > 1) && (
                                    <span className="text-[9px] bg-red-500 text-white px-1 rounded-sm shadow-sm ml-1 flex-shrink-0">
                                      x{sch.salaryMultiplier}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] opacity-80 truncate">{getShiftTime(sch.shift)}</div>
                                
                                <div className="mt-auto flex justify-between items-end">
                                  <div className="text-[10px] opacity-90 truncate">
                                    {sch.attendance?.checkIn && `In: ${sch.attendance.checkIn.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}`}
                                  </div>
                                  <div className="flex items-center space-x-1 opacity-80 bg-black/10 px-1 rounded" title={sch.coworkers.map(c => c.isMe ? 'Bạn' : c.name).join(', ')}>
                                    <UserCircle size={10} />
                                    <span className="text-[9px]">{sch.coworkers.length}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;

