import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { 
  LayoutDashboard, Building2, Users, UserCog, 
  Clock, CalendarDays, ClipboardList, Wallet, 
  BarChart3, FileSpreadsheet, Settings, LogOut, UserCircle, Bell, ChevronLeft, ChevronRight
} from 'lucide-react';

const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const userRole = localStorage.getItem('userRole') || 'EMPLOYEE';
  const userEmail = localStorage.getItem('userEmail') || 'User';
  const employeeId = localStorage.getItem('employeeId');

  const [displayName, setDisplayName] = useState(userEmail);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    const fetchName = async () => {
      if (employeeId) {
        try {
          const empDoc = await getDoc(doc(db, 'employees', employeeId));
          if (empDoc.exists() && empDoc.data().fullName) {
            setDisplayName(empDoc.data().fullName);
          }
        } catch (error) {
          console.error(error);
        }
      } else if (userRole === 'SUPER_ADMIN') {
        setDisplayName('Quản trị viên');
      }
    };
    fetchName();
  }, [employeeId, userRole]);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    try {
      await signOut(auth);
      localStorage.clear();
      navigate('/login');
    } catch (error) {
      console.error('Lỗi đăng xuất:', error);
    }
  };

  const allMenuItems = [
    { name: 'Trang chủ', path: '/dashboard', icon: <LayoutDashboard size={20} />, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'EMPLOYEE'] },
    { name: 'Quản lý cơ sở', path: '/dashboard/branches', icon: <Building2 size={20} />, roles: ['SUPER_ADMIN'] },
    { name: 'Quản lý nhân viên', path: '/dashboard/employees', icon: <Users size={20} />, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
    { name: 'Quản lý tài khoản', path: '/dashboard/accounts', icon: <UserCog size={20} />, roles: ['SUPER_ADMIN'] },
    { name: 'Chấm công (Admin)', path: '/dashboard/attendance', icon: <Clock size={20} />, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
    { name: 'Lịch làm việc', path: '/dashboard/schedules', icon: <CalendarDays size={20} />, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'EMPLOYEE'] },
    { name: 'Bảng công', path: '/dashboard/timesheets', icon: <ClipboardList size={20} />, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
    { name: 'Bảng lương', path: '/dashboard/payroll', icon: <Wallet size={20} />, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'EMPLOYEE'] },
    { name: 'Thông báo', path: '/dashboard/notifications', icon: <Bell size={20} />, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'EMPLOYEE'] },
    { name: 'Hồ sơ cá nhân', path: '/dashboard/profile', icon: <UserCircle size={20} />, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'EMPLOYEE'] },
    { name: 'Báo cáo', path: '/dashboard/reports', icon: <BarChart3 size={20} />, roles: ['SUPER_ADMIN'] },
    { name: 'Xuất Excel', path: '/dashboard/export', icon: <FileSpreadsheet size={20} />, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
    { name: 'Thiết lập', path: '/dashboard/settings', icon: <Settings size={20} />, roles: ['SUPER_ADMIN'] },
  ];

  const menuItems = allMenuItems.filter(item => item.roles.includes(userRole));

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white shadow-lg flex flex-col transition-all duration-300 relative`}>
        {/* Toggle Button */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-6 bg-white border border-gray-200 rounded-full p-1 shadow-md text-gray-500 hover:text-blue-600 z-50 flex items-center justify-center"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="h-16 flex flex-col items-center justify-center border-b border-gray-200">
          {isSidebarCollapsed ? (
            <h1 className="text-xl font-bold text-blue-600">CC</h1>
          ) : (
            <>
              <h1 className="text-xl font-bold text-blue-600">Chấm Công Pro</h1>
              <span className="text-xs text-gray-500 font-medium">{userRole}</span>
            </>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-2">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={isSidebarCollapsed ? item.name : ''}
                  className={`flex items-center py-3 text-sm font-medium rounded-lg transition-colors ${
                    isActive 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  } ${isSidebarCollapsed ? 'justify-center px-0' : 'px-4'}`}
                >
                  <span className={`${isSidebarCollapsed ? '' : 'mr-3'} ${isActive ? 'text-blue-700' : 'text-gray-400'}`}>
                    {item.icon}
                  </span>
                  {!isSidebarCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            title={isSidebarCollapsed ? "Đăng xuất" : ""}
            className={`flex items-center w-full py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors ${isSidebarCollapsed ? 'justify-center px-0' : 'px-4'}`}
          >
            <LogOut size={20} className={isSidebarCollapsed ? '' : 'mr-3'} />
            {!isSidebarCollapsed && <span>Đăng xuất</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-6 z-10">
          <h2 className="text-lg font-semibold text-gray-800">
            {menuItems.find(i => i.path === location.pathname)?.name || 'Hệ thống'}
          </h2>
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-600">{displayName}</span>
            <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold uppercase">
              {displayName.charAt(0)}
            </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all">
          <div className="bg-white rounded-2xl p-6 w-[400px] shadow-2xl scale-100 transform transition-transform">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Đăng xuất khỏi hệ thống</h3>
            <p className="text-gray-600 mb-6">Bạn có chắc chắn muốn đăng xuất không? Phiên làm việc của bạn sẽ được đóng lại.</p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setShowLogoutModal(false)}
                className="px-5 py-2.5 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={confirmLogout}
                className="px-5 py-2.5 rounded-xl font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md shadow-red-200"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;
