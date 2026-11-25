import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eraser, Flag, LayoutGrid, Send, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { studentExamApi } from '../../services/api/studentExamApi';
import { useAsync } from '../../utils/useAsync';
import { INSTITUTION, USER_ROLES } from '../../utils/constants';
import { formatDateTime } from '../../utils/format';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import { InstitutionMark } from '../../components/public/PublicChrome';

// ── Question states ──
const Q_STATUS = {
  NOT_VISITED: 'not-visited',
  NOT_ANSWERED: 'not-answered',
  ANSWERED: 'answered',
  MARKED: 'marked',
  MARKED_ANSWERED: 'marked-answered',
};

const STATUS_LABEL = {
  [Q_STATUS.NOT_VISITED]: 'not visited',
  [Q_STATUS.NOT_ANSWERED]: 'not answered',
  [Q_STATUS.ANSWERED]: 'answered',
  [Q_STATUS.MARKED]: 'marked for review',
  [Q_STATUS.MARKED_ANSWERED]: 'answered and marked for review',
};

const LETTERS = ['A', 'B', 'C', 'D'];

function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Only the current question index lives in sessionStorage (a UI convenience);
// answers, review flags and the timer come from the server on every load.
function readIndex(key) {
  try {
    const value = Number(sessionStorage.getItem(key));
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function statusFromResponse(r, index) {
  const marked = Boolean(r?.markedForReview);
  const selected = r?.selectedOption !== null && r?.selectedOption !== undefined;
  if (marked) return selected ? Q_STATUS.MARKED_ANSWERED : Q_STATUS.MARKED;
  if (selected) return Q_STATUS.ANSWERED;
  if (r?.visited || index === 0) return Q_STATUS.NOT_ANSWERED;
  return Q_STATUS.NOT_VISITED;
}

const isMarkedStatus = (s) => s === Q_STATUS.MARKED || s === Q_STATUS.MARKED_ANSWERED;

/**
 * Resolve the student's examination (`?exam=<course code>`) and start or resume
 * the attempt on the server. The paper carries no answer key, option order or
 * question ids; the same attempt resumes on any device.
 */
async function openAttempt(examParam) {
  const exams = await studentExamApi.myExams();
  const exam = examParam
    ? exams.find((e) => e.courseCode === examParam || e.examCode === examParam)
    : exams.find((e) => e.availability === 'in_progress') || exams.find((e) => e.availability === 'live');
  if (!exam) {
    return { kind: 'unavailable', message: 'This examination is not assigned to you, is not published yet, or your eligibility has been withheld by the examination office. Please contact the examination cell.' };
  }
  if (exam.availability === 'completed') return { kind: 'submitted', result: await studentExamApi.myResult(exam.examId) };
  if (exam.availability === 'upcoming') return { kind: 'unavailable', message: `The examination opens at ${formatDateTime(exam.windowStart)}.` };
  if (exam.availability === 'entry_closed') return { kind: 'unavailable', message: 'The entry window for this examination has closed.' };
  if (exam.availability !== 'live' && exam.availability !== 'in_progress') return { kind: 'unavailable', message: 'This examination is closed.' };
  const paper = await studentExamApi.start(exam.examId);
  if (paper.status !== 'active') return { kind: 'submitted', result: await studentExamApi.myResult(exam.examId) };
  return { kind: 'ready', paper };
}

/** Palette tile: colour + shape cue so status never relies on colour alone. */
function PaletteButton({ number, status, current, onClick, decorative = false }) {
  const styles = {
    [Q_STATUS.ANSWERED]: 'bg-emerald-600 text-white border-emerald-700',
    [Q_STATUS.NOT_ANSWERED]: 'bg-rose-600 text-white border-rose-700',
    [Q_STATUS.MARKED]: 'bg-violet-600 text-white border-violet-700 rounded-full',
    [Q_STATUS.MARKED_ANSWERED]: 'bg-violet-600 text-white border-violet-700 rounded-full',
    [Q_STATUS.NOT_VISITED]: 'bg-white text-slate-700 border-slate-300',
  };
  const Tag = decorative ? 'span' : 'button';
  return (
    <Tag
      type={decorative ? undefined : 'button'}
      onClick={decorative ? undefined : onClick}
      aria-label={decorative ? undefined : `Question ${number}, ${STATUS_LABEL[status]}${current ? ', current question' : ''}`}
      aria-current={current ? 'step' : undefined}
      className={`relative flex h-10 w-full items-center justify-center rounded-sm border text-xs font-bold tabular-nums transition-colors ${styles[status] || styles[Q_STATUS.NOT_VISITED]} ${
        current ? 'ring-2 ring-[#1E3A5F] ring-offset-2' : ''
      }`}
    >
      {number}
      {status === Q_STATUS.MARKED_ANSWERED && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500" aria-hidden="true" />
      )}
    </Tag>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function ExamInterface() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [searchParams] = useSearchParams();
  const examParam = String(searchParams.get('exam') || '').trim().toUpperCase();
  // Only student accounts receive a paper (defence in depth behind the route guard and RLS).
  const isStudentAccount = user?.role === USER_ROLES.STUDENT;
  const { data, error, loading, reload } = useAsync(
    () => (isStudentAccount ? openAttempt(examParam) : Promise.resolve({ kind: 'unavailable', message: 'Examinations can only be taken from a student account.' })),
    [user?.id, examParam, isStudentAccount],
  );

  if (data?.kind === 'ready') {
    return <ExamSession key={data.paper.attemptId} paper={data.paper} user={user} settings={settings} navigate={navigate} />;
  }

  const submitted = data?.kind === 'submitted';
  const title = loading && !data && !error ? 'Opening your examination…'
    : error ? 'Examination could not be opened'
      : submitted ? 'Examination already submitted' : 'Examination unavailable';
  const message = loading && !data && !error ? 'Fetching your paper from the examination server.'
    : error ? error.message
      : submitted ? 'You have already submitted this examination. Your answer sheet is recorded; see Results for your submission.'
        : data?.message;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F6F9] p-4">
      <main className="w-full max-w-md rounded-sm border border-slate-200 bg-white p-6 text-center" aria-busy={loading && !data}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-sm border border-amber-200 bg-amber-50 text-amber-700">
          {submitted ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> : <AlertTriangle className="h-6 w-6" aria-hidden="true" />}
        </div>
        <h1 className="text-base font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600" role={error ? 'alert' : 'status'}>{message}</p>
        <p className="mt-3 text-xs text-slate-500">Help desk: {settings.supportEmail} · {settings.helplinePhone}</p>
        <div className="mt-5 flex justify-center gap-2">
          {error && <Button variant="secondary" onClick={reload}>Try again</Button>}
          <Button onClick={() => navigate(submitted ? '/student?tab=results' : '/student')}>Return to student portal</Button>
        </div>
      </main>
    </div>
  );
}

function ExamSession({ paper, user, settings, navigate }) {
  const studentExam = paper;
  const studentName = user?.name || 'Candidate';
  const studentUsn = user?.usn || user?.identifier || 'Student ID unavailable';
  const questions = useMemo(() => paper.questions || [], [paper.questions]);
  const indexKey = `examsphere_attempt_index_${paper.attemptId}`;

  // ── Restore from the server's saved responses ──────────────────────────────
  const [answers, setAnswers] = useState(() => {
    const byNo = Object.fromEntries((paper.responses || []).map((r) => [r.displayNumber, r]));
    return questions.map((q) => byNo[q.displayNumber]?.selectedOption ?? null);
  });
  const [statuses, setStatuses] = useState(() => {
    const byNo = Object.fromEntries((paper.responses || []).map((r) => [r.displayNumber, r]));
    return questions.map((q, i) => statusFromResponse(byNo[q.displayNumber], i));
  });
  const answersRef = useRef(answers);
  const statusesRef = useRef(statuses);
  useEffect(() => {
    answersRef.current = answers;
    statusesRef.current = statuses;
  }, [answers, statuses]);

  const [currentIndex, setCurrentIndex] = useState(() => Math.min(readIndex(indexKey), Math.max(0, questions.length - 1)));
  useEffect(() => {
    try { sessionStorage.setItem(indexKey, String(currentIndex)); } catch { /* storage blocked: index resets to Q1 on reload */ }
  }, [currentIndex, indexKey]);

  const question = questions[currentIndex];

  // ── Timer: the server's deadline is authoritative ──────────────────────────
  const deadlineRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Number(paper.remainingSeconds) || 0));
  useEffect(() => {
    deadlineRef.current = Date.now() + Math.max(0, Number(paper.remainingSeconds) || 0) * 1000;
  }, [paper.remainingSeconds]);

  const timerRef = useRef(null);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [saveState, setSaveState] = useState('saved'); // saved | saving | retrying | session

  // ── Screens / dialogs ──────────────────────────────────────────────────────
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const buildResponses = useCallback(() => questions.map((q, i) => ({
    displayNumber: q.displayNumber,
    selectedOption: answersRef.current[i],
    markedForReview: isMarkedStatus(statusesRef.current[i]),
    visited: statusesRef.current[i] !== Q_STATUS.NOT_VISITED,
  })), [questions]);

  // Single, idempotent submission path used by manual submit, the timer and
  // the server reporting an auto-submission. Safe to retry after a failure.
  const finalizeSubmission = useCallback(async (source) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await studentExamApi.submit(paper.attemptId, buildResponses());
      clearInterval(timerRef.current);
      setEvaluationResult(result);
      setExamSubmitted(true);
      setAutoSubmitted(result?.autoSubmitted || source === 'timer');
      setShowSubmitModal(false);
      setShowResultModal(true);
      try { sessionStorage.removeItem(indexKey); } catch { /* ignore */ }
    } catch (err) {
      submittingRef.current = false;
      setSubmitError(err.code === 'SESSION'
        ? 'Your session has expired. Your saved answers are kept on the server: sign in again in a new tab, then return here and submit.'
        : err.message || 'Your answers could not be submitted. Do not close this window; try again or inform the invigilator.');
      setShowSubmitModal(true);
    } finally {
      setSubmitting(false);
    }
  }, [paper.attemptId, buildResponses, indexKey]);

  // ── Autosave to the server (debounced, ordered, retried) ───────────────────
  // `seq` follows the server clock so a resume on another device continues
  // the sequence; the server ignores stale or reordered saves.
  const clockOffset = useRef(0);
  const seqRef = useRef(0);
  const inFlight = useRef(false);
  const dirty = useRef(false);
  const retryTimer = useRef(null);
  const retryDelay = useRef(2000);
  const firstRender = useRef(true);
  const flushRef = useRef(null);
  useEffect(() => {
    clockOffset.current = paper.serverNow ? new Date(paper.serverNow).getTime() - Date.now() : 0;
  }, [paper.serverNow]);

  const flush = useCallback(async () => {
    if (submittingRef.current || examSubmitted) return;
    if (inFlight.current) { dirty.current = true; return; }
    if (!dirty.current) return;
    dirty.current = false;
    inFlight.current = true;
    setSaveState('saving');
    const seq = Math.max(seqRef.current + 1, Date.now() + clockOffset.current);
    seqRef.current = seq;
    let failed = false;
    try {
      const res = await studentExamApi.save(paper.attemptId, buildResponses(), seq);
      retryDelay.current = 2000;
      if (typeof res?.remainingSeconds === 'number') deadlineRef.current = Date.now() + res.remainingSeconds * 1000;
      if (res?.status === 'auto_submitted') { finalizeSubmission('timer'); return; }
      setSaveState(dirty.current ? 'saving' : 'saved');
    } catch (err) {
      failed = true;
      dirty.current = true;
      if (err.code === 'SESSION') { setSaveState('session'); return; }
      if (/already been submitted/i.test(err.message || '')) { finalizeSubmission('timer'); return; }
      setSaveState('retrying');
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => { flushRef.current?.(); }, retryDelay.current);
      retryDelay.current = Math.min(retryDelay.current * 2, 30000);
    } finally {
      inFlight.current = false;
      // Changes made while this save was in flight go out next (failures wait for the retry timer).
      if (dirty.current && !failed) setTimeout(() => flushRef.current?.(), 0);
    }
  }, [paper.attemptId, buildResponses, finalizeSubmission, examSubmitted]);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return undefined; }
    if (examSubmitted) return undefined;
    dirty.current = true;
    const t = setTimeout(() => flushRef.current?.(), 600);
    return () => clearTimeout(t);
  }, [answers, statuses, examSubmitted]);

  // Retry at once when the connection returns; save before the tab is hidden.
  useEffect(() => {
    const onOnline = () => { retryDelay.current = 2000; flushRef.current?.(); };
    const onVisibility = () => {
      if (examSubmitted) return;
      if (document.visibilityState === 'hidden') { flushRef.current?.(); studentExamApi.logEvent(paper.attemptId, 'tab_hidden'); }
      else studentExamApi.logEvent(paper.attemptId, 'tab_visible');
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(retryTimer.current);
    };
  }, [paper.attemptId, examSubmitted]);

  // ── Timer countdown (derived from the server deadline) ─────────────────────
  useEffect(() => {
    if (examSubmitted) return undefined;
    timerRef.current = setInterval(() => {
      setTimeLeft(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [examSubmitted]);

  // ── Auto-submit at zero (side effect lives in an effect, not an updater) ──
  const warnAt = (settings.timerWarningMinutes || 5) * 60;
  useEffect(() => {
    if (examSubmitted || timeLeft > 0) return undefined;
    const t = setTimeout(() => finalizeSubmission('timer'), 0);
    return () => clearTimeout(t);
  }, [timeLeft, examSubmitted, finalizeSubmission]);
  // Screen-reader warning: text only changes when a threshold is crossed.
  const announcement = timeLeft <= 60
    ? 'One minute remaining. Your answers will be submitted automatically.'
    : timeLeft <= warnAt ? `${settings.timerWarningMinutes || 5} minutes or less remaining.` : '';

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const visitQuestion = useCallback((index) => {
    setStatuses((prev) => {
      const next = [...prev];
      if (next[index] === Q_STATUS.NOT_VISITED) next[index] = Q_STATUS.NOT_ANSWERED;
      return next;
    });
    setCurrentIndex(index);
    setShowPalette(false);
  }, []);

  const goNext = useCallback(() => {
    if (currentIndex < questions.length - 1) visitQuestion(currentIndex + 1);
  }, [currentIndex, questions.length, visitQuestion]);
  const goPrev = useCallback(() => {
    if (currentIndex > 0) visitQuestion(currentIndex - 1);
  }, [currentIndex, visitQuestion]);

  // ── Answer selection ───────────────────────────────────────────────────────
  const selectOption = useCallback((optionIndex) => {
    if (examSubmitted) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[currentIndex] = optionIndex;
      return next;
    });
    setStatuses((prev) => {
      const next = [...prev];
      next[currentIndex] =
        next[currentIndex] === Q_STATUS.MARKED || next[currentIndex] === Q_STATUS.MARKED_ANSWERED
          ? Q_STATUS.MARKED_ANSWERED
          : Q_STATUS.ANSWERED;
      return next;
    });
  }, [examSubmitted, currentIndex]);

  const clearResponse = useCallback(() => {
    if (examSubmitted) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[currentIndex] = null;
      return next;
    });
    setStatuses((prev) => {
      const next = [...prev];
      next[currentIndex] = next[currentIndex] === Q_STATUS.MARKED_ANSWERED ? Q_STATUS.MARKED : Q_STATUS.NOT_ANSWERED;
      return next;
    });
  }, [examSubmitted, currentIndex]);

  const toggleMark = useCallback(() => {
    if (examSubmitted) return;
    setStatuses((prev) => {
      const next = [...prev];
      const cur = next[currentIndex];
      if (cur === Q_STATUS.MARKED || cur === Q_STATUS.MARKED_ANSWERED) {
        next[currentIndex] = answers[currentIndex] !== null ? Q_STATUS.ANSWERED : Q_STATUS.NOT_ANSWERED;
      } else {
        next[currentIndex] = answers[currentIndex] !== null ? Q_STATUS.MARKED_ANSWERED : Q_STATUS.MARKED;
      }
      return next;
    });
  }, [examSubmitted, currentIndex, answers]);

  const markAndNext = () => {
    const cur = statuses[currentIndex];
    if (cur !== Q_STATUS.MARKED && cur !== Q_STATUS.MARKED_ANSWERED) toggleMark();
    goNext();
  };

  // ── Keyboard shortcuts (inactive while a dialog or drawer is open) ─────────
  const onExamScreen = !showInstructionsModal && !examSubmitted;
  useEffect(() => {
    if (!onExamScreen || showSubmitModal || showPalette) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input[type="text"], textarea')) return;
      const key = e.key.toLowerCase();
      const optionIndex = ['a', 'b', 'c', 'd'].indexOf(key) >= 0 ? ['a', 'b', 'c', 'd'].indexOf(key) : ['1', '2', '3', '4'].indexOf(key);
      if (optionIndex >= 0) { e.preventDefault(); selectOption(optionIndex); }
      else if (key === 'n' || e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      else if (key === 'p' || e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (key === 'm') { e.preventDefault(); toggleMark(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExamScreen, showSubmitModal, showPalette, selectOption, goNext, goPrev, toggleMark]);

  // Warn before leaving mid-examination.
  useEffect(() => {
    if (!onExamScreen) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [onExamScreen]);

  // ── Summary counts ─────────────────────────────────────────────────────────
  const countByStatus = (status) => statuses.filter((s) => s === status).length;
  const answeredCount = countByStatus(Q_STATUS.ANSWERED) + countByStatus(Q_STATUS.MARKED_ANSWERED);
  const notAnsweredCount = countByStatus(Q_STATUS.NOT_ANSWERED);
  const notVisitedCount = countByStatus(Q_STATUS.NOT_VISITED);
  const markedOnly = countByStatus(Q_STATUS.MARKED);
  const markedAnswered = countByStatus(Q_STATUS.MARKED_ANSWERED);

  const timerCritical = timeLeft <= 60;
  const timerUrgent = timeLeft <= warnAt;
  const showPattern = settings.showPatternToCandidates;

  const examHeader = (
    <header className="border-b border-[#152A45] bg-[#1E3A5F] text-white">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden sm:block"><InstitutionMark size="sm" inverted /></span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{studentExam.courseCode} · {studentExam.courseTitle}</p>
            <p className="hidden truncate text-[11px] text-slate-300 sm:block">{INSTITUTION.name} · {studentExam.semester}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {!examSubmitted && (
            <span
              className={`hidden text-[11px] sm:inline ${saveState === 'saved' ? 'text-slate-300' : saveState === 'saving' ? 'text-slate-200' : 'font-semibold text-amber-300'}`}
              role="status"
            >
              {{ saved: 'All answers saved', saving: 'Saving…', retrying: 'Offline — retrying save', session: 'Session expired — answers not saving' }[saveState]}
            </span>
          )}
          {!examSubmitted && (
            <div
              className={`flex items-center gap-2 rounded-sm px-3 py-1.5 font-mono text-sm font-bold tabular-nums ${
                timerCritical ? 'bg-rose-600 text-white' : timerUrgent ? 'bg-amber-400 text-slate-900' : 'bg-white/10 text-white'
              }`}
              role="timer"
              aria-label={`Time remaining ${formatTime(timeLeft)}`}
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
              {formatTime(timeLeft)}
            </div>
          )}
          <div className="hidden text-right leading-tight md:block">
            <p className="text-xs font-semibold">{studentName}</p>
            <p className="font-mono text-[11px] text-slate-300">{studentUsn}</p>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="assertive">{announcement}</p>
    </header>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 1: PRE-EXAMINATION INSTRUCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  if (showInstructionsModal && !examSubmitted) {
    const instructions = studentExam.instructions?.length ? studentExam.instructions : [];
    return (
      <div className="min-h-screen bg-[#F4F6F9]">
        {examHeader}
        <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-3">
          <section className="rounded-sm border border-slate-200 bg-white lg:col-span-2">
            <div className="border-b border-slate-200 px-5 py-4">
              <h1 className="text-base font-semibold text-slate-900">Instructions to candidates</h1>
              <p className="mt-0.5 text-xs text-amber-700">The timer is already running.</p>
            </div>
            <div className="space-y-5 px-5 py-5 text-sm leading-relaxed text-slate-700">
              <ol className="list-decimal space-y-2 pl-5">
                {instructions.map((line) => <li key={line}>{line}</li>)}
                {instructions.length === 0 && <li>
                  This paper has {studentExam.totalQuestions} questions.{' '}
                  {studentExam.marksPerQuestion !== null ? `Each question carries ${studentExam.marksPerQuestion} marks.` : 'Marks are shown with each question.'}{' '}
                  {studentExam.negativeMarking ? 'Incorrect answers attract the negative marks shown with each question.' : 'There is no negative marking.'}
                </li>}
                <li>Question and option order is unique to your paper.</li>
              </ol>

              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Question status</h2>
                <ul className="grid gap-2 text-xs sm:grid-cols-2">
                  {[
                    [Q_STATUS.NOT_VISITED, 'Not visited'],
                    [Q_STATUS.NOT_ANSWERED, 'Not answered'],
                    [Q_STATUS.ANSWERED, 'Answered'],
                    [Q_STATUS.MARKED, 'Marked, not answered'],
                    [Q_STATUS.MARKED_ANSWERED, 'Answered & marked (evaluated)'],
                  ].map(([status, label], i) => (
                    <li key={status} className="flex items-center gap-2">
                      <span className="w-9 shrink-0" aria-hidden="true"><PaletteButton decorative number={i + 1} status={status} /></span>
                      {label}
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-sm border border-slate-200 bg-white p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Candidate</h2>
              <p className="mt-2 text-sm font-semibold text-slate-900">{studentName}</p>
              <p className="font-mono text-xs text-[#1E3A5F]">{studentUsn}</p>
              <dl className="mt-4 divide-y divide-slate-100 text-xs">
                {[
                  ['Paper code', showPattern ? studentExam.paperCode : studentExam.courseCode],
                  ...(showPattern ? [['Pattern', studentExam.patternLabel]] : []),
                  ['Questions', studentExam.totalQuestions],
                  ['Total marks', studentExam.totalMarks],
                  ['Duration', `${studentExam.durationMinutes} minutes`],
                  ['Time remaining', formatTime(timeLeft)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 py-2">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-semibold text-slate-900 tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-sm border border-slate-200 bg-white p-5">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
                <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1E3A5F]" />
                I have read the instructions and will not use unfair means.
              </label>
              <Button size="lg" className="mt-4 w-full" disabled={!acknowledged} onClick={() => setShowInstructionsModal(false)} rightIcon={ChevronRight}>
                {answeredCount > 0 ? 'Resume examination' : 'Start examination'}
              </Button>
            </section>
          </aside>
        </main>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 2: SUBMISSION RECEIPT & RESULT
  // ═══════════════════════════════════════════════════════════════════════════
  if (examSubmitted && showResultModal && evaluationResult) {
    const showScore = Boolean(evaluationResult.released && evaluationResult.score !== null);
    return (
      <div className="min-h-screen bg-[#F4F6F9]">
        {examHeader}
        <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
          <div className="overflow-hidden rounded-sm border border-slate-200 bg-white">
            <div className="flex items-start gap-3 border-b border-emerald-200 bg-emerald-50 px-5 py-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <h1 className="text-sm font-semibold text-emerald-900">Answer sheet submitted successfully</h1>
                <p className="text-xs text-emerald-800">
                  {autoSubmitted ? 'Time expired — your answers were submitted automatically' : 'Submitted'} on {formatDateTime(evaluationResult.submittedAt)}.
                </p>
              </div>
            </div>

            {showScore ? (
              <div className="space-y-5 p-5">
                <div className="flex flex-col items-center gap-1 border-b border-slate-100 pb-5 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Provisional score</p>
                  <p className="text-4xl font-semibold tabular-nums text-slate-900">
                    {evaluationResult.score}<span className="text-xl font-normal text-slate-400"> / {evaluationResult.maxScore}</span>
                  </p>
                  <p className={`mt-1 inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-xs font-semibold ${evaluationResult.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                    {evaluationResult.percentage}% · {evaluationResult.passed ? 'Pass' : 'Below pass mark'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200 text-center">
                  {[['Correct', evaluationResult.correctCount, 'text-emerald-700'], ['Incorrect', evaluationResult.incorrectCount, 'text-rose-700'], ['Not attempted', evaluationResult.unattemptedCount, 'text-slate-700']].map(([k, v, c]) => (
                    <div key={k} className="bg-white p-3">
                      <p className={`text-xl font-semibold tabular-nums ${c}`}>{v}</p>
                      <p className="text-[11px] text-slate-500">{k}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="p-5 text-sm leading-relaxed text-slate-700">
                Your answer sheet has been recorded. Results will be published by the {INSTITUTION.office}.
              </p>
            )}

            <dl className="divide-y divide-slate-100 border-t border-slate-200 px-5 text-xs">
              {[
                ['Candidate', `${studentName} (${studentUsn})`],
                ['Course', `${evaluationResult.courseCode} — ${evaluationResult.courseTitle}`],
                ['Paper code', showPattern ? evaluationResult.paperCode : evaluationResult.courseCode],
                ['Reference', evaluationResult.attemptId],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:justify-between">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="break-all font-medium text-slate-900 sm:text-right">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-right">
              <Button onClick={() => navigate('/student?tab=results')}>Return to student portal</Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 3: EXAMINATION
  // ═══════════════════════════════════════════════════════════════════════════
  const currentStatus = statuses[currentIndex];
  const isMarked = currentStatus === Q_STATUS.MARKED || currentStatus === Q_STATUS.MARKED_ANSWERED;

  const palette = (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-900">{studentName}</p>
        <p className="font-mono text-[11px] text-slate-500">{studentUsn}{showPattern ? ` · ${studentExam.paperCode}` : ''}</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 border-b border-slate-200 p-4 text-[11px]">
        {[
          ['Answered', answeredCount, 'bg-emerald-600'],
          ['Not answered', notAnsweredCount, 'bg-rose-600'],
          ['Not visited', notVisitedCount, 'bg-white border border-slate-300'],
          ['Marked', markedOnly, 'bg-violet-600 rounded-full'],
          ['Answered & marked', markedAnswered, 'bg-violet-600 rounded-full ring-2 ring-emerald-400 ring-offset-1'],
        ].map(([k, v, c]) => (
          <div key={k} className="flex items-center gap-2">
            <span className={`h-3 w-3 shrink-0 rounded-sm ${c}`} aria-hidden="true" />
            <dt className="text-slate-600">{k}</dt>
            <dd className="ml-auto font-semibold tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      <nav aria-label="Question palette" className="flex-1 overflow-y-auto p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Questions</p>
        <div className="grid grid-cols-5 gap-2">
          {questions.map((_, idx) => (
            <PaletteButton key={idx} number={idx + 1} status={statuses[idx]} current={idx === currentIndex} onClick={() => visitQuestion(idx)} />
          ))}
        </div>
      </nav>
      <div className="border-t border-slate-200 p-4">
        <Button variant="success" icon={Send} className="w-full" size="lg" onClick={() => { setShowPalette(false); setShowSubmitModal(true); }}>
          Submit examination
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F6F9]">
      {examHeader}
      {saveState === 'session' && (
        <Alert tone="danger" title="Your session has expired" className="rounded-none border-x-0">
          Answers you change now are not being saved. Sign in again in a new tab, then return here — your earlier answers are kept on the server.
        </Alert>
      )}
      {saveState === 'retrying' && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 sm:hidden" role="status">Connection problem — your latest answers will be saved when it returns.</p>
      )}

      <div className="flex flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
            <p className="text-sm font-semibold text-slate-900">
              Question {currentIndex + 1} <span className="font-normal text-slate-500">of {questions.length}</span>
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 tabular-nums">
                +{question?.marks ?? studentExam.marksPerQuestion ?? '—'} marks
                {Number(question?.negativeMarks) > 0 && <span className="text-rose-700"> · −{question.negativeMarks}</span>}
              </span>
              {isMarked && <span className="hidden items-center gap-1 rounded-sm border border-violet-200 bg-violet-50 px-2 py-0.5 text-violet-800 sm:inline-flex"><Flag className="h-3 w-3" aria-hidden="true" /> Marked</span>}
              <button
                type="button"
                onClick={() => setShowPalette(true)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 lg:hidden"
                aria-label={`Open question palette, ${answeredCount} of ${questions.length} answered`}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" /> {answeredCount}/{questions.length}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
            <fieldset key={currentIndex} className="mx-auto max-w-3xl">
              <legend className="mb-6 text-base leading-relaxed text-slate-900 sm:text-lg">
                <span className="sr-only">Question {currentIndex + 1}: </span>{question?.text}
              </legend>
              <div className="space-y-3">
                {question?.options.map((optText, optIdx) => {
                  const isSelected = answers[currentIndex] === optIdx;
                  return (
                    <label
                      key={optIdx}
                      className={`flex cursor-pointer items-center gap-4 rounded-sm border-2 bg-white px-4 py-3.5 text-sm transition-colors sm:text-base ${
                        isSelected ? 'border-[#1E3A5F] bg-[#F0F4F8]' : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${question.displayNumber}`}
                        checked={isSelected}
                        onChange={() => selectOption(optIdx)}
                        className="h-4 w-4 shrink-0 accent-[#1E3A5F]"
                      />
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border text-xs font-bold ${isSelected ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white' : 'border-slate-300 text-slate-600'}`} aria-hidden="true">
                        {LETTERS[optIdx]}
                      </span>
                      <span className="text-slate-900">{optText}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="secondary" icon={Flag} onClick={markAndNext} className={isMarked ? 'border-violet-300 text-violet-800' : ''}>
                  <span className="hidden sm:inline">{isMarked ? 'Next (marked)' : 'Mark for review & next'}</span>
                  <span className="sm:hidden">Mark</span>
                </Button>
                {isMarked && <Button variant="ghost" onClick={toggleMark} className="hidden sm:inline-flex">Unmark</Button>}
                <Button variant="ghost" icon={Eraser} onClick={clearResponse} disabled={answers[currentIndex] === null}>
                  <span className="hidden sm:inline">Clear response</span>
                  <span className="sm:hidden">Clear</span>
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" icon={ChevronLeft} onClick={goPrev} disabled={currentIndex === 0} aria-label="Previous question">
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                {currentIndex < questions.length - 1 ? (
                  <Button rightIcon={ChevronRight} onClick={goNext}>{answers[currentIndex] !== null ? 'Save & next' : 'Next'}</Button>
                ) : (
                  <Button variant="success" icon={Send} onClick={() => setShowSubmitModal(true)}>Submit</Button>
                )}
              </div>
            </div>
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 border-l border-slate-200 bg-white lg:block" aria-label="Question palette and summary">
          <div className="sticky top-0 h-[calc(100vh-3.5rem)]">{palette}</div>
        </aside>
      </div>

      {showPalette && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Question palette">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowPalette(false)} aria-hidden="true" />
          <div className="es-fade-in absolute inset-y-0 right-0 flex w-80 max-w-[88vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Question palette</p>
              <button type="button" onClick={() => setShowPalette(false)} className="rounded-sm p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close palette" autoFocus>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{palette}</div>
          </div>
        </div>
      )}

      <Modal
        isOpen={showSubmitModal}
        onClose={() => { setShowSubmitModal(false); setSubmitError(''); }}
        title="Submit your answer sheet?"
        subtitle={`${studentExam.courseCode}${showPattern ? ` · ${studentExam.patternLabel}` : ''} · ${formatTime(timeLeft)} remaining`}
        maxWidth="max-w-md"
        footer={(
          <>
            <Button variant="secondary" disabled={submitting} onClick={() => { setShowSubmitModal(false); setSubmitError(''); }}>Return to examination</Button>
            <Button variant="success" icon={Send} isLoading={submitting} onClick={() => finalizeSubmission('student')} data-autofocus>Submit answer sheet</Button>
          </>
        )}
      >
        <div className="space-y-4">
          {submitError && <Alert tone="danger" title="Submission failed">{submitError}</Alert>}
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {[
                ['Answered', answeredCount, 'text-emerald-700'],
                ['Not answered', notAnsweredCount + markedOnly, 'text-rose-700'],
                ['Not visited', notVisitedCount, 'text-slate-700'],
                ['Marked for review', markedOnly + markedAnswered, 'text-violet-700'],
              ].map(([k, v, c]) => (
                <tr key={k}>
                  <th scope="row" className="py-2 text-left font-normal text-slate-600">{k}</th>
                  <td className={`py-2 text-right font-semibold tabular-nums ${c}`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {questions.length - answeredCount > 0 && (
            <Alert tone="warning">
              {questions.length - answeredCount} question{questions.length - answeredCount === 1 ? ' is' : 's are'} unanswered and will score zero.
            </Alert>
          )}
          <p className="text-xs text-slate-600">After submission you cannot return to the examination or change any answer.</p>
        </div>
      </Modal>
    </div>
  );
}
