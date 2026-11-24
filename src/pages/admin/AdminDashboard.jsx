import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, Circle, ClipboardList, FileSpreadsheet, HelpCircle, Timer, Users,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { examRandomizerService } from '../../services/examRandomizerService';
import { questionBankService } from '../../services/questionBankService';
import { studentRosterService } from '../../services/studentRosterService';
import { activityLogService } from '../../services/activityLogService';
import { useDataVersion } from '../../utils/useDataVersion';
import { formatRelative } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';

function Step({ done, label, detail, to }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${done ? 'text-emerald-600' : 'text-slate-300'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${done ? 'text-slate-900' : 'text-slate-700'}`}>{label}</p>
        <p className="text-[11px] text-slate-500">{detail}</p>
      </div>
      {to && !done && <Link to={to} className="shrink-0 text-[11px] font-semibold text-[#1E3A5F] hover:underline">Open</Link>}
    </li>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  useDataVersion(); // re-render when exam, roster or activity data changes

  const data = (() => {
    const exam = examRandomizerService.getExamState();
    const questions = questionBankService.getQuestions();
    const roster = studentRosterService.list();
    const attempts = examRandomizerService.listAttempts();
    const submitted = attempts.filter((a) => a.status === 'submitted' && a.result);
    const avg = submitted.length ? submitted.reduce((s, a) => s + a.result.percentage, 0) / submitted.length : null;
    return {
      exam,
      questions,
      roster,
      eligible: roster.filter((s) => s.status === 'Eligible').length,
      active: attempts.filter((a) => a.status === 'active').length,
      submitted,
      avg,
      activity: activityLogService.list().slice(0, 6),
    };
  })();

  const { exam } = data;
  const verified = Boolean(exam.verificationReport?.isValid);
  const byName = Object.fromEntries(data.roster.map((s) => [s.usn, s.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Examination Office"
        title="Dashboard"
        description={`Welcome, ${(user?.name || 'Administrator').replace(/\.$/, '')}. Track the current examination, candidates and submissions.`}
        actions={(
          <>
            <Button variant="secondary" icon={HelpCircle} onClick={() => navigate('/admin/questions')}>Question Bank</Button>
            <Button icon={FileSpreadsheet} onClick={() => navigate('/admin/exams')}>Manage Examination</Button>
          </>
        )}
      />

      <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 bg-[#1E3A5F] px-5 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">Current examination</p>
          <span className="text-[11px] text-slate-200">Last generated {(formatRelative(exam.lastGeneratedAt) || '—').toLowerCase()}</span>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-bold text-[#1E3A5F]">{exam.meta.courseCode}</span>
              <StatusBadge status={exam.isPublished ? 'Published' : 'Draft'} />
              <StatusBadge status={verified ? 'Verified' : 'Invalid'}>{verified ? 'Patterns verified' : 'Verification failed'}</StatusBadge>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">{exam.meta.courseTitle}</h2>
            <p className="text-xs text-slate-600">{exam.meta.semester}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-4">
              {[
                ['Exam date', exam.meta.examDate],
                ['Duration', `${exam.meta.durationMinutes} min`],
                ['Questions', `${exam.masterQuestions?.length ?? 25} MCQs`],
                ['Total marks', exam.meta.totalMarks],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate('/admin/exams')} rightIcon={ArrowRight}>Open examination console</Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/admin/results')}>View results</Button>
            </div>
          </div>
          <div className="lg:col-span-2 lg:border-l lg:border-slate-200 lg:pl-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Readiness checklist</p>
            <ol className="divide-y divide-slate-100">
              <Step done={data.questions.length >= 25} label="Question bank has 25+ questions" detail={`${data.questions.length} questions available`} to="/admin/questions" />
              <Step done={(exam.masterQuestions?.length ?? 0) === 25} label="25 questions selected" detail="Master set for this examination" to="/admin/questions" />
              <Step done={verified} label="10 patterns generated and verified" detail="Patterns A–J with independent option order" to="/admin/exams" />
              <Step done={data.eligible > 0} label="Candidates eligible" detail={`${data.eligible} of ${data.roster.length} on the roster`} to="/admin/students" />
              <Step done={exam.isPublished} label="Examination published" detail={exam.isPublished ? 'Visible to candidates' : 'Hidden from candidates'} to="/admin/exams" />
            </ol>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key figures">
        <StatCard title="Question bank" value={data.questions.length} hint="Validated MCQs available" icon={HelpCircle} onClick={() => navigate('/admin/questions')} />
        <StatCard title="Eligible candidates" value={`${data.eligible}/${data.roster.length}`} hint="On the examination roster" icon={Users} tone="success" onClick={() => navigate('/admin/students')} />
        <StatCard title="Attempts in progress" value={data.active} hint={data.active ? 'Candidates writing now' : 'No live attempts'} icon={Timer} tone={data.active ? 'warning' : 'neutral'} onClick={() => navigate('/admin/results')} />
        <StatCard title="Answer sheets evaluated" value={data.submitted.length} hint={data.avg === null ? 'No submissions yet' : `Average ${data.avg.toFixed(1)}%`} icon={ClipboardList} onClick={() => navigate('/admin/results')} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Recent submissions"
          subtitle="Latest evaluated answer sheets"
          action={<Link to="/admin/results" className="text-xs font-semibold text-[#1E3A5F] hover:underline">All results</Link>}
          bodyClassName="p-0"
        >
          {data.submitted.length === 0 ? (
            <EmptyState compact icon={ClipboardList} title="No submissions yet" description="Evaluated answer sheets appear here as candidates submit." />
          ) : (
            <Table className="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Paper</TableHead>
                  <TableHead align="right">Score</TableHead>
                  <TableHead align="right">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.submitted.slice(0, 6).map((a) => (
                  <TableRow key={a.attemptId}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{byName[a.studentIdentifier] || 'Candidate'}</p>
                      <p className="font-mono text-[11px] text-slate-500">{a.studentIdentifier}</p>
                    </TableCell>
                    <TableCell className="font-mono">{a.paperCode}</TableCell>
                    <TableCell align="right" className="tabular-nums">
                      <span className="font-semibold text-slate-900">{a.result.score}</span> / {a.result.maxScore}
                    </TableCell>
                    <TableCell align="right" className="text-slate-500">{formatRelative(a.submittedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card title="Recent activity" subtitle="Actions recorded in this portal" bodyClassName="p-0">
          {data.activity.length === 0 ? (
            <EmptyState compact title="No activity yet" description="Publishing, imports and submissions are recorded here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.activity.map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <p className="text-xs font-medium text-slate-900">{e.action}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{e.actor.name}{e.target ? ` · ${e.target}` : ''} · {formatRelative(e.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
