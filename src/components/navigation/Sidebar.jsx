import React from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  X,
  Layers,
  Sparkles,
  LayoutDashboard,
  FileSpreadsheet,
  HelpCircle,
  Server,
  Settings,
  LogIn,
  GraduationCap,
  Building,
  ShieldCheck,
  LogOut,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { USER_ROLES } from '../../utils/constants';

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navigationSections = [
    {
      title: 'Authentication & Access',
      items: [
        {
          label: 'Candidate Portal (USN)',
          path: '/login?role=student',
          icon: GraduationCap,
        },
        {
          label: 'Institution Admin Login',
          path: '/login?role=admin',
          icon: Building,
        },
        {
          label: 'Super Admin Login',
          path: '/login?role=super-admin',
          icon: ShieldCheck,
        },
      ],
    },
    {
      title: 'Design System & UI',
      items: [
        {
          label: 'Component Showcase',
          path: '/design-system',
          icon: Sparkles,
          isHighlight: true,
        },
      ],
    },
    {
      title: 'Examination Management',
      items: [
        { label: 'Admin Overview', path: '/admin', icon: LayoutDashboard },
        { label: 'Assessment Rosters', path: '/admin/exams', icon: FileSpreadsheet },
        { label: 'Question Taxonomy', path: '/admin/questions', icon: HelpCircle },
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
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-[#1E3A5F] text-white shadow-xs">
              <Layers className="h-4 w-4" />
            </div>
            <div className="leading-none">
              <span className="text-sm font-bold tracking-tight text-[#1E3A5F]">
                ExamSphere
              </span>
              <span className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                CBT System
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* System Health / Auth State Status Pill */}
        <div className="px-4 py-2.5 mx-3 mt-3 rounded border border-slate-200/80 bg-slate-50">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-700">
              {isAuthenticated ? user?.role?.toUpperCase() : 'Guest Session'}
            </span>
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                isAuthenticated ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isAuthenticated ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              {isAuthenticated ? 'Authenticated' : 'Login Required'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
            {isAuthenticated ? user?.identifier || user?.email : 'No active JWT'}
          </p>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {navigationSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {section.title}
              </p>

              {section.items.map((item) => {
                const Icon = item.icon;
                const isExactActive =
                  location.pathname + location.search === item.path ||
                  location.pathname === item.path;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs font-medium transition ${
                      isExactActive
                        ? 'bg-[#1E3A5F] text-white shadow-xs'
                        : item.isHighlight
                        ? 'text-[#1E3A5F] bg-[#EBF2FA] hover:bg-[#D9E6F5]'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                      <span>{item.label}</span>
                    </div>
                    {item.isHighlight && !isExactActive && (
                      <span className="text-[10px] bg-white text-[#1E3A5F] px-1.5 py-0.5 rounded border border-[#BFDBFE] font-semibold">
                        Preview
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        {/* Institutional Identity Footer & Session Logout */}
        <div className="border-t border-slate-200 p-3 bg-slate-50/50">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-between text-xs text-rose-600 hover:bg-rose-50 px-2 py-1.5 rounded transition font-medium"
            >
              <span className="flex items-center gap-2">
                <LogOut className="w-3.5 h-3.5" />
                Sign Out Session
              </span>
              <span className="text-[10px] text-rose-400">Exit</span>
            </button>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>University Examination ERP</span>
              <span className="font-mono text-[10px]">ISO 27001</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
