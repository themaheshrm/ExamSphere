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
import { platformService } from '../../services/platformService';
import { examRandomizerService } from '../../services/examRandomizerService';
import { studentRosterService } from '../../services/studentRosterService';
import { activityLogService } from '../../services/activityLogService';
import { questionBankService } from '../../services/questionBankService';
import { INSTITUTION } from '../../utils/constants';
import { useDataVersion } from '../../utils/useDataVersion';
import { formatRelative } from '../../utils/format';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  useDataVersion();

  const users = platformService.listUsers();
  const exam = examRandomizerService.getExamState();
  const attempts = examRandomizerService.listAttempts();
  const roster = studentRosterService.list();
  const activity = activityLogService.list().slice(0, 8);
  const admins = users.filter((u) => u.role === 'admin');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform Administration"
        title="Overview"
        description={`Staff accounts, examination status and portal activity for ${INSTITUTION.name}.`}
        actions={(
          <>
            <Button variant="secondary" icon={Building2} onClick={() => navigate('/super-admin/organizations')}>Institution profile</Button>
            <Button icon={UserCog} onClick={() => navigate('/super-admin/users')}>Manage staff accounts</Button>
          </>
        )}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform figures">
        <StatCard title="Question bank" value={questionBankService.getQuestions().length} hint="Validated MCQs" icon={HelpCircle} onClick={() => navigate('/admin/questions')} />
        <StatCard title="Staff accounts" value={users.length} hint={`${users.filter((u) => u.status === 'Active').length} active accounts`} icon={UserCog} onClick={() => navigate('/super-admin/users')} />
        <StatCard title="Candidates on roster" value={roster.length} hint={`${exam.meta.courseCode} · ${INSTITUTION.shortName}`} icon={Users} tone="success" />
        <StatCard title="Answer sheets" value={attempts.filter((a) => a.status === 'submitted').length} hint={`${attempts.filter((a) => a.status === 'active').length} attempt(s) in progress`} icon={ClipboardList} tone="neutral" onClick={() => navigate('/admin/results')} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Examination office staff"
          subtitle={`Administrators of ${INSTITUTION.office}`}
          bodyClassName="p-0"
          action={<Link to="/super-admin/users" className="text-xs font-semibold text-[#1E3A5F] hover:underline">Manage</Link>}
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

        <Card title="Current examination" subtitle={INSTITUTION.name}>
          <p className="font-mono text-xs font-bold text-[#1E3A5F]">{exam.meta.courseCode}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{exam.meta.courseTitle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={exam.isPublished ? 'Published' : 'Draft'} />
            <StatusBadge status={exam.verificationReport?.isValid ? 'Verified' : 'Failed'}>{exam.verificationReport?.isValid ? 'Patterns verified' : 'Verification failed'}</StatusBadge>
          </div>
          <dl className="mt-4 divide-y divide-slate-100 text-xs">
            {[['Patterns', '10 × 25 questions'], ['Duration', `${exam.meta.durationMinutes} min`], ['Total marks', exam.meta.totalMarks]].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2"><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-slate-900">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Activity} onClick={() => navigate('/super-admin/monitoring')}>System status</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/admin/exams')}>Open console</Button>
          </div>
        </Card>
      </div>

      <Card title="Recent platform activity" bodyClassName="p-0" action={<Link to="/super-admin/activity" className="text-xs font-semibold text-[#1E3A5F] hover:underline">Activity logs</Link>}>
        {activity.length === 0 ? (
          <EmptyState compact icon={ScrollText} title="No activity recorded yet" description="Administrative actions and submissions appear here." />
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
