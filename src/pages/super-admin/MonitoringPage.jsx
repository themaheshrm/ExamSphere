import React, { useEffect, useState } from 'react';
import { CheckCircle2, Database, Globe, HardDrive, RefreshCw, ShieldCheck, Timer, XCircle } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { supabase } from '../../services/supabase';
import { select } from '../../services/api/core';
import { examsApi } from '../../services/api/examsApi';
import { formatDateTime, formatRelative } from '../../utils/format';

/** One round trip per data area, timed; failures are reported, not thrown. */
async function probe() {
  const timed = async (fn) => {
    const t = performance.now();
    try {
      const value = await fn();
      return { ok: true, ms: Math.round(performance.now() - t), value };
    } catch (error) {
      return { ok: false, ms: Math.round(performance.now() - t), error: error.message };
    }
  };
  const [settings, exams, questions, active] = await Promise.all([
    timed(() => select('platform_settings', 'id', (q) => q.limit(1))),
    timed(() => examsApi.list()),
    timed(() => select('questions', 'id', (q) => q.eq('is_archived', false))),
    timed(() => select('admin_exam_candidates', 'attempt_id,started_at,exam_id', (q) => q.eq('attempt_status', 'active'))),
  ]);
  return { settings, exams, questions, active };
}

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

  const [result, setResult] = useState(null);
  useEffect(() => {
    let cancelled = false;
    probe().then((r) => { if (!cancelled) setResult({ ...r, at: checkedAt }); });
    return () => { cancelled = true; };
  }, [checkedAt]);
  const fresh = result?.at === checkedAt ? result : null;
  const exams = fresh?.exams.ok ? fresh.exams.value : [];
  const live = exams.filter((e) => e.status === 'published');
  const intact = live.every((e) => e.patternCount === 10 && !e.patternsStale);
  const bankSize = fresh?.questions.ok ? fresh.questions.value.length : 0;
  const active = fresh?.active.ok ? fresh.active.value : [];
  const oldestActive = active.reduce((min, a) => (!min || a.started_at < min ? a.started_at : min), null);
  const pending = !fresh;

  const checks = [
    { label: 'Network connectivity', ok: online, detail: online ? 'Browser is online' : 'Browser reports offline', icon: Globe },
    { label: 'Authentication service', ok: authStatus.state === 'ok', pending: authStatus.state === 'checking', detail: authStatus.state === 'ok' ? `Session verified in ${authStatus.ms} ms` : authStatus.state === 'checking' ? 'Checking…' : 'Session could not be verified', icon: ShieldCheck },
    { label: 'Database', ok: Boolean(fresh?.settings.ok), pending, detail: pending ? 'Checking…' : fresh.settings.ok ? `Responded in ${fresh.settings.ms} ms` : fresh.settings.error, icon: HardDrive },
    { label: 'Pattern integrity', ok: Boolean(fresh?.exams.ok) && intact, pending, detail: pending ? 'Checking…' : `${live.length} published examination(s)${intact ? ', all with 10 verified patterns' : ', patterns need regeneration'}`, icon: CheckCircle2 },
    { label: 'Question bank', ok: bankSize >= 25, pending, detail: pending ? 'Checking…' : `${bankSize} active questions`, icon: Database },
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
        <Card title="Examination workload">
          <dl className="divide-y divide-slate-100 text-xs">
            {[
              ['Attempts in progress', pending ? '—' : active.length],
              ['Oldest running attempt', oldestActive ? `Started ${formatRelative(oldestActive)}` : '—'],
              ['Answer sheets submitted', pending ? '—' : exams.reduce((n, e) => n + e.submittedAttempts, 0)],
              ['Published examinations', pending ? '—' : live.length],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Examinations" bodyClassName="p-0" action={<Timer className="h-4 w-4 text-slate-400" aria-hidden="true" />}>
          <Table className="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>Examination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="right">Running / submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((e) => (
                <TableRow key={e.id}>
                  <TableCell><span className="font-mono text-xs font-semibold text-[#1E3A5F]">{e.courseCode}</span><span className="block text-[11px] text-slate-500">{e.title}</span></TableCell>
                  <TableCell><StatusBadge status={e.isPublished ? 'Published' : e.status === 'closed' ? 'Closed' : 'Draft'} size="sm" /></TableCell>
                  <TableCell align="right" className="tabular-nums">{e.activeAttempts} / {e.submittedAttempts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
