import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { 
  LayoutDashboard, Building2, Users, UserCog, 
  Clock, CalendarDays, ClipboardList, Wallet, 
  BarChart3, FileSpreadsheet, Settings, LogOut, UserCircle, Bell, ChevronLeft, ChevronRight, Menu, X
} from 'lucide-react';

const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const userRole = localStorage.getItem('userRole') || 'EMPLOYEE';
  const userEmail = localStorage.getItem('userEmail') || 'User';
  const employeeId = localStorage.getItem('employeeId');

  const [displayName, setDisplayName] = useState(userEmail);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!employeeId) return;
    const q = query(
      collection(db, 'notifications'), 
      where('employeeId', '==', employeeId), 
      where('read', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      setUnreadCount(snap.docs.length);
    });
    return () => unsub();
  }, [employeeId]);

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
      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-50 transform 
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 transition-transform duration-300 ease-in-out
        ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64'} 
        w-64 bg-white shadow-lg flex flex-col h-full
      `}>
        {/* Mobile close button */}
        <button
          className="md:hidden absolute top-4 right-4 text-gray-500 hover:text-gray-800"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <X size={24} />
        </button>

        {/* Toggle Button for Desktop */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden md:flex absolute -right-3 top-6 bg-white border border-gray-200 rounded-full p-1 shadow-md text-gray-500 hover:text-blue-600 z-50 items-center justify-center"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="h-16 flex flex-col items-center justify-center border-b border-gray-200 mt-2 md:mt-0">
          {isSidebarCollapsed ? (
            <h1 className="hidden md:block text-xl font-bold text-blue-600">CC</h1>
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
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center py-3 text-sm font-medium rounded-lg transition-colors relative ${
                    isActive 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  } ${isSidebarCollapsed ? 'md:justify-center px-4 md:px-0' : 'px-4'}`}
                >
                  <span className={`${isSidebarCollapsed ? 'md:mr-0 mr-3' : 'mr-3'} relative ${isActive ? 'text-blue-700' : 'text-gray-400'}`}>
                    {item.icon}
                    {item.path === '/dashboard/notifications' && unreadCount > 0 && isSidebarCollapsed && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                    )}
                  </span>
                  <span className={`${isSidebarCollapsed ? 'md:hidden' : ''} flex-1`}>{item.name}</span>
                  {item.path === '/dashboard/notifications' && unreadCount > 0 && !isSidebarCollapsed && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto md:mr-0 mr-2 shadow-sm">
                      {unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            title={isSidebarCollapsed ? "Đăng xuất" : ""}
            className={`flex items-center w-full py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors ${isSidebarCollapsed ? 'md:justify-center px-4 md:px-0' : 'px-4'}`}
          >
            <LogOut size={20} className={isSidebarCollapsed ? 'md:mr-0 mr-3' : 'mr-3'} />
            <span className={`${isSidebarCollapsed ? 'md:hidden' : ''}`}>Đăng xuất</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-4 md:px-6 z-10">
          <div className="flex items-center">
            <button 
              className="md:hidden mr-3 text-gray-600 hover:text-blue-600 focus:outline-none relative"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
              )}
            </button>
            <h2 className="text-lg font-semibold text-gray-800 truncate max-w-[150px] sm:max-w-xs md:max-w-none">
              {menuItems.find(i => i.path === location.pathname)?.name || 'Hệ thống'}
            </h2>
          </div>
          <div className="flex items-center space-x-2 md:space-x-4">
            <span className="text-sm font-medium text-gray-600 hidden sm:block">{displayName}</span>
            <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold uppercase shrink-0">
              {displayName.charAt(0)}
            </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl scale-100 transform transition-transform">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Đăng xuất khỏi hệ thống</h3>
            <p className="text-gray-600 mb-6 text-sm md:text-base">Bạn có chắc chắn muốn đăng xuất không? Phiên làm việc của bạn sẽ được đóng lại.</p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 md:px-5 md:py-2.5 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors text-sm md:text-base"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={confirmLogout}
                className="px-4 py-2 md:px-5 md:py-2.5 rounded-xl font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md shadow-red-200 text-sm md:text-base"
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
