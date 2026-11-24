import React from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  X,
  Layers,
  LayoutDashboard,
  Calendar,
  Award,
  Bell,
  User,
  HelpCircle,
  LogOut,
  Building,
  ShieldCheck,
  FileSpreadsheet,
  Server,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { USER_ROLES } from '../../utils/constants';
import { studentInfo } from '../../data/studentMockData';

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isStudentPortal =
    location.pathname.startsWith('/student') || user?.role === USER_ROLES.STUDENT;

  // Active query tab for student portal
  const searchParams = new URLSearchParams(location.search);
  const activeStudentTab = searchParams.get('tab') || 'dashboard';

  // Simple Student Portal Navigation Items
  const studentNavItems = [
    {
      label: 'Dashboard',
      tab: 'dashboard',
      path: '/student?tab=dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'My Exams',
      tab: 'exams',
      path: '/student?tab=exams',
      icon: Calendar,
    },
    {
      label: 'Results',
      tab: 'results',
      path: '/student?tab=results',
      icon: Award,
    },
    {
      label: 'Notifications',
      tab: 'notifications',
      path: '/student?tab=notifications',
      icon: Bell,
    },
    {
      label: 'Profile',
      tab: 'profile',
      path: '/student?tab=profile',
      icon: User,
    },
    {
      label: 'Help',
      tab: 'support',
      path: '/student?tab=support',
      icon: HelpCircle,
    },
  ];

  // Administration Navigation Sections (Fallback for admin/super-admin roles)
  const adminSections = [
    {
      title: 'Examination Management',
      items: [
        { label: 'Admin Overview', path: '/admin', icon: LayoutDashboard },
        { label: 'Assessment Rosters', path: '/admin/exams', icon: FileSpreadsheet },
        { label: 'Question Bank', path: '/admin/questions', icon: HelpCircle },
      ],
    },
    {
      title: 'System Administration',
      items: [
        { label: 'Platform Metrics', path: '/super-admin', icon: Server },
        { label: 'Institutions', path: '/super-admin/organizations', icon: Settings },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Fixed Left Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-slate-300 bg-white transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Institutional Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-300 px-4 bg-slate-50">
          <Link to={isStudentPortal ? '/student' : '/'} className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xs bg-[#1E3A5F] text-white font-serif font-bold text-xs tracking-wide shrink-0">
              Dr.AIT
            </div>
            <div className="leading-tight">
              <span className="text-sm font-bold tracking-tight text-[#1E3A5F] block">
                ExamSphere
              </span>
              <span className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                {isStudentPortal ? 'Student CBT Portal' : 'Examination System'}
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-200 lg:hidden cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Student Identity Banner inside Sidebar */}
        {isStudentPortal && (
          <div className="p-3 mx-3 mt-3 rounded-xs border border-slate-200 bg-slate-50">
            <p className="text-xs font-bold text-slate-900 truncate">
              {user?.name || studentInfo.name}
            </p>
            <p className="text-[11px] font-mono font-semibold text-[#1E3A5F] mt-0.5">
              USN: {user?.usn || user?.identifier || studentInfo.usn}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Computer Science &bull; 6th Sem
            </p>
          </div>
        )}

        {/* Sidebar Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {isStudentPortal ? (
            // Student Simple Navigation
            <nav className="space-y-1">
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Menu
              </p>
              {studentNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeStudentTab === item.tab;

                return (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => {
                      navigate(item.path);
                      onClose?.();
                    }}
                    className={`w-full flex items-center gap-2.5 rounded-xs px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#1E3A5F] text-white font-semibold'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          ) : (
            // Fallback for Admin & System Roles
            adminSections.map((section, idx) => (
              <div key={idx} className="space-y-1">
                <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {section.title}
                </p>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isExactActive = location.pathname === item.path;

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={`flex items-center justify-between rounded-xs px-2.5 py-2 text-xs font-medium transition ${
                        isExactActive
                          ? 'bg-[#1E3A5F] text-white shadow-xs font-semibold'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </div>
                    </NavLink>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Institutional Footer & Logout */}
        <div className="border-t border-slate-300 p-3 bg-slate-50">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 text-xs text-slate-700 hover:text-red-700 hover:bg-red-50 px-2.5 py-2 rounded-xs transition font-medium cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-slate-500" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
