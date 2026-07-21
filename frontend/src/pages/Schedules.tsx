import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, setDoc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import { CalendarDays, Plus, Trash2, ChevronLeft, ChevronRight, Clock, Edit2 } from 'lucide-react';
import { TimeInput24 } from '../components/TimeInput24';

interface Employee {
  id: string;
  fullName: string;
  branchName: string;
  branchId?: string;
  employeeCode?: string;
  position?: string;
}

interface Schedule {
  id: string;
  employeeId: string | null;
  employeeName: string;
  date: string;
  shift: string;
  branchId?: string;
  branchName?: string;
  salaryMultiplier?: number;
}

const generateShiftName = (start: string, end: string) => {
  if (!start || !end) return 'Ca trống';
  const startHour = parseInt(start.split(':')[0]);
  let endHour = parseInt(end.split(':')[0]);
  
  if (endHour < startHour) endHour += 24;
  const duration = endHour - startHour;
  
  let name = '';
  if (duration >= 7) {
    name = 'Full ca';
  } else if (startHour < 12) {
    name = 'Sáng';
  } else if (startHour >= 12 && startHour < 17) {
    name = 'Chiều';
  } else {
    name = 'Tối';
  }
  return `${name} (${start} - ${end})`;
};

const Schedules: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editBlockModal, setEditBlockModal] = useState<{ isOpen: boolean, shiftsInSlot: any[], newStartTime: string, newEndTime: string, newSlots: number, newSalaryMultiplier: number }>({
    isOpen: false,
    shiftsInSlot: [],
    newStartTime: '08:00',
    newEndTime: '12:00',
    newSlots: 0,
    newSalaryMultiplier: 1
  });
  const [viewBlockModal, setViewBlockModal] = useState<{ isOpen: boolean, shiftsInSlot: any[] }>({
    isOpen: false,
    shiftsInSlot: []
  });
  const [weekOffset, setWeekOffset] = useState(0);

  const userRole = localStorage.getItem('userRole') || 'EMPLOYEE';
  const currentEmployeeId = localStorage.getItem('employeeId');
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [applyWholeWeek, setApplyWholeWeek] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    employeeId: '',
    date: new Date().toLocaleDateString('en-CA'),
    startTime: '08:00',
    endTime: '12:00',
    slots: 1,
    salaryMultiplier: 1
  });

  const [myBranchId, setMyBranchId] = useState('');
  const [myBranchName, setMyBranchName] = useState('');
  const [myInfo, setMyInfo] = useState<Employee | null>(null);
  const [viewBranchId, setViewBranchId] = useState('ALL');

  const fetchData = async () => {
    setLoading(true);
    try {
      const empSnap = await getDocs(collection(db, 'employees'));
      const allEmps: Employee[] = [];
      let currentBranchId = '';
      let currentBranchName = '';

      empSnap.forEach(d => {
        const data = d.data();
        if (d.id === currentEmployeeId) {
          currentBranchId = data.branchId;
          currentBranchName = data.branchName;
          setMyInfo({
            id: d.id, 
            fullName: data.fullName, 
            branchName: data.branchName, 
            branchId: data.branchId,
            employeeCode: data.employeeCode,
            position: data.position
          });
        }
        allEmps.push({ 
          id: d.id, 
          fullName: data.fullName, 
          branchName: data.branchName, 
          branchId: data.branchId,
          employeeCode: data.employeeCode,
          position: data.position
        });
      });

      setMyBranchId(currentBranchId);
      setMyBranchName(currentBranchName);

      // Filter employees for dropdown
      let filteredEmps = allEmps.filter(e => e.id !== currentEmployeeId); // Hide self
      if (userRole === 'BRANCH_ADMIN') {
        filteredEmps = filteredEmps.filter(e => e.branchId === currentBranchId);
      }
      setEmployees(filteredEmps);

      if (userRole === 'SUPER_ADMIN') {
        const branchSnap = await getDocs(collection(db, 'branches'));
        const brs: any[] = [];
        branchSnap.forEach(b => brs.push({ id: b.id, name: b.data().name }));
        
        // Sắp xếp các cơ sở theo tên (A-Z)
        brs.sort((a, b) => a.name.localeCompare(b.name));
        
        setBranches(brs);
        if (brs.length > 0) {
          setViewBranchId(prev => prev || brs[0].id);
        }
      }

      const schSnap = await getDocs(collection(db, 'schedules'));
      const schList: Schedule[] = [];
      schSnap.forEach(d => {
        const data = d.data();
        let belongsToBranch = false;

        // Infer branchId if missing and employeeId exists (legacy data support)
        let inferredBranchId = data.branchId;
        if (!inferredBranchId && data.employeeId) {
          const emp = allEmps.find(e => e.id === data.employeeId);
          if (emp) inferredBranchId = emp.branchId;
        }

        if (userRole === 'SUPER_ADMIN') {
          belongsToBranch = true;
        } else {
          if (inferredBranchId && inferredBranchId === currentBranchId) {
            belongsToBranch = true;
          } 
          else if (data.employeeId) {
            const emp = allEmps.find(e => e.id === data.employeeId);
            if (emp && emp.branchId === currentBranchId) {
              belongsToBranch = true;
            }
          }
        }

        if (belongsToBranch) {
          schList.push({ id: d.id, ...data, branchId: inferredBranchId } as Schedule);
        }
      });
      setSchedules(schList);

      const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
      if (settingsDoc.exists() && settingsDoc.data().registrationDeadline) {
        setRegistrationDeadline(settingsDoc.data().registrationDeadline);
      }
    } catch (error) {
      console.error("Lỗi lấy lịch làm việc:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formData.startTime || !formData.endTime) {
        toast.error('Vui lòng chọn thời gian bắt đầu và kết thúc!');
        return;
      }
      const shiftStr = generateShiftName(formData.startTime, formData.endTime);

      let empName = 'Đang trống (Chưa có người)';
      let empId = null;
      let targetBranches: {id: string, name: string | null}[] = [];
      if (userRole === 'BRANCH_ADMIN') {
        targetBranches = [{ id: myBranchId, name: myBranchName }];
      } else {
        if (viewBranchId === 'ALL') {
          targetBranches = branches.map(b => ({ id: b.id, name: b.name }));
        } else {
          const b = branches.find(b => b.id === viewBranchId);
          targetBranches = [{ id: viewBranchId, name: b?.name || null }];
        }
      }

      if (formData.employeeId !== '') {
        const emp = employees.find(e => e.id === formData.employeeId);
        if (emp) {
          empId = emp.id;
          empName = emp.fullName;
          if (userRole === 'SUPER_ADMIN' && viewBranchId === 'ALL') {
             targetBranches = [{ id: emp.branchId || '', name: emp.branchName || '' }];
          }
        }
      } else {
        if (userRole === 'SUPER_ADMIN') {
          if (!viewBranchId) {
            toast.error('Vui lòng chọn cơ sở cho ca trống!');
            return;
          }
        }
      }

      const datesToProcess = [];
      if (applyWholeWeek) {
         const d = new Date(formData.date);
         const day = d.getDay() === 0 ? 7 : d.getDay();
         const diff = d.getDate() - day + 1; // Monday
         for (let i = 0; i < 7; i++) {
           const nd = new Date(d.getFullYear(), d.getMonth(), diff + i);
           datesToProcess.push(nd.toLocaleDateString('en-CA'));
         }
      } else {
         datesToProcess.push(formData.date);
      }

      const startH = parseInt(formData.startTime.split(':')[0]);
      const startM = parseInt(formData.startTime.split(':')[1]);
      
      const invalidDates = datesToProcess.filter(dStr => {
        const d = new Date(dStr);
        d.setHours(startH, startM, 0, 0);
        const lockTime = new Date(d.getTime() - 60 * 60 * 1000);
        return new Date() >= lockTime;
      });

      if (invalidDates.length > 0) {
        if (applyWholeWeek) {
          toast.error('Không thể áp dụng cả tuần vì có ngày đã qua (khóa trước 1 tiếng)!');
        } else {
          toast.error('Không thể tạo ca trong quá khứ hoặc quá cận giờ (khóa trước 1 tiếng)!');
        }
        return;
      }

      if (formData.employeeId !== '') {
        const promises = [];
        for (const processDate of datesToProcess) {
          for (const tb of targetBranches) {
            promises.push(addDoc(collection(db, 'schedules'), {
              employeeId: empId,
              employeeName: empName,
              date: processDate,
              shift: shiftStr,
              branchId: tb.id,
              branchName: tb.name,
              salaryMultiplier: formData.salaryMultiplier
            }));
            promises.push(addDoc(collection(db, 'notifications'), {
              employeeId: empId,
              title: 'Lịch làm việc mới',
              message: `Bạn đã được phân ca làm việc mới vào ngày ${processDate}, ${shiftStr}.`,
              type: 'SCHEDULE_ASSIGNED',
              read: false,
              createdAt: new Date()
            }));
          }
        }
        await Promise.all(promises);
      } else {
        const promises = [];
        for (const processDate of datesToProcess) {
          for (const tb of targetBranches) {
            for (let i = 0; i < formData.slots; i++) {
              promises.push(
                addDoc(collection(db, 'schedules'), {
                  employeeId: null,
                  employeeName: 'Đang trống (Chưa có người)',
                  date: processDate,
                  shift: shiftStr,
                  branchId: tb.id,
                  branchName: tb.name,
                  salaryMultiplier: formData.salaryMultiplier
                }),
              );
            }
          }
        }
        await Promise.all(promises);
      }
      
      toast.success('Đã tạo ca làm việc thành công!');
      fetchData();
    } catch (error) {
      toast.error('Lỗi khi phân ca!');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Xóa ca làm việc?',
      text: 'Bạn có chắc chắn muốn xóa ca này không?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Có, xóa đi',
      cancelButtonText: 'Hủy'
    });
    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'schedules', id));
        fetchData();
      } catch (error) {
        toast.error('Lỗi xóa ca!');
      }
    }
  };

  const handleUpdateSlot = async (scheduleId: string, newEmployeeId: string) => {
    try {
      const sch = schedules.find(s => s.id === scheduleId);
      
      // Tự động check-out nhân viên cũ nếu ca đang diễn ra
      if (sch && sch.employeeId && sch.employeeId !== newEmployeeId) {
        const today = new Date().toLocaleDateString('en-CA');
        if (sch.date === today) {
          const match = sch.shift.match(/\((\d{2}):(\d{2}) - (\d{2}):(\d{2})\)/);
          if (match) {
            const startH = parseInt(match[1]);
            const startM = parseInt(match[2]);
            let endH = parseInt(match[3]);
            const endM = parseInt(match[4]);
            if (endH < startH) endH += 24;
            
            const now = new Date();
            const shiftStart = new Date(today);
            shiftStart.setHours(startH, startM, 0, 0);
            const shiftEnd = new Date(today);
            shiftEnd.setHours(endH, endM, 0, 0);
            
            if (now >= shiftStart && now <= shiftEnd) {
              const attQuery = query(
                collection(db, 'attendance'),
                where('employeeId', '==', sch.employeeId),
                where('date', '==', today)
              );
              const attSnap = await getDocs(attQuery);
              const promises: any[] = [];
              attSnap.forEach((d) => {
                const attData = d.data();
                if (attData.checkIn && !attData.checkOut) {
                  const checkOutTime = new Date();
                  const logs = attData.logs || [];
                  promises.push(updateDoc(doc(db, 'attendance', d.id), {
                    checkOut: checkOutTime,
                    logs: [...logs, { action: 'CHECK_OUT', time: checkOutTime, note: 'Bị thay thế ca làm việc' }]
                  }));
                }
              });
              if (promises.length > 0) {
                await Promise.all(promises);
                toast.success(`Đã tự động Check-out cho ${sch.employeeName} do bị thay ca!`);
              }
            }
          }
        }
      }

      if (newEmployeeId === '') {
        await updateDoc(doc(db, 'schedules', scheduleId), {
          employeeId: null,
          employeeName: null
        });
      } else {
        const emp = employees.find(e => e.id === newEmployeeId);
        if (emp) {
          await updateDoc(doc(db, 'schedules', scheduleId), {
            employeeId: emp.id,
            employeeName: emp.fullName
          });
          
          if (sch && sch.employeeId !== emp.id) {
            await addDoc(collection(db, 'notifications'), {
              employeeId: emp.id,
              title: 'Lịch làm việc mới',
              message: `Bạn đã được quản lý phân công vào ${sch.shift} ngày ${new Date(sch.date).toLocaleDateString('vi-VN')}.`,
              type: 'SCHEDULE_ASSIGNED',
              read: false,
              createdAt: new Date()
            });
          }
        }
      }
      toast.success('Đã cập nhật ca làm việc!');
      setEditingSlot(null);
      fetchData();
    } catch (error) {
      toast.error('Lỗi khi cập nhật ca!');
    }
  };


  const handleDeleteShiftBlock = async (shiftsInSlot: any[]) => {
    if (shiftsInSlot.length === 0) return;
    const result = await Swal.fire({
      title: 'Xóa toàn bộ ca này?',
      text: `Bạn chuẩn bị xóa ${shiftsInSlot.length} vị trí trong ca này. Hành động này không thể hoàn tác!`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Có, xóa tất cả',
      cancelButtonText: 'Hủy'
    });

    if (result.isConfirmed) {
      try {
        const promises = shiftsInSlot.map(s => deleteDoc(doc(db, 'schedules', s.id)));
        await Promise.all(promises);
        toast.success(`Đã xóa thành công ${shiftsInSlot.length} vị trí!`);
        fetchData();
      } catch (error) {
        toast.error('Lỗi khi xóa ca!');
      }
    }
  };

  const handleOpenEditBlock = (shiftsInSlot: any[]) => {
    if (shiftsInSlot.length === 0) return;
    const match = shiftsInSlot[0].shift.match(/\((\d{2}:\d{2}) - (\d{2}:\d{2})\)/);
    const start = match ? match[1] : '08:00';
    const end = match ? match[2] : '12:00';

    setEditBlockModal({
      isOpen: true,
      shiftsInSlot: shiftsInSlot,
      newStartTime: start,
      newEndTime: end,
      newSlots: shiftsInSlot.length,
      newSalaryMultiplier: shiftsInSlot[0].salaryMultiplier || 1
    });
  };

  const handleSaveEditBlock = async () => {
    try {
      const { shiftsInSlot, newSlots, newStartTime, newEndTime, newSalaryMultiplier } = editBlockModal;
      const newShift = generateShiftName(newStartTime, newEndTime);
      const currentLength = shiftsInSlot.length;
      const date = shiftsInSlot[0].date;
      const baseBranchId = shiftsInSlot[0].branchId || null;
      const baseBranchName = shiftsInSlot[0].branchName || null;

      const promises: any[] = [];
      
      // Update existing slots to new shift
      for (let i = 0; i < Math.min(currentLength, newSlots); i++) {
        if (shiftsInSlot[i].shift !== newShift || shiftsInSlot[i].salaryMultiplier !== newSalaryMultiplier) {
          promises.push(updateDoc(doc(db, 'schedules', shiftsInSlot[i].id), { shift: newShift, salaryMultiplier: newSalaryMultiplier }));
        }
      }

      // Add new slots if needed
      if (newSlots > currentLength) {
        for (let i = 0; i < newSlots - currentLength; i++) {
          promises.push(addDoc(collection(db, 'schedules'), {
            employeeId: null,
            employeeName: 'Đang trống (Chưa có người)',
            date: date,
            shift: newShift,
            salaryMultiplier: newSalaryMultiplier,
            branchId: baseBranchId,
            branchName: baseBranchName
          }));
        }
      }

      // Delete excess slots if needed (prefer deleting empty ones first)
      if (currentLength > newSlots) {
        let slotsToDelete = currentLength - newSlots;
        const sortedShifts = [...shiftsInSlot].sort((a, b) => {
          if (a.employeeId === null) return -1;
          if (b.employeeId === null) return 1;
          return 0;
        });
        for (let i = 0; i < slotsToDelete; i++) {
          promises.push(deleteDoc(doc(db, 'schedules', sortedShifts[i].id)));
        }
      }

      await Promise.all(promises);
      toast.success('Đã cập nhật cấu trúc ca làm việc!');
      setEditBlockModal({ ...editBlockModal, isOpen: false });
      fetchData();
    } catch (error) {
      toast.error('Lỗi khi cập nhật ca làm việc!');
    }
  };

  const handleRegisterShift = async (scheduleId: string) => {
    if (!currentEmployeeId || !myInfo) {
      toast.error('Lỗi: Không tìm thấy hồ sơ nhân viên của bạn!');
      return;
    }
    
    try {
      const targetShift = schedules.find(s => s.id === scheduleId);
      if (!targetShift) return;

      // Check overlap
      const myShiftsToday = schedules.filter(s => s.date === targetShift.date && s.employeeId === currentEmployeeId);
      
      const parseShiftTime = (shiftStr: string) => {
        const match = shiftStr.match(/\((\d{2}):\d{2} - (\d{2}):\d{2}\)/);
        if (!match) return { start: 0, end: 1 };
        let start = parseInt(match[1]);
        let end = parseInt(match[2]);
        if (end < start) end += 24;
        return { start, end };
      };

      const targetTime = parseShiftTime(targetShift.shift);
      const isOverlapping = myShiftsToday.some(myShift => {
        const myTime = parseShiftTime(myShift.shift);
        return Math.max(targetTime.start, myTime.start) < Math.min(targetTime.end, myTime.end);
      });

      if (isOverlapping) {
        toast.error('Bạn đã có ca làm việc khác trùng giờ trong ngày này!');
        return;
      }

      await updateDoc(doc(db, 'schedules', scheduleId), {
        employeeId: myInfo.id,
        employeeName: myInfo.fullName
      });

      const sch = schedules.find(s => s.id === scheduleId);
      if (sch) {
        await addDoc(collection(db, 'notifications'), {
          employeeId: currentEmployeeId,
          title: 'Đăng ký ca thành công',
          message: `Bạn đã đăng ký thành công ${sch.shift} ngày ${new Date(sch.date).toLocaleDateString('vi-VN')}.`,
          type: 'SCHEDULE_REGISTER',
          read: false,
          createdAt: new Date()
        });
      }

      toast.success('Đăng ký ca làm thành công!');
      fetchData();
    } catch (error) {
      toast.error('Lỗi khi đăng ký ca!');
    }
  };

  const handleCancelShift = async (scheduleId: string) => {
    const result = await Swal.fire({
      title: 'Hủy đăng ký ca?',
      text: 'Bạn có chắc chắn muốn hủy đăng ký ca làm việc này?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Có, hủy',
      cancelButtonText: 'Không'
    });
    
    if (result.isConfirmed) {
      try {
        await updateDoc(doc(db, 'schedules', scheduleId), {
          employeeId: null,
          employeeName: 'Đang trống (Chưa có người)'
        });
        
        const sch = schedules.find(s => s.id === scheduleId);
        if (sch) {
          await addDoc(collection(db, 'notifications'), {
            employeeId: currentEmployeeId,
            title: 'Hủy đăng ký ca',
            message: `Bạn đã hủy đăng ký ${sch.shift} ngày ${new Date(sch.date).toLocaleDateString('vi-VN')}.`,
            type: 'SCHEDULE_CANCEL',
            read: false,
            createdAt: new Date()
          });
        }
        
        toast.success('Đã hủy đăng ký ca!');
        fetchData();
      } catch (error) {
        toast.error('Lỗi khi hủy ca!');
      }
    }
  };

  const handleSaveDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'settings', 'general'), { registrationDeadline }, { merge: true });
      toast.success('Đã cập nhật hạn chót đăng ký!');
    } catch (error) {
      toast.error('Lỗi khi lưu hạn chót!');
    }
  };

  // Tính toán 7 ngày trong tuần
  const getWeekDates = () => {
    const curr = new Date();
    const dayOfWeek = curr.getDay() === 0 ? 7 : curr.getDay(); // CN là 7
    const firstDay = curr.getDate() - dayOfWeek + 1 + (weekOffset * 7);
    
    const dates = [];
    for(let i = 0; i < 7; i++) {
      const nextDate = new Date(curr.getFullYear(), curr.getMonth(), firstDay + i);
      // Format YYYY-MM-DD local time
      const dateStr = nextDate.toLocaleDateString('en-CA'); 
      dates.push({
        dateStr,
        dayName: i === 6 ? 'CN' : `Thứ ${i + 2}`,
        displayDate: nextDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
      });
    }
    return dates;
  };

  const weekDates = getWeekDates();
  const weekDatesStr = weekDates.map(d => d.dateStr);

  let START_HOUR = 8;
  let END_HOUR = 12;

  const currentWeekShifts = schedules.filter(s => weekDatesStr.includes(s.date));
  if (currentWeekShifts.length > 0) {
    let minH = 24;
    let maxH = 0;
    currentWeekShifts.forEach(s => {
      const match = s.shift.match(/\((\d{2}):\d{2} - (\d{2}):\d{2}\)/);
      if (match) {
        const startH = parseInt(match[1]);
        const endH = parseInt(match[2]);
        if (startH < minH) minH = startH;
        if (endH > maxH) maxH = endH;
      }
    });
    if (minH < 24) START_HOUR = minH;
    if (maxH > 0) END_HOUR = maxH;
  }

  const HOUR_HEIGHT = 60; // 60px
  const hoursList = Array.from({length: END_HOUR - START_HOUR + 1}, (_, i) => START_HOUR + i);

  const getEventStyle = (shiftStr: string) => {
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

  const checkIsPastShift = (dateStr: string, shiftStr: string) => {
    const match = shiftStr.match(/\((\d{2}):(\d{2}) - (\d{2}):(\d{2})\)/);
    if (!match) return false;
    
    const startH = parseInt(match[1]);
    const startM = parseInt(match[2]);
    
    const shiftDate = new Date(dateStr);
    shiftDate.setHours(startH, startM, 0, 0);
    
    const lockTime = new Date(shiftDate.getTime() - 60 * 60 * 1000);
    return new Date() >= lockTime;
  };

  const checkIsPastShiftForAdmin = (dateStr: string, shiftStr: string) => {
    const match = shiftStr.match(/\((\d{2}):(\d{2}) - (\d{2}):(\d{2})\)/);
    if (!match) return false;
    
    const startH = parseInt(match[1]);
    let endH = parseInt(match[3]);
    const endM = parseInt(match[4]);
    if (endH < startH) endH += 24;
    
    const shiftDate = new Date(dateStr);
    shiftDate.setHours(endH, endM, 0, 0);
    
    return new Date() >= shiftDate;
  };

  const renderEmployeeSlot = (shiftsInSlot: any[]) => {
    const isPast = shiftsInSlot.length > 0 && checkIsPastShift(shiftsInSlot[0].date, shiftsInSlot[0].shift);
    const myShift = shiftsInSlot.find(s => s.employeeId === currentEmployeeId);
    
    if (isPast) {
      if (myShift) {
        return <div className="bg-gray-200 text-gray-600 font-bold p-1 rounded text-center text-[10px] border border-gray-300 mt-1">Đã tham gia</div>;
      }
      return <div className="bg-gray-100 text-gray-400 p-1 rounded text-center text-[10px] border border-gray-200 mt-1">Đã qua</div>;
    }

    if (myShift) {
      return (
        <button 
          onClick={() => handleCancelShift(myShift.id)}
          className="w-full bg-blue-50 hover:bg-red-50 text-blue-700 hover:text-red-600 p-1 rounded border border-blue-200 hover:border-red-200 text-center mt-1 transition-colors group flex flex-col items-center justify-center cursor-pointer"
        >
          <span className="text-[10px] font-bold group-hover:hidden">Ca của bạn</span>
          <span className="text-[10px] font-bold hidden group-hover:block">Hủy đăng ký</span>
        </button>
      );
    }

    const openShifts = shiftsInSlot.filter(s => s.employeeId === null);
    if (openShifts.length > 0) {
      return (
        <button 
          onClick={() => handleRegisterShift(openShifts[0].id)}
          className="w-full bg-green-50 hover:bg-green-100 text-green-700 p-1 rounded text-center font-bold border border-green-200 transition-colors flex flex-col items-center justify-center mt-1"
        >
          <span className="text-[10px]">Đăng ký</span>
          <span className="text-[9px] font-normal opacity-80">(Còn {openShifts.length}/{shiftsInSlot.length} chỗ)</span>
        </button>
      );
    }

    return <div className="bg-gray-100 text-gray-500 p-1 rounded text-center text-[10px] border border-gray-200 mt-1">Đã kín chỗ</div>;
  };

  const renderAdminSlot = (shiftsInSlot: any[]) => {
    return (
      <div className="space-y-1 mt-1">
        {shiftsInSlot.map(sch => {
          if (editingSlot === sch.id) {
            return (
              <div key={sch.id} className="p-1 rounded flex flex-col gap-1 border bg-white border-blue-300 shadow-sm relative z-50">
                <select 
                  className="text-[10px] w-full p-1 border rounded outline-none focus:ring-1 focus:ring-blue-500"
                  defaultValue={sch.employeeId || ''}
                  onChange={(e) => handleUpdateSlot(sch.id, e.target.value)}
                  autoFocus
                  onBlur={() => setEditingSlot(null)}
                >
                  <option value="">-- Ca trống --</option>
                  {Object.entries(
                    employees
                      .filter(emp => userRole !== 'SUPER_ADMIN' || viewBranchId === 'ALL' || emp.branchId === viewBranchId)
                      .reduce((acc, emp) => {
                        const pos = emp.position || 'Nhân viên';
                      if (!acc[pos]) acc[pos] = [];
                      acc[pos].push(emp);
                      return acc;
                    }, {} as Record<string, Employee[]>)
                  ).map(([position, emps]) => (
                    <optgroup key={position} label={position}>
                      {emps.map(e => (
                        <option key={e.id} value={e.id}>
                          [{e.employeeCode || 'No ID'}] {e.fullName}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            );
          }

          const isLocked = checkIsPastShiftForAdmin(sch.date, sch.shift);

          return (
            <div key={sch.id} className={`p-1 rounded text-[10px] flex justify-between items-center border ${sch.employeeId ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
              <span className="truncate mr-1 font-medium">{sch.employeeId ? sch.employeeName : 'Ca trống'}</span>
              {!isLocked ? (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setEditingSlot(sch.id)} className="text-gray-400 hover:text-blue-600">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => handleDelete(sch.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 size={12} />
                  </button>
                </div>
              ) : (
                <span className="text-gray-400 text-[9px] italic flex-shrink-0">Đã khóa</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };



  return (
    <div className="space-y-6">
      {userRole === 'SUPER_ADMIN' && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-gray-800 flex items-center">
            <CalendarDays className="mr-2 text-blue-600" size={20} /> Cơ sở đang quản lý:
          </h2>
          <select 
            value={viewBranchId}
            onChange={(e) => setViewBranchId(e.target.value)}
            className="w-64 px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-medium text-gray-700"
          >
            <option value="ALL">Tất cả cơ sở</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {/* ---------------- ADMIN VIEW: XẾP LỊCH ---------------- */}
      {(userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN') && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-800 flex items-center mb-4">
              <CalendarDays className="mr-2 text-blue-600" /> Quản lý Ca làm việc
            </h2>
            <form onSubmit={handleAddSchedule} className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên nhận ca</label>
                  <select 
                    value={formData.employeeId}
                    onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                  >
                    <option value="">-- Tạo Ca Trống (Cho NV tự đăng ký) --</option>
                    {Object.entries(
                      employees
                        .filter(emp => userRole !== 'SUPER_ADMIN' || viewBranchId === 'ALL' || emp.branchId === viewBranchId)
                        .reduce((acc, emp) => {
                          const pos = emp.position || 'Nhân viên';
                        if (!acc[pos]) acc[pos] = [];
                        acc[pos].push(emp);
                        return acc;
                      }, {} as Record<string, Employee[]>)
                    ).map(([position, emps]) => (
                      <optgroup key={position} label={position}>
                        {emps.map(e => (
                          <option key={e.id} value={e.id}>
                            [{e.employeeCode || 'No ID'}] {e.fullName} ({e.branchName})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                
                {formData.employeeId === '' && (
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng người cần (Slots)</label>
                    <input 
                      type="number" required min="1" max="20"
                      value={formData.slots}
                      onChange={(e) => setFormData({...formData, slots: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                    />
                  </div>
                )}

                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày làm việc</label>
                  <input 
                    type="date" required
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                  />
                </div>
                
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian (Từ - Đến)</label>
                  <div className="flex items-center space-x-2">
                    <TimeInput24 
                      value={formData.startTime}
                      onChange={(val) => setFormData({...formData, startTime: val})}
                      className="w-full px-2 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 bg-white"
                    />
                    <span>-</span>
                    <TimeInput24 
                      value={formData.endTime}
                      onChange={(val) => setFormData({...formData, endTime: val})}
                      className="w-full px-2 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 bg-white"
                    />
                  </div>
                </div>

                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hệ số lương (Tùy chọn)</label>
                  <input 
                    type="number" step="0.1" min="1" max="10"
                    value={formData.salaryMultiplier}
                    onChange={(e) => setFormData({...formData, salaryMultiplier: parseFloat(e.target.value) || 1})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none bg-yellow-50 focus:border-yellow-500 focus:ring-yellow-500 font-semibold text-yellow-700"
                  />
                </div>
              </div>
                <div className="md:col-span-2 flex items-center h-full pt-6 space-x-4">
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center flex-1 justify-center">
                    <Plus size={18} className="mr-2" /> Phân ca / Thêm ca trống
                  </button>
                  <label className="flex items-center space-x-2 cursor-pointer bg-white border border-gray-200 px-3 py-2 rounded-lg shadow-sm">
                    <input 
                      type="checkbox"
                      checked={applyWholeWeek}
                      onChange={(e) => setApplyWholeWeek(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Áp dụng cả tuần</span>
                  </label>
                </div>
            </form>

            <form onSubmit={handleSaveDeadline} className="mt-4 flex items-end space-x-4 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="flex-1">
                <label className="block text-sm font-medium text-yellow-800 mb-1">Hạn chót đăng ký ca làm việc cho nhân viên</label>
                <input 
                  type="datetime-local" 
                  value={registrationDeadline}
                  onChange={(e) => setRegistrationDeadline(e.target.value)}
                  className="w-full px-3 py-2 border border-yellow-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                />
              </div>
              <button type="submit" className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                Lưu hạn chót
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- EMPLOYEE VIEW: XEM VÀ ĐĂNG KÝ CA ---------------- */}
      {userRole === 'EMPLOYEE' && registrationDeadline !== '' && new Date() > new Date(registrationDeadline) ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white rounded-xl border border-gray-200 shadow-sm mt-6">
          <Clock size={48} className="text-gray-400 mb-4" />
          <h3 className="text-xl font-bold text-gray-700 mb-2">Đăng ký lịch làm việc đã khóa</h3>
          <p className="text-gray-500 text-center">
            Thời gian đăng ký ca đã kết thúc vào lúc <span className="font-bold text-gray-700">{new Date(registrationDeadline).toLocaleString('vi-VN')}</span>.<br/>
            Vui lòng xem lịch làm việc chính thức tại màn hình Trang chủ.
          </p>
        </div>
      ) : (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 bg-white border-b border-gray-200">
          <h3 className="font-bold text-gray-800 text-lg flex items-center">
            <CalendarDays className="mr-2 text-[#253e7a]" />
            {userRole === 'EMPLOYEE' ? 'Đăng ký Lịch Làm Việc (Theo tuần)' : 'Bảng Lịch Làm Việc (Theo tuần)'}
          </h3>
          <div className="flex items-center space-x-2">
            <button onClick={() => setWeekOffset(prev => prev - 1)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
              <ChevronLeft size={18} />
            </button>
            <span className="font-medium text-gray-700 text-sm">
              Tuần từ {weekDates[0].displayDate} - {weekDates[6].displayDate}
            </span>
            <button onClick={() => setWeekOffset(prev => prev + 1)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-gray-500">Đang tải bảng lịch...</div>
        ) : (
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
              {(viewBranchId && viewBranchId !== 'ALL' ? schedules.filter(s => s.branchId === viewBranchId) : schedules).filter(s => weekDatesStr.includes(s.date)).length === 0 ? (
                <div className="p-16 flex flex-col items-center justify-center bg-white min-h-[400px]">
                  <div className="p-8 border border-dashed border-gray-300 rounded-xl text-center bg-gray-50">
                    <CalendarDays size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 text-sm font-medium">Chủ quán chưa đăng ca làm việc nào cho tuần này.</p>
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
                      const dayShifts = schedules.filter(s => s.date === d.dateStr && (viewBranchId === '' || viewBranchId === 'ALL' || s.branchId === viewBranchId));
                      const isToday = d.dateStr === new Date().toLocaleDateString('en-CA');
                      // Lấy danh sách các loại ca duy nhất trong ngày
                      const uniqueShiftTypes = Array.from(new Set(dayShifts.map(s => s.shift)));
                      
                      // Calculate overlap styles
                      const parsedShifts = uniqueShiftTypes.map((type, index) => {
                        const match = type.match(/\((\d{2}):\d{2} - (\d{2}):\d{2}\)/);
                        let start = 0, end = 1;
                        if (match) {
                          start = parseInt(match[1]);
                          end = parseInt(match[2]);
                          if (end < start) end += 24;
                        }
                        return { type, start, end, index };
                      });

                      // Sort shifts by start time, then by longest duration
                      parsedShifts.sort((a, b) => {
                        if (a.start !== b.start) return a.start - b.start;
                        return b.end - a.end;
                      });

                      // Group into isolated overlap blocks
                      const blocks: typeof parsedShifts[] = [];
                      let currentBlock: typeof parsedShifts = [];
                      let currentBlockEnd = -1;

                      parsedShifts.forEach(shift => {
                        if (currentBlock.length === 0) {
                          currentBlock.push(shift);
                          currentBlockEnd = shift.end;
                        } else if (shift.start < currentBlockEnd) {
                          currentBlock.push(shift);
                          if (shift.end > currentBlockEnd) currentBlockEnd = shift.end;
                        } else {
                          blocks.push(currentBlock);
                          currentBlock = [shift];
                          currentBlockEnd = shift.end;
                        }
                      });
                      if (currentBlock.length > 0) blocks.push(currentBlock);

                      // Assign columns
                      const shiftLayout: Record<string, { col: number, maxCols: number }> = {};
                      blocks.forEach(block => {
                        const columns: typeof parsedShifts[] = [];
                        block.forEach(shift => {
                          let placed = false;
                          for (let i = 0; i < columns.length; i++) {
                            const lastShiftInCol = columns[i][columns[i].length - 1];
                            if (shift.start >= lastShiftInCol.end) {
                              columns[i].push(shift);
                              shiftLayout[shift.type] = { col: i, maxCols: 1 };
                              placed = true;
                              break;
                            }
                          }
                          if (!placed) {
                            columns.push([shift]);
                            shiftLayout[shift.type] = { col: columns.length - 1, maxCols: 1 };
                          }
                        });
                        
                        const maxCols = columns.length;
                        block.forEach(shift => {
                          shiftLayout[shift.type].maxCols = maxCols;
                        });
                      });

                      const getOverlapStyle = (shiftType: string) => {
                        const layout = shiftLayout[shiftType];
                        if (!layout || layout.maxCols <= 1) return { left: '4px', right: '4px', width: 'auto' };

                        const widthPercent = 100 / layout.maxCols;
                        const leftPercent = layout.col * widthPercent;
                        
                        return {
                          left: `calc(${leftPercent}% + 2px)`,
                          width: `calc(${widthPercent}% - 4px)`,
                          right: 'auto'
                        };
                      };
                      
                      return (
                        <div key={d.dateStr} className={`flex-1 relative border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-blue-50/20' : ''}`}>
                          {uniqueShiftTypes.map((shiftType) => {
                            const shiftsInSlot = dayShifts.filter(s => s.shift === shiftType);
                            const style = getEventStyle(shiftType);
                            const overlapStyle = getOverlapStyle(shiftType);
                            
                            return (
                              <div 
                                key={shiftType}
                                className="absolute rounded-md p-1.5 overflow-y-auto shadow-sm flex flex-col z-10 hover:z-20 transition-all border bg-white border-gray-200"
                                style={{ top: style.top, height: style.height, minHeight: '60px', ...overlapStyle }}
                              >
                                <div 
                                  className="flex justify-between items-start cursor-pointer hover:bg-gray-50 rounded -mx-1 px-1 py-0.5"
                                  onClick={() => setViewBlockModal({ isOpen: true, shiftsInSlot })}
                                  title="Nhấn để xem chi tiết"
                                >
                                  <div>
                                    <div className="font-bold text-[11px] text-gray-800 flex items-center gap-1 flex-wrap">
                                      {getShiftName(shiftType)}
                                      {(shiftsInSlot[0]?.salaryMultiplier || 1) > 1 && (
                                        <span className="text-[9px] bg-red-500 text-white px-1 rounded-sm shadow-sm">
                                          x{shiftsInSlot[0].salaryMultiplier}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[9px] text-gray-500 mb-1">{getShiftTime(shiftType)}</div>
                                  </div>
                                  {(userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN') && (
                                    <div className="flex flex-col gap-1 items-center" onClick={e => e.stopPropagation()}>
                                      {shiftsInSlot.some(s => checkIsPastShiftForAdmin(s.date, s.shift)) ? (
                                        <div className="text-[9px] text-gray-400 italic" title="Ca này đã có người làm và trong quá khứ nên bị khóa sửa đổi">Đã khóa</div>
                                      ) : (
                                        <>
                                          <button 
                                            onClick={() => handleOpenEditBlock(shiftsInSlot)} 
                                            className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded"
                                            title="Sửa cấu trúc ca này"
                                          >
                                            <Edit2 size={12} />
                                          </button>
                                          <button 
                                            onClick={() => handleDeleteShiftBlock(shiftsInSlot)} 
                                            className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                                            title="Xóa toàn bộ ca này"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                <div className="mt-auto">
                                  {userRole === 'EMPLOYEE' 
                                    ? renderEmployeeSlot(shiftsInSlot)
                                    : renderAdminSlot(shiftsInSlot)
                                  }
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
        )}
      </div>
      )}
      
      {/* Modal Edit Shift Block */}
      {editBlockModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white p-6 rounded-xl w-96 shadow-lg">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Sửa thông tin Ca</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đổi khung giờ Ca (Từ - Đến)</label>
                <div className="flex items-center space-x-2">
                  <TimeInput24 
                    value={editBlockModal.newStartTime}
                    onChange={(val) => setEditBlockModal({...editBlockModal, newStartTime: val})}
                    className="w-full border border-gray-300 p-2 rounded focus-within:ring-2 focus-within:ring-blue-500 bg-white"
                  />
                  <span>-</span>
                  <TimeInput24 
                    value={editBlockModal.newEndTime}
                    onChange={(val) => setEditBlockModal({...editBlockModal, newEndTime: val})}
                    className="w-full border border-gray-300 p-2 rounded focus-within:ring-2 focus-within:ring-blue-500 bg-white"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng nhân viên cần (Slots)</label>
                  <input 
                    type="number" min="1" max="20"
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:ring-2 focus:ring-blue-500"
                    value={editBlockModal.newSlots}
                    onChange={e => setEditBlockModal({...editBlockModal, newSlots: parseInt(e.target.value) || 1})}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hệ số lương</label>
                  <input 
                    type="number" step="0.1" min="0" max="10"
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:ring-2 focus:ring-blue-500 bg-yellow-50"
                    value={editBlockModal.newSalaryMultiplier}
                    onChange={e => setEditBlockModal({...editBlockModal, newSalaryMultiplier: parseFloat(e.target.value) || 1})}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setEditBlockModal({...editBlockModal, isOpen: false})} className="px-4 py-2 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors">Hủy</button>
                <button onClick={handleSaveEditBlock} className="px-4 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-lg transition-colors">Lưu thay đổi</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal View Shift Block Details */}
      {viewBlockModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => setViewBlockModal({...viewBlockModal, isOpen: false})}>
          <div className="bg-white p-6 rounded-xl w-96 shadow-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Chi tiết Ca làm việc</h3>
              <button onClick={() => setViewBlockModal({...viewBlockModal, isOpen: false})} className="text-gray-500 hover:text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <div className="font-semibold text-blue-800">{viewBlockModal.shiftsInSlot[0]?.shift}</div>
                <div className="text-sm text-blue-600 mt-1">
                  <strong>Ngày:</strong> {viewBlockModal.shiftsInSlot[0]?.date ? new Date(viewBlockModal.shiftsInSlot[0].date).toLocaleDateString('vi-VN') : ''}
                </div>
                <div className="text-sm text-blue-600 mt-1">
                  <strong>Cơ sở:</strong> {viewBlockModal.shiftsInSlot[0]?.branchName || 'Tất cả'}
                </div>
                <div className="text-sm text-blue-600 mt-1">
                  <strong>Hệ số lương:</strong> x{viewBlockModal.shiftsInSlot[0]?.salaryMultiplier || 1}
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold text-gray-700 mb-2 border-b pb-1">
                  Danh sách nhân viên ({viewBlockModal.shiftsInSlot.filter(s => s.employeeId).length}/{viewBlockModal.shiftsInSlot.length})
                </h4>
                {viewBlockModal.shiftsInSlot.length > 0 ? (
                  <ul className="space-y-2">
                    {viewBlockModal.shiftsInSlot.map((s, idx) => (
                      <li key={s.id || idx} className="flex items-center gap-2 text-sm p-2 rounded bg-gray-50 border border-gray-100">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.employeeId ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        {s.employeeId ? (
                          <span className="font-medium text-gray-800">{s.employeeName}</span>
                        ) : (
                          <span className="text-gray-400 italic">Ca trống</span>
                        )}
                        {s.employeeId === currentEmployeeId && (
                          <span className="ml-auto text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Bạn</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 italic">Không có dữ liệu.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedules;

