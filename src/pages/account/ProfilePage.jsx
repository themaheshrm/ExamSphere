import React, { useMemo, useState } from 'react';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/common/PageHeader';
import { useToast } from '../../components/common/Toast';
import { authService } from '../../services/authService';
import { activityLogService } from '../../services/activityLogService';
import { readJson, writeJson } from '../../services/localStore';
import { useAuth } from '../../context/AuthContext';
import { INSTITUTION, ROLE_LABELS } from '../../utils/constants';
import { formatDateTime } from '../../utils/format';

const PREFS_KEY = 'examsphere_profile_prefs_v1';
const PREF_OPTIONS = [
  ['submissionAlerts', 'Answer-sheet submission alerts', 'Show a notification when a candidate submits.'],
  ['publicationAlerts', 'Publication reminders', 'Remind me when an examination is still in draft.'],
];

/** Account details, preferences and password reset for staff accounts. */
export default function ProfilePage() {
  const { user, role } = useAuth();
  const { notify } = useToast();
  const prefsKey = user?.id || 'anonymous';
  const [prefs, setPrefs] = useState(() => ({ submissionAlerts: true, publicationAlerts: true, ...(readJson(PREFS_KEY, {})[prefsKey] || {}) }));
  const [sending, setSending] = useState(false);
  const myActivity = useMemo(() => activityLogService.list().filter((e) => e.actor.name === user?.name).slice(0, 8), [user]);

  const savePrefs = () => {
    const all = readJson(PREFS_KEY, {});
    writeJson(PREFS_KEY, { ...all, [prefsKey]: prefs });
    notify('Notification preferences saved.');
  };

  const resetPassword = async () => {
    setSending(true);
    const response = await authService.requestPasswordReset({ identifier: user?.email || '', role });
    setSending(false);
    notify(response.message, 'info', { title: 'Password reset requested' });
  };

  const rows = [
    ['Full name', user?.name],
    ['Role', ROLE_LABELS[role]],
    ['Email', user?.email],
    ['Staff ID', user?.staffId || '—'],
    ['Institution', INSTITUTION.name],
    ['Account ID', user?.id],
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="My Profile" description="Your account details are managed by the platform administrator." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Account details" subtitle="Verified from the institutional directory">
          <dl className="divide-y divide-slate-100 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-3">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="break-all text-slate-900 sm:col-span-2">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Security" subtitle="Sign-in protection">
          <div className="space-y-4 text-xs text-slate-600">
            <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Your role is verified against the institutional profile on every sign-in.</p>
            <p className="flex items-start gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> Password reset links are sent to your registered email address.</p>
            <Button variant="secondary" icon={KeyRound} isLoading={sending} onClick={resetPassword} className="w-full">Send password reset link</Button>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Notification preferences" footer={<div className="flex justify-end"><Button size="sm" onClick={savePrefs}>Save preferences</Button></div>}>
          <ul className="divide-y divide-slate-100">
            {PREF_OPTIONS.map(([key, label, help]) => (
              <li key={key} className="flex items-start justify-between gap-4 py-3">
                <label htmlFor={`pref-${key}`} className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{label}</span>
                  <span className="block text-xs text-slate-500">{help}</span>
                </label>
                <input id={`pref-${key}`} type="checkbox" checked={prefs[key]} onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })} className="mt-1 h-4 w-4 accent-[#1E3A5F]" />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="My recent activity" bodyClassName="p-0">
          {myActivity.length === 0 ? (
            <p className="px-5 py-6 text-xs text-slate-500">No recorded actions yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {myActivity.map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <p className="text-xs font-medium text-slate-900">{e.action}</p>
                  <p className="text-[11px] text-slate-500">{e.target && `${e.target} · `}{formatDateTime(e.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
