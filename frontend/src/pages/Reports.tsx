import React, { useState, useEffect } from 'react';
import { BarChart3, Building2, Wallet } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [branchStats, setBranchStats] = useState<any[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        // Fetch branches
        const branchesSnap = await getDocs(collection(db, 'branches'));
        const branches: Record<string, string> = {};
        branchesSnap.forEach(d => {
          branches[d.id] = d.data().name;
        });

        // Fetch employees to map to branches
        const empSnap = await getDocs(collection(db, 'employees'));
        const empBranchMap: Record<string, string> = {};
        empSnap.forEach(d => {
          empBranchMap[d.id] = d.data().branchId;
        });

        // Fetch payroll history
        const payrollSnap = await getDocs(collection(db, 'payroll_history'));
        const branchTotals: Record<string, number> = {};
        let total = 0;

        payrollSnap.forEach(d => {
          const data = d.data();
          const amount = data.amount || 0;
          total += amount;

          const branchId = empBranchMap[data.employeeId] || 'unknown';
          if (!branchTotals[branchId]) branchTotals[branchId] = 0;
          branchTotals[branchId] += amount;
        });

        setTotalPaid(total);

        const statsList = Object.keys(branchTotals).map(bId => ({
          branchName: branches[bId] || 'Chưa phân bổ',
          totalAmount: branchTotals[bId]
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-sm p-6 text-white border border-blue-400">
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
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h3 className="font-bold text-gray-800 flex items-center">
            <Building2 size={18} className="mr-2 text-gray-500" />
            Chi phí lương theo Cơ sở
          </h3>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="p-4 font-semibold text-gray-600 text-sm">Cơ sở</th>
              <th className="p-4 font-semibold text-gray-600 text-sm text-right">Tổng chi phí</th>
            </tr>
          </thead>
          <tbody>
            {branchStats.length === 0 ? (
              <tr>
                <td colSpan={2} className="p-8 text-center text-gray-500 italic">Chưa có dữ liệu thanh toán lương.</td>
              </tr>
            ) : (
              branchStats.map((stat, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4 text-sm font-medium text-gray-800">{stat.branchName}</td>
                  <td className="p-4 text-sm font-bold text-blue-600 text-right">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stat.totalAmount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reports;
