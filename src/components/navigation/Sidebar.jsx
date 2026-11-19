import React from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  X,
  Layers,
  Sparkles,
  LayoutDashboard,
  FileSpreadsheet,
  HelpCircle,
  Users,
  Server,
  Settings,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react';

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();

  const navigationSections = [
    {
      title: 'Examination Management',
      items: [
        { label: 'Admin Overview', path: '/admin', icon: LayoutDashboard },
        { label: 'Assessment Rosters', path: '/admin/exams', icon: FileSpreadsheet },
        { label: 'Question Taxonomy', path: '/admin/questions', icon: HelpCircle },
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

        {/* System Health / Academic Session Status Pill */}
        <div className="px-4 py-3 mx-3 mt-3 rounded border border-slate-200/80 bg-slate-50">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-600">Secure CBT Engine</span>
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">Build v1.0.0-PROD</p>
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
                const isActive = location.pathname === item.path;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs font-medium transition ${
                      isActive
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
                    {item.isHighlight && !isActive && (
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

        {/* Institutional Identity Footer */}
        <div className="border-t border-slate-200 p-3 bg-slate-50/50">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>University Examination ERP</span>
            <span className="font-mono text-[10px]">ISO 27001</span>
          </div>
        </div>
      </aside>
    </>
  );
}
