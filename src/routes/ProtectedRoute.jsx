import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/common/LoadingStates';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { ShieldAlert } from 'lucide-react';

/**
 * Route protection guard
 * Enforces session authentication and role-based access control.
 */
export default function ProtectedRoute({ allowedRoles = [] }) {
  const { isAuthenticated, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" variant="primary" />
          <p className="text-xs font-medium text-slate-500">Verifying session credentials...</p>
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
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F8FAFC]">
        <Card className="max-w-md w-full text-center p-6">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Your current credential session (<strong>{role}</strong>) does not have authorization to view this examination portal section.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.history.back()}>
              Go Back
            </Button>
            <Button variant="primary" size="sm" onClick={() => (window.location.href = '/login')}>
              Switch Role Session
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
