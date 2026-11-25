import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Building2, ClipboardList, HelpCircle, ScrollText, UserCog, Users } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import Alert from '../../components/common/Alert';
import { activityLogService } from '../../services/activityLogService';
import { platformApi } from '../../services/api/platformApi';
import { examsApi } from '../../services/api/examsApi';
import { select } from '../../services/api/core';
import { useAsync } from '../../utils/useAsync';
import { useDataVersion } from '../../utils/useDataVersion';
import { formatRelative } from '../../utils/format';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const version = useDataVersion();
  const { data, error } = useAsync(async () => {
    const [overview, exams, activity, admins, questions] = await Promise.all([
      platformApi.overview(),
      examsApi.list(),
      activityLogService.list({ limit: 8 }),
      select('profiles', 'id,full_name,email,staff_id,is_active', (q) => q.eq('role', 'admin').order('full_name')),
      select('questions', 'id', (q) => q.eq('is_archived', false)),
    ]);
    return { overview, exams, activity, admins, questionCount: questions.length };
  }, [version]);
  const overview = data?.overview || {};
  const exam = data?.exams.find((e) => e.status === 'published') || data?.exams[0] || null;
  const activity = data?.activity || [];
  const admins = (data?.admins || []).map((u) => ({ id: u.id, name: u.full_name, email: u.email, staffId: u.staff_id, status: u.is_active === false ? 'Inactive' : 'Active' }));
  const v = (x) => (data ? x ?? 0 : '—');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform Administration"
        title="Overview"
        actions={(
          <>
            <Button variant="secondary" icon={Building2} onClick={() => navigate('/super-admin/organizations')}>Institution profile</Button>
            <Button icon={UserCog} onClick={() => navigate('/super-admin/admins')}>Admin Management</Button>
          </>
        )}
      />

      {error && <Alert tone="danger" title="Could not load the overview">{error.message}</Alert>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform figures">
        <StatCard title="Question bank" value={v(data?.questionCount)} icon={HelpCircle} onClick={() => navigate('/admin/questions')} />
        <StatCard title="Admin accounts" value={v(overview.admins)} hint={`${admins.filter((u) => u.status === 'Active').length} active`} icon={UserCog} onClick={() => navigate('/super-admin/admins')} />
        <StatCard title="Student accounts" value={v(overview.students)} hint={`${v(overview.publishedExams)} published examination(s)`} icon={Users} tone="success" />
        <StatCard title="Answer sheets" value={v(overview.evaluatedSubmissions)} hint={`${v(overview.activeAttempts)} attempt(s) in progress`} icon={ClipboardList} tone="neutral" onClick={() => navigate('/admin/results')} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Examination office staff"
          bodyClassName="p-0"
          action={<Link to="/super-admin/admins" className="text-xs font-semibold text-[#1E3A5F] hover:underline">Manage</Link>}
        >
          <Table className="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Staff ID</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((u) => (
                <TableRow key={u.id}>
                  <TableCell><p className="font-medium text-slate-900">{u.name}</p><p className="text-[11px] text-slate-500">{u.email}</p></TableCell>
                  <TableCell className="hidden font-mono sm:table-cell">{u.staffId || '—'}</TableCell>
                  <TableCell><StatusBadge status={u.status} size="sm" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card title="Current examination">
          {!exam ? <EmptyState compact title={data ? 'No examinations yet' : 'Loading…'} /> : (
            <>
              <p className="font-mono text-xs font-bold text-[#1E3A5F]">{exam.courseCode}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{exam.title}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge status={exam.isPublished ? 'Published' : exam.status === 'closed' ? 'Closed' : 'Draft'} />
                <StatusBadge status={exam.patternCount === 10 && !exam.patternsStale ? 'Verified' : 'Failed'}>{exam.patternCount === 10 && !exam.patternsStale ? 'Patterns generated' : 'Patterns not generated'}</StatusBadge>
              </div>
              <dl className="mt-4 divide-y divide-slate-100 text-xs">
                {[['Patterns', `${exam.patternCount} × ${exam.questionCount} questions`], ['Duration', `${exam.durationMinutes} min`], ['Total marks', exam.totalMarks ?? '—']].map(([k, val]) => (
                  <div key={k} className="flex justify-between py-2"><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-slate-900">{val}</dd></div>
                ))}
              </dl>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Activity} onClick={() => navigate('/super-admin/monitoring')}>System status</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/admin/exams')}>Open console</Button>
          </div>
        </Card>
      </div>

      <Card title="Recent platform activity" bodyClassName="p-0" action={<Link to="/super-admin/activity" className="text-xs font-semibold text-[#1E3A5F] hover:underline">Activity logs</Link>}>
        {activity.length === 0 ? (
          <EmptyState compact icon={ScrollText} title="No activity recorded yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-900"><span className="font-semibold">{e.actor.name}</span> · {e.action}{e.target ? <span className="text-slate-500"> · {e.target}</span> : null}</p>
                <p className="text-[11px] text-slate-500">{formatRelative(e.at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
