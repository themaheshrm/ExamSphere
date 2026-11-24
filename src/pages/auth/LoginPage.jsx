import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import SuperAdminLoginForm from './SuperAdminLoginForm';
import AdminLoginForm from './AdminLoginForm';
import StudentLoginForm from './StudentLoginForm';
import { USER_ROLES } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, role, clearError } = useAuth();

  // Redirect already-authenticated users to their assigned dashboard
  useEffect(() => {
    if (isAuthenticated && role) {
      const routes = {
        [USER_ROLES.SUPER_ADMIN]: '/super-admin',
        [USER_ROLES.ADMIN]: '/admin',
        [USER_ROLES.STUDENT]: '/student',
      };
      navigate(routes[role] || '/login', { replace: true });
    }
  }, [isAuthenticated, role, navigate]);

  // Read active role from URL parameter or default to Student
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-800 font-sans">
      {/* ── Top Institutional Sub-Bar ─────────────────────────────────────── */}
      <div className="w-full bg-slate-100 border-b border-slate-200 text-[11px] text-slate-600 px-4 py-1.5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1">
          <div className="truncate text-center sm:text-left">
            Dr. Ambedkar Institute of Technology &bull; An Autonomous Institution Affiliated to VTU, Belagavi
          </div>
          <div className="flex items-center gap-3 font-medium text-slate-700">
            <span>Academic Year: 2026–2027</span>
            <span>&bull;</span>
            <span>Online Examination Portal</span>
          </div>
        </div>
      </div>

      {/* ── Institutional Main Header ─────────────────────────────────────── */}
      <header className="w-full bg-white border-b border-slate-300">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Institution Monogram & Name */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-[#1E3A5F] text-white rounded-xs flex flex-col items-center justify-center shrink-0 border border-[#152A45]">
              <span className="font-serif font-bold text-xs tracking-wide">Dr. AIT</span>
              <span className="text-[9px] text-slate-200">1980</span>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-[#1E3A5F] tracking-tight leading-snug">
                DR. AMBEDKAR INSTITUTE OF TECHNOLOGY
              </h1>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Office of the Controller of Examinations (COE)
              </p>
              <p className="text-[11px] text-slate-500">
                ExamSphere &bull; Computer Based Test (CBT) Portal
              </p>
            </div>
          </div>

          {/* Contact / Helpdesk Strip */}
          <div className="hidden md:block text-right text-xs text-slate-600 border-l border-slate-200 pl-4">
            <p className="font-semibold text-slate-800">Examination Helpline</p>
            <p className="text-[11px]">Control Room: 080-23211505</p>
            <p className="text-[11px] text-[#1E3A5F]">coe@drait.edu.in</p>
          </div>
        </div>
      </header>

      {/* ── Section Title Strip ───────────────────────────────────────────── */}
      <div className="w-full bg-[#1E3A5F] text-white text-xs font-semibold py-2 px-4 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span>PORTAL AUTHENTICATION &bull; CANDIDATE & STAFF ACCESS</span>
          <span className="hidden sm:inline text-[11px] font-normal text-slate-200">
            Bengaluru, Karnataka
          </span>
        </div>
      </div>

      {/* ── Main Two-Column Institutional Layout ─────────────────────────── */}
      <main className="max-w-6xl w-full mx-auto px-4 py-8 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Official Instructions & Information */}
          <div className="lg:col-span-7 space-y-6">
            {/* Candidate Instructions Block */}
            <div className="bg-white border border-slate-300 rounded-xs shadow-2xs">
              <div className="bg-slate-100 border-b border-slate-300 px-4 py-2.5">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Important Instructions for Examinees
                </h2>
              </div>
              <div className="p-4 text-xs text-slate-700 space-y-3 leading-relaxed">
                <p>
                  Welcome to the Dr. Ambedkar Institute of Technology online Computer-Based Examination system. Please review the following instructions prior to signing in:
                </p>
                <ol className="list-decimal list-outside pl-4 space-y-2 text-slate-600">
                  <li>
                    <strong className="text-slate-800">Candidate Login:</strong> Enter your 10-digit University Seat Number (USN) exactly as allocated on your official Admission Ticket (e.g., <code className="bg-slate-100 px-1 py-0.5 rounded-xs text-slate-900 font-mono text-[11px]">1DA22CS001</code>).
                  </li>
                  <li>
                    <strong className="text-slate-800">Password / Exam PIN:</strong> Enter the confidential password or Hall Ticket PIN issued by the Examination Authority.
                  </li>
                  <li>
                    <strong className="text-slate-800">Single Session Policy:</strong> Multiple active sessions under the same candidate USN are prohibited. Opening additional browser tabs will invalidate the session.
                  </li>
                  <li>
                    <strong className="text-slate-800">System Interruptions:</strong> In case of hardware malfunction or network interruption during an exam, immediately contact the room invigilator.
                  </li>
                  <li>
                    <strong className="text-slate-800">Staff Portal:</strong> Institution staff, invigilators, and administrators should select the respective portal tab to access examination rosters and evaluation consoles.
                  </li>
                </ol>
              </div>
            </div>

            {/* Examination Control Cell Information */}
            <div className="bg-white border border-slate-200 rounded-xs p-4 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Examination Control Cell Notice:</p>
              <p>
                Central Computer Center (CCC), 2nd Floor, Dr. AIT Campus, Mallathahalli, Bengaluru.
              </p>
              <p className="text-slate-500 text-[11px]">
                For candidate hall ticket discrepancies, contact your department examination coordinator.
              </p>
            </div>
          </div>

          {/* Right Column: Conventional Institutional Login Box */}
          <div className="lg:col-span-5">
            <div className="bg-white border border-slate-300 rounded-xs shadow-xs">
              {/* Login Box Header */}
              <div className="bg-slate-100 border-b border-slate-300 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Sign In to ExamSphere
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  SECURE PORTAL
                </span>
              </div>

              {/* Role Navigation Control: Conventional Horizontal Tabs */}
              <div className="border-b border-slate-200 bg-slate-50 flex">
                <button
                  type="button"
                  onClick={() => handleRoleChange(USER_ROLES.STUDENT)}
                  className={`flex-1 py-2.5 text-xs text-center border-r border-slate-200 transition-colors cursor-pointer ${
                    activeRole === USER_ROLES.STUDENT
                      ? 'bg-white text-[#1E3A5F] font-bold border-b-2 border-b-[#1E3A5F]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Student
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleChange(USER_ROLES.ADMIN)}
                  className={`flex-1 py-2.5 text-xs text-center border-r border-slate-200 transition-colors cursor-pointer ${
                    activeRole === USER_ROLES.ADMIN
                      ? 'bg-white text-[#1E3A5F] font-bold border-b-2 border-b-[#1E3A5F]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Institution Admin
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleChange(USER_ROLES.SUPER_ADMIN)}
                  className={`flex-1 py-2.5 text-xs text-center transition-colors cursor-pointer ${
                    activeRole === USER_ROLES.SUPER_ADMIN
                      ? 'bg-white text-[#1E3A5F] font-bold border-b-2 border-b-[#1E3A5F]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Super Admin
                </button>
              </div>

              {/* Login Form Container */}
              <div className="p-5">
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
            </div>

            {/* Bottom Support Link */}
            <div className="mt-3 text-center text-xs text-slate-500">
              Need assistance?{' '}
              <button
                type="button"
                onClick={() => handleForgotPassword(activeRole)}
                className="text-[#1E3A5F] font-medium hover:underline cursor-pointer"
              >
                Reset Password / Help Desk
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── Conventional Institutional Footer ──────────────────────────────── */}
      <footer className="w-full bg-slate-100 border-t border-slate-300 py-6 text-xs text-slate-600 mt-auto">
        <div className="max-w-6xl mx-auto px-4 space-y-2">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="text-center sm:text-left">
              <p className="font-semibold text-slate-800">
                Dr. Ambedkar Institute of Technology, Bengaluru – 560056
              </p>
              <p className="text-[11px] text-slate-500">
                BDA Outer Ring Road, Near Jnana Bharathi Campus, Mallathahalli, Bengaluru, Karnataka, India
              </p>
            </div>
            <div className="text-center sm:text-right text-[11px] text-slate-500">
              <p>Office of the Controller of Examinations</p>
              <p>ExamSphere CBT Portal Version 2.4.0</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px] text-slate-500 pt-1 text-center sm:text-left">
            <p>
              &copy; {new Date().getFullYear()} Dr. Ambedkar Institute of Technology. All Rights Reserved.
            </p>
            <p>
              Authorized access only. Unauthorized usage is punishable under the Indian Information Technology Act.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
