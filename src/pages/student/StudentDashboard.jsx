import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Award, Bell, BookOpenCheck, CalendarDays, CheckCheck, Clock, KeyRound, LifeBuoy, Megaphone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import Badge from '../../components/common/Badge';
import Alert from '../../components/common/Alert';
import EmptyState from '../../components/common/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { useToast } from '../../components/common/Toast';
import { authService } from '../../services/authService';
import { studentExamApi } from '../../services/api/studentExamApi';
import { rosterApi } from '../../services/api/rosterApi';
import { platformApi } from '../../services/api/platformApi';
import { useAsync, useAutoReload } from '../../utils/useAsync';
import { useNotifications } from '../../utils/useNotifications';
import { useSettings } from '../../context/SettingsContext';
import { formatDateTime } from '../../utils/format';
import { INSTITUTION, USER_ROLES } from '../../utils/constants';

const TAB_TITLES = {
  dashboard: ['Dashboard', null],
  exams: ['My Examinations', null],
  results: ['Results', null],
  notifications: ['Notifications', null],
  profile: ['My Profile', null],
  support: ['Help & Support', null],
};

const STATUS = {
  in_progress: ['In progress', 'Attempt in progress'],
  completed: ['Submitted', 'Submitted'],
  live: ['Live', 'Open now'],
  upcoming: ['Upcoming', 'Not yet open'],
  closed: ['Closed', 'Closed'],
  entry_closed: ['Closed', 'Entry closed'],
};
const ORDER = { in_progress: 0, live: 1, upcoming: 2, completed: 3, entry_closed: 4, closed: 5 };
const EMPTY_META = { courseCode: '—', courseTitle: '—', examDate: '—', durationMinutes: '—', totalMarks: '—', totalQuestions: 25, instructions: [] };

async function loadStudentHome() {
  const [exams, withheld, profile, notices] = await Promise.all([
    studentExamApi.myExams(),
    studentExamApi.withheld(),
    rosterApi.list().then((rows) => rows[0] || null), // RLS: only the student's own row
    platformApi.announcements().catch(() => []),
  ]);
  const submittedIds = exams.filter((e) => ['submitted', 'auto_submitted'].includes(e.attemptStatus)).map((e) => e.examId);
  const [details, results] = await Promise.all([
    studentExamApi.examDetails(exams.map((e) => e.examId)),
    Promise.all(submittedIds.map((id) => studentExamApi.myResult(id).then((r) => [id, r]))),
  ]);
  return { exams, withheld, profile, notices, details, results: Object.fromEntries(results) };
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { notify } = useToast();
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = TAB_TITLES[searchParams.get('tab')] ? searchParams.get('tab') : 'dashboard';
  const [detailsExam, setDetailsExam] = useState(null);
  const [sendingReset, setSendingReset] = useState(false);
  const isStudentAccount = user?.role === USER_ROLES.STUDENT;
  const { data, error, loading, reload } = useAsync(() => (isStudentAccount ? loadStudentHome() : Promise.resolve(null)), [user?.id, isStudentAccount]);
  useAutoReload(reload, 60000);
  const { items: notifications, unread, markRead } = useNotifications();
  const announcements = data?.notices || [];

  // Genuine data only: the signed-in account and its own student record.
  const record = data?.profile;
  const currentStudent = {
    name: user?.name || record?.name || '—',
    usn: user?.usn || user?.identifier || '—',
    department: record?.department || '—',
    semester: record?.semester ? `Semester ${record.semester}` : '—',
    section: record?.section ? `Section ${record.section}` : '—',
    institution: INSTITUTION.name,
    email: user?.email || record?.email || '—',
  };
  const withheld = data?.withheld || [];
  const eligible = withheld.length === 0 || (data?.exams || []).length > 0;
  const withheldReason = withheld.map((w) => w.reason).filter(Boolean)[0] || '';

  const go = (tab) => setSearchParams({ tab });
  const openExam = (code) => navigate(`/student/exam?exam=${encodeURIComponent(code)}`);

  // Assigned examinations from the server (published / closed only), most urgent first.
  const exams = (data?.exams || []).map((e) => {
    const [status, label] = STATUS[e.availability] || ['Closed', 'Closed'];
    const result = data.results[e.examId] || null;
    const detail = data.details[e.examId] || {};
    return {
      examId: e.examId,
      code: e.courseCode,
      availability: e.availability,
      status,
      label,
      deadlineAt: e.deadlineAt,
      patternLabel: e.patternLabel,
      active: e.availability === 'in_progress',
      result,
      meta: {
        courseCode: e.courseCode,
        courseTitle: e.title || e.courseTitle,
        semester: detail.semesterLabel,
        examDate: e.windowStart ? formatDateTime(e.windowStart) : '—',
        windowEnd: e.windowEnd,
        durationMinutes: e.durationMinutes,
        totalMarks: e.totalMarks ?? '—',
        totalQuestions: e.totalQuestions || 25,
        instructions: detail.instructions || [],
      },
    };
  }).sort((x, y) => (ORDER[x.availability] ?? 9) - (ORDER[y.availability] ?? 9));
  const current = exams[0] || null;
  const subjectExams = exams.slice(1);
  const meta = current?.meta || EMPTY_META;
  const withResults = exams.filter((e) => e.result);

  const examActionFor = (exam, size = 'md') => {
    if (!isStudentAccount) return <Button size={size} variant="secondary" disabled>Students only</Button>;
    if (!exam) return <Button size={size} variant="secondary" disabled>Not yet open</Button>;
    if (exam.active) return <Button size={size} onClick={() => openExam(exam.code)} rightIcon={ArrowRight}>Resume examination</Button>;
    if (exam.result || exam.availability === 'completed') return <Button size={size} variant="secondary" onClick={() => go('results')}>View submission</Button>;
    if (exam.availability === 'live') return <Button size={size} onClick={() => openExam(exam.code)} rightIcon={ArrowRight}>Start examination</Button>;
    if (exam.availability === 'upcoming') return <Button size={size} variant="secondary" disabled title={`Opens ${exam.meta.examDate}`}>Not yet open</Button>;
    return <Button size={size} variant="secondary" disabled>Closed</Button>;
  };
  const examAction = (size = 'md') => examActionFor(current, size);
  const subjectAction = (exam) => examActionFor(exam, 'sm');
  const cbtState = current?.status || 'Draft';
  const cbtLabel = current?.label || 'No examination assigned';
  const isCbtPublished = Boolean(current);
  const assignedPattern = current?.patternLabel;
  const activeAttempt = current?.active ? current : null;

  const resetPassword = async () => {
    setSendingReset(true);
    const response = await authService.requestPasswordReset({ identifier: currentStudent.usn, role: USER_ROLES.STUDENT });
    setSendingReset(false);
    notify(response.message, 'info', { title: 'Password reset requested' });
  };

  const [title, description] = TAB_TITLES[activeTab];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${INSTITUTION.shortName} · Candidate Portal`}
        title={title}
        description={description}
        meta={activeTab === 'dashboard' ? (
          <>
            <span className="font-semibold text-slate-900">{currentStudent.name}</span>
            <span className="font-mono text-[#1E3A5F]">{currentStudent.usn}</span>
            <span className="hidden text-slate-300 sm:inline">|</span>
            <span>{currentStudent.department}</span>
            <span className="hidden text-slate-300 sm:inline">|</span>
            <span>{currentStudent.semester} · {currentStudent.section}</span>
          </>
        ) : null}
      />

      {error && (
        <Alert tone="danger" title="Could not load your examinations">
          {error.message} <button type="button" className="ml-2 font-semibold underline" onClick={reload}>Try again</button>
        </Alert>
      )}
      {loading && !data && isStudentAccount && <p className="text-sm text-slate-500" role="status">Loading your examinations…</p>}
      {withheld.length > 0 && (
        <Alert tone="danger" title="Examination access withheld">
          {withheldReason ? `Reason: ${withheldReason}. ` : ''}Contact the examination office at {settings.supportEmail} or {settings.helplinePhone}.
        </Alert>
      )}

      {/* ═══ DASHBOARD ═══ */}
      {activeTab === 'dashboard' && (
        <>
          {!current && data && (
            <Card title="Current examination">
              <EmptyState compact icon={BookOpenCheck} title="No examination assigned yet" />
            </Card>
          )}
          {current && <section className="overflow-hidden rounded-sm border border-slate-300 bg-white" aria-labelledby="next-exam-heading">
            <div className="flex items-center justify-between bg-[#1E3A5F] px-5 py-2.5 text-white">
              <h2 id="next-exam-heading" className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Current examination</h2>
              <span className="text-[11px] text-slate-200">Computer-based test</span>
            </div>
            <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-bold text-[#1E3A5F]">{meta.courseCode}</span>
                  <StatusBadge status={cbtState}>{cbtLabel}</StatusBadge>
                  {isCbtPublished && assignedPattern && settings.showPatternToCandidates && (
                    <Badge variant="primary" className="font-mono">Paper {meta.courseCode}-{assignedPattern}</Badge>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{meta.courseTitle}</h3>
                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /><dt className="sr-only">Date</dt><dd className="font-medium text-slate-900">{meta.examDate}</dd></div>
                  <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /><dt className="sr-only">Time</dt><dd className="font-medium text-slate-900">{meta.durationMinutes} min</dd></div>
                  <div><dt className="inline">Marks: </dt><dd className="inline font-medium text-slate-900">{meta.totalMarks} ({meta.totalQuestions} MCQs)</dd></div>
                </dl>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setDetailsExam(current)}>Instructions</Button>
                {examAction()}
              </div>
            </div>
            {activeAttempt && (
              <div className="border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-900">
                Attempt in progress{activeAttempt.deadlineAt ? ` — submits automatically at ${formatDateTime(activeAttempt.deadlineAt)}` : ''}. The timer is running.
              </div>
            )}
          </section>}

          {subjectExams.length > 0 && (
            <Card title="Subject examinations" bodyClassName="p-0">
              <ul className="divide-y divide-slate-100">
                {subjectExams.map((exam) => (
                  <li key={exam.examId} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#1E3A5F]">{exam.meta.courseCode}</span>
                        <StatusBadge status={exam.status} size="sm">{exam.label}</StatusBadge>
                      </p>
                      <p className="text-sm font-medium text-slate-900">{exam.meta.courseTitle}</p>
                      <p className="text-[11px] text-slate-500">{exam.meta.totalQuestions} MCQs · {exam.meta.totalMarks} marks · {exam.meta.durationMinutes} min</p>
                    </div>
                    <div className="shrink-0">{subjectAction(exam)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <section className="grid grid-cols-3 gap-2 sm:gap-4" aria-label="Summary">
            {[
              ['Open examinations', exams.filter((e) => e.availability === 'live' || e.availability === 'in_progress').length, 'exams', BookOpenCheck],
              ['Results', withResults.filter((e) => e.result.released).length, 'results', Award],
              ['Unread notifications', unread.length, 'notifications', Bell],
            ].map(([label, value, tab, Icon]) => (
              <button key={tab} type="button" onClick={() => go(tab)} className="flex items-start justify-between rounded-sm border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 sm:items-center sm:p-4">
                <span>
                  <span className="block text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-[11px]">{label}</span>
                  <span className="mt-1 block text-xl sm:text-2xl font-semibold tabular-nums text-slate-900">{value}</span>
                </span>
                <Icon className="hidden h-5 w-5 text-slate-300 sm:block" aria-hidden="true" />
              </button>
            ))}
          </section>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3" title="Recent results" action={<button type="button" onClick={() => go('results')} className="text-xs font-semibold text-[#1E3A5F] hover:underline">All results</button>} bodyClassName="p-0">
              <Table className="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead align="center">Marks</TableHead>
                    <TableHead align="center">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withResults.filter((e) => e.result.released).map(({ examId, result }) => (
                    <TableRow key={examId}>
                      <TableCell><span className="font-mono font-semibold text-[#1E3A5F]">{result.courseCode}</span> {result.courseTitle} <Badge size="sm" variant="primary" className="ml-1">Provisional</Badge></TableCell>
                      <TableCell align="center" className="tabular-nums">{result.score} / {result.maxScore}</TableCell>
                      <TableCell align="center"><StatusBadge status={result.passed ? 'Pass' : 'Fail'} size="sm" /></TableCell>
                    </TableRow>
                  ))}
                  {!withResults.some((e) => e.result.released) && (
                    <TableRow><TableCell colSpan={3} className="text-center text-xs text-slate-500">No results yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>

            <Card className="lg:col-span-2" title="Notices from the examination office" bodyClassName="p-0">
              <ul className="divide-y divide-slate-100">
                {announcements.length === 0 && <li className="px-5 py-3 text-xs text-slate-500">No notices.</li>}
                {announcements.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Badge size="sm" variant={a.priority === 'Urgent' ? 'danger' : a.priority === 'Official' ? 'primary' : 'neutral'}>{a.priority}</Badge>
                      <span className="text-[11px] text-slate-500">{a.date}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-900">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-600">{a.content}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      {/* ═══ EXAMS ═══ */}
      {activeTab === 'exams' && (
        <Card bodyClassName="p-0" title="Examination timetable" subtitle={INSTITUTION.academicYear}>
          <Table className="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead align="right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!current && (
                <TableRow><TableCell colSpan={4} className="text-center text-xs text-slate-500">{data ? 'No examination assigned yet.' : 'Loading…'}</TableCell></TableRow>
              )}
              {current && <TableRow>
                <TableCell>
                  <p className="font-mono text-xs font-semibold text-[#1E3A5F]">{meta.courseCode}</p>
                  <p className="font-medium text-slate-900">{meta.courseTitle}</p>
                  <p className="text-[11px] text-slate-500 sm:hidden">{meta.examDate} · {meta.durationMinutes} min</p>
                  <p className="mt-1 sm:hidden"><StatusBadge status={cbtState} size="sm">{cbtLabel}</StatusBadge></p>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{meta.examDate}<span className="block text-[11px] text-slate-500">{meta.durationMinutes} min</span></TableCell>
                <TableCell className="hidden sm:table-cell"><StatusBadge status={cbtState} size="sm">{cbtLabel}</StatusBadge></TableCell>
                <TableCell align="right"><div className="flex justify-end">{examAction('sm')}</div></TableCell>
              </TableRow>}
              {subjectExams.map((exam) => (
                <TableRow key={exam.examId}>
                  <TableCell>
                    <p className="font-mono text-xs font-semibold text-[#1E3A5F]">{exam.meta.courseCode}</p>
                    <p className="font-medium text-slate-900">{exam.meta.courseTitle}</p>
                    <p className="text-[11px] text-slate-500 sm:hidden">{exam.meta.examDate} · {exam.meta.durationMinutes} min</p>
                    <p className="mt-1 sm:hidden"><StatusBadge status={exam.status} size="sm">{exam.label}</StatusBadge></p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{exam.meta.examDate}<span className="block text-[11px] text-slate-500">{exam.meta.durationMinutes} min</span></TableCell>
                  <TableCell className="hidden sm:table-cell"><StatusBadge status={exam.status} size="sm">{exam.label}</StatusBadge></TableCell>
                  <TableCell align="right"><div className="flex justify-end">{subjectAction(exam)}</div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ═══ RESULTS ═══ */}
      {activeTab === 'results' && (
        <>
          {withResults.length === 0 && <Alert tone="info">No computer-based test has been submitted yet.</Alert>}

          {withResults.map(({ examId, result }) => (
            <Card key={examId} title={`${result.courseCode} — ${result.courseTitle}`} subtitle={`Submitted ${formatDateTime(result.submittedAt)} · Paper ${result.paperCode}`} action={<Badge variant="primary">Provisional</Badge>}>
              {result.released ? (
                <div className="grid gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200 sm:grid-cols-5">
                  {[
                    ['Score', `${result.score} / ${result.maxScore}`],
                    ['Percentage', `${result.percentage}%`],
                    ['Result', result.passed ? 'Pass' : 'Below pass mark'],
                    ['Correct', result.correctCount],
                    ['Not attempted', result.unattemptedCount],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-white p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
                      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${k === 'Result' ? (result.passed ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-900'}`}>{v}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-700">Your answer sheet has been recorded. Results will be published by the {INSTITUTION.office}.</p>
              )}
            </Card>
          ))}

        </>
      )}

      {/* ═══ NOTIFICATIONS ═══ */}
      {activeTab === 'notifications' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card
            title="Alerts"
            bodyClassName="p-0"
            action={unread.length > 0 && <Button size="sm" variant="ghost" icon={CheckCheck} onClick={() => markRead(notifications.map((n) => n.id))}>Mark all read</Button>}
          >
            {notifications.length === 0 ? (
              <EmptyState compact icon={Bell} title="No notifications" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => { markRead([n.id]); if (n.link) navigate(n.link); }} className={`w-full px-5 py-3 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-[#F7F9FC]'}`}>
                      <span className={`block text-xs ${n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-600">{n.message}</span>
                      <span className="mt-1 block text-[10px] text-slate-400">{n.at ? formatDateTime(n.at) : n.timeLabel || 'Current'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Official circulars" bodyClassName="p-0">
            <ul className="divide-y divide-slate-100">
              {announcements.length === 0 && <li className="px-5 py-4 text-xs text-slate-500">No circulars.</li>}
              {announcements.map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-4">
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{a.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{a.content}</p>
                    <p className="mt-1.5 text-[11px] text-slate-500">{a.issuer} · {a.date}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* ═══ PROFILE ═══ */}
      {activeTab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Academic record">
            <dl className="grid gap-x-8 sm:grid-cols-2">
              {[
                ['Full name', currentStudent.name],
                ['USN', currentStudent.usn],
                ['Email', currentStudent.email],
                ['Department', currentStudent.department],
                ['Semester / section', `${currentStudent.semester} · ${currentStudent.section}`],
                ['Institution', currentStudent.institution],
              ].map(([k, v]) => (
                <div key={k} className="border-b border-slate-100 py-2.5">
                  <dt className="text-[11px] text-slate-500">{k}</dt>
                  <dd className={`break-all text-sm text-slate-900 ${k === 'USN' ? 'font-mono' : ''}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <div className="space-y-6">
            <Card title="Examination eligibility">
              <StatusBadge status={eligible ? 'Eligible' : 'Withheld'}>{eligible ? 'Eligible' : 'Withheld'}</StatusBadge>
              {withheldReason && <p className="mt-2 text-xs text-slate-600">{withheldReason}</p>}
            </Card>
            <Card title="Password">
              <Button variant="secondary" icon={KeyRound} isLoading={sendingReset} onClick={resetPassword} className="w-full">Send password reset link</Button>
            </Card>
          </div>
        </div>
      )}

      {/* ═══ SUPPORT ═══ */}
      {activeTab === 'support' && (
        <div className="max-w-md">
          <Card title="Examination help desk">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-[11px] text-slate-500">Helpline</dt><dd className="font-semibold text-slate-900">{settings.helplinePhone}</dd></div>
              <div><dt className="text-[11px] text-slate-500">Email</dt><dd><a className="font-semibold text-[#1E3A5F] hover:underline" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></dd></div>
              <div><dt className="text-[11px] text-slate-500">Office</dt><dd className="text-slate-900">Central Administrative Block, 2nd Floor, Dr. AIT Campus</dd></div>
              <div><dt className="text-[11px] text-slate-500">Hours</dt><dd className="text-slate-900">Monday – Friday, 9:30 AM – 5:00 PM</dd></div>
            </dl>
          </Card>
        </div>
      )}

      {/* ═══ Examination details dialog ═══ */}
      <Modal
        isOpen={Boolean(detailsExam)}
        onClose={() => setDetailsExam(null)}
        title={detailsExam ? `${detailsExam.meta.courseCode} · ${detailsExam.meta.courseTitle}` : ''}
        maxWidth="max-w-lg"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDetailsExam(null)}>Close</Button>
            {detailsExam && (detailsExam.active || detailsExam.availability === 'live') && examActionFor(detailsExam)}
          </>
        )}
      >
        {detailsExam && (
          <div className="space-y-4">
            <dl className="divide-y divide-slate-100 rounded-sm border border-slate-200 text-xs">
              {[
                ['Opens', detailsExam.meta.examDate || '—'],
                ['Closes', detailsExam.meta.windowEnd ? formatDateTime(detailsExam.meta.windowEnd) : '—'],
                ['Duration', `${detailsExam.meta.durationMinutes} minutes`],
                ['Questions / marks', `${detailsExam.meta.totalQuestions} MCQs · ${detailsExam.meta.totalMarks} marks`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-3 py-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
            {detailsExam.meta.instructions?.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-900"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" /> Instructions</p>
                <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-700">
                  {detailsExam.meta.instructions.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </div>
            )}
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" /> Help desk: {settings.helplinePhone} · {settings.supportEmail}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
