import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, UserCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { INSTITUTION, NOTIFICATION_PATHS, PROFILE_PATHS, ROLE_LABELS, USER_ROLES } from '../../utils/constants';
import { useNotifications } from '../../utils/useNotifications';
import { formatRelative } from '../../utils/format';

const TONE_DOT = {
  info: 'bg-[#1E3A5F]', success: 'bg-emerald-600', warning: 'bg-amber-500', danger: 'bg-rose-600', neutral: 'bg-slate-400',
};

function useDismiss(ref, open, setOpen) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, setOpen]);
}

export default function Navbar({ onToggleSidebar, sidebarOpen }) {
  const navigate = useNavigate();
  const { user, role, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const profileRef = useRef(null);
  const notifRef = useRef(null);
  useDismiss(profileRef, profileOpen, setProfileOpen);
  useDismiss(notifRef, notifOpen, setNotifOpen);
  const { items: notifications, unread: unreadItems, markRead } = useNotifications();
  const unread = unreadItems.length;

  const initials = (user?.name || 'ES').split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const identifier = user?.usn || user?.staffId || user?.email || '';

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    navigate('/login');
  };

  const openNotification = (n) => {
    markRead([n.id]);
    setNotifOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Open navigation"
          aria-controls="app-sidebar"
          aria-expanded={sidebarOpen}
          className="rounded-sm p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-semibold text-slate-900">{INSTITUTION.name}</p>
          <p className="hidden truncate text-[11px] text-slate-500 sm:block">{INSTITUTION.office} · {ROLE_LABELS[role] || 'Examination Portal'}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <span className="mr-1 hidden rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 md:inline">
          Academic Year <strong className="font-semibold text-slate-900">{INSTITUTION.academicYear}</strong>
        </span>

        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={notifOpen}
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            className="relative rounded-sm p-2 text-slate-600 hover:bg-slate-100"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white tabular-nums">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="es-fade-in fixed inset-x-3 top-14 z-50 rounded-sm border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-900">Notifications</p>
                {unread > 0 && (
                  <button type="button" onClick={() => markRead(notifications.map((n) => n.id))} className="text-[11px] font-semibold text-[#1E3A5F] hover:underline">
                    Mark all as read
                  </button>
                )}
              </div>
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                {notifications.length === 0 && <li className="px-4 py-8 text-center text-xs text-slate-500">You're all caught up.</li>}
                {notifications.slice(0, 8).map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => openNotification(n)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-[#F7F9FC]'}`}>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-slate-200' : TONE_DOT[n.tone] || TONE_DOT.neutral}`} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className={`block text-xs ${n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-600">{n.message}</span>
                        <span className="mt-1 block text-[10px] text-slate-400">{n.at ? formatRelative(n.at) : n.timeLabel || 'Current'}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Link to={NOTIFICATION_PATHS[role] || '/'} onClick={() => setNotifOpen(false)} className="block border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs font-semibold text-[#1E3A5F] hover:underline">
                View all notifications
              </Link>
            </div>
          )}
        </div>

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={profileOpen}
            className="flex items-center gap-2 rounded-sm py-1 pl-1 pr-1.5 hover:bg-slate-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#1E3A5F] text-[11px] font-bold text-white">{initials}</span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-40 truncate text-xs font-semibold text-slate-900">{user?.name || 'User'}</span>
              <span className="block max-w-40 truncate font-mono text-[10px] text-slate-500">{identifier}</span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
          </button>

          {profileOpen && (
            <div className="es-fade-in absolute right-0 top-11 z-50 w-60 rounded-sm border border-slate-200 bg-white py-1 shadow-lg">
              <div className="border-b border-slate-100 px-4 py-2.5">
                <p className="truncate text-xs font-semibold text-slate-900">{user?.name}</p>
                <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#1E3A5F]">{ROLE_LABELS[role]}</p>
              </div>
              <Link to={PROFILE_PATHS[role] || '/'} onClick={() => setProfileOpen(false)} className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50">
                <UserCircle className="h-4 w-4 text-slate-400" /> My profile
              </Link>
              {role === USER_ROLES.STUDENT && (
                <Link to="/student?tab=exams" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50">
                  <Bell className="h-4 w-4 text-slate-400" /> My examinations
                </Link>
              )}
              <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2 text-left text-xs text-rose-700 hover:bg-rose-50">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
