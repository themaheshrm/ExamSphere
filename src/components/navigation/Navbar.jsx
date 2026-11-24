import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Menu,
  Bell,
  User,
  LogOut,
  ChevronDown,
  CheckCircle2,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { USER_ROLES } from '../../utils/constants';
import { studentInfo, notifications } from '../../data/studentMockData';

export default function Navbar({ onToggleSidebar }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const profileRef = useRef(null);
  const notifRef = useRef(null);

  const isStudentPortal =
    location.pathname.startsWith('/student') || user?.role === USER_ROLES.STUDENT;

  const displayName = user?.name || studentInfo.name;
  const displayUsn = user?.usn || user?.identifier || studentInfo.usn;

  const handleLogout = async () => {
    setIsProfileOpen(false);
    await logout();
    navigate('/login');
  };

  // Close popups on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name) => {
    if (!name) return 'EX';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const unreadNotifsCount = notifications.filter((n) => n.unread).length;

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-slate-300 bg-white px-4 sm:px-6 shadow-2xs">
      {/* Left: Mobile Toggle & Institutional Subtitle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-xs p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden focus:outline-none cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-block font-semibold text-xs text-[#1E3A5F]">
            Dr. Ambedkar Institute of Technology
          </span>
          <span className="hidden sm:inline-block text-slate-300">&bull;</span>
          <span className="text-xs text-slate-600 font-medium">
            {isStudentPortal ? 'Examinee CBT Console' : 'Examination Portal'}
          </span>
        </div>
      </div>

      {/* Right: Academic Year, Notifications & Student Profile Menu */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Academic Year Tag (Requirement 2) */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-xs font-medium">
          <span>Academic Year:</span>
          <strong className="text-slate-900 font-semibold">2026–27</strong>
        </div>

        {/* Notifications Icon with Popup (Requirement 2) */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setIsNotificationsOpen((prev) => !prev)}
            className="relative rounded-xs p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none cursor-pointer transition-colors"
            aria-label="View notifications"
          >
            <Bell className="h-4.5 w-4.5" />
            {unreadNotifsCount > 0 && (
              <span className="absolute top-1 right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xs border border-slate-300 bg-white shadow-lg z-50 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 bg-slate-50">
                <span className="font-semibold text-slate-900 uppercase tracking-wide text-[11px]">
                  Examination Notices ({notifications.length})
                </span>
                <span className="text-[11px] text-emerald-800 font-medium bg-emerald-50 px-1.5 py-0.5 rounded-xs border border-emerald-200">
                  {unreadNotifsCount} New
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {notifications.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 text-left transition-colors hover:bg-slate-50 ${
                      item.unread ? 'bg-blue-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 text-xs">{item.title}</p>
                      <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                        {item.time}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] mt-1 leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 bg-slate-50 p-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsNotificationsOpen(false);
                    navigate('/student?tab=notifications');
                  }}
                  className="text-xs text-[#1E3A5F] font-semibold hover:underline cursor-pointer"
                >
                  View All Notices & Circulars &rarr;
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="h-5 w-px bg-slate-200" />

        {/* Student Profile Menu Dropdown (Requirement 2) */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-xs p-1 hover:bg-slate-100 transition-colors cursor-pointer text-left focus:outline-none"
            aria-expanded={isProfileOpen}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-xs bg-[#1E3A5F] text-white font-bold text-xs">
              {getInitials(displayName)}
            </div>

            <div className="hidden sm:block leading-tight text-left">
              <p className="text-xs font-semibold text-slate-800 truncate max-w-[130px]">
                {displayName}
              </p>
              <p className="text-[10px] text-slate-500 font-mono font-bold">
                {displayUsn}
              </p>
            </div>

            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {/* Profile Menu Dropdown Panel */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-xs border border-slate-300 bg-white shadow-lg z-50 text-xs text-slate-700">
              {/* Header Box */}
              <div className="p-3.5 border-b border-slate-200 bg-slate-50">
                <p className="font-bold text-slate-900 text-sm">{displayName}</p>
                <p className="text-xs font-mono font-bold text-[#1E3A5F] mt-0.5">
                  USN: {displayUsn}
                </p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Computer Science & Engineering &bull; Sem 6
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-xs font-medium">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Terminal Authorized (Admit Card Verified)</span>
                </div>
              </div>

              {/* Menu Links */}
              <div className="p-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate('/student?tab=profile');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-xs text-left cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>View Full Student Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate('/student?tab=exams');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-xs text-left cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>My Examination Roster</span>
                </button>
              </div>

              {/* Logout Footer */}
              <div className="border-t border-slate-200 p-1.5 bg-slate-50">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-xs transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out Session</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
