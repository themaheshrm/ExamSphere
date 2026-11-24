import React from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/common/LoadingStates';
import { getRouteForRole } from '../services/authService';
import { ROLE_LABELS } from '../utils/constants';

/**
 * Route protection guard
 * Enforces session authentication and role-based access control.
 */
export default function ProtectedRoute({ allowedRoles = [] }) {
  const { isAuthenticated, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white" role="status">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" variant="primary" />
          <p className="text-xs font-medium text-slate-500">Verifying your session…</p>
        </div>
      </div>
    );
  }

  // Not authenticated: Redirect to centralized login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role validation if specific roles are required
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-sm border border-rose-200 bg-rose-50 text-rose-700">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-semibold text-slate-900">Access restricted</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            This section is not available to your account ({ROLE_LABELS[role] || role}). If you believe this is an error, contact the examination office.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link
              to={getRouteForRole(role)}
              className="inline-flex h-9 items-center rounded-sm bg-[#1E3A5F] px-4 text-xs font-semibold text-white hover:bg-[#152A45]"
            >
              Go to my dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
