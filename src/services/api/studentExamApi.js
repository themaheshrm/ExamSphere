import { rpc, select } from './core.js';

/**
 * Student side of the examination engine. Every call is scoped to the
 * signed-in student by the database; papers never contain answer keys,
 * option permutations or question ids, and grading happens server-side.
 */
const toMyExam = (r) => ({
  examId: r.exam_id,
  examCode: r.exam_code,
  title: r.title,
  courseCode: r.course_code,
  courseTitle: r.course_title,
  windowStart: r.window_start,
  windowEnd: r.window_end,
  durationMinutes: r.duration_minutes,
  totalMarks: r.total_marks === null ? null : Number(r.total_marks),
  totalQuestions: r.total_questions,
  venue: r.venue,
  seatNumber: r.seat_number,
  patternLabel: r.pattern_label,
  examStatus: r.exam_status,
  availability: r.availability, // upcoming | live | in_progress | completed | closed | entry_closed
  attemptId: r.attempt_id,
  attemptStatus: r.attempt_status,
  deadlineAt: r.deadline_at,
  score: r.score === null ? null : Number(r.score),
  maxScore: r.max_score === null ? null : Number(r.max_score),
  percentage: r.percentage === null ? null : Number(r.percentage),
  passed: r.passed,
});

/** Student-facing result payload → the receipt/result shape used by the UI. */
export function toResult(payload) {
  if (!payload) return null;
  const r = payload.result || {};
  return {
    attemptId: payload.attemptId,
    status: payload.status,
    submittedAt: payload.submittedAt,
    courseCode: payload.courseCode,
    courseTitle: payload.courseTitle,
    patternLabel: payload.patternLabel,
    paperCode: payload.paperCode,
    released: Boolean(payload.released),
    autoSubmitted: payload.status === 'auto_submitted',
    score: r.score === undefined ? null : Number(r.score),
    maxScore: r.maxScore === undefined ? null : Number(r.maxScore),
    percentage: r.percentage === undefined ? null : Number(r.percentage),
    passed: r.passed ?? null,
    correctCount: r.correctCount ?? null,
    incorrectCount: r.incorrectCount ?? null,
    unattemptedCount: r.unattemptedCount ?? null,
  };
}

export const studentExamApi = {
  async myExams() {
    const rows = await rpc('get_my_exams', {}, { idempotent: true });
    return (rows || []).map(toMyExam);
  },

  /** Instructions / semester label of the student's assigned exams (RLS: assigned + published only). */
  async examDetails(examIds) {
    if (!examIds.length) return {};
    const rows = await select('exams', 'id,instructions,semester_label', (q) => q.in('id', examIds));
    return Object.fromEntries(rows.map((r) => [r.id, { instructions: r.instructions || [], semesterLabel: r.semester_label || '' }]));
  },

  /** The student's withdrawn assignments (eligibility withheld) with the office's reason. */
  async withheld() {
    const rows = await select('exam_assignments', 'exam_id,revoke_reason,revoked_at', (q) => q.eq('status', 'revoked'));
    return rows.map((r) => ({ examId: r.exam_id, reason: r.revoke_reason || '', at: r.revoked_at }));
  },

  /** Starts or resumes (same attempt on any device) and returns the paper with saved responses. */
  start: (examId) => rpc('start_exam_attempt', {
    p_exam_id: examId,
    p_client_info: { ua: typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 200) },
  }),

  paper: (attemptId) => rpc('get_attempt_paper', { p_attempt_id: attemptId }, { idempotent: true }),

  /** Autosave. `seq` increases per change so stale or reordered saves are ignored server-side. */
  save: (attemptId, responses, seq) => rpc('save_attempt_responses', { p_attempt_id: attemptId, p_responses: responses, p_client_seq: seq }),

  /** Final submit; idempotent on the server, so it is safe to retry. */
  async submit(attemptId, finalResponses) {
    return toResult(await rpc('submit_exam_attempt', { p_attempt_id: attemptId, p_final_responses: finalResponses }, { idempotent: true }));
  },

  async myResult(examId) {
    return toResult(await rpc('get_my_result', { p_exam_id: examId }, { idempotent: true }));
  },

  logEvent: (attemptId, type, details = {}) => rpc('log_attempt_event', { p_attempt_id: attemptId, p_event_type: type, p_details: details }).catch(() => {}),
};
