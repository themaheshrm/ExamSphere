import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import SuperAdminLoginForm from './SuperAdminLoginForm';
import AdminLoginForm from './AdminLoginForm';
import StudentLoginForm from './StudentLoginForm';
import { USER_ROLES } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import { PublicHeader, PublicFooter } from '../../components/public/PublicChrome';

const ROLE_TABS = [
  [USER_ROLES.STUDENT, 'Student'],
  [USER_ROLES.ADMIN, 'Institution Admin'],
  [USER_ROLES.SUPER_ADMIN, 'Super Admin'],
];

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

  // Active portal tab is derived from the URL (unknown values fall back to Student)
  const roleParam = searchParams.get('role');
  const activeRole = Object.values(USER_ROLES).includes(roleParam) ? roleParam : USER_ROLES.STUDENT;

  const handleRoleChange = (newRole) => {
    clearError();
    setSearchParams({ role: newRole });
  };

  const handleForgotPassword = (roleKey) => {
    navigate(`/forgot-password?role=${roleKey}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <PublicHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8 lg:py-16">
        <div className="grid items-start gap-12 lg:grid-cols-12">
          {/* Sign-in panel (first on mobile) */}
          <section className="lg:order-2 lg:col-span-5" aria-labelledby="signin-title">
            <div className="rounded-sm border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 pt-6">
                <h1 id="signin-title" className="text-xl font-semibold tracking-tight text-slate-900">Sign in to ExamSphere</h1>
                <p className="mt-1 text-xs text-slate-500">Choose your portal and use your institutional credentials.</p>
                <div className="mt-5 flex" role="group" aria-label="Portal">
                  {ROLE_TABS.map(([key, label]) => {
                    const active = activeRole === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleRoleChange(key)}
                        aria-pressed={active}
                        className={`-mb-px flex-1 border-b-2 px-2 pb-3 text-xs font-semibold transition-colors ${
                          active ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-6">
                {activeRole === USER_ROLES.SUPER_ADMIN && <SuperAdminLoginForm onForgotPassword={handleForgotPassword} />}
                {activeRole === USER_ROLES.ADMIN && <AdminLoginForm onForgotPassword={handleForgotPassword} />}
                {activeRole === USER_ROLES.STUDENT && <StudentLoginForm onForgotPassword={handleForgotPassword} />}
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-slate-500">
              Need assistance?{' '}
              <button type="button" onClick={() => handleForgotPassword(activeRole)} className="font-medium text-[#1E3A5F] hover:underline">
                Reset password / help desk
              </button>
            </p>
          </section>

          {/* Guidance */}
          <section className="lg:order-1 lg:col-span-7 lg:pr-8" aria-labelledby="guidance-title">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">ExamSphere · CBT Portal</p>
            <h2 id="guidance-title" className="mt-3 text-2xl font-semibold tracking-tight text-[#1E3A5F] sm:text-3xl">Before you sign in</h2>
            <ol className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
              {[
                ['Candidates', <>Sign in with your University Seat Number exactly as printed on your admission ticket, e.g. <code className="rounded-sm bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-900">1DA22CS001</code>.</>],
                ['Password', 'Use the confidential password or hall-ticket PIN issued by the examination authority.'],
                ['One session', 'Only one active session is allowed per candidate. Do not open the examination in additional tabs.'],
                ['Interruptions', 'If your computer or network fails during an examination, inform the room invigilator immediately.'],
                ['Staff', 'Examination office staff and administrators should choose the Institution Admin or Super Admin portal.'],
              ].map(([title, text], i) => (
                <li key={title} className="grid gap-1 py-4 sm:grid-cols-[8rem_1fr] sm:gap-6">
                  <span className="text-xs font-semibold text-slate-900"><span className="mr-2 tabular-nums text-slate-400">{String(i + 1).padStart(2, '0')}</span>{title}</span>
                  <span className="text-sm leading-relaxed text-slate-600">{text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-xs leading-relaxed text-slate-500">
              Examination Control Cell: Central Computer Center (CCC), 2nd Floor, Dr. AIT Campus. For hall-ticket discrepancies, contact your department examination coordinator.
            </p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
