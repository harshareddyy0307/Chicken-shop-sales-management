import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { DateProvider } from './context/DateContext';
import { Layout } from './components/Layout';

// Pages
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { DailyClosing } from './pages/DailyClosing';
import { ChickenSales } from './pages/ChickenSales';
import { StockManagement } from './pages/StockManagement';
import { DistributorSupplyPage } from './pages/DistributorSupply';
import { DistributorRecordsPage } from './pages/DistributorRecords';
import { CustomerKathaPage } from './pages/CustomerKatha';
import { CustomerBillingPage } from './pages/CustomerBilling';
import { OperatingExpensesPage } from './pages/OperatingExpenses';
import { ReportsPage } from './pages/Reports';
import { AuditLogPage } from './pages/AuditLog';
import { UserManagementPage } from './pages/UserManagement';
import { SettingsPage } from './pages/Settings';

const ProtectedRoute: React.FC<{ children: React.ReactNode; requiredRoles?: string[] }> = ({
  children,
  requiredRoles,
}) => {
  const { user, isAuthenticated, isLoading, hasRole } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && !hasRole(...requiredRoles)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <DateProvider>
            <Routes>
              {/* Public Login Route */}
              <Route path="/login" element={<Login />} />

              {/* Protected App Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="closing" element={<DailyClosing />} />
                <Route path="sales" element={<ChickenSales />} />
                <Route path="stock" element={<StockManagement />} />
                <Route path="distributor-supply" element={<DistributorSupplyPage />} />
                <Route path="distributor-records" element={<DistributorRecordsPage />} />
                <Route path="customer-katha" element={<CustomerKathaPage />} />
                <Route path="customer-billing" element={<CustomerBillingPage />} />
                <Route path="expenses" element={<OperatingExpensesPage />} />
                <Route path="reports" element={<ReportsPage />} />

                {/* Owner / Admin Only Pages */}
                <Route
                  path="audit-logs"
                  element={
                    <ProtectedRoute requiredRoles={['owner', 'admin']}>
                      <AuditLogPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="users"
                  element={
                    <ProtectedRoute requiredRoles={['owner', 'admin']}>
                      <UserManagementPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </DateProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
