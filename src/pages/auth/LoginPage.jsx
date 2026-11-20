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
  Zap,
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
  const { demoLogin, clearError } = useAuth();

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

  const handleQuickDemoAccess = async (roleKey, targetPath) => {
    clearError();
    const result = await demoLogin(roleKey);
    if (result.success) {
      navigate(targetPath);
    }
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

        {/* Quick Testing 1-Click Demo Bar */}
        <div className="mt-4 p-4 rounded border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-2">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              1-Click Instant Demo Login
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-mono">
              LIVE SUPABASE
            </span>
          </div>

          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
            Test any role immediately without typing credentials:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickDemoAccess(USER_ROLES.STUDENT, '/student')}
              className="flex items-center justify-between p-2 rounded border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/80 text-emerald-900 text-xs font-medium transition"
            >
              <div className="text-left">
                <p className="font-semibold text-[11px]">Candidate / Student</p>
                <p className="text-[10px] text-emerald-700 font-mono">1DA22CS001</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemoAccess(USER_ROLES.ADMIN, '/admin')}
              className="flex items-center justify-between p-2 rounded border border-blue-200 bg-blue-50/60 hover:bg-blue-100/80 text-blue-900 text-xs font-medium transition"
            >
              <div className="text-left">
                <p className="font-semibold text-[11px]">Institution Admin</p>
                <p className="text-[10px] text-blue-700 font-mono">admin@drait.edu.in</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemoAccess(USER_ROLES.SUPER_ADMIN, '/super-admin')}
              className="flex items-center justify-between p-2 rounded border border-purple-200 bg-purple-50/60 hover:bg-purple-100/80 text-purple-900 text-xs font-medium transition"
            >
              <div className="text-left">
                <p className="font-semibold text-[11px]">Super Admin</p>
                <p className="text-[10px] text-purple-700 font-mono">superadmin@drait.edu.in</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto text-center text-xs text-slate-400 pt-6">
        <p>© {new Date().getFullYear()} ExamSphere CBT Platform • High-consequence Assessment Security</p>
      </footer>
    </div>
  );
}
