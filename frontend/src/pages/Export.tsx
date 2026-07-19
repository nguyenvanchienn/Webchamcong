import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';

const formatHours = (decimalHours: number) => {
  if (!decimalHours || decimalHours === 0) return '0 giờ 0 phút 0 giây';
  const totalSeconds = Math.round(decimalHours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h} giờ ${m} phút ${s} giây`;
};

const Export: React.FC = () => {
  const [month, setMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [exporting, setExporting] = useState(false);
  const [filterBranchId, setFilterBranchId] = useState('ALL');
  const [branches, setBranches] = useState<any[]>([]);
  const userRole = localStorage.getItem('userRole');
  const currentUserBranchId = localStorage.getItem('branchId');

  useEffect(() => {
    if (userRole === 'SUPER_ADMIN') {
      const fetchBranches = async () => {
        try {
          const snap = await getDocs(collection(db, 'branches'));
          const list: any[] = [];
          snap.forEach(d => list.push({ id: d.id, ...d.data() }));
          setBranches(list);
        } catch (err) {
          console.error(err);
        }
      };
      fetchBranches();
    }
  }, [userRole]);

  const handleExport = async () => {
    setExporting(true);
    try {
      // 1. Get employees
      const empSnap = await getDocs(collection(db, 'employees'));
      const employees: Record<string, any> = {};
      empSnap.forEach(d => {
        const data = d.data();
        if (userRole === 'BRANCH_ADMIN' && data.branchId !== currentUserBranchId) return;
        if (userRole === 'SUPER_ADMIN' && filterBranchId !== 'ALL' && data.branchId !== filterBranchId) return;
        employees[d.id] = { id: d.id, ...data };
      });

      // 2. Get attendance for the selected month
      const [year, m] = month.split('-');
      const startDate = `${year}-${m}-01`;
      const endDate = new Date(parseInt(year), parseInt(m), 0).toLocaleDateString('en-CA');
      
      const attQuery = query(
        collection(db, 'attendance'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      const attSnap = await getDocs(attQuery);
      
      const summary: Record<string, any> = {};
      
      Object.values(employees).forEach(emp => {
        summary[emp.id] = {
          id: emp.employeeCode || emp.id,
          name: emp.fullName,
          role: emp.position || 'Nhân viên',
          branch: emp.branchName,
          salaryPerHour: emp.salaryPerHour || 0,
          totalHours: 0,
          totalShifts: 0,
          totalEarned: 0,
          bonus: 0,
          penalty: 0
        };
      });

      attSnap.forEach(d => {
        const data = d.data();
        if (data.employeeId && summary[data.employeeId] && data.checkIn && data.checkOut) {
           const inTime = data.checkIn.toDate();
           const outTime = data.checkOut.toDate();
           const hours = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
           
           summary[data.employeeId].totalHours += hours;
           summary[data.employeeId].totalShifts += 1;
           summary[data.employeeId].totalEarned += (hours * summary[data.employeeId].salaryPerHour);
        }
      });

      // 3. Format data for Excel
      // 3. Format data for Excel
      const excelData = Object.values(summary).map((item, index) => ({
        'STT': index + 1,
        'ID Nhân viên': item.id,
        'Họ và Tên': item.name,
        'Chức vụ': item.role,
        'Cơ sở': item.branch,
        'Số ca làm': item.totalShifts,
        'Tổng số giờ': formatHours(item.totalHours),
        'Mức lương (VNĐ/h)': new Intl.NumberFormat('vi-VN').format(item.salaryPerHour),
        'Tiền thưởng (VNĐ)': new Intl.NumberFormat('vi-VN').format(item.bonus),
        'Tiền phạt (VNĐ)': new Intl.NumberFormat('vi-VN').format(item.penalty),
        'Tổng thu nhập (VNĐ)': new Intl.NumberFormat('vi-VN').format(Math.round(item.totalEarned + item.bonus - item.penalty))
      }));

      if (excelData.length === 0) {
        toast.error('Không có dữ liệu để xuất trong tháng này!');
        setExporting(false);
        return;
      }

      // 4. Create Workbook
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      const colWidths = [
        { wch: 5 },  // STT
        { wch: 20 }, // ID NV
        { wch: 25 }, // Tên
        { wch: 15 }, // Chức vụ
        { wch: 20 }, // Cơ sở
        { wch: 15 }, // Số ca
        { wch: 30 }, // Số giờ
        { wch: 20 }, // Mức lương
        { wch: 20 }, // Tiền thưởng
        { wch: 20 }, // Tiền phạt
        { wch: 25 }, // Tổng thu nhập
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Lương T${m}-${year}`);

      XLSX.writeFile(workbook, `Bang_Luong_Thang_${m}_${year}.xlsx`);
      toast.success('Xuất file thành công!');
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra khi xuất file!');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 flex items-center">
          <FileSpreadsheet className="mr-2 text-green-600" /> Xuất Dữ Liệu (Excel)
        </h2>
        <p className="text-sm text-gray-500 mt-1">Xuất Bảng công và Bảng lương ra file Excel .xlsx để lưu trữ.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 max-w-2xl mx-auto flex flex-col items-center">
        <div className="p-5 bg-green-50 rounded-full mb-6">
          <FileSpreadsheet size={48} className="text-green-500" />
        </div>
        
        <div className="w-full max-w-sm space-y-4 text-center">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-left">Chọn tháng xuất dữ liệu</label>
            <input 
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-green-500 text-gray-700 font-medium bg-gray-50 text-center"
            />
          </div>

          {userRole === 'SUPER_ADMIN' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-left">Chọn cơ sở xuất dữ liệu</label>
              <select 
                value={filterBranchId}
                onChange={(e) => setFilterBranchId(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-green-500 text-gray-700 font-medium bg-gray-50 text-center"
              >
                <option value="ALL">Tất cả cơ sở</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <button 
            onClick={handleExport}
            disabled={exporting}
            className={`w-full py-3 rounded-xl font-bold text-white shadow-sm transition-all flex justify-center items-center ${
              exporting 
                ? 'bg-green-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
            }`}
          >
            {exporting ? (
              'Đang xử lý...'
            ) : (
              <>
                <Download size={20} className="mr-2" />
                Xuất file Bảng Lương
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Export;
