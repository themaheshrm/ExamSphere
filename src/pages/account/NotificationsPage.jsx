import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import Tabs from '../../components/common/Tabs';
import { notificationService } from '../../services/notificationService';
import { useAuth } from '../../context/AuthContext';
import { useDataVersion } from '../../utils/useDataVersion';
import { formatDateTime } from '../../utils/format';

const TONE_BAR = { info: 'bg-[#1E3A5F]', success: 'bg-emerald-600', warning: 'bg-amber-500', danger: 'bg-rose-600', neutral: 'bg-slate-300' };

/** Full notification list for the signed-in staff member. */
export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useDataVersion();
  const [filter, setFilter] = useState('all');
  const items = notificationService.list(user);
  const unread = items.filter((n) => !n.read);
  const shown = filter === 'unread' ? unread : items;

  const open = (n) => {
    notificationService.markRead(user, [n.id]);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        actions={<Button variant="secondary" icon={CheckCheck} disabled={!unread.length} onClick={() => notificationService.markRead(user, items.map((n) => n.id))}>Mark all as read</Button>}
      />
      <Card bodyClassName="p-0">
        <div className="px-4">
          <Tabs tabs={[{ id: 'all', label: 'All', count: items.length }, { id: 'unread', label: 'Unread', count: unread.length }]} value={filter} onChange={setFilter} label="Notification filter" />
        </div>
        {shown.length === 0 ? (
          <EmptyState icon={Bell} title={filter === 'unread' ? 'No unread notifications' : 'No notifications'} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((n) => (
              <li key={n.id} className="relative">
                <span className={`absolute inset-y-0 left-0 w-1 ${n.read ? 'bg-transparent' : TONE_BAR[n.tone] || TONE_BAR.neutral}`} aria-hidden="true" />
                <button type="button" onClick={() => open(n)} className={`flex w-full flex-col gap-1 px-5 py-4 text-left hover:bg-slate-50 sm:flex-row sm:items-start sm:justify-between ${n.read ? '' : 'bg-[#F7F9FC]'}`}>
                  <span className="min-w-0">
                    <span className={`block text-sm ${n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>
                      {n.title}{!n.read && <span className="sr-only"> (unread)</span>}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{n.message}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{n.at ? formatDateTime(n.at) : n.timeLabel || 'Current status'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
