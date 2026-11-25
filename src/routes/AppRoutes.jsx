import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import ProtectedRoute from './ProtectedRoute';
import LoginPage from '../pages/auth/LoginPage';
import HomePage from '../pages/public/HomePage';
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage'));
const ChangePasswordPage = lazy(() => import('../pages/auth/ChangePasswordPage'));
const ComponentShowcase = lazy(() => import('../pages/design-system/ComponentShowcase'));
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const ExamManagementPage = lazy(() => import('../pages/admin/ExamManagementPage'));
const QuestionBankPage = lazy(() => import('../pages/admin/QuestionBankPage'));
const StudentsPage = lazy(() => import('../pages/admin/StudentsPage'));
const ResultsPage = lazy(() => import('../pages/admin/ResultsPage'));
const NotificationsPage = lazy(() => import('../pages/account/NotificationsPage'));
const ProfilePage = lazy(() => import('../pages/account/ProfilePage'));
const SuperAdminDashboard = lazy(() => import('../pages/super-admin/SuperAdminDashboard'));
const InstitutionProfilePage = lazy(() => import('../pages/super-admin/InstitutionProfilePage'));
const SystemSettingsPage = lazy(() => import('../pages/super-admin/SystemSettingsPage'));
const UsersPage = lazy(() => import('../pages/super-admin/UsersPage'));
const AdminManagementPage = lazy(() => import('../pages/super-admin/AdminManagementPage'));
const MonitoringPage = lazy(() => import('../pages/super-admin/MonitoringPage'));
const ActivityLogPage = lazy(() => import('../pages/super-admin/ActivityLogPage'));
const StudentDashboard = lazy(() => import('../pages/student/StudentDashboard'));
const ExamInterface = lazy(() => import('../pages/student/ExamInterface'));
import { USER_ROLES } from '../utils/constants';
import { Spinner } from '../components/common/LoadingStates';

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status">
      <Spinner size="lg" />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public home page */}
        <Route path="/" element={<HomePage />} />

        {/* Public Authentication Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* First sign-in with a temporary password (any signed-in role) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />
        </Route>

        {/* Full-screen Exam Interface — outside DashboardLayout */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={[USER_ROLES.STUDENT, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]}
            />
          }
        >
          <Route path="/student/exam" element={<ExamInterface />} />
        </Route>

        {/* Main Application Shell */}
        <Route element={<DashboardLayout />}>

          {/* Design System Specification & Showcase (Public for UI verification) */}
          <Route path="design-system" element={<ComponentShowcase />} />

          {/* Protected Student Portal Route */}
          <Route
            element={
              <ProtectedRoute
                allowedRoles={[USER_ROLES.STUDENT, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]}
              />
            }
          >
            <Route path="student" element={<StudentDashboard />} />
          </Route>

          {/* Protected Examination Office (admin) Routes */}
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
            <Route path="admin/students" element={<StudentsPage />} />
            <Route path="admin/results" element={<ResultsPage />} />
            <Route path="admin/notifications" element={<NotificationsPage />} />
            <Route path="admin/profile" element={<ProfilePage />} />
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
              element={<InstitutionProfilePage />}
            />
            <Route
              path="super-admin/settings"
              element={<SystemSettingsPage />}
            />
            <Route path="super-admin/admins" element={<AdminManagementPage />} />
            <Route path="super-admin/users" element={<UsersPage />} />
            <Route path="super-admin/monitoring" element={<MonitoringPage />} />
            <Route path="super-admin/activity" element={<ActivityLogPage />} />
            <Route path="super-admin/profile" element={<ProfilePage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
