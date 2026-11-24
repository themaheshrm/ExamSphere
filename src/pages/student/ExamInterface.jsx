import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Flag,
  Send,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Menu,
  X,
  Award,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { examRandomizerService } from '../../services/examRandomizerService';
import { studentInfo } from '../../data/studentMockData';
import Modal from '../../components/common/Modal';

// ── Question states ──────────────────────────────────────────────────────────
const Q_STATUS = {
  NOT_VISITED: 'not-visited',
  NOT_ANSWERED: 'not-answered',
  ANSWERED: 'answered',
  MARKED: 'marked',
  MARKED_ANSWERED: 'marked-answered',
};

// ── Helper: format seconds → MM:SS ──────────────────────────────────────────
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function ExamInterface() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Student details ────────────────────────────────────────────────────────
  const studentName = user?.name || studentInfo.name;
  const studentUsn = user ? (user.usn || user.identifier || 'Student ID unavailable') : studentInfo.usn;
  const studentIdentity = user
    ? (user.usn || user.identifier || user.id || null)
    : studentInfo.usn;

  // ── Fetch Randomized Student Paper ─────────────────────────────────────────
  // Note: If exam is unpublished, returns null (securing unpublished tests)
  const [studentExam] = useState(() => examRandomizerService.getStudentExam(studentIdentity));
  const unavailableMessage = !studentIdentity
    ? 'A verified student identifier is required before an exam attempt can be assigned.'
    : 'The exam is unavailable or this browser could not save a persistent attempt. Please contact the examination administrator.';

  const questions = studentExam?.questions || [];
  const sessionKey = studentExam ? `examsphere_attempt_${studentExam.attemptId}` : null;

  // ── Restore saved draft or initialize ──────────────────────────────────────
  const [answers, setAnswers] = useState(() => {
    if (!sessionKey) return [];
    try {
      const saved = sessionStorage.getItem(sessionKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.answers) && parsed.answers.length === questions.length) {
          return parsed.answers;
        }
      }
    } catch {}
    return Array(questions.length).fill(null);
  });
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const [statuses, setStatuses] = useState(() => {
    if (!sessionKey) return [];
    try {
      const saved = sessionStorage.getItem(sessionKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.statuses) && parsed.statuses.length === questions.length) {
          return parsed.statuses;
        }
      }
    } catch {}
    return questions.map((_, i) =>
      i === 0 ? Q_STATUS.NOT_ANSWERED : Q_STATUS.NOT_VISITED,
    );
  });

  // ── Current question index ─────────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!sessionKey) return 0;
    try {
      const saved = sessionStorage.getItem(sessionKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.currentIndex === 'number' && parsed.currentIndex < questions.length) {
          return parsed.currentIndex;
        }
      }
    } catch {}
    return 0;
  });

  const question = questions[currentIndex];

  // ── Timer (Persisted to prevent refreshing timer exploitation) ─────────────
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!sessionKey) return 90 * 60;
    try {
      const saved = sessionStorage.getItem(sessionKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.timeLeft === 'number' && parsed.timeLeft > 0) {
          return parsed.timeLeft;
        }
      }
    } catch {}
    return (studentExam?.durationMinutes || 90) * 60;
  });

  const timerRef = useRef(null);
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState(null);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(true);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const handleAutoSubmit = useCallback(() => {
    clearInterval(timerRef.current);
    const result = examRandomizerService.evaluateSubmission(
      studentIdentity,
      answersRef.current,
      studentExam.attemptId,
    );
    setEvaluationResult(result);
    setExamSubmitted(true);
    setShowSubmitModal(false);
    setShowResultModal(true);
    if (sessionKey) sessionStorage.removeItem(sessionKey);
  }, [studentIdentity, studentExam, sessionKey]);

  // ── Sync attempt state to sessionStorage (survives page reloads) ───────────
  useEffect(() => {
    if (!sessionKey || examSubmitted) return;
    try {
      sessionStorage.setItem(
        sessionKey,
        JSON.stringify({ answers, statuses, currentIndex, timeLeft }),
      );
    } catch {}
  }, [answers, statuses, currentIndex, timeLeft, sessionKey, examSubmitted]);

  // ── Timer countdown ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!studentExam || examSubmitted) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [studentExam, examSubmitted, handleAutoSubmit]);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const visitQuestion = useCallback(
    (index) => {
      setStatuses((prev) => {
        const next = [...prev];
        if (next[index] === Q_STATUS.NOT_VISITED) {
          next[index] = Q_STATUS.NOT_ANSWERED;
        }
        return next;
      });
      setCurrentIndex(index);
      setShowPalette(false);
    },
    [],
  );

  const goNext = () => {
    if (currentIndex < questions.length - 1) visitQuestion(currentIndex + 1);
  };
  const goPrev = () => {
    if (currentIndex > 0) visitQuestion(currentIndex - 1);
  };

  // ── Answer selection ───────────────────────────────────────────────────────
  const selectOption = (optionIndex) => {
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
  };

  // ── Clear response ─────────────────────────────────────────────────────────
  const clearResponse = () => {
    if (examSubmitted) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[currentIndex] = null;
      return next;
    });
    setStatuses((prev) => {
      const next = [...prev];
      next[currentIndex] =
        next[currentIndex] === Q_STATUS.MARKED_ANSWERED
          ? Q_STATUS.MARKED
          : Q_STATUS.NOT_ANSWERED;
      return next;
    });
  };

  // ── Mark for review ────────────────────────────────────────────────────────
  const toggleMark = () => {
    if (examSubmitted) return;
    setStatuses((prev) => {
      const next = [...prev];
      const cur = next[currentIndex];
      if (cur === Q_STATUS.MARKED || cur === Q_STATUS.MARKED_ANSWERED) {
        next[currentIndex] =
          answers[currentIndex] !== null ? Q_STATUS.ANSWERED : Q_STATUS.NOT_ANSWERED;
      } else {
        next[currentIndex] =
          answers[currentIndex] !== null ? Q_STATUS.MARKED_ANSWERED : Q_STATUS.MARKED;
      }
      return next;
    });
  };

  // ── Submission & Evaluation ────────────────────────────────────────────────
  const confirmSubmit = () => {
    clearInterval(timerRef.current);
    const result = examRandomizerService.evaluateSubmission(studentIdentity, answers, studentExam.attemptId);
    setEvaluationResult(result);
    setExamSubmitted(true);
    setShowSubmitModal(false);
    setShowResultModal(true);
    if (sessionKey) sessionStorage.removeItem(sessionKey);
  };

  // ── Summary counts ─────────────────────────────────────────────────────────
  const countByStatus = (status) => statuses.filter((s) => s === status).length;
  const answeredCount =
    countByStatus(Q_STATUS.ANSWERED) + countByStatus(Q_STATUS.MARKED_ANSWERED);
  const notAnsweredCount = countByStatus(Q_STATUS.NOT_ANSWERED);
  const notVisitedCount = countByStatus(Q_STATUS.NOT_VISITED);
  const markedCount =
    countByStatus(Q_STATUS.MARKED) + countByStatus(Q_STATUS.MARKED_ANSWERED);

  // ── Timer colour ───────────────────────────────────────────────────────────
  const timerUrgent = timeLeft <= 300; // last 5 minutes
  const timerCritical = timeLeft <= 60; // last 1 minute

  // ── Palette status colours ─────────────────────────────────────────────────
  const statusColor = (status) => {
    switch (status) {
      case Q_STATUS.ANSWERED:
        return 'bg-emerald-600 text-white border-emerald-700';
      case Q_STATUS.NOT_ANSWERED:
        return 'bg-red-500 text-white border-red-600';
      case Q_STATUS.MARKED:
        return 'bg-violet-500 text-white border-violet-600';
      case Q_STATUS.MARKED_ANSWERED:
        return 'bg-violet-500 text-white border-violet-600 ring-2 ring-emerald-400';
      default:
        return 'bg-slate-200 text-slate-500 border-slate-300';
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // GUARD: UNPUBLISHED EXAMINATION
  // ═══════════════════════════════════════════════════════════════════════════
  if (!studentExam) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xs p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Examination Unavailable</h1>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {unavailableMessage}
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate('/student')}
              className="bg-[#1E3A5F] hover:bg-[#152A45] text-white text-xs font-semibold px-5 py-2.5 rounded-xs transition-colors cursor-pointer"
            >
              Return to Student Portal
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 1: PRE-EXAMINATION INSTRUCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  if (showInstructionsModal && !examSubmitted) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xs shadow-sm">
          {/* Institutional Header */}
          <div className="bg-[#1E3A5F] text-white px-6 py-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold bg-white/20 px-2 py-0.5 rounded-xs">
                  {studentExam.courseCode}
                </span>
                <h1 className="text-sm font-bold uppercase tracking-wider">
                  {studentExam.courseTitle}
                </h1>
              </div>
              <p className="text-xs text-slate-200 mt-0.5">
                {studentExam.institution} &bull; {studentExam.semester}
              </p>
            </div>

            {/* Pattern Badge */}
            <div className="text-right">
              <span className="inline-block font-mono text-xs font-bold bg-emerald-500 text-white px-2.5 py-1 rounded-xs shadow-xs">
                {studentExam.patternLabel}
              </span>
              <p className="text-[10px] text-slate-300 font-mono mt-0.5">
                Code: {studentExam.paperCode}
              </p>
            </div>
          </div>

          {/* Student Identity Strip */}
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
            <div>
              <span className="font-bold text-slate-900">{studentName}</span>
              <span className="ml-2 font-mono font-semibold text-[#1E3A5F]">{studentUsn}</span>
            </div>
            <div className="text-slate-500 font-medium">
              {studentExam.totalQuestions} Questions &bull; {studentExam.totalMarks} Marks &bull; {studentExam.durationMinutes} Minutes
            </div>
          </div>

          {/* Instructions */}
          <div className="px-6 py-5 space-y-3">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Examination Instructions & Randomization Protocol
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 leading-relaxed">
              <li>You have been assigned <strong>{studentExam.patternLabel}</strong> (Paper Code: {studentExam.paperCode}).</li>
              <li>Questions and answer options have been randomized independently across examinees.</li>
              <li>This test contains {studentExam.totalQuestions} questions. {studentExam.marksPerQuestion !== null ? `Each question carries ${studentExam.marksPerQuestion} marks.` : 'Marks are shown with each question.'}</li>
              <li>{studentExam.negativeMarking ? 'Incorrect answers receive the negative marks shown with each question.' : 'There is NO negative marking.'} Select exactly one answer choice per question.</li>
              <li>Use the question palette to jump between questions, or the Mark for Review button to flag items.</li>
              <li>Once submitted, your answers will be automatically evaluated against your pattern's answer key.</li>
            </ol>
          </div>

          {/* Legend */}
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              Question Status Legend
            </h3>
            <div className="flex flex-wrap gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-xs bg-slate-200 border border-slate-300 inline-flex items-center justify-center text-[10px] font-bold text-slate-500">1</span>
                Not Visited
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-xs bg-red-500 border border-red-600 inline-flex items-center justify-center text-[10px] font-bold text-white">2</span>
                Not Answered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-xs bg-emerald-600 border border-emerald-700 inline-flex items-center justify-center text-[10px] font-bold text-white">3</span>
                Answered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-xs bg-violet-500 border border-violet-600 inline-flex items-center justify-center text-[10px] font-bold text-white">4</span>
                Marked for Review
              </span>
            </div>
          </div>

          {/* Action */}
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">
              Secured Randomization Pattern: {studentExam.paperCode}
            </span>
            <button
              type="button"
              onClick={() => setShowInstructionsModal(false)}
              className="bg-[#1E3A5F] hover:bg-[#152A45] text-white text-xs sm:text-sm font-semibold px-6 py-2.5 rounded-xs cursor-pointer transition-colors shadow-xs"
            >
              Start Examination
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 2: POST-SUBMISSION RESULTS & EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════
  if (examSubmitted && showResultModal && evaluationResult) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xs shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-[#1E3A5F] text-white px-6 py-5 text-center">
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-2 text-emerald-300">
              <Award className="w-6 h-6" />
            </div>
            <h1 className="text-base font-bold uppercase tracking-wider">
              Examination Result & Evaluation
            </h1>
            <p className="text-xs text-slate-200 mt-0.5">
              {evaluationResult.courseCode} — {evaluationResult.courseTitle}
            </p>
          </div>

          {/* Score Strip */}
          <div className="p-6 space-y-4">
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xs text-center space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Final Score Evaluated Against {evaluationResult.patternLabel}
              </p>
              <div className="text-3xl font-bold font-mono text-[#1E3A5F]">
                {evaluationResult.score} <span className="text-base text-slate-400 font-normal">/ {evaluationResult.maxScore}</span>
              </div>
              <p className="text-xs font-semibold text-emerald-700">
                {evaluationResult.percentage}% &bull; {evaluationResult.passed ? 'PASSED (First Class)' : 'FAILED'}
              </p>
            </div>

            {/* Performance Stats */}
            <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
              <div className="p-3 border border-emerald-200 bg-emerald-50/50 rounded-xs">
                <span className="text-emerald-800 font-bold block text-lg font-mono">
                  {evaluationResult.correctCount}
                </span>
                <span className="text-[11px] text-emerald-700">Correct</span>
              </div>
              <div className="p-3 border border-red-200 bg-red-50/50 rounded-xs">
                <span className="text-red-800 font-bold block text-lg font-mono">
                  {evaluationResult.incorrectCount}
                </span>
                <span className="text-[11px] text-red-700">Incorrect</span>
              </div>
              <div className="p-3 border border-slate-200 bg-slate-50 rounded-xs">
                <span className="text-slate-800 font-bold block text-lg font-mono">
                  {evaluationResult.unattemptedCount}
                </span>
                <span className="text-[11px] text-slate-500">Unattempted</span>
              </div>
            </div>

            {/* Meta Table */}
            <div className="text-xs text-slate-700 space-y-1.5 border border-slate-200 p-3.5 rounded-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Candidate Name:</span>
                <span className="font-semibold text-slate-900">{studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">USN:</span>
                <span className="font-mono font-bold text-[#1E3A5F]">{studentUsn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Assigned Paper Code:</span>
                <span className="font-mono font-bold text-slate-800">{evaluationResult.paperCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Randomized Pattern:</span>
                <span className="font-mono font-semibold text-emerald-800">{evaluationResult.patternLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Evaluation Mode:</span>
                <span className="text-slate-700">Option-Mapping Decoded & Verified</span>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-center">
            <button
              type="button"
              onClick={() => navigate('/student')}
              className="bg-[#1E3A5F] hover:bg-[#152A45] text-white text-xs font-semibold px-6 py-2 rounded-xs cursor-pointer transition-colors"
            >
              Return to Student Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN EXAMINATION ATTEMPT CANVAS
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      {/* ── Top Header Bar ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#1E3A5F] text-white border-b border-[#152A45] shadow-sm">
        <div className="flex items-center justify-between px-4 h-12 max-w-screen-2xl mx-auto">
          {/* Left: Course & Pattern Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-xs font-bold bg-white/15 px-2 py-0.5 rounded-xs shrink-0">
              {studentExam.courseCode}
            </span>
            <span className="font-mono text-xs font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-xs shrink-0">
              {studentExam.patternLabel}
            </span>
            <span className="text-xs font-semibold truncate hidden md:inline">
              {studentExam.courseTitle}
            </span>
          </div>

          {/* Center: Live Timer */}
          <div
            className={`flex items-center gap-1.5 font-mono text-sm font-bold px-3 py-1 rounded-xs ${
              timerCritical
                ? 'bg-red-600 animate-pulse'
                : timerUrgent
                ? 'bg-amber-600'
                : 'bg-white/15'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{formatTime(timeLeft)}</span>
          </div>

          {/* Right: Candidate Details & Mobile Toggle */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-[11px] font-semibold leading-tight">{studentName}</p>
              <p className="text-[10px] text-slate-300 font-mono">
                {studentUsn} &bull; {studentExam.paperCode}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPalette(!showPalette)}
              className="lg:hidden p-1.5 rounded-xs bg-white/15 hover:bg-white/25 cursor-pointer transition-colors"
              aria-label="Toggle question palette"
            >
              {showPalette ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Body: Question Panel + Question Palette ──────────────────────── */}
      <div className="flex-1 flex max-w-screen-2xl mx-auto w-full">
        {/* ── Left: Question Surface ─────────────────────────────────────── */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {/* Question Card */}
          <div className="bg-white border border-slate-200 rounded-xs mb-4">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Question {currentIndex + 1}
                  <span className="text-slate-400 font-normal ml-1">
                    of {questions.length}
                  </span>
                </h2>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded-xs">
                  {studentExam.patternLabel}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {question?.marks ?? studentExam.marksPerQuestion ?? '—'} Marks
                {(question?.negativeMarks ?? 0) > 0 && <span className="ml-1 text-rose-600">(−{question.negativeMarks} incorrect)</span>}
              </span>
            </div>

            {/* Question Text */}
            <div className="px-5 py-5">
              <p className="text-sm text-slate-900 leading-relaxed font-medium">
                {question?.text}
              </p>
            </div>

            {/* Shuffled Options for this Pattern */}
            <div className="px-5 pb-5 space-y-2.5">
              {question?.options.map((option, optIdx) => {
                const isSelected = answers[currentIndex] === optIdx;
                return (
                  <label
                    key={optIdx}
                    className={`flex items-start gap-3 p-3 border rounded-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-[#1E3A5F] bg-blue-50/60'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    } ${examSubmitted ? 'pointer-events-none opacity-70' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`q-${question.id}-${currentIndex}`}
                      checked={isSelected}
                      onChange={() => selectOption(optIdx)}
                      disabled={examSubmitted}
                      className="mt-0.5 h-4 w-4 text-[#1E3A5F] border-slate-300 cursor-pointer accent-[#1E3A5F]"
                    />
                    <span className="text-xs text-slate-800 leading-relaxed">
                      <strong className="text-slate-500 mr-1.5 font-mono text-[11px]">
                        {String.fromCharCode(65 + optIdx)}.
                      </strong>
                      {option}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* ── Control Action Buttons ──────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left actions: Mark for Review & Clear Response */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMark}
                disabled={examSubmitted}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xs border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  statuses[currentIndex] === Q_STATUS.MARKED ||
                  statuses[currentIndex] === Q_STATUS.MARKED_ANSWERED
                    ? 'bg-violet-50 text-violet-700 border-violet-300'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>
                  {statuses[currentIndex] === Q_STATUS.MARKED ||
                  statuses[currentIndex] === Q_STATUS.MARKED_ANSWERED
                    ? 'Unmark Review'
                    : 'Mark for Review'}
                </span>
              </button>

              <button
                type="button"
                onClick={clearResponse}
                disabled={examSubmitted || answers[currentIndex] === null}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xs border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Response</span>
              </button>
            </div>

            {/* Right actions: Prev, Next, Submit */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-xs border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex items-center gap-1 px-3.5 py-2 text-xs font-medium rounded-xs border border-[#1E3A5F] bg-[#1E3A5F] text-white hover:bg-[#152A45] cursor-pointer transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  disabled={examSubmitted}
                  className="flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-xs bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Exam</span>
                </button>
              )}
            </div>
          </div>
        </main>

        {/* ── Right: Question Palette Sidebar ──────────────────────────── */}
        <aside
          className={`
            fixed inset-y-0 right-0 z-40 w-64 bg-white border-l border-slate-200 shadow-lg transition-transform lg:static lg:translate-x-0 lg:shadow-none lg:w-60 xl:w-64
            ${showPalette ? 'translate-x-0' : 'translate-x-full'}
          `}
        >
          <div className="flex flex-col h-full pt-14 lg:pt-0">
            {/* Mobile close */}
            <div className="lg:hidden flex items-center justify-between px-4 py-2 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-900 uppercase">Question Palette</span>
              <button
                type="button"
                onClick={() => setShowPalette(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pattern Badge on Palette */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Assigned Paper:</span>
              <span className="font-mono font-bold text-emerald-800 bg-white border border-slate-200 px-2 py-0.5 rounded-xs">
                {studentExam.patternLabel}
              </span>
            </div>

            {/* Palette Grid (1 to 25) */}
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 hidden lg:block">
                Question Palette
              </p>
              <div className="grid grid-cols-5 gap-2">
                {statuses.map((status, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => visitQuestion(idx)}
                    className={`w-full aspect-square flex items-center justify-center text-[11px] font-bold rounded-xs border cursor-pointer transition-all hover:scale-105 ${statusColor(status)} ${
                      idx === currentIndex ? 'ring-2 ring-[#1E3A5F] ring-offset-1' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Palette Legend */}
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 space-y-1.5 text-[11px] text-slate-600">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-xs bg-emerald-600 border border-emerald-700 inline-block" />
                Answered ({answeredCount})
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-xs bg-red-500 border border-red-600 inline-block" />
                Not Answered ({notAnsweredCount})
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-xs bg-slate-200 border border-slate-300 inline-block" />
                Not Visited ({notVisitedCount})
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-xs bg-violet-500 border border-violet-600 inline-block" />
                Marked for Review ({markedCount})
              </div>
            </div>

            {/* Submit Action */}
            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowSubmitModal(true)}
                disabled={examSubmitted}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-xs bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Exam</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile Backdrop */}
      {showPalette && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setShowPalette(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Submit Confirmation Modal ─────────────────────────────────── */}
      <Modal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        title="Confirm Examination Submission"
        subtitle={`${studentExam.courseCode} — ${studentExam.patternLabel}`}
        maxWidth="max-w-md"
        footer={null}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-amber-800">
              You are about to submit your paper. Answers will be evaluated against <strong>{studentExam.patternLabel}</strong>. Once submitted, answers cannot be modified.
            </p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Assigned Paper:</span>
              <span className="font-mono font-bold text-[#1E3A5F]">{studentExam.patternLabel} ({studentExam.paperCode})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total Questions:</span>
              <span className="font-bold">{questions.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Answered:</span>
              <span className="font-bold text-emerald-700">{answeredCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Not Answered:</span>
              <span className="font-bold text-red-600">
                {questions.length - answeredCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Marked for Review:</span>
              <span className="font-bold text-violet-700">{markedCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Time Remaining:</span>
              <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowSubmitModal(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xs cursor-pointer transition-colors"
            >
              Go Back
            </button>
            <button
              type="button"
              onClick={confirmSubmit}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xs bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Confirm & Submit</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
