import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ClipboardList, Calendar, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  branchName: string;
  branchId?: string;
  date: string;
  checkIn: any;
  checkOut: any;
  status: string;
}

interface TimesheetSummary {
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  branchName: string;
  branches: Set<string>;
  totalHours: number;
  shiftsPresent: number;
  records: AttendanceRecord[];
}

const formatHours = (decimalHours: number) => {
  if (!decimalHours || decimalHours === 0) return '0h 0m';
  const totalSeconds = Math.round(decimalHours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
};

const Timesheets: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [summaries, setSummaries] = useState<TimesheetSummary[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  
  const [filterBranchId, setFilterBranchId] = useState<string>('ALL');
  const [branches, setBranches] = useState<any[]>([]);
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

  const fetchTimesheets = async () => {
    setLoading(true);
    try {
      // Tìm theo tháng (VD: 2023-10) -> date >= 2023-10-01 và date <= 2023-10-31
      const startDate = `${month}-01`;
      const endDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
      const endDate = `${month}-${endDay}`;

      const attQuery = query(
        collection(db, 'attendance'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );

      const snap = await getDocs(attQuery);
      const records: AttendanceRecord[] = [];
      snap.forEach(doc => {
        records.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
      });

      const empSnap = await getDocs(collection(db, 'employees'));
      const empMap: Record<string, string> = {};
      let currentUserBranchId = '';
      let currentUserBranchName = '';

      const allEmps: Record<string, any> = {};

      empSnap.forEach(d => {
        empMap[d.id] = d.data().employeeCode;
        allEmps[d.id] = d.data();
        if (d.id === currentEmployeeId) {
          currentUserBranchId = d.data().branchId;
          currentUserBranchName = d.data().branchName;
        }
      });

      // Group theo nhân viên
      const summaryMap: Record<string, TimesheetSummary> = {};

      records.forEach(r => {
        let belongsToAdmin = false;
        
        // Filter by current branch of the employee instead of where the shift was recorded
        const employeeCurrentBranchId = allEmps[r.employeeId]?.branchId;

        if (userRole === 'SUPER_ADMIN') {
          if (filterBranchId === 'ALL') {
            belongsToAdmin = true;
          } else {
            if (employeeCurrentBranchId === filterBranchId) belongsToAdmin = true;
          }
        } else if (userRole === 'BRANCH_ADMIN') {
          if (r.branchId) {
            if (r.branchId === currentUserBranchId) belongsToAdmin = true;
          } else {
            if (r.branchName === currentUserBranchName) belongsToAdmin = true;
          }
        } else {
          if (r.employeeId === currentEmployeeId) belongsToAdmin = true;
        }

        if (!belongsToAdmin) return;

        const groupKey = r.employeeId;
        if (!summaryMap[groupKey]) {
          summaryMap[groupKey] = {
            employeeId: r.employeeId,
            employeeName: r.employeeName,
            employeeCode: empMap[r.employeeId],
            branchName: allEmps[r.employeeId]?.branchName || r.branchName,
            branches: new Set<string>(),
            totalHours: 0,
            shiftsPresent: 0,
            records: []
          };
        }

        if (r.branchName) summaryMap[groupKey].branches.add(r.branchName);
        summaryMap[groupKey].records.push(r);
        summaryMap[groupKey].shiftsPresent += 1;

        if (r.checkIn && r.checkOut) {
          const inTime = r.checkIn.toDate();
          const outTime = r.checkOut.toDate();
          const hours = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
          summaryMap[groupKey].totalHours += hours;
        }
      });

      // Sort records for each employee by date
      Object.values(summaryMap).forEach(s => {
        s.records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });

      const summaryList = Object.values(summaryMap).sort((a, b) => b.totalHours - a.totalHours);
      setSummaries(summaryList);
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi tải bảng công');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimesheets();
  }, [month, filterBranchId]);

  const toggleRow = (empId: string) => {
    if (expandedRow === empId) setExpandedRow(null);
    else setExpandedRow(empId);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center">
            <ClipboardList className="mr-2 text-blue-600" /> Bảng Công Tổng Hợp
          </h2>
          <p className="text-sm text-gray-500 mt-1">Quản lý và theo dõi giờ làm việc của nhân viên theo tháng.</p>
        </div>
        
        <div className="flex items-center space-x-3">
          {userRole === 'SUPER_ADMIN' && (
            <select
              value={filterBranchId}
              onChange={(e) => setFilterBranchId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">Đang tải dữ liệu...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 font-semibold text-gray-600 text-sm w-10"></th>
                  <th className="p-4 font-semibold text-gray-600 text-sm">Nhân viên</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm text-center">Số ca đi làm</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm text-center">Tổng giờ làm</th>
                </tr>
              </thead>
              <tbody>
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500 italic">Không có dữ liệu chấm công cho tháng này.</td>
                  </tr>
                ) : (
                  summaries.map((summary, idx) => {
                    const displayBranch = summary.branchName;
                    return (
                    <React.Fragment key={`${summary.employeeId}_${idx}`}>
                      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => toggleRow(summary.employeeId)}>
                        <td className="p-4 text-gray-400">
                          {expandedRow === summary.employeeId ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </td>
                        <td className="p-4 text-sm font-bold text-gray-800">
                          [{summary.employeeCode || 'No ID'}] {summary.employeeName}
                        </td>
                        <td className="p-4 text-sm text-gray-600">{displayBranch}</td>
                        <td className="p-4 text-sm text-center font-medium text-blue-600">{summary.shiftsPresent} ca</td>
                        <td className="p-4 text-sm text-center font-bold text-gray-700">{formatHours(summary.totalHours)}</td>
                      </tr>
                      
                      {/* Chi tiết từng ngày */}
                      {expandedRow === summary.employeeId && (
                        <tr className="bg-blue-50/30">
                          <td colSpan={5} className="p-0">
                            <div className="p-6 border-b border-gray-100">
                              <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                                <Calendar size={16} className="mr-2 text-blue-500" /> Chi tiết chấm công tháng {month.split('-')[1]}
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {summary.records.map(r => {
                                  const inTime = r.checkIn ? r.checkIn.toDate().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                                  const outTime = r.checkOut ? r.checkOut.toDate().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                                  
                                  let rowHours = 0;
                                  if (r.checkIn && r.checkOut) {
                                    rowHours = (r.checkOut.toDate().getTime() - r.checkIn.toDate().getTime()) / (1000 * 60 * 60);
                                  }

                                  return (
                                    <div key={r.id} className="bg-white p-3 rounded border border-gray-200 shadow-sm flex flex-col">
                                      <div className="flex justify-between items-center mb-2">
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-gray-800">{new Date(r.date).toLocaleDateString('vi-VN')}</span>
                                          <span className="text-[10px] text-gray-500">{r.branchName}</span>
                                        </div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                          r.status.includes('Đi muộn') ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                                        }`}>
                                          {r.status}
                                        </span>
                                      </div>
                                      <div className="flex items-center text-xs text-gray-600 space-x-4">
                                        <div className="flex items-center"><Clock size={12} className="mr-1 text-gray-400"/> In: {inTime}</div>
                                        <div className="flex items-center"><Clock size={12} className="mr-1 text-gray-400"/> Out: {outTime}</div>
                                      </div>
                                      {rowHours > 0 && (
                                        <div className="mt-2 text-right text-xs font-semibold text-blue-600">
                                          +{formatHours(rowHours)}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Timesheets;

