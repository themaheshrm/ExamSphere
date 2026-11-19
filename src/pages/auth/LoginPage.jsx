import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Layers,
  ShieldCheck,
  Building,
  GraduationCap,
  Sparkles,
  ArrowRight,
  Lock,
  ExternalLink,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import SuperAdminLoginForm from './SuperAdminLoginForm';
import AdminLoginForm from './AdminLoginForm';
import StudentLoginForm from './StudentLoginForm';
import { USER_ROLES } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, role: currentAuthRole, clearError } = useAuth();

  // Get active role from URL parameter or default to Student (highest volume user)
  const initialRole = searchParams.get('role') || USER_ROLES.STUDENT;
  const [activeRole, setActiveRole] = useState(initialRole);

  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam && Object.values(USER_ROLES).includes(roleParam)) {
      setActiveRole(roleParam);
    }
  }, [searchParams]);

  const handleRoleChange = (newRole) => {
    clearError();
    setActiveRole(newRole);
    setSearchParams({ role: newRole });
  };

  const handleForgotPassword = (roleKey) => {
    navigate(`/forgot-password?role=${roleKey}`);
  };

  const roleMeta = {
    [USER_ROLES.STUDENT]: {
      label: 'Student / Candidate',
      badge: 'Examinee Portal',
      badgeVariant: 'success',
      icon: GraduationCap,
      description: 'Enter your official USN and password to take scheduled computer-based assessments.',
    },
    [USER_ROLES.ADMIN]: {
      label: 'Institution Admin',
      badge: 'Staff / COE',
      badgeVariant: 'primary',
      icon: Building,
      description: 'Examination Controller and invigilator console for session rosters and question banks.',
    },
    [USER_ROLES.SUPER_ADMIN]: {
      label: 'Super Admin',
      badge: 'Root Authority',
      badgeVariant: 'warning',
      icon: ShieldCheck,
      description: 'Master platform management, multi-institution tenant provisioning, and cloud telemetry.',
    },
  };

  const currentMeta = roleMeta[activeRole] || roleMeta[USER_ROLES.STUDENT];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between pb-4 sm:pb-8">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#1E3A5F] text-white shadow-xs">
            <Layers className="h-4.5 w-4.5" />
          </div>
          <div className="leading-none">
            <span className="text-base font-bold tracking-tight text-slate-900">
              Exam<span className="text-[#1E3A5F]">Sphere</span>
            </span>
            <span className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              Examination Portal
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to="/design-system"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] bg-[#EBF2FA] border border-[#BFDBFE] px-2.5 py-1 rounded hover:bg-[#D9E6F5] transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>UI Design System</span>
          </Link>
          <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded">
            Academic Year: 2026-27
          </span>
        </div>
      </header>

      {/* Main Authentication Container */}
      <div className="max-w-lg w-full mx-auto my-auto">
        <Card className="bg-white border border-slate-200 shadow-xs p-6 sm:p-8">
          {/* Header Title & Description */}
          <div className="text-center pb-5 border-b border-slate-100">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#EBF2FA] text-[#1E3A5F] border border-[#BFDBFE] mb-3">
              <currentMeta.icon className="w-5 h-5" />
            </div>

            <div className="flex items-center justify-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                {currentMeta.label}
              </h1>
              <Badge variant={currentMeta.badgeVariant} size="sm">
                {currentMeta.badge}
              </Badge>
            </div>

            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
              {currentMeta.description}
            </p>
          </div>

          {/* Role Selection Switcher (Option 1: Super Admin, Option 2: Admin, Option 3: Student) */}
          <div className="my-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Select Login Role
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-1 rounded border border-slate-200 bg-slate-50 text-xs">
              {/* Option 1: Student */}
              <button
                type="button"
                onClick={() => handleRoleChange(USER_ROLES.STUDENT)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 rounded transition ${
                  activeRole === USER_ROLES.STUDENT
                    ? 'bg-white text-[#1E3A5F] shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Student</span>
              </button>

              {/* Option 2: Institution Admin */}
              <button
                type="button"
                onClick={() => handleRoleChange(USER_ROLES.ADMIN)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 rounded transition ${
                  activeRole === USER_ROLES.ADMIN
                    ? 'bg-white text-[#1E3A5F] shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Admin</span>
              </button>

              {/* Option 3: Super Admin */}
              <button
                type="button"
                onClick={() => handleRoleChange(USER_ROLES.SUPER_ADMIN)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 rounded transition ${
                  activeRole === USER_ROLES.SUPER_ADMIN
                    ? 'bg-white text-[#1E3A5F] shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Super Admin</span>
              </button>
            </div>
          </div>

          {/* Role-Specific Form Rendering */}
          <div className="mt-2">
            {activeRole === USER_ROLES.SUPER_ADMIN && (
              <SuperAdminLoginForm onForgotPassword={handleForgotPassword} />
            )}

            {activeRole === USER_ROLES.ADMIN && (
              <AdminLoginForm onForgotPassword={handleForgotPassword} />
            )}

            {activeRole === USER_ROLES.STUDENT && (
              <StudentLoginForm onForgotPassword={handleForgotPassword} />
            )}
          </div>
        </Card>

        {/* Quick Testing Helper Card */}
        <div className="mt-4 p-3.5 rounded border border-slate-200 bg-white/80 text-xs text-slate-600">
          <div className="flex items-center justify-between font-semibold text-slate-800 text-[11px] mb-1">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#1E3A5F]" />
              Enterprise Security & JWT Architecture
            </span>
            <span className="font-mono text-[10px] text-slate-400">READY</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            All login forms perform live client validation and dispatch structured payloads. Backend integration points are ready for the JWT endpoint (<code className="font-mono bg-slate-100 px-1 rounded text-[10px]">POST /api/auth/login</code>).
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto text-center text-xs text-slate-400 pt-6">
        <p>© {new Date().getFullYear()} ExamSphere CBT Platform • High-consequence Assessment Security</p>
      </footer>
    </div>
  );
}
