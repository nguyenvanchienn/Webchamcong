import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Branches from './pages/Branches';
import Employees from './pages/Employees';
import Accounts from './pages/Accounts';
import Attendance from './pages/Attendance';

import Schedules from './pages/Schedules';
import Timesheets from './pages/Timesheets';
import Payroll from './pages/Payroll';
import Reports from './pages/Reports';
import Export from './pages/Export';
import Settings from './pages/Settings';
import EmployeeDashboard from './pages/EmployeeDashboard';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import ForceChangePassword from './pages/ForceChangePassword';

import Kiosk from './pages/Kiosk';
import POS from './pages/POS';
import CustomerOrder from './pages/CustomerOrder';
import MenuManager from './pages/MenuManager';
import Revenue from './pages/Revenue';
import TableManager from './pages/TableManager';
import TableOrder from './pages/TableOrder';

const RoleBasedDashboard = () => {
  const role = localStorage.getItem('userRole') || 'EMPLOYEE';
  if (role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN') {
    return <Dashboard />;
  }
  return <EmployeeDashboard />;
};

function App() {
  return (
    <>
      <Toaster position="top-right" />
      <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/force-change-password" element={<ForceChangePassword />} />
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/customer-order" element={<CustomerOrder />} />
        <Route path="/order/:branchId/:tableId" element={<TableOrder />} />
        
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<RoleBasedDashboard />} />
          <Route path="branches" element={<Branches />} />
          <Route path="tables" element={<TableManager />} />
          <Route path="employees" element={<Employees />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="schedules" element={<Schedules />} />
          <Route path="timesheets" element={<Timesheets />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} />
          <Route path="reports" element={<Reports />} />
          <Route path="export" element={<Export />} />
          <Route path="settings" element={<Settings />} />
          <Route path="menu" element={<MenuManager />} />
          <Route path="revenue" element={<Revenue />} />
          <Route path="orders" element={<Revenue />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
