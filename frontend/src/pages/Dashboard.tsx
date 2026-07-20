import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Building2, UserCheck, Clock } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import EmployeeDashboard from './EmployeeDashboard';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem('userRole');
  const [activeTab, setActiveTab] = useState<'admin' | 'personal'>(
    userRole === 'BRANCH_ADMIN' ? 'personal' : 'admin'
  );

  const [stats, setStats] = useState<any[]>([
    { title: 'Tổng số cơ sở', value: 0, icon: <Building2 className="text-blue-500" size={32} /> },
    { title: 'Tổng nhân viên', value: 0, icon: <Users className="text-green-500" size={32} /> },
    { title: 'Đang làm việc', value: 0, icon: <UserCheck className="text-purple-500" size={32} /> },
    { title: 'Đi trễ hôm nay', value: 0, icon: <Clock className="text-orange-500" size={32} /> },
  ]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [todaySchedules, setTodaySchedules] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const userRole = localStorage.getItem('userRole');
        const currentUserEmployeeId = localStorage.getItem('employeeId');

        const branchesSnap = await getDocs(collection(db, 'branches'));
        const employeesSnap = await getDocs(collection(db, 'employees'));
        
        let currentUserBranchId = '';
        if (currentUserEmployeeId) {
          employeesSnap.forEach(doc => {
            if (doc.id === currentUserEmployeeId) {
              currentUserBranchId = doc.data().branchId;
            }
          });
        }

        let totalEmployees = 0;
        let totalBranches = branchesSnap.size;

        if (userRole === 'BRANCH_ADMIN') {
          totalBranches = 1;
          employeesSnap.forEach(doc => {
            if (doc.id !== currentUserEmployeeId && doc.data().branchId === currentUserBranchId) {
              totalEmployees++;
            }
          });
        } else {
          employeesSnap.forEach(doc => {
            if (doc.id !== currentUserEmployeeId) {
              totalEmployees++;
            }
          });
        }

        const today = new Date().toLocaleDateString('en-CA');
        const attQuery = query(collection(db, 'attendance'), where('date', '==', today));
        const attSnap = await getDocs(attQuery);
        
        let workingCount = 0;
        let lateCount = 0;
        const activities: any[] = [];
        
        attSnap.forEach(doc => {
          const data = doc.data();
          if (userRole === 'BRANCH_ADMIN' && data.branchId !== currentUserBranchId) return;

          if (!data.checkOut) workingCount++; // Đang làm việc (chưa check-out)
          if (data.status.includes('Đi muộn')) lateCount++;
          
          if (data.checkIn) {
            activities.push({
              id: doc.id,
              employeeName: data.employeeName,
              branchName: data.branchName,
              time: data.checkIn.toDate(),
              type: 'CHECK_IN'
            });
          }
          if (data.checkOut) {
            activities.push({
              id: doc.id + '_out',
              employeeName: data.employeeName,
              branchName: data.branchName,
              time: data.checkOut.toDate(),
              type: 'CHECK_OUT'
            });
          }
        });

        // Sort activities by time descending
        activities.sort((a, b) => b.time.getTime() - a.time.getTime());
        setRecentActivities(activities.slice(0, 5)); // Lấy 5 hoạt động gần nhất

        // Lấy lịch trình hôm nay
        const schedQuery = query(collection(db, 'schedules'), where('date', '==', today));
        const schedSnap = await getDocs(schedQuery);
        const schedules: any[] = [];
        schedSnap.forEach(doc => {
          const data = doc.data();
          if (userRole === 'BRANCH_ADMIN' && data.branchId !== currentUserBranchId) return;
          schedules.push({ id: doc.id, ...data });
        });
        setTodaySchedules(schedules);

        setStats([
          { title: userRole === 'BRANCH_ADMIN' ? 'Cơ sở quản lý' : 'Tổng số cơ sở', value: totalBranches, icon: <Building2 className="text-blue-500" size={32} />, path: '' },
          { title: 'Tổng nhân viên', value: totalEmployees, icon: <Users className="text-green-500" size={32} />, path: '/dashboard/employees' },
          { title: 'Đang làm việc', value: workingCount, icon: <UserCheck className="text-purple-500" size={32} />, path: '/dashboard/attendance' },
          { title: 'Đi trễ hôm nay', value: lateCount, icon: <Clock className="text-orange-500" size={32} />, path: '/dashboard/attendance' },
        ]);
      } catch (error) {
        console.error("Lỗi lấy thống kê:", error);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {userRole === 'BRANCH_ADMIN' && (
        <div className="flex border-b border-gray-200 bg-white px-2 rounded-t-xl pt-2">
          <button 
            className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'personal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('personal')}
          >
            Không gian Cá nhân
          </button>
          <button 
            className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'admin' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('admin')}
          >
            Tổng quan Quản lý
          </button>
        </div>
      )}

      <div className={activeTab === 'personal' ? 'hidden' : 'space-y-6'}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, idx) => (
          <div 
            key={idx} 
            onClick={() => stat.path && navigate(stat.path)}
            className={`bg-white rounded-xl shadow-sm p-6 flex items-center justify-between border border-gray-100 hover:shadow-md transition-all ${stat.path ? 'cursor-pointer hover:scale-[1.02]' : ''}`}
          >
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.title}</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">{stat.value}</h3>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              {stat.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Hoạt động gần đây</h3>
          {recentActivities.length === 0 ? (
            <p className="text-gray-500 italic text-sm">Chưa có hoạt động nào...</p>
          ) : (
            <div className="space-y-4">
              {recentActivities.map(act => (
                <div key={act.id} className="flex items-start space-x-3">
                  <div className={`p-2 rounded-full ${act.type === 'CHECK_IN' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                    <UserCheck size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {act.employeeName} <span className="font-normal text-gray-500">đã {act.type === 'CHECK_IN' ? 'Check-in' : 'Check-out'}</span>
                    </p>
                    <p className="text-xs text-gray-500">{act.time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} • {act.branchName}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Lịch trình hôm nay</h3>
          {todaySchedules.length === 0 ? (
            <p className="text-gray-500 italic text-sm">Chưa có lịch trình...</p>
          ) : (
            <div className="space-y-3">
              {todaySchedules.map(sched => (
                <div key={sched.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-lg bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{sched.employeeName}</p>
                    <p className="text-xs text-blue-600 font-medium">{sched.shift}</p>
                  </div>
                  <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border">Ca làm việc</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>

      {activeTab === 'personal' && userRole === 'BRANCH_ADMIN' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1">
          <EmployeeDashboard />
        </div>
      )}
    </div>
  );
};

export default Dashboard;

