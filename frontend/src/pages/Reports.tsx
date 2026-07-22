import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Building2, Wallet } from 'lucide-react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../config/firebase';

const Reports: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [branchStats, setBranchStats] = useState<any[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalBonus, setTotalBonus] = useState(0);
  const [estimatedUnpaid, setEstimatedUnpaid] = useState(0);

  const userRole = localStorage.getItem('userRole') || '';
  const userBranchId = localStorage.getItem('branchId') || '';

  const [payrollList, setPayrollList] = useState<any[]>([]);
  const [bonusList, setBonusList] = useState<any[]>([]);
  const [unpaidList, setUnpaidList] = useState<any[]>([]);
  const [modalType, setModalType] = useState<'payroll' | 'bonus' | 'estimate' | 'unpaid' | 'total_paid' | null>(null);

  const formatHoursMinutes = (decimalHours: number) => {
    if (!decimalHours) return '0 phút';
    const h = Math.floor(decimalHours);
    const m = Math.round((decimalHours - h) * 60);
    if (h === 0) return `${m} phút`;
    if (m === 0) return `${h} giờ`;
    return `${h} giờ ${m} phút`;
  };

  useEffect(() => {
    const fetchReports = async () => {
      try {
        // Fetch branches
        const branchesSnap = await getDocs(collection(db, 'branches'));
        const branches: Record<string, string> = {};
        branchesSnap.forEach(d => {
          branches[d.id] = d.data().name;
        });

        // Fetch employees to map to branches and names
        const empSnap = await getDocs(collection(db, 'employees'));
        const empBranchMap: Record<string, string> = {};
        const empNameMap: Record<string, string> = {};
        const empCodeMap: Record<string, string> = {};
        const empSalaryMap: Record<string, number> = {};
        empSnap.forEach(d => {
          empBranchMap[d.id] = d.data().branchId;
          empNameMap[d.id] = d.data().fullName;
          empCodeMap[d.id] = d.data().employeeCode;
          empSalaryMap[d.id] = d.data().salaryPerHour || 0;
        });

        // Fetch payroll history
        const payrollSnap = await getDocs(collection(db, 'payroll_history'));
        const branchTotals: Record<string, { payroll: number; bonus: number; estimatedUnpaid: number }> = {};
        let totalPayroll = 0;
        let totalBonusAmount = 0;

        const pList: any[] = [];
        payrollSnap.forEach(d => {
          const data = d.data();
          const branchId = empBranchMap[data.employeeId] || 'unknown';
          if (userRole === 'BRANCH_ADMIN' && branchId !== userBranchId) return;

          const amount = data.amount || 0;
          totalPayroll += amount;
          if (!branchTotals[branchId]) branchTotals[branchId] = { payroll: 0, bonus: 0, estimatedUnpaid: 0 };
          branchTotals[branchId].payroll += amount;
          
          pList.push({
             ...data,
             employeeName: empNameMap[data.employeeId] || 'Không xác định',
             employeeCode: empCodeMap[data.employeeId] || 'No ID',
             branchName: branches[branchId] || 'Chưa phân bổ',
             branchId
          });
        });

        // Fetch bonuses
        const bonusSnap = await getDocs(collection(db, 'bonuses'));
        const bList: any[] = [];
        bonusSnap.forEach(d => {
          const data = d.data();
          const branchId = empBranchMap[data.employeeId] || 'unknown';
          if (userRole === 'BRANCH_ADMIN' && branchId !== userBranchId) return;

          const amount = data.amount || 0;
          totalBonusAmount += amount;
          if (!branchTotals[branchId]) branchTotals[branchId] = { payroll: 0, bonus: 0, estimatedUnpaid: 0 };
          branchTotals[branchId].bonus += amount;
          
          bList.push({
             ...data,
             employeeName: empNameMap[data.employeeId] || 'Không xác định',
             employeeCode: empCodeMap[data.employeeId] || 'No ID',
             branchName: branches[branchId] || 'Chưa phân bổ',
             branchId
          });
        });

        setTotalPaid(totalPayroll);
        setTotalBonus(totalBonusAmount);
        
        // Fetch unpaid attendance for estimated cost (all time)
        const attQuery = query(collection(db, 'attendance')); // Fetch all
        const attSnap = await getDocs(attQuery);
        let estimatedUnpaidAmount = 0;
        const uList: any[] = [];
        attSnap.forEach(d => {
           const data = d.data();
           const branchId = empBranchMap[data.employeeId] || 'unknown';
           if (userRole === 'BRANCH_ADMIN' && branchId !== userBranchId) return;

           if (data.checkIn && data.checkOut && !data.isPaid) {
              const inTime = data.checkIn.toDate ? data.checkIn.toDate() : new Date(data.checkIn);
              const outTime = data.checkOut.toDate ? data.checkOut.toDate() : new Date(data.checkOut);
              let diff = outTime.getTime() - inTime.getTime();
              if (data.logs) {
                 let breakStart: Date | null = null;
                 data.logs.forEach((l: any) => {
                    if (l.action === 'Nghỉ giải lao') breakStart = l.time?.toDate ? l.time.toDate() : new Date(l.time);
                    if (l.action === 'Kết thúc giải lao' && breakStart) {
                       const breakEnd = l.time?.toDate ? l.time.toDate() : new Date(l.time);
                       diff -= (breakEnd.getTime() - breakStart.getTime());
                       breakStart = null;
                    }
                 });
              }
              let hours = diff / 3600000;
              hours = Math.round(hours * 100) / 100;
              const salary = Number(data.salaryPerHour || empSalaryMap[data.employeeId] || 0);
              const cost = Math.round(hours * salary);
              estimatedUnpaidAmount += cost;
              
              if (!branchTotals[branchId]) branchTotals[branchId] = { payroll: 0, bonus: 0, estimatedUnpaid: 0 };
              branchTotals[branchId].estimatedUnpaid += cost;
              uList.push({
                 ...data,
                 amount: cost,
                 hours: hours,
                 employeeName: empNameMap[data.employeeId] || 'Không xác định',
                 employeeCode: empCodeMap[data.employeeId] || 'No ID',
                 branchName: branches[branchId] || 'Chưa phân bổ',
                 branchId
              });
           }
        });
        setUnpaidList(uList.sort((a, b) => {
           const dateA = a.checkIn?.toDate ? a.checkIn.toDate().getTime() : (a.checkIn ? new Date(a.checkIn).getTime() : 0);
           const dateB = b.checkIn?.toDate ? b.checkIn.toDate().getTime() : (b.checkIn ? new Date(b.checkIn).getTime() : 0);
           return dateB - dateA;
        }));
        setEstimatedUnpaid(estimatedUnpaidAmount + totalPayroll);
        
        setPayrollList(pList.sort((a, b) => {
           const dateA = a.paymentDate?.toDate ? a.paymentDate.toDate().getTime() : (a.paymentDate ? new Date(a.paymentDate).getTime() : 0);
           const dateB = b.paymentDate?.toDate ? b.paymentDate.toDate().getTime() : (b.paymentDate ? new Date(b.paymentDate).getTime() : 0);
           return dateB - dateA;
        }));
        setBonusList(bList.sort((a, b) => {
           const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
           const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
           return dateB - dateA;
        }));

        const statsList = Object.keys(branchTotals).map(bId => ({
          branchId: bId,
          branchName: branches[bId] || 'Chưa phân bổ',
          totalAmount: branchTotals[bId].payroll + branchTotals[bId].bonus,
          estimatedTotalAmount: branchTotals[bId].payroll + branchTotals[bId].bonus + branchTotals[bId].estimatedUnpaid,
          payrollAmount: branchTotals[bId].payroll,
          bonusAmount: branchTotals[bId].bonus
        }));
        
        // Sort descending
        statsList.sort((a, b) => b.totalAmount - a.totalAmount);
        setBranchStats(statsList);
      } catch (error) {
        console.error("Lỗi lấy báo cáo:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Đang tải báo cáo...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center">
            <BarChart3 className="mr-2 text-blue-600" /> Báo Cáo Thống Kê
          </h2>
          <p className="text-sm text-gray-500 mt-1">Tổng quan chi phí lương theo cơ sở.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-sm flex flex-col text-white border border-blue-400">
          <div 
            onClick={() => setModalType('payroll')}
            className="p-6 cursor-pointer hover:bg-white/10 transition-colors rounded-t-xl group/paid flex-1"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-100 mb-1">Tổng chi phí lương đã thanh toán</p>
                <h3 className="text-3xl font-bold">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalPaid)}
                </h3>
              </div>
              <div className="p-3 bg-white/20 rounded-lg">
                <Wallet size={32} />
              </div>
            </div>
            <p className="text-xs text-blue-100 mt-3 opacity-80 group-hover/paid:opacity-100 transition-opacity">Nhấn để xem chi tiết →</p>
          </div>
          
          <div 
            onClick={(e) => { e.stopPropagation(); setModalType('unpaid'); }}
            className="flex justify-between items-end p-4 px-6 border-t border-blue-400/30 hover:bg-white/10 rounded-b-xl transition-colors cursor-pointer group/unpaid"
          >
            <div>
              <p className="text-xs text-blue-100 font-medium">Ước tính tổng chi phí lương:</p>
              <p className="text-sm font-bold text-white mt-0.5">
                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(estimatedUnpaid)}
              </p>
            </div>
            <p className="text-xs text-blue-100 opacity-80 group-hover/unpaid:opacity-100 transition-opacity">Nhấn để xem chi tiết →</p>
          </div>
        </div>

        <div 
          onClick={() => setModalType('bonus')}
          className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-sm p-6 text-white border border-green-400 cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-100 mb-1">Tổng chi phí thưởng</p>
              <h3 className="text-3xl font-bold">
                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalBonus)}
              </h3>
            </div>
            <div className="p-3 bg-white/20 rounded-lg">
              <Wallet size={32} />
            </div>
          </div>
          <p className="text-xs text-green-100 mt-4 opacity-80">Nhấn để xem chi tiết →</p>
        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-sm flex flex-col text-white border border-indigo-400">
          <div 
            onClick={() => setModalType('total_paid')}
            className="p-6 cursor-pointer hover:bg-white/10 transition-colors rounded-t-xl group/total flex-1"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-indigo-100 mb-1">Tổng cộng (Lương + Thưởng)</p>
                <h3 className="text-3xl font-bold">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalPaid + totalBonus)}
                </h3>
              </div>
              <div className="p-3 bg-white/20 rounded-lg">
                <Wallet size={32} />
              </div>
            </div>
            <p className="text-xs text-indigo-100 mt-3 opacity-80 group-hover/total:opacity-100 transition-opacity">Nhấn để xem chi tiết →</p>
          </div>
          
          <div 
            onClick={(e) => { e.stopPropagation(); setModalType('estimate'); }}
            className="flex justify-between items-end p-4 px-6 border-t border-indigo-400/30 hover:bg-white/10 rounded-b-xl transition-colors cursor-pointer group/estimate"
          >
            <div>
              <p className="text-xs text-indigo-100 font-medium">Ước tính:</p>
              <p className="text-sm font-bold text-white mt-0.5">
                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(estimatedUnpaid + totalBonus)}
              </p>
            </div>
            <p className="text-xs text-indigo-100 opacity-80 group-hover/estimate:opacity-100 transition-opacity">Nhấn để xem chi tiết theo cơ sở →</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto overflow-y-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h3 className="font-bold text-gray-800 flex items-center">
            <Building2 size={18} className="mr-2 text-gray-500" />
            Chi phí lương theo Cơ sở
          </h3>
        </div>
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở</th>
              <th className="p-4 font-semibold text-gray-600 text-sm text-right">Chi phí lương (đã thanh toán)</th>
              <th className="p-4 font-semibold text-gray-600 text-sm text-right">Chi phí thưởng</th>
              <th className="p-4 font-semibold text-indigo-700 text-sm text-right">Ước tính</th>
              <th className="p-4 font-semibold text-gray-600 text-sm text-right">Tổng cộng</th>
            </tr>
          </thead>
          <tbody>
            {branchStats.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500 italic">Chưa có dữ liệu thanh toán.</td>
              </tr>
            ) : (
              branchStats.map((stat, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4 text-sm font-medium text-gray-800">{stat.branchName}</td>
                  <td className="p-4 text-sm font-medium text-gray-600 text-right">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stat.payrollAmount)}
                  </td>
                  <td className="p-4 text-sm font-medium text-green-600 text-right">
                    {stat.bonusAmount > 0 ? `+${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stat.bonusAmount)}` : '-'}
                  </td>
                  <td className="p-4 text-sm font-black text-indigo-600 text-right bg-indigo-50/30 border-r border-gray-100">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stat.estimatedTotalAmount)}
                  </td>
                  <td className="p-4 text-sm font-bold text-blue-600 text-right">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stat.totalAmount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Details Modal */}
      {modalType && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-fade-in-up">
            <div className={`p-4 text-white flex justify-between items-center ${modalType === 'payroll' ? 'bg-blue-600' : modalType === 'unpaid' ? 'bg-orange-500' : modalType === 'bonus' ? 'bg-green-600' : modalType === 'total_paid' ? 'bg-indigo-600' : 'bg-indigo-600'}`}>
              <h3 className="font-bold text-lg">
                {modalType === 'payroll' ? 'Chi tiết các khoản lương đã thanh toán' : modalType === 'bonus' ? 'Chi tiết các khoản thưởng' : modalType === 'unpaid' ? 'Chi tiết lương ước tính chưa thanh toán' : modalType === 'total_paid' ? 'Chi tiết tổng tiền đã thanh toán' : 'Ước tính chi phí theo cơ sở'}
              </h3>
              <button 
                onClick={() => setModalType(null)}
                className="text-white hover:bg-white/20 p-1 rounded-full transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                  {modalType === 'estimate' ? (
                    <tr className="border-b border-gray-200">
                      <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở</th>
                      <th className="p-4 font-semibold text-gray-600 text-sm text-right">Tổng đã trả</th>
                      <th className="p-4 font-semibold text-indigo-600 text-sm text-right">Ước tính chi phí</th>
                    </tr>
                  ) : (
                    <tr className="border-b border-gray-200">
                      <th className="p-4 font-semibold text-gray-600 text-sm">Thời gian</th>
                      <th className="p-4 font-semibold text-gray-600 text-sm">Nhân viên</th>
                      <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở</th>
                      <th className="p-4 font-semibold text-gray-600 text-sm">Chi tiết</th>
                      <th className="p-4 font-semibold text-gray-600 text-sm text-right">Số tiền</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {modalType === 'estimate' ? (
                     branchStats.length === 0 ? (
                       <tr>
                         <td colSpan={3} className="p-8 text-center text-gray-500 italic">Chưa có dữ liệu.</td>
                       </tr>
                     ) : (
                       branchStats.map((stat, idx) => (
                         <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                           <td className="p-4 text-sm font-bold text-gray-800">
                             <button
                               onClick={() => navigate(`/dashboard/payroll?branchId=${stat.branchId}`)}
                               className="hover:text-blue-600 hover:underline transition-colors text-left"
                             >
                               {stat.branchName}
                             </button>
                           </td>
                           <td className="p-4 text-sm font-medium text-blue-600 text-right">
                             {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stat.totalAmount)}
                           </td>
                           <td className="p-4 text-sm font-black text-indigo-600 text-right">
                             {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stat.estimatedTotalAmount)}
                           </td>
                         </tr>
                       ))
                     )
                  ) : modalType === 'unpaid' ? (
                     unpaidList.length === 0 ? (
                       <tr>
                         <td colSpan={5} className="p-8 text-center text-gray-500 italic">Chưa có dữ liệu.</td>
                       </tr>
                     ) : (
                       unpaidList.map((item, idx) => {
                          const date = item.checkIn;
                          let dateStr = 'Chưa rõ';
                          if (date) {
                             const dateObj = date.toDate ? date.toDate() : new Date(date);
                             if (!isNaN(dateObj.getTime())) {
                                dateStr = dateObj.toLocaleDateString('vi-VN');
                             }
                          }
                          return (
                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="p-4 text-sm text-gray-600">{dateStr}</td>
                              <td className="p-4 text-sm font-bold text-gray-800">
                                <button
                                  onClick={() => navigate(`/dashboard/timesheets?expandId=${item.employeeId}`)}
                                  className="hover:text-blue-600 hover:underline transition-colors text-left"
                                >
                                  {item.employeeCode} - {item.employeeName}
                                </button>
                              </td>
                              <td className="p-4 text-sm text-gray-600">
                                {item.branchId && item.branchId !== 'unknown' ? (
                                  <button
                                    onClick={() => navigate(`/dashboard/payroll?branchId=${item.branchId}`)}
                                    className="hover:text-blue-600 hover:underline transition-colors text-left"
                                  >
                                    {item.branchName}
                                  </button>
                                ) : (
                                  item.branchName
                                )}
                              </td>
                              <td className="p-4 text-sm text-gray-600">
                                {formatHoursMinutes(item.hours)}
                              </td>
                              <td className="p-4 text-sm font-bold text-orange-600 text-right">
                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.amount)}
                              </td>
                            </tr>
                          );
                       })
                     )
                  ) : modalType === 'total_paid' ? (
                     [...payrollList, ...bonusList].length === 0 ? (
                       <tr>
                         <td colSpan={5} className="p-8 text-center text-gray-500 italic">Chưa có dữ liệu.</td>
                       </tr>
                     ) : (
                       [...payrollList, ...bonusList].sort((a, b) => {
                         const dateA = (a.paymentDate || a.createdAt)?.toDate ? (a.paymentDate || a.createdAt).toDate().getTime() : (a.paymentDate || a.createdAt ? new Date(a.paymentDate || a.createdAt).getTime() : 0);
                         const dateB = (b.paymentDate || b.createdAt)?.toDate ? (b.paymentDate || b.createdAt).toDate().getTime() : (b.paymentDate || b.createdAt ? new Date(b.paymentDate || b.createdAt).getTime() : 0);
                         return dateB - dateA;
                       }).map((item, idx) => {
                          const date = item.paymentDate || item.createdAt;
                          let dateStr = 'Chưa rõ';
                          if (date) {
                             const dateObj = date.toDate ? date.toDate() : new Date(date);
                             if (!isNaN(dateObj.getTime())) {
                                dateStr = `${dateObj.toLocaleDateString('vi-VN')} ${dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
                             }
                          }
                          const isBonus = item.reason !== undefined;
                          return (
                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="p-4 text-sm text-gray-600">{dateStr}</td>
                              <td className="p-4 text-sm font-bold text-gray-800">
                                <button
                                  onClick={() => navigate(`/dashboard/timesheets?expandId=${item.employeeId}`)}
                                  className="hover:text-blue-600 hover:underline transition-colors text-left"
                                >
                                  {item.employeeCode} - {item.employeeName}
                                </button>
                              </td>
                              <td className="p-4 text-sm text-gray-600">
                                {item.branchId && item.branchId !== 'unknown' ? (
                                  <button
                                    onClick={() => navigate(`/dashboard/payroll?branchId=${item.branchId}`)}
                                    className="hover:text-blue-600 hover:underline transition-colors text-left"
                                  >
                                    {item.branchName}
                                  </button>
                                ) : (
                                  item.branchName
                                )}
                              </td>
                              <td className="p-4 text-sm text-gray-600">
                                {isBonus ? `Thưởng: ${item.reason}` : `Lương: Tháng ${item.month}`}
                              </td>
                              <td className={`p-4 text-sm font-bold text-right ${isBonus ? 'text-green-600' : 'text-blue-600'}`}>
                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.amount)}
                              </td>
                            </tr>
                          );
                       })
                     )
                  ) : (modalType === 'payroll' ? payrollList : bonusList).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 italic">Chưa có dữ liệu.</td>
                    </tr>
                  ) : (
                    (modalType === 'payroll' ? payrollList : bonusList).map((item, idx) => {
                      const date = item.paymentDate || item.createdAt;
                      let dateStr = 'Chưa rõ';
                      if (date) {
                         const dateObj = date.toDate ? date.toDate() : new Date(date);
                         if (!isNaN(dateObj.getTime())) {
                            dateStr = `${dateObj.toLocaleDateString('vi-VN')} ${dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
                         }
                      }
                      
                      return (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="p-4 text-sm text-gray-600">{dateStr}</td>
                          <td className="p-4 text-sm font-bold text-gray-800">
                            <button
                              onClick={() => navigate(`/dashboard/timesheets?expandId=${item.employeeId}`)}
                              className="hover:text-blue-600 hover:underline transition-colors text-left"
                            >
                              {item.employeeCode} - {item.employeeName}
                            </button>
                          </td>
                          <td className="p-4 text-sm text-gray-600">
                            {item.branchId && item.branchId !== 'unknown' ? (
                              <button
                                onClick={() => navigate(`/dashboard/payroll?branchId=${item.branchId}`)}
                                className="hover:text-blue-600 hover:underline transition-colors text-left"
                              >
                                {item.branchName}
                              </button>
                            ) : (
                              item.branchName
                            )}
                          </td>
                          <td className="p-4 text-sm text-gray-600">
                            {modalType === 'payroll' ? `Tháng ${item.month}` : item.reason}
                          </td>
                          <td className={`p-4 text-sm font-bold text-right ${modalType === 'payroll' ? 'text-blue-600' : 'text-green-600'}`}>
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.amount)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 bg-gray-100 shadow-[0_-1px_0_0_#e5e7eb] z-10 border-t border-gray-300">
                  {modalType === 'estimate' ? (
                    <tr>
                      <td className="p-4 font-bold text-gray-800 text-right">Tổng cộng:</td>
                      <td className="p-4 font-bold text-blue-600 text-right">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(branchStats.reduce((sum, b) => sum + (b.totalAmount || 0), 0))}
                      </td>
                      <td className="p-4 font-bold text-indigo-600 text-right">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(branchStats.reduce((sum, b) => sum + (b.estimatedTotalAmount || 0), 0))}
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-4 font-bold text-gray-800 text-right">Tổng cộng:</td>
                      <td className={`p-4 font-bold text-right ${modalType === 'unpaid' ? 'text-orange-600' : modalType === 'payroll' ? 'text-blue-600' : modalType === 'bonus' ? 'text-green-600' : 'text-indigo-600'}`}>
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                          modalType === 'unpaid' ? unpaidList.reduce((sum, item) => sum + (item.amount || 0), 0) :
                          modalType === 'total_paid' ? [...payrollList, ...bonusList].reduce((sum, item) => sum + (item.amount || 0), 0) :
                          modalType === 'payroll' ? payrollList.reduce((sum, item) => sum + (item.amount || 0), 0) :
                          bonusList.reduce((sum, item) => sum + (item.amount || 0), 0)
                        )}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
            
            <div className="p-4 border-t border-gray-200 bg-gray-50 text-right">
              <button
                onClick={() => setModalType(null)}
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
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

export default Reports;

