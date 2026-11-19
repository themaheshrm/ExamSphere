import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import ComponentShowcase from '../pages/design-system/ComponentShowcase';
import AdminDashboard from '../pages/admin/AdminDashboard';
import ExamManagementPage from '../pages/admin/ExamManagementPage';
import QuestionBankPage from '../pages/admin/QuestionBankPage';
import SuperAdminDashboard from '../pages/super-admin/SuperAdminDashboard';
import OrganizationsPage from '../pages/super-admin/OrganizationsPage';
import SystemSettingsPage from '../pages/super-admin/SystemSettingsPage';

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Main Application Shell with Fixed Sidebar & Topbar */}
        <Route element={<DashboardLayout />}>
          {/* Default entry point points directly to the UI Component Showcase */}
          <Route index element={<ComponentShowcase />} />
          <Route path="design-system" element={<ComponentShowcase />} />

          {/* Institution Admin Routes */}
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="admin/exams" element={<ExamManagementPage />} />
          <Route path="admin/questions" element={<QuestionBankPage />} />

          {/* Super Admin Routes */}
          <Route path="super-admin" element={<SuperAdminDashboard />} />
          <Route path="super-admin/organizations" element={<OrganizationsPage />} />
          <Route path="super-admin/settings" element={<SystemSettingsPage />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/design-system" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
