import React, { useEffect, useState } from 'react';
import { CheckCircle2, Database, Globe, HardDrive, RefreshCw, ShieldCheck, Timer, XCircle } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { examRandomizerService } from '../../services/examRandomizerService';
import { questionBankService } from '../../services/questionBankService';
import { supabase } from '../../services/supabase';
import { formatDateTime, formatRelative } from '../../utils/format';

const STORE_LABELS = {
  examsphere_randomized_exam_v1: 'Examination state & patterns',
  examsphere_paper_attempts_v2: 'Attempt registry (paper snapshots)',
  examsphere_student_attempts_v1: 'Candidate results',
  examsphere_question_bank_v1: 'Question bank',
  examsphere_candidate_roster_v1: 'Candidate roster',
  examsphere_activity_log_v1: 'Activity log',
  examsphere_platform_users_v1: 'Staff accounts',
  examsphere_platform_settings_v1: 'Platform settings',
};

function readStorage() {
  const rows = [];
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      const bytes = (localStorage.getItem(key) || '').length * 2;
      total += bytes;
      if (key.startsWith('examsphere_')) rows.push({ key, label: STORE_LABELS[key] || key, bytes });
    }
  } catch {
    // storage blocked
  }
  return { rows: rows.sort((a, b) => b.bytes - a.bytes), total };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/** Health of the services this deployment actually depends on. */
export default function MonitoringPage() {
  const [checkedAt, setCheckedAt] = useState(() => new Date().toISOString());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [authStatus, setAuthStatus] = useState({ state: 'checking', ms: null });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        setAuthStatus({ state: error ? 'error' : data?.session ? 'ok' : 'no-session', ms: Math.round(performance.now() - started) });
      })
      .catch(() => { if (!cancelled) setAuthStatus({ state: 'error', ms: null }); });
    return () => { cancelled = true; };
  }, [checkedAt]);

  const exam = examRandomizerService.getExamState();
  const attempts = examRandomizerService.listAttempts();
  const bankSize = questionBankService.getQuestions().length;
  const storage = readStorage();
  const active = attempts.filter((a) => a.status === 'active');
  const oldestActive = active.reduce((min, a) => (!min || a.startedAt < min ? a.startedAt : min), null);

  const checks = [
    { label: 'Network connectivity', ok: online, detail: online ? 'Browser is online' : 'Browser reports offline', icon: Globe },
    { label: 'Authentication service', ok: authStatus.state === 'ok', pending: authStatus.state === 'checking', detail: authStatus.state === 'ok' ? `Session verified in ${authStatus.ms} ms` : authStatus.state === 'checking' ? 'Checking…' : 'Session could not be verified', icon: ShieldCheck },
    { label: 'Pattern integrity', ok: Boolean(exam.verificationReport?.isValid), detail: `Verified ${formatRelative(exam.verificationReport?.timestamp) || '—'}`, icon: CheckCircle2 },
    { label: 'Question bank', ok: bankSize >= 25, detail: `${bankSize} questions available (25 required)`, icon: Database },
    { label: 'Attempt storage', ok: storage.rows.length > 0, detail: `${kb(storage.total)} used in this browser`, icon: HardDrive },
  ];
  const healthy = checks.every((c) => c.ok || c.pending);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform Administration"
        title="System Monitoring"
        meta={<span>Last checked {formatDateTime(checkedAt)}</span>}
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => { setAuthStatus({ state: 'checking', ms: null }); setCheckedAt(new Date().toISOString()); }}>Run checks again</Button>}
      />

      <div className={`flex items-center gap-3 rounded-sm border px-4 py-3 text-sm ${healthy ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
        {healthy ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <XCircle className="h-5 w-5" aria-hidden="true" />}
        <span className="font-semibold">{healthy ? 'All systems operational' : 'Attention required'}</span>
        <span className="text-xs">{checks.filter((c) => c.ok).length} of {checks.length} checks passing</span>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Health checks">
        {checks.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-sm border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <StatusBadge status={c.pending ? 'Pending' : c.ok ? 'Active' : 'Failed'} size="sm">{c.pending ? 'Checking' : c.ok ? 'Healthy' : 'Issue'}</StatusBadge>
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-900">{c.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{c.detail}</p>
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Examination workload" subtitle={`${exam.meta.courseCode} · ${exam.isPublished ? 'published' : 'draft'}`}>
          <dl className="divide-y divide-slate-100 text-xs">
            {[
              ['Attempts in progress', active.length],
              ['Oldest running attempt', oldestActive ? `Started ${formatRelative(oldestActive)}` : '—'],
              ['Answer sheets submitted', attempts.filter((a) => a.status === 'submitted').length],
              ['Patterns generated', `${Object.keys(exam.patterns || {}).length} (last ${formatRelative(exam.lastGeneratedAt) || '—'})`],
              ['Configured duration', `${exam.meta.durationMinutes} minutes`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Client data stores" bodyClassName="p-0" action={<Timer className="h-4 w-4 text-slate-400" aria-hidden="true" />}>
          <Table className="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead align="right">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {storage.rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{r.label}<span className="block font-mono text-[10px] text-slate-400">{r.key}</span></TableCell>
                  <TableCell align="right" className="tabular-nums">{kb(r.bytes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
