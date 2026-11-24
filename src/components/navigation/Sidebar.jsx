import React from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { INSTITUTION, NAVIGATION_CONFIG, ROLE_LABELS, USER_ROLES } from '../../utils/constants';
import { studentInfo } from '../../data/studentMockData';

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="ExamSphere home">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-[#1E3A5F] font-serif text-[11px] font-bold tracking-tight text-white">
        AIT
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-semibold text-slate-900">ExamSphere</span>
        <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">{INSTITUTION.shortName} · CBT Portal</span>
      </span>
    </Link>
  );
}

/**
 * Role-aware navigation. Admin and super-admin items are real routes; student
 * items drive the existing `/student?tab=…` views.
 */
export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, role, logout } = useAuth();

  // Viewing a student page with a staff account still shows the student menu.
  const navRole = location.pathname.startsWith('/student') ? USER_ROLES.STUDENT : role || USER_ROLES.STUDENT;
  const config = NAVIGATION_CONFIG[navRole];
  const activeTab = searchParams.get('tab') || 'dashboard';

  const isActive = (item) => {
    if (item.tab) return location.pathname === '/student' && activeTab === item.tab;
    if (item.path === '/admin' || item.path === '/super-admin') return location.pathname === item.path;
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const identifier = user?.usn || user?.staffId || user?.email || (navRole === USER_ROLES.STUDENT ? studentInfo.usn : '');

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        id="app-sidebar"
        aria-label="Primary navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <Brand />
          <button type="button" onClick={onClose} className="rounded-sm p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="truncate text-sm font-semibold text-slate-900">{user?.name || studentInfo.name}</p>
          <p className="truncate font-mono text-[11px] text-slate-600">{identifier}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#1E3A5F]">{ROLE_LABELS[role] || config.title}</p>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {config.sections.map((section) => (
            <div key={section.title}>
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{section.title}</p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item);
                  const to = item.tab ? `/student?tab=${item.tab}` : item.path;
                  return (
                    <li key={to}>
                      <Link
                        to={to}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={`relative flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] font-medium transition-colors ${
                          active ? 'bg-[#1E3A5F] text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] font-medium text-slate-700 transition-colors hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
          <p className="mt-2 px-2.5 text-[10px] text-slate-400">ExamSphere CBT · {INSTITUTION.academicYear}</p>
        </div>
      </aside>
    </>
  );
}
