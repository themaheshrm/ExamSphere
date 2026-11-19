import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import ProtectedRoute from './ProtectedRoute';
import LoginPage from '../pages/auth/LoginPage';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage';
import ComponentShowcase from '../pages/design-system/ComponentShowcase';
import AdminDashboard from '../pages/admin/AdminDashboard';
import ExamManagementPage from '../pages/admin/ExamManagementPage';
import QuestionBankPage from '../pages/admin/QuestionBankPage';
import SuperAdminDashboard from '../pages/super-admin/SuperAdminDashboard';
import OrganizationsPage from '../pages/super-admin/OrganizationsPage';
import SystemSettingsPage from '../pages/super-admin/SystemSettingsPage';
import { USER_ROLES } from '../utils/constants';

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Authentication Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Main Application Shell */}
        <Route element={<DashboardLayout />}>
          {/* Default entry point redirects to login */}
          <Route index element={<Navigate to="/login" replace />} />

          {/* Design System Specification & Showcase (Public for UI verification) */}
          <Route path="design-system" element={<ComponentShowcase />} />

          {/* Protected Institution Admin Routes */}
          <Route
            element={
              <ProtectedRoute
                allowedRoles={[USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]}
              />
            }
          >
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="admin/exams" element={<ExamManagementPage />} />
            <Route path="admin/questions" element={<QuestionBankPage />} />
          </Route>

          {/* Protected Super Admin Enterprise Routes */}
          <Route
            element={
              <ProtectedRoute allowedRoles={[USER_ROLES.SUPER_ADMIN]} />
            }
          >
            <Route path="super-admin" element={<SuperAdminDashboard />} />
            <Route
              path="super-admin/organizations"
              element={<OrganizationsPage />}
            />
            <Route
              path="super-admin/settings"
              element={<SystemSettingsPage />}
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
