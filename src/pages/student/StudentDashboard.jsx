import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Award, Bell, BookOpenCheck, CalendarDays, CheckCheck, Clock, KeyRound, LifeBuoy, MapPin, Megaphone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  studentInfo,
  activeExam,
  upcomingExams,
  recentResults,
  announcements,
} from '../../data/studentMockData';
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
import { examRandomizerService } from '../../services/examRandomizerService';
import { studentRosterService } from '../../services/studentRosterService';
import { notificationService } from '../../services/notificationService';
import { platformService } from '../../services/platformService';
import { authService } from '../../services/authService';
import { assignPatternForCandidate } from '../../utils/patternAssignment';
import { useDataVersion } from '../../utils/useDataVersion';
import { formatDateTime } from '../../utils/format';
import { INSTITUTION, USER_ROLES } from '../../utils/constants';

const TAB_TITLES = {
  dashboard: ['Candidate Dashboard', 'Your examinations, results and notices in one place.'],
  exams: ['My Examinations', 'Timetable for the current examination session.'],
  results: ['Results & History', 'Provisional CBT results and your statement of marks.'],
  notifications: ['Notifications', 'Examination alerts and official circulars.'],
  profile: ['My Profile', 'Academic record as maintained by the institution.'],
  support: ['Help & Support', 'Who to contact for examination matters.'],
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  useDataVersion(); // reflect publication / roster / notification changes live
  const activeTab = TAB_TITLES[searchParams.get('tab')] ? searchParams.get('tab') : 'dashboard';
  const [detailsExam, setDetailsExam] = useState(null);
  const [sendingReset, setSendingReset] = useState(false);

  // ── Live examination state ─────────────────────────────────────────────────
  const examState = examRandomizerService.getExamState();
  const settings = platformService.getSettings();
  const meta = examState.meta;
  const isCbtPublished = examState.isPublished;

  const currentStudent = {
    name: user?.name || studentInfo.name,
    usn: user ? (user.usn || user.identifier || 'Unavailable') : studentInfo.usn,
    department: studentInfo.department,
    semester: studentInfo.semester,
    section: studentInfo.section,
    institution: studentInfo.institution,
    email: user?.email || studentInfo.email,
  };

  const studentIdentity = user ? (user.usn || user.identifier || user.id || null) : studentInfo.usn;
  const normalizedId = String(studentIdentity ?? '').trim().toUpperCase();
  const assignedPattern = assignPatternForCandidate(studentIdentity);
  const eligible = studentRosterService.isEligible(normalizedId);
  const rosterEntry = studentRosterService.find(normalizedId);
  const ownAttempts = examRandomizerService.listAttempts().filter((a) => a.studentIdentifier === normalizedId);
  const activeAttempt = ownAttempts.find((a) => a.status === 'active');
  const submittedResult = examRandomizerService.getStudentAttempt(normalizedId);
  const showScore = settings.resultDisplay !== 'withheld';
  const notifications = notificationService.list(user ? { ...user, role: user.role || USER_ROLES.STUDENT } : null);
  const unread = notifications.filter((n) => !n.read);

  const cbtState = !eligible ? 'Withheld'
    : activeAttempt ? 'In progress'
      : submittedResult ? 'Submitted'
        : isCbtPublished ? 'Live' : 'Draft';
  const cbtLabel = { Withheld: 'Eligibility withheld', 'In progress': 'Attempt in progress', Submitted: 'Submitted', Live: 'Open now', Draft: 'Under moderation' }[cbtState];
  const canStart = eligible && (activeAttempt || (isCbtPublished && !submittedResult));
  const otherExams = upcomingExams.filter((e) => e.courseCode !== meta.courseCode);

  const go = (tab) => setSearchParams({ tab });

  const resetPassword = async () => {
    setSendingReset(true);
    const response = await authService.requestPasswordReset({ identifier: currentStudent.usn, role: USER_ROLES.STUDENT });
    setSendingReset(false);
    notify(response.message, 'info', { title: 'Password reset requested' });
  };

  const examAction = (size = 'md') => {
    if (!eligible) return <Button size={size} variant="secondary" disabled>Not eligible</Button>;
    if (activeAttempt) return <Button size={size} onClick={() => navigate('/student/exam')} rightIcon={ArrowRight}>Resume examination</Button>;
    if (submittedResult) return <Button size={size} variant="secondary" onClick={() => go('results')}>View submission</Button>;
    if (isCbtPublished) return <Button size={size} onClick={() => navigate('/student/exam')} rightIcon={ArrowRight}>Start examination</Button>;
    return <Button size={size} variant="secondary" disabled title="Not yet published by the examination office">Not yet open</Button>;
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

      {!eligible && (
        <Alert tone="danger" title="Examination access withheld">
          {rosterEntry?.remarks ? `Reason: ${rosterEntry.remarks}. ` : ''}Contact the examination office at {settings.supportEmail} or {settings.helplinePhone}.
        </Alert>
      )}

      {/* ═══ DASHBOARD ═══ */}
      {activeTab === 'dashboard' && (
        <>
          <section className="overflow-hidden rounded-sm border border-slate-300 bg-white" aria-labelledby="next-exam-heading">
            <div className="flex items-center justify-between bg-[#1E3A5F] px-5 py-2.5 text-white">
              <h2 id="next-exam-heading" className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Current examination</h2>
              <span className="text-[11px] text-slate-200">Computer-based test</span>
            </div>
            <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-bold text-[#1E3A5F]">{meta.courseCode}</span>
                  <StatusBadge status={cbtState}>{cbtLabel}</StatusBadge>
                  {isCbtPublished && eligible && assignedPattern && settings.showPatternToCandidates && (
                    <Badge variant="primary" className="font-mono">Paper {meta.courseCode}-{assignedPattern}</Badge>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{meta.courseTitle}</h3>
                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /><dt className="sr-only">Date</dt><dd className="font-medium text-slate-900">{meta.examDate}</dd></div>
                  <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /><dt className="sr-only">Time</dt><dd className="font-medium text-slate-900">{activeExam.time} · {meta.durationMinutes} min</dd></div>
                  <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /><dt className="sr-only">Centre</dt><dd className="font-medium text-slate-900">{activeExam.terminal}</dd></div>
                  <div><dt className="inline">Marks: </dt><dd className="inline font-medium text-slate-900">{meta.totalMarks} ({meta.totalQuestions} MCQs)</dd></div>
                </dl>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setDetailsExam('current')}>Instructions & venue</Button>
                {examAction()}
              </div>
            </div>
            {activeAttempt && (
              <div className="border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-900">
                You started this examination on {formatDateTime(activeAttempt.startedAt)}. Resume now — the timer continues while you are away.
              </div>
            )}
          </section>

          <section className="grid grid-cols-3 gap-2 sm:gap-4" aria-label="Summary">
            {[
              ['Upcoming examinations', otherExams.length + (submittedResult ? 0 : 1), 'exams', BookOpenCheck],
              ['Results declared', recentResults.length + (submittedResult && showScore ? 1 : 0), 'results', Award],
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
                    <TableHead align="center">Grade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submittedResult && showScore && (
                    <TableRow>
                      <TableCell><span className="font-mono font-semibold text-[#1E3A5F]">{submittedResult.courseCode}</span> {submittedResult.courseTitle} <Badge size="sm" variant="primary" className="ml-1">Provisional</Badge></TableCell>
                      <TableCell align="center" className="tabular-nums">{submittedResult.score} / {submittedResult.maxScore}</TableCell>
                      <TableCell align="center"><StatusBadge status={submittedResult.passed ? 'Pass' : 'Fail'} size="sm" /></TableCell>
                    </TableRow>
                  )}
                  {recentResults.slice(0, 4).map((res) => (
                    <TableRow key={res.courseCode}>
                      <TableCell><span className="font-mono font-semibold text-[#1E3A5F]">{res.courseCode}</span> {res.courseTitle}</TableCell>
                      <TableCell align="center" className="tabular-nums">{res.scoredMarks} / {res.maxMarks}</TableCell>
                      <TableCell align="center" className="font-semibold">{res.grade.split(' ')[0]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="lg:col-span-2" title="Notices from the examination office" bodyClassName="p-0">
              <ul className="divide-y divide-slate-100">
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
        <Card bodyClassName="p-0" title="Examination timetable" subtitle={`${currentStudent.semester} · ${INSTITUTION.academicYear}`}>
          <Table className="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="hidden sm:table-cell">Date & time</TableHead>
                <TableHead className="hidden md:table-cell">Centre</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead align="right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <p className="font-mono text-xs font-semibold text-[#1E3A5F]">{meta.courseCode}</p>
                  <p className="font-medium text-slate-900">{meta.courseTitle}</p>
                  <p className="text-[11px] text-slate-500 sm:hidden">{meta.examDate} · {activeExam.time}</p>
                  <p className="mt-1 sm:hidden"><StatusBadge status={cbtState} size="sm">{cbtLabel}</StatusBadge></p>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{meta.examDate}<span className="block text-[11px] text-slate-500">{activeExam.time} · {meta.durationMinutes} min</span></TableCell>
                <TableCell className="hidden md:table-cell">{activeExam.terminal}</TableCell>
                <TableCell className="hidden sm:table-cell"><StatusBadge status={cbtState} size="sm">{cbtLabel}</StatusBadge></TableCell>
                <TableCell align="right"><div className="flex justify-end">{examAction('sm')}</div></TableCell>
              </TableRow>
              {otherExams.map((exam) => (
                <TableRow key={exam.id}>
                  <TableCell>
                    <p className="font-mono text-xs font-semibold text-[#1E3A5F]">{exam.courseCode}</p>
                    <p className="font-medium text-slate-900">{exam.courseTitle}</p>
                    <p className="text-[11px] text-slate-500 sm:hidden">{exam.examDate} · {exam.time} · {exam.status}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{exam.examDate}<span className="block text-[11px] text-slate-500">{exam.time} · {exam.duration}</span></TableCell>
                  <TableCell className="hidden md:table-cell">{exam.hall}</TableCell>
                  <TableCell className="hidden sm:table-cell"><StatusBadge status="Pending" size="sm">{exam.status}</StatusBadge></TableCell>
                  <TableCell align="right"><Button size="sm" variant="ghost" onClick={() => setDetailsExam(exam)}>Details</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ═══ RESULTS ═══ */}
      {activeTab === 'results' && (
        <>
          {submittedResult ? (
            <Card title={`${submittedResult.courseCode} — computer-based test`} subtitle={`Submitted ${formatDateTime(submittedResult.submittedAt)}`} action={<Badge variant="primary">Provisional</Badge>}>
              {showScore ? (
                <div className="grid gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200 sm:grid-cols-5">
                  {[
                    ['Score', `${submittedResult.score} / ${submittedResult.maxScore}`],
                    ['Percentage', `${submittedResult.percentage}%`],
                    ['Result', submittedResult.passed ? 'Pass' : 'Below pass mark'],
                    ['Correct', submittedResult.correctCount],
                    ['Not attempted', submittedResult.unattemptedCount],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-white p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
                      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${k === 'Result' ? (submittedResult.passed ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-900'}`}>{v}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-700">Your answer sheet has been recorded. Results will be published by the {INSTITUTION.office}.</p>
              )}
            </Card>
          ) : (
            <Alert tone="info">No computer-based test has been submitted yet this session.</Alert>
          )}

          <Card title="Statement of marks" subtitle={`CGPA ${studentInfo.currentCgpa} · SGPA ${studentInfo.currentSgpa} · Credits ${studentInfo.totalCreditsEarned}`} bodyClassName="p-0">
            <Table className="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead className="hidden sm:table-cell">Exam date</TableHead>
                  <TableHead align="center">Marks</TableHead>
                  <TableHead align="center">Grade</TableHead>
                  <TableHead align="center" className="hidden sm:table-cell">Credits</TableHead>
                  <TableHead align="right" className="hidden sm:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentResults.map((res) => (
                  <TableRow key={res.courseCode}>
                    <TableCell><span className="font-mono font-semibold text-[#1E3A5F]">{res.courseCode}</span><span className="block text-slate-800">{res.courseTitle}</span></TableCell>
                    <TableCell className="hidden sm:table-cell">{res.examDate}</TableCell>
                    <TableCell align="center" className="tabular-nums">{res.scoredMarks} / {res.maxMarks}</TableCell>
                    <TableCell align="center"><span className="font-semibold">{res.grade.split(' ')[0]}</span><span className="block text-[11px] text-slate-500">GP {res.gradePoint}</span></TableCell>
                    <TableCell align="center" className="hidden tabular-nums sm:table-cell">{res.credits}</TableCell>
                    <TableCell align="right" className="hidden sm:table-cell"><StatusBadge status="Pass" size="sm">{res.status}</StatusBadge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {/* ═══ NOTIFICATIONS ═══ */}
      {activeTab === 'notifications' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card
            title="Alerts"
            subtitle="About your examinations"
            bodyClassName="p-0"
            action={unread.length > 0 && <Button size="sm" variant="ghost" icon={CheckCheck} onClick={() => notificationService.markRead(user, notifications.map((n) => n.id))}>Mark all read</Button>}
          >
            {notifications.length === 0 ? (
              <EmptyState compact icon={Bell} title="No notifications" description="You're up to date." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => { notificationService.markRead(user, [n.id]); if (n.link) navigate(n.link); }} className={`w-full px-5 py-3 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-[#F7F9FC]'}`}>
                      <span className={`block text-xs ${n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-600">{n.message}</span>
                      <span className="mt-1 block text-[10px] text-slate-400">{n.at ? formatDateTime(n.at) : n.timeLabel || 'Current'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Official circulars" subtitle="Office of the Controller of Examinations" bodyClassName="p-0">
            <ul className="divide-y divide-slate-100">
              {announcements.map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-4">
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{a.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{a.content}</p>
                    <p className="mt-1.5 text-[11px] text-slate-500">{a.issuer} · {a.date} · <span className="font-mono">{a.id}</span></p>
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
                ['Programme', studentInfo.degree],
                ['Department', currentStudent.department],
                ['Semester / section', `${currentStudent.semester} · ${currentStudent.section}`],
                ['Admission batch', studentInfo.admissionBatch],
                ['Scheme', studentInfo.scheme],
                ['Institution', currentStudent.institution],
                ['Mentor', studentInfo.mentorName],
              ].map(([k, v]) => (
                <div key={k} className="border-b border-slate-100 py-2.5">
                  <dt className="text-[11px] text-slate-500">{k}</dt>
                  <dd className={`break-all text-sm text-slate-900 ${k === 'USN' ? 'font-mono' : ''}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[11px] text-slate-500">To correct any detail, contact your department examination coordinator.</p>
          </Card>
          <div className="space-y-6">
            <Card title="Examination eligibility">
              <StatusBadge status={eligible ? 'Eligible' : 'Withheld'}>{eligible ? studentInfo.eligibilityStatus : 'Withheld'}</StatusBadge>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Attendance</dt><dd className="font-semibold text-slate-900">{studentInfo.attendancePercentage}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Hall</dt><dd className="text-right font-semibold text-slate-900">{studentInfo.assignedHall}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Terminal</dt><dd className="font-semibold text-slate-900">{studentInfo.assignedTerminal}</dd></div>
              </dl>
            </Card>
            <Card title="Password">
              <p className="mb-3 text-xs text-slate-600">A reset link will be sent to your registered institutional email.</p>
              <Button variant="secondary" icon={KeyRound} isLoading={sendingReset} onClick={resetPassword} className="w-full">Send password reset link</Button>
            </Card>
          </div>
        </div>
      )}

      {/* ═══ SUPPORT ═══ */}
      {activeTab === 'support' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Examination help desk" className="lg:col-span-1">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-[11px] text-slate-500">Helpline</dt><dd className="font-semibold text-slate-900">{settings.helplinePhone}</dd></div>
              <div><dt className="text-[11px] text-slate-500">Email</dt><dd><a className="font-semibold text-[#1E3A5F] hover:underline" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></dd></div>
              <div><dt className="text-[11px] text-slate-500">Office</dt><dd className="text-slate-900">Central Administrative Block, 2nd Floor, Dr. AIT Campus</dd></div>
              <div><dt className="text-[11px] text-slate-500">Hours</dt><dd className="text-slate-900">Monday – Friday, 9:30 AM – 5:00 PM</dd></div>
            </dl>
          </Card>
          <Card title="Frequently asked questions" className="lg:col-span-2" bodyClassName="p-0">
            <div className="divide-y divide-slate-100">
              {[
                ['My browser closed during the examination. What happens?', 'Sign in again on the same device and choose Resume examination. Your saved answers are restored; the timer keeps running while you are away.'],
                ['Why does my question order differ from my neighbour\'s?', 'Each candidate receives one of ten paper patterns with a different question and option order. All patterns contain the same questions and are marked against their own key.'],
                ['What does "Marked for review" mean at submission?', 'A marked question that has an answer is evaluated normally. A marked question without an answer scores zero.'],
                ['Can I change an answer after submitting?', 'No. Submission is final. Review the summary carefully before you confirm.'],
              ].map(([q, a]) => (
                <details key={q} className="group px-5 py-3">
                  <summary className="flex items-center justify-between gap-3 text-sm font-medium text-slate-900 marker:content-none">
                    {q}
                    <span className="text-slate-400 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                  </summary>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{a}</p>
                </details>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ═══ Examination details dialog ═══ */}
      <Modal
        isOpen={Boolean(detailsExam)}
        onClose={() => setDetailsExam(null)}
        title={detailsExam === 'current' ? `${meta.courseCode} · ${meta.courseTitle}` : detailsExam ? `${detailsExam.courseCode} · ${detailsExam.courseTitle}` : ''}
        subtitle="Examination details"
        maxWidth="max-w-lg"
        footer={detailsExam === 'current' ? (
          <>
            <Button variant="secondary" onClick={() => setDetailsExam(null)}>Close</Button>
            {canStart && examAction()}
          </>
        ) : undefined}
      >
        {detailsExam && (
          <div className="space-y-4">
            <dl className="divide-y divide-slate-100 rounded-sm border border-slate-200 text-xs">
              {(detailsExam === 'current' ? [
                ['Date', meta.examDate],
                ['Time', activeExam.time],
                ['Duration', `${meta.durationMinutes} minutes`],
                ['Questions / marks', `${meta.totalQuestions} MCQs · ${meta.totalMarks} marks`],
                ['Centre', activeExam.examCenter],
                ['Terminal', activeExam.terminal],
                ['Invigilator', activeExam.invigilator],
              ] : [
                ['Date', detailsExam.examDate],
                ['Time', detailsExam.time],
                ['Duration', detailsExam.duration],
                ['Marks', detailsExam.marks],
                ['Centre', detailsExam.hall],
              ]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-3 py-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
            {detailsExam === 'current' && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-900"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" /> Conduct guidelines</p>
                <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-700">
                  {activeExam.guidelines.map((g) => <li key={g}>{g}</li>)}
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
