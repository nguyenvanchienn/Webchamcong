import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Wallet, CalendarDays, Clock, X, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface EmployeeInfo {
  id: string;
  fullName: string;
  employeeCode?: string;
  branchName: string;
  branchId?: string;
  role: string;
  salaryPerHour: number;
  bankName?: string;
  bankAccountNum?: string;
  bankAccountName?: string;
}

interface PayrollItem {
  date: string;
  checkInStr: string;
  checkOutStr: string;
  hoursWorked: number;
  earned: number;
  status: string;
  logs?: any[];
}

const formatHours = (decimalHours: number) => {
  if (!decimalHours || decimalHours === 0) return '0h 0m 0s';
  const totalSeconds = Math.round(decimalHours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
};

const calculateHoursWorked = (data: any, isLive = false): number => {
  if (!data.checkIn) return 0;
  if (!data.checkOut && !isLive) return 0;
  if (data.logs && data.logs.length > 0) {
    let totalMs = 0;
    let lastIn: Date | null = null;
    for (const log of data.logs) {
      if (log.action === 'CHECK_IN') {
        lastIn = log.time?.toDate ? log.time.toDate() : new Date(log.time);
      } else if (log.action === 'CHECK_OUT' && lastIn) {
        const outTime = log.time?.toDate ? log.time.toDate() : new Date(log.time);
        totalMs += outTime.getTime() - lastIn.getTime();
        lastIn = null;
      }
    }
    if (lastIn && !data.checkOut && isLive) {
      totalMs += Date.now() - lastIn.getTime();
    }
    return totalMs / (1000 * 60 * 60);
  }
  const inTime = data.checkIn?.toDate ? data.checkIn.toDate() : new Date(data.checkIn);
  if (!data.checkOut) {
    if (isLive) return Math.max(0, Date.now() - inTime.getTime()) / (1000 * 60 * 60);
    return 0;
  }
  const outTime = data.checkOut?.toDate ? data.checkOut.toDate() : new Date(data.checkOut);
  return Math.max(0, outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
};

const Payroll: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [activeShiftData, setActiveShiftData] = useState<any | null>(null);
  const [liveHours, setLiveHours] = useState(0);
  const [salaryRate, setSalaryRate] = useState(0);
  
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [selectedLogs, setSelectedLogs] = useState<any[] | null>(null);
  const [bonuses, setBonuses] = useState<any[]>([]);
  
  // Dành cho Admin
  const [adminPayroll, setAdminPayroll] = useState<any[]>([]);
  
  const initialBranchId = searchParams.get('branchId') || 'ALL';
  const [filterBranchId, setFilterBranchId] = useState<string>(initialBranchId);
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    const bId = searchParams.get('branchId');
    if (bId) {
      setFilterBranchId(bId);
    }
  }, [searchParams]);

  const [paymentModalData, setPaymentModalData] = useState<{
    employeeId: string;
    amount: number;
    totalHours: number;
    shiftsCount: number;
    attendanceIds: string[];
    bankName?: string;
    bankAccountNum?: string;
    bankAccountName?: string;
    fullName: string;
    salaryRate: number;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'admin' | 'personal'>('admin');
  const userRole = localStorage.getItem('userRole') || 'EMPLOYEE';
  const currentEmployeeId = localStorage.getItem('employeeId');

  useEffect(() => {
    if (userRole === 'SUPER_ADMIN') {
      const fetchBranches = async () => {
        const snap = await getDocs(collection(db, 'branches'));
        const br: any[] = [];
        snap.forEach(d => br.push({ id: d.id, ...d.data() }));
        setBranches(br);
      };
      fetchBranches();
    }
  }, [userRole]);

  const fetchPayroll = async () => {
    setLoading(true);
    try {
      let latePenaltyMap: Record<string, number> = { ALL: 0 };
      const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        if (typeof data.latePenalty === 'number') latePenaltyMap = { ALL: data.latePenalty };
        else if (typeof data.latePenalty === 'object') latePenaltyMap = data.latePenalty;
      }

      const startDate = `${month}-01`;
      const endDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
      const endDate = `${month}-${endDay}`;

      // --- PERSONAL PAYROLL ---
      if (currentEmployeeId && (['EMPLOYEE', 'CASHIER', 'BARTENDER', 'KITCHEN', 'GUARD'].includes(userRole) || userRole === 'BRANCH_ADMIN')) {
        // Lấy thông tin lương/giờ của NV
        const empDoc = await getDoc(doc(db, 'employees', currentEmployeeId));
        if (!empDoc.exists()) return;
        const salaryPerHour = empDoc.data().salaryPerHour || 0;
        const currentUserBranchId = empDoc.data().branchId;

        // Lấy lịch làm việc của nhân viên này để tính đi muộn
        const schedQuery = query(collection(db, 'schedules'), where('employeeId', '==', currentEmployeeId));
        const schedSnap = await getDocs(schedQuery);
        const schedulesMap: Record<string, string[]> = {};
        schedSnap.forEach(d => {
           const data = d.data();
           if (!schedulesMap[data.date]) schedulesMap[data.date] = [];
           schedulesMap[data.date].push(data.shift);
        });

        // Lấy các record chấm công
        const attQuery = query(
          collection(db, 'attendance'), 
          where('employeeId', '==', currentEmployeeId)
        );
        const attSnap = await getDocs(attQuery);
        
        const bonusQuery = query(collection(db, 'bonuses'), where('employeeId', '==', currentEmployeeId), where('month', '==', month));
        const bonusSnap = await getDocs(bonusQuery);
        let totalBonus = 0;
        const userBonuses: any[] = [];
        bonusSnap.forEach(d => {
           totalBonus += d.data().amount || 0;
           userBonuses.push(d.data());
        });
        setBonuses(userBonuses);

        const records: PayrollItem[] = [];
        let tHours = 0;
        let tEarned = totalBonus;
        let activeData: any | null = null;

        attSnap.forEach(d => {
          const data = d.data();
          if (data.date >= startDate && data.date <= endDate) {
            if (data.checkIn) {
              const inTime = data.checkIn.toDate();
              let outTime = data.checkOut ? data.checkOut.toDate() : null;
              
              let roundedHours = 0;
              let earned = 0;

              if (outTime) {
                const hours = calculateHoursWorked(data);
                roundedHours = hours;
                const recordSalary = Number(data.salaryPerHour || salaryPerHour || 0);
                earned = Math.round(hours * recordSalary);
                tHours += roundedHours;
              } else {
                activeData = data;
              }

              // Tính trạng thái Đi muộn hay Đúng giờ
              let isLate = false;
              let isEarly = false;
              let latePenalty = 0;
              const branchIdForRecord = data.branchId || currentUserBranchId;
              const latePenaltyRate = (latePenaltyMap[branchIdForRecord] !== undefined ? latePenaltyMap[branchIdForRecord] : latePenaltyMap['ALL']) || 0;
              
              const shiftsToday = schedulesMap[data.date];
              if (shiftsToday && shiftsToday.length > 0) {
                // Tìm ca sớm nhất trong ngày của NV này
                let earliestShiftM = 24 * 60;
                let latestEndM = 0;
                shiftsToday.forEach(shiftStr => {
                   const match = shiftStr.match(/\((\d{2}):(\d{2})/);
                   if (match) {
                      const startM = parseInt(match[1]) * 60 + parseInt(match[2]);
                      if (startM < earliestShiftM) earliestShiftM = startM;
                   }
                   const matchEnd = shiftStr.match(/-\s*(\d{2}):(\d{2})/);
                   if (matchEnd && match) {
                      const startM = parseInt(match[1]) * 60 + parseInt(match[2]);
                      let endM = parseInt(matchEnd[1]) * 60 + parseInt(matchEnd[2]);
                      if (endM < startM) endM += 24 * 60;
                      if (endM > latestEndM) latestEndM = endM;
                   }
                });
                const inTotalM = inTime.getHours() * 60 + inTime.getMinutes();
                if (inTotalM > earliestShiftM + 15) { // Cho phép trễ 15 phút
                   isLate = true;
                   latePenalty = (inTotalM - earliestShiftM) * latePenaltyRate;
                }
                if (outTime) {
                   const outTotalM = outTime.getHours() * 60 + outTime.getMinutes();
                   if (outTotalM < latestEndM) {
                      isEarly = true;
                   }
                }
              }
              
              if (outTime) {
                earned -= latePenalty;
                if (earned < 0) earned = 0;
                tEarned += earned;
              }

              let status = '';
              if (!outTime) {
                 status = isLate ? 'Đang làm (Đi muộn)' : 'Đang làm (Đúng giờ)';
              } else {
                 if (isLate && isEarly) status = 'Hoàn thành (Muộn/Sớm)';
                 else if (isLate) status = 'Hoàn thành (Đi muộn)';
                 else if (isEarly) status = 'Hoàn thành (Về sớm)';
                 else status = 'Hoàn thành (Đúng giờ)';
              }

              if (data.logs && data.logs.length > 3) {
                 status += ' - Ngắt quãng';
              }

              records.push({
                date: data.date,
                checkInStr: inTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                checkOutStr: outTime ? outTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--',
                hoursWorked: roundedHours,
                earned: earned,
                status: status,
                logs: data.logs?.map((l: any) => ({ action: l.action, time: l.time?.toDate ? l.time.toDate() : new Date(l.time) }))
              });
            }
          }
        });

        records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setPayrollData(records);
        setTotalHours(tHours);
        setTotalEarned(tEarned);
        setActiveShiftData(activeData);
        setSalaryRate(activeData && activeData.salaryPerHour !== undefined ? activeData.salaryPerHour : salaryPerHour);
      } 
      
      // --- ADMIN PAYROLL ---
      if (userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN') {
        let currentUserBranchId = '';
        let currentUserBranchName = '';

        if (currentEmployeeId) {
          const empDoc = await getDoc(doc(db, 'employees', currentEmployeeId));
          if (empDoc.exists()) {
            currentUserBranchId = empDoc.data().branchId;
            currentUserBranchName = empDoc.data().branchName;
          }
        }

        const empSnap = await getDocs(collection(db, 'employees'));
        const allEmps: Record<string, EmployeeInfo> = {};

        empSnap.forEach(d => {
           allEmps[d.id] = { id: d.id, ...d.data() } as EmployeeInfo;
           if (d.id === currentEmployeeId) {
             currentUserBranchId = d.data().branchId;
             currentUserBranchName = d.data().branchName;
           }
        });

        // Lấy chấm công trong tháng
        const attQuery = query(
          collection(db, 'attendance'),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
        );
        const attSnap = await getDocs(attQuery);
        
        // Load admin schedules to compute late penalty
        const schedQueryAdmin = query(
          collection(db, 'schedules'),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
        );
        const schedSnapAdmin = await getDocs(schedQueryAdmin);
        const adminSchedulesMap: Record<string, string[]> = {};
        schedSnapAdmin.forEach(d => {
           const data = d.data();
           const key = `${data.employeeId}_${data.date}`;
           if (!adminSchedulesMap[key]) adminSchedulesMap[key] = [];
           adminSchedulesMap[key].push(data.shift);
        });

        const adminBonusQuery = query(collection(db, 'bonuses'), where('month', '==', month));
        const adminBonusSnap = await getDocs(adminBonusQuery);
        const adminBonusMap: Record<string, number> = {};
        const adminBonusDetails: Record<string, any[]> = {};
        adminBonusSnap.forEach(d => {
           const b = d.data();
           if (!adminBonusMap[b.employeeId]) adminBonusMap[b.employeeId] = 0;
           if (!adminBonusDetails[b.employeeId]) adminBonusDetails[b.employeeId] = [];
           adminBonusMap[b.employeeId] += b.amount || 0;
           adminBonusDetails[b.employeeId].push(b);
        });

        const adminList: any[] = [];
        
        // 1. Dòng Đã thanh toán (Từ Lịch sử)
        const historyQuery = query(collection(db, 'payroll_history'), where('month', '==', month));
        const historySnap = await getDocs(historyQuery);
        historySnap.forEach(d => {
          const historyData = d.data();
          if (historyData.employeeId && allEmps[historyData.employeeId]) {
            const empId = historyData.employeeId;
            let belongsToAdmin = false;
            const employeeCurrentBranchId = allEmps[empId]?.branchId;
            if (userRole === 'SUPER_ADMIN') {
              if (filterBranchId === 'ALL') belongsToAdmin = true;
              else if (employeeCurrentBranchId === filterBranchId) belongsToAdmin = true;
            } else if (userRole === 'BRANCH_ADMIN') {
              if (employeeCurrentBranchId === currentUserBranchId) belongsToAdmin = true;
            }
            if (belongsToAdmin) {
               adminList.push({
                 groupKey: `paid_${d.id}`,
                 employeeInfo: { ...allEmps[empId] },
                 branches: new Set<string>(),
                 totalHours: historyData.totalHours || 0,
                 totalEarned: historyData.amount,
                 shiftsCount: historyData.shiftsCount || 0,
                 isPaid: true,
                 historyId: d.id,
                 salaryRate: historyData.salaryPerHour || 0
               });
            }
          }
        });

        // 2. Dòng Chưa thanh toán (Nhóm các attendance chưa thanh toán)
        const summary: Record<string, any> = {};
        attSnap.forEach(d => {
          const data = d.data();
          if (data.employeeId && allEmps[data.employeeId] && data.checkIn && data.checkOut && !data.isPaid) {
            const empId = data.employeeId;
            let belongsToAdmin = false;
            
            const employeeCurrentBranchId = allEmps[empId]?.branchId;

            if (userRole === 'SUPER_ADMIN') {
              if (filterBranchId === 'ALL') {
                belongsToAdmin = true;
              } else {
                if (employeeCurrentBranchId === filterBranchId) belongsToAdmin = true;
              }
            } else if (userRole === 'BRANCH_ADMIN') {
              if (data.branchId) {
                if (data.branchId === currentUserBranchId) belongsToAdmin = true;
              } else {
                // Legacy records fallback
                if (data.branchName === currentUserBranchName) {
                  belongsToAdmin = true;
                }
              }
            }

            if (!belongsToAdmin) return;

            const hours = calculateHoursWorked(data);
            const recordSalary = Number(data.salaryPerHour || allEmps[empId]?.salaryPerHour || 0);
            
            let latePenalty = 0;
            const branchIdForRecord = data.branchId || allEmps[empId]?.branchId;
            const latePenaltyRate = (latePenaltyMap[branchIdForRecord] !== undefined ? latePenaltyMap[branchIdForRecord] : latePenaltyMap['ALL']) || 0;

            const inTime = data.checkIn.toDate ? data.checkIn.toDate() : new Date(data.checkIn);
            const inTotalM = inTime.getHours() * 60 + inTime.getMinutes();
            const shiftsToday = adminSchedulesMap[`${empId}_${data.date}`];
            if (shiftsToday && shiftsToday.length > 0) {
                 let earliestShiftM = 24 * 60;
                 shiftsToday.forEach(shiftStr => {
                    const match = shiftStr.match(/\((\d{2}):(\d{2})/);
                    if (match) {
                       const startM = parseInt(match[1]) * 60 + parseInt(match[2]);
                       if (startM < earliestShiftM) earliestShiftM = startM;
                    }
                 });
                 if (inTotalM > earliestShiftM + 15) {
                    latePenalty = (inTotalM - earliestShiftM) * latePenaltyRate;
                 }
            }

            let earned = Math.round(hours * recordSalary) - latePenalty;
            if (earned < 0) earned = 0;

            const groupKey = `${empId}_${recordSalary}`;
            
            if (!summary[groupKey]) {
              let bonus = 0;
              if (adminBonusMap[empId]) {
                 bonus = adminBonusMap[empId];
                 adminBonusMap[empId] = 0; // Consume the bonus
              }
              summary[groupKey] = {
                groupKey: `unpaid_${groupKey}`,
                employeeInfo: { ...allEmps[empId] },
                branches: new Set<string>(),
                totalHours: 0,
                totalEarned: bonus,
                shiftsCount: 0,
                attendanceIds: [],
                isPaid: false,
                salaryRate: recordSalary,
                bonuses: adminBonusDetails[empId] || []
              };
            }

            if (data.branchName) summary[groupKey].branches.add(data.branchName);
            summary[groupKey].totalHours += hours;
            summary[groupKey].shiftsCount += 1;
            summary[groupKey].attendanceIds.push(d.id);
            summary[groupKey].totalEarned += earned;
          }
        });

        // Post process remaining bonuses for employees without attendance
        for (const [empId, bonusAmount] of Object.entries(adminBonusMap)) {
           if (bonusAmount > 0 && allEmps[empId]) {
              let belongsToAdmin = false;
              const employeeCurrentBranchId = allEmps[empId]?.branchId;
              if (userRole === 'SUPER_ADMIN') {
                if (filterBranchId === 'ALL') belongsToAdmin = true;
                else if (employeeCurrentBranchId === filterBranchId) belongsToAdmin = true;
              } else if (userRole === 'BRANCH_ADMIN') {
                if (employeeCurrentBranchId === currentUserBranchId) belongsToAdmin = true;
              }
              
              if (belongsToAdmin) {
                 const recordSalary = Number(allEmps[empId]?.salaryPerHour || 0);
                 const groupKey = `${empId}_${recordSalary}`;
                 if (!summary[groupKey]) {
                    summary[groupKey] = {
                      groupKey: `unpaid_${groupKey}`,
                      employeeInfo: { ...allEmps[empId] },
                      branches: new Set<string>(),
                      totalHours: 0,
                      totalEarned: bonusAmount,
                      shiftsCount: 0,
                      attendanceIds: [],
                      isPaid: false,
                      salaryRate: recordSalary,
                      bonuses: adminBonusDetails[empId] || []
                    };
                 } else {
                    summary[groupKey].totalEarned += bonusAmount;
                 }
              }
           }
        }

        const unpaidList = Object.values(summary).map(item => ({
          ...item,
          totalHours: Math.round(item.totalHours * 100) / 100
        }));
        
        setAdminPayroll([...adminList, ...unpaidList].sort((a, b) => a.employeeInfo.fullName.localeCompare(b.employeeInfo.fullName)));
      }
    } catch (error) {
      console.error("Lỗi tính lương:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!paymentModalData) return;
    try {
      const historyRef = await addDoc(collection(db, 'payroll_history'), {
        employeeId: paymentModalData.employeeId,
        month,
        amount: paymentModalData.amount,
        totalHours: paymentModalData.totalHours,
        shiftsCount: paymentModalData.shiftsCount,
        salaryPerHour: paymentModalData.salaryRate,
        paidAt: new Date()
      });
      
      // Update attendance docs
      for (const id of paymentModalData.attendanceIds) {
        await updateDoc(doc(db, 'attendance', id), {
          isPaid: true,
          paymentId: historyRef.id
        });
      }
      
      // Send notification to employee
      await addDoc(collection(db, 'notifications'), {
        employeeId: paymentModalData.employeeId,
        title: 'Nhận thanh toán lương',
        message: `Tài khoản của bạn vừa được cộng thêm ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(paymentModalData.amount)} từ đợt thanh toán lương tháng ${month}.`,
        type: 'MONEY_ADD',
        read: false,
        createdAt: new Date()
      });

      setPaymentModalData(null);
      toast.success('Đã đánh dấu thanh toán!');
      fetchPayroll(); // refresh
    } catch (error) {
      console.error(error);
      toast.error('Lỗi cập nhật thanh toán');
    }
  };



  useEffect(() => {
    fetchPayroll();
  }, [userRole, currentEmployeeId, month, filterBranchId]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (activeShiftData) {
      interval = setInterval(() => {
        setLiveHours(calculateHoursWorked(activeShiftData, true));
      }, 1000);
    } else {
      setLiveHours(0);
    }
    return () => clearInterval(interval);
  }, [activeShiftData]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Đang tính toán bảng lương...</div>;
  }

  return (
    <div className="space-y-6">
      {userRole === 'BRANCH_ADMIN' && (
        <div className="flex border-b border-gray-200 bg-white px-2 rounded-t-xl pt-2">
          <button 
            className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'admin' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('admin')}
          >
            Quản lý Lương Nhân viên
          </button>
          <button 
            className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'personal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('personal')}
          >
            Bảng lương Cá nhân
          </button>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center">
            <Wallet className="mr-2 text-green-600" /> Bảng Lương Tự Động
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {(['EMPLOYEE', 'CASHIER', 'BARTENDER', 'KITCHEN', 'GUARD'].includes(userRole) || activeTab === 'personal') ? 'Lương được tính toán dựa trên số giờ Check-in/Check-out thực tế' : 'Tổng hợp lương nhân viên toàn hệ thống'}
          </p>
        </div>
        {(['EMPLOYEE', 'CASHIER', 'BARTENDER', 'KITCHEN', 'GUARD'].includes(userRole) || (userRole === 'BRANCH_ADMIN' && activeTab === 'personal')) && (
          <div className="bg-green-50 px-4 py-2 rounded-lg border border-green-200 text-right">
            <p className="text-xs font-semibold text-green-800 uppercase tracking-wider">Tổng Thu Nhập Tạm Tính</p>
            <p className="text-2xl font-bold text-green-600">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalEarned + Math.round(liveHours * salaryRate))}
            </p>
          </div>
        )}
      </div>

      {/* TỔNG KẾT NHÂN VIÊN (Dành cho Admin) */}
      {(userRole === 'SUPER_ADMIN' || (userRole === 'BRANCH_ADMIN' && activeTab === 'admin')) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto overflow-y-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Tổng hợp Bảng Lương Nhân Viên</h3>
            <div className="flex items-center space-x-3">
              {userRole === 'SUPER_ADMIN' && (
                <select
                  value={filterBranchId}
                  onChange={(e) => {
                    setFilterBranchId(e.target.value);
                    if (e.target.value === 'ALL') {
                      searchParams.delete('branchId');
                    } else {
                      searchParams.set('branchId', e.target.value);
                    }
                    setSearchParams(searchParams);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50 mr-2"
                >
                  <option value="ALL">Tất cả cơ sở</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
              <label className="text-sm font-medium text-gray-700">Chọn tháng:</label>
              <input 
                type="month" 
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-semibold text-gray-600 text-sm">Nhân viên</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-center">Số ca hoàn thành</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-center">Tổng giờ làm</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-right">Mức lương/giờ</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-right">Thành tiền</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {adminPayroll.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 italic">Chưa có dữ liệu chấm công nào được ghi nhận.</td>
                </tr>
              ) : (
                adminPayroll.map((item) => {
                  const displayBranch = item.employeeInfo.branchName;
                  return (
                  <tr key={item.groupKey} className={`border-b border-gray-100 transition-colors ${item.isPaid ? 'bg-green-50/50 hover:bg-green-50' : 'hover:bg-gray-50'}`}>
                    <td className="p-4 text-sm font-bold text-gray-800">
                      <button 
                        onClick={() => navigate(`/dashboard/employees?highlightId=${item.employeeInfo.id}`)}
                        className="hover:text-blue-600 hover:underline transition-colors text-left"
                      >
                        [{item.employeeInfo.employeeCode || 'No ID'}] {item.employeeInfo.fullName}
                      </button>
                    </td>
                    <td className="p-4 text-sm text-gray-600">{displayBranch as string}</td>
                    <td className="p-4 text-sm text-center font-medium text-blue-600">{item.shiftsCount} ca</td>
                    <td className="p-4 text-sm text-center text-gray-700">
                      <button 
                        onClick={() => navigate(`/dashboard/timesheets?expandId=${item.employeeInfo.id}`)}
                        className="hover:text-blue-600 hover:underline transition-colors font-bold"
                        title="Xem chi tiết bảng công"
                      >
                        {formatHours(item.totalHours)}
                      </button>
                    </td>
                      <td className="p-4 text-sm text-right text-gray-500">
                        <div className="flex flex-col items-end gap-1">
                          <span>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.salaryRate !== undefined ? item.salaryRate : item.employeeInfo.salaryPerHour)}</span>
                        </div>
                      </td>
                    <td className="p-4 text-sm text-right font-bold text-gray-800">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.totalEarned)}
                      {item.bonuses && item.bonuses.length > 0 && (
                        <div className="text-[10px] text-green-600 font-normal mt-1 flex flex-col items-end">
                           <span>(+ {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.bonuses.reduce((sum: number, b: any) => sum + b.amount, 0))} thưởng)</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-center">
                      {item.isPaid ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Đã thanh toán</span>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setPaymentModalData({
                            employeeId: item.employeeInfo.id,
                            amount: item.totalEarned,
                            totalHours: item.totalHours,
                            shiftsCount: item.shiftsCount,
                            attendanceIds: item.attendanceIds,
                            bankName: item.employeeInfo.bankName,
                            bankAccountNum: item.employeeInfo.bankAccountNum,
                            bankAccountName: item.employeeInfo.bankAccountName,
                            fullName: item.employeeInfo.fullName,
                            salaryRate: item.salaryRate !== undefined ? item.salaryRate : item.employeeInfo.salaryPerHour
                          })}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        >
                          Xác nhận trả lương
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CHI TIẾT CÁ NHÂN (Dành cho Nhân viên) */}
      {(['EMPLOYEE', 'CASHIER', 'BARTENDER', 'KITCHEN', 'GUARD'].includes(userRole) || (userRole === 'BRANCH_ADMIN' && activeTab === 'personal')) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto overflow-y-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="font-bold text-gray-800 flex items-center">
              <CalendarDays size={18} className="mr-2 text-gray-500" />
              Chi tiết công làm việc
            </h3>
            <div className="flex items-center space-x-4">
              <input 
                type="month" 
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500"
              />
              <span className="text-sm font-medium text-gray-600 bg-white px-3 py-1 rounded-full border">
                Tổng: {formatHours(totalHours + liveHours)}
              </span>
            </div>
          </div>
          
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-semibold text-gray-600 text-sm">Ngày làm việc</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Thời gian làm việc</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">Trạng thái</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-center">Số giờ</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-right">Thu nhập</th>
              </tr>
            </thead>
            <tbody>
              {payrollData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500 italic">Chưa có ca làm việc nào được ghi nhận.</td>
                </tr>
              ) : (
                payrollData.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm font-medium text-gray-800">
                      {new Date(item.date).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      Từ <span className="font-medium text-blue-600">{item.checkInStr}</span> đến <span className="font-medium text-blue-600">{item.checkOutStr}</span>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            item.status.includes('Đang làm') 
                              ? 'bg-blue-50 text-blue-700 border-blue-200' 
                              : item.status.includes('Muộn') || item.status.includes('Sớm') || item.status.includes('Ngắt quãng')
                              ? 'bg-orange-50 text-orange-700 border-orange-200'
                              : 'bg-green-50 text-green-700 border-green-200'
                          }`}>
                            {item.status}
                          </span>
                          {item.logs && item.logs.length > 0 && (
                            <button 
                              onClick={() => setSelectedLogs(item.logs!)}
                              className="text-xs text-blue-600 hover:text-blue-800 underline transition-colors"
                            >
                              Chi tiết
                            </button>
                          )}
                        </div>
                      </td>
                    <td className="p-4 text-sm text-center text-gray-600">
                      {item.hoursWorked > 0 ? (
                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-medium border border-blue-100">
                          {formatHours(item.hoursWorked)}
                        </span>
                      ) : (
                        <span className="bg-blue-50/50 text-blue-500 px-2 py-1 rounded-lg font-medium border border-blue-100/50 italic animate-pulse">
                          {formatHours(liveHours)}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-right font-bold text-green-600">
                      {item.earned > 0 
                        ? `+ ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.earned)}` 
                        : <span className="opacity-70 animate-pulse">+ {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.round(liveHours * salaryRate))}</span>
                      }
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {bonuses && bonuses.length > 0 && (
            <div className="p-4 bg-green-50/50 border-t border-green-100">
               <h4 className="font-semibold text-green-800 mb-2">Các khoản thưởng thêm trong tháng:</h4>
               <ul className="space-y-1">
                 {bonuses.map((b, idx) => (
                   <li key={idx} className="flex justify-between items-center text-sm border-b border-green-100 pb-1 last:border-b-0">
                     <span className="text-gray-700">{b.reason} <span className="text-gray-400 text-xs ml-1">({new Date(b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt).toLocaleDateString('vi-VN')})</span></span>
                     <span className="font-bold text-green-600">+{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(b.amount)}</span>
                   </li>
                 ))}
               </ul>
            </div>
          )}
        </div>
      )}

      {/* PAYMENT MODAL */}
      {paymentModalData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
            <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">Thông tin thanh toán</h3>
              <button onClick={() => setPaymentModalData(null)} className="text-white/80 hover:text-white transition-colors">
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="text-center mb-6">
                <p className="text-sm text-gray-500 mb-1">Thanh toán lương tháng {month} cho</p>
                <p className="text-xl font-bold text-gray-800">{paymentModalData.fullName}</p>
                <p className="text-3xl font-black text-green-600 mt-2">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(paymentModalData.amount)}
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                <h4 className="font-semibold text-gray-700 mb-2 border-b border-gray-200 pb-2">Tài khoản thụ hưởng</h4>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Ngân hàng:</span>
                  <span className="font-medium text-gray-800">{paymentModalData.bankName || 'Chưa cập nhật'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Số tài khoản:</span>
                  <span className="font-medium text-blue-600 tracking-wider">{paymentModalData.bankAccountNum || 'Chưa cập nhật'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Chủ tài khoản:</span>
                  <span className="font-medium text-gray-800 uppercase">{paymentModalData.bankAccountName || 'Chưa cập nhật'}</span>
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setPaymentModalData(null)}
                  className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                >
                  Hủy
                </button>
                <button 
                  onClick={() => handleMarkAsPaid()}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2"
                >
                  <Wallet size={18} /> Đã thanh toán
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 transition-opacity">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Lịch sử Ra/Vào ca
              </h3>
              <button onClick={() => setSelectedLogs(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                {selectedLogs.map((log, index) => (
                  <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-blue-100 text-blue-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                      {log.action === 'CHECK_IN' ? <CheckCircle className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-orange-500" />}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-lg border border-gray-100 bg-white shadow-sm">
                      <div className="flex items-center justify-between space-x-2 mb-1">
                        <div className="font-bold text-gray-800 text-sm">
                          {log.action === 'CHECK_IN' ? 'Check-In' : 'Check-Out'}
                        </div>
                        <time className="font-mono text-xs font-medium text-indigo-500">
                          {log.time.toLocaleTimeString('vi-VN')}
                        </time>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setSelectedLogs(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;

