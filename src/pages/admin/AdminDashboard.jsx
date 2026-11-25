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
import Alert from '../../components/common/Alert';
import { useAdminExamContext } from '../../utils/useAdminExamContext';
import { ExamSwitcher, AdminExamGate } from '../../components/admin/ExamScope';
import { examsApi, examDateOf } from '../../services/api/examsApi';
import { questionsApi } from '../../services/api/questionsApi';
import { rosterApi } from '../../services/api/rosterApi';
import { activityLogService } from '../../services/activityLogService';
import { useAsync, useAutoReload } from '../../utils/useAsync';
import { formatRelative } from '../../utils/format';

function Step({ done, label, detail, to }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${done ? 'text-emerald-600' : 'text-slate-300'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${done ? 'text-slate-900' : 'text-slate-700'}`}>{label}</p>
        {detail && <p className="text-[11px] text-slate-500">{detail}</p>}
      </div>
      {to && !done && <Link to={to} className="shrink-0 text-[11px] font-semibold text-[#1E3A5F] hover:underline">Open</Link>}
    </li>
  );
}

async function loadDashboard(exam) {
  const [bank, roster, candidates, activity] = await Promise.all([
    questionsApi.list(),
    rosterApi.list(),
    examsApi.candidates(exam.id),
    // RLS already limits subject-scoped admins to their own actions.
    activityLogService.list({ limit: 6 }),
  ]);
  const submitted = candidates
    .filter((c) => ['submitted', 'auto_submitted'].includes(c.attemptStatus) && c.score !== null)
    .map((c) => ({ attemptId: c.attemptId, studentIdentifier: c.usn, name: c.name, paperCode: c.paperCode, submittedAt: c.submittedAt, result: { score: c.score, maxScore: c.maxScore, percentage: c.percentage } }))
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return {
    questions: bank.filter((x) => x.subjectCode === exam.courseCode),
    roster,
    eligible: candidates.filter((c) => c.assignmentStatus === 'assigned').length,
    active: candidates.filter((c) => c.attemptStatus === 'active').length,
    submitted,
    avg: submitted.length ? submitted.reduce((sum, a) => sum + a.result.percentage, 0) / submitted.length : null,
    activity,
  };
}

function DashboardView({ exam: current, examCode, summaries, selectExam, scope }) {
  const navigate = useNavigate();
  const q = `?exam=${examCode}`;
  const { data: loaded, error, reload } = useAsync(() => loadDashboard(current), [current.id]);
  useAutoReload(reload, 30000);
  const data = loaded || { questions: [], roster: [], eligible: 0, active: 0, submitted: [], avg: null, activity: [] };

  // Shape the server exam like the console expects.
  const exam = {
    isPublished: current.isPublished,
    lastGeneratedAt: current.patternsGeneratedAt,
    masterQuestions: { length: current.questionCount },
    meta: {
      courseCode: current.courseCode, courseTitle: current.courseTitle, semester: current.semesterLabel,
      examDate: examDateOf(current) || '—', durationMinutes: current.durationMinutes, totalMarks: current.totalMarks ?? '—',
    },
  };
  const verified = current.patternCount === 10 && !current.patternsStale;
  const byName = Object.fromEntries(data.submitted.map((a) => [a.studentIdentifier, a.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Examination Office"
        title="Dashboard"
        description={scope.scoped ? `Assigned subject: ${scope.label}` : undefined}
        actions={(
          <>
            <ExamSwitcher summaries={summaries} value={examCode} onChange={selectExam} />
            <Button variant="secondary" icon={HelpCircle} onClick={() => navigate(`/admin/questions${q}`)}>Question Bank</Button>
            <Button icon={FileSpreadsheet} onClick={() => navigate(`/admin/exams${q}`)}>Manage Examination</Button>
          </>
        )}
      />

      {error && (
        <Alert tone="danger" title="Could not load dashboard data">
          {error.message} <button type="button" className="ml-2 font-semibold underline" onClick={reload}>Try again</button>
        </Alert>
      )}

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
              <Button size="sm" onClick={() => navigate(`/admin/exams${q}`)} rightIcon={ArrowRight}>Open examination console</Button>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/results${q}`)}>View results</Button>
            </div>
          </div>
          <div className="lg:col-span-2 lg:border-l lg:border-slate-200 lg:pl-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Readiness checklist</p>
            <ol className="divide-y divide-slate-100">
              <Step done={data.questions.length >= 25} label="Question bank has 25+ questions" detail={`${data.questions.length} in bank`} to={`/admin/questions${q}`} />
              <Step done={(exam.masterQuestions?.length ?? 0) === 25} label="25 questions selected" to={`/admin/questions${q}`} />
              <Step done={verified} label="10 patterns generated and verified" to={`/admin/exams${q}`} />
              <Step done={data.eligible > 0} label="Candidates eligible" detail={`${data.eligible} of ${data.roster.length} on the roster`} to={`/admin/students${q}`} />
              <Step done={exam.isPublished} label="Examination published" to={`/admin/exams${q}`} />
            </ol>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key figures">
        <StatCard title="Question bank" value={data.questions.length} icon={HelpCircle} onClick={() => navigate(`/admin/questions${q}`)} />
        <StatCard title="Eligible candidates" value={`${data.eligible}/${data.roster.length}`} icon={Users} tone="success" onClick={() => navigate(`/admin/students${q}`)} />
        <StatCard title="Attempts in progress" value={data.active} icon={Timer} tone={data.active ? 'warning' : 'neutral'} onClick={() => navigate(`/admin/results${q}`)} />
        <StatCard title="Answer sheets evaluated" value={data.submitted.length} hint={data.avg === null ? undefined : `Average ${data.avg.toFixed(1)}%`} icon={ClipboardList} onClick={() => navigate(`/admin/results${q}`)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Recent submissions"
          action={<Link to={`/admin/results${q}`} className="text-xs font-semibold text-[#1E3A5F] hover:underline">All results</Link>}
          bodyClassName="p-0"
        >
          {data.submitted.length === 0 ? (
            <EmptyState compact icon={ClipboardList} title="No submissions yet" />
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

        <Card title="Recent activity" bodyClassName="p-0">
          {data.activity.length === 0 ? (
            <EmptyState compact title="No activity yet" />
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

export default function AdminDashboard() {
  const ctx = useAdminExamContext();
  return (
    <AdminExamGate ctx={ctx} eyebrow="Examination Office" title="Dashboard" requireExam>
      {(c) => <DashboardView key={c.exam.id} {...c} />}
    </AdminExamGate>
  );
}
