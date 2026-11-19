import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Bell, Search, ShieldCheck, User, Sparkles } from 'lucide-react';
import Badge from '../common/Badge';

export default function Navbar({ onToggleSidebar, activeRoleConfig }) {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      {/* Left: Mobile hamburger & Institutional Context */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden focus:outline-none focus:ring-1 focus:ring-slate-300"
          aria-label="Toggle navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            AY 2026-27 | Term 1
          </span>

          {activeRoleConfig && (
            <Badge variant="primary" size="sm" className="hidden md:inline-flex">
              {activeRoleConfig.title}
            </Badge>
          )}
        </div>
      </div>

      {/* Center: Search Field */}
      <div className="hidden lg:block w-72">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search candidate, test code, or hall..."
            className="w-full rounded border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#1E3A5F] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
          />
        </div>
      </div>

      {/* Right: Actions, Showcase Link, User Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Design System Showcase Link Pill */}
        <Link
          to="/design-system"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition ${
            location.pathname === '/design-system'
              ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
              : 'bg-[#EBF2FA] text-[#1E3A5F] border-[#BFDBFE] hover:bg-[#D9E6F5]'
          }`}
          title="View Design System Showcase"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span className="hidden sm:inline">UI Design System</span>
        </Link>

        {/* Notification Bell */}
        <button
          type="button"
          className="relative rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none"
          aria-label="View notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
        </button>

        {/* Separator */}
        <div className="h-5 w-px bg-slate-200" />

        {/* User Identity */}
        <div className="flex items-center gap-2 pl-1">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-[#1E3A5F] text-white font-semibold text-xs shadow-xs">
            EC
          </div>
          <div className="hidden md:block text-left leading-tight">
            <p className="text-xs font-semibold text-slate-800">Exam Controller</p>
            <p className="text-[10px] text-slate-500 font-mono">ID: ERP-9042</p>
          </div>
        </div>
      </div>
    </header>
  );
}
