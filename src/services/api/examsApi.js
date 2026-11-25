import { rpc, select, insert, update } from './core.js';
import { questionsApi } from './questionsApi.js';

export const PATTERN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

const toExam = (r) => ({
  id: r.id,
  examCode: r.exam_code,
  title: r.title,
  status: r.status,
  isPublished: r.status === 'published',
  institutionId: r.institution_id,
  subjectId: r.subject_id,
  courseCode: r.course_code,
  courseTitle: r.course_title,
  semesterLabel: r.semester_label || '',
  instructions: r.instructions || [],
  durationMinutes: r.duration_minutes,
  totalMarks: r.total_marks === null ? null : Number(r.total_marks),
  passPercentage: Number(r.pass_percentage),
  windowStart: r.window_start,
  windowEnd: r.window_end,
  resultsReleaseMode: r.results_release_mode,
  resultsReleasedAt: r.results_released_at,
  patternsStale: r.patterns_stale,
  patternsGeneratedAt: r.patterns_generated_at,
  publishedAt: r.published_at,
  createdAt: r.created_at,
  questionCount: Number(r.question_count),
  patternCount: Number(r.pattern_count),
  assignedCount: Number(r.assigned_count),
  activeAttempts: Number(r.active_attempts),
  submittedAttempts: Number(r.submitted_attempts),
});

const toCandidate = (r) => ({
  examId: r.exam_id,
  assignmentId: r.assignment_id,
  studentId: r.student_id,
  usn: r.usn,
  name: r.full_name,
  assignmentStatus: r.assignment_status,
  revokeReason: r.revoke_reason,
  maxAttempts: r.max_attempts,
  patternLabel: r.pattern_label,
  paperCode: r.paper_code,
  attemptId: r.attempt_id,
  attemptStatus: r.attempt_status,
  startedAt: r.started_at,
  submittedAt: r.submitted_at,
  submissionSource: r.submission_source,
  score: r.score === null ? null : Number(r.score),
  maxScore: r.max_score === null ? null : Number(r.max_score),
  percentage: r.percentage === null ? null : Number(r.percentage),
  passed: r.passed,
  correctCount: r.correct_count,
  incorrectCount: r.incorrect_count,
  unattemptedCount: r.unattempted_count,
});

/** Examination window for a calendar date (whole day, India time); open now → +30 days when no date. */
export function windowFor(examDate) {
  if (examDate && /^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    return { window_start: `${examDate}T00:00:00+05:30`, window_end: `${examDate}T23:59:00+05:30` };
  }
  const start = new Date();
  return { window_start: start.toISOString(), window_end: new Date(start.getTime() + 30 * 86400000).toISOString() };
}

export const examDateOf = (exam) => (exam?.windowStart ? new Date(exam.windowStart).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');

export const examsApi = {
  async list() {
    const rows = await select('admin_exam_overview', '*', (q) => q.neq('status', 'archived').order('created_at', { ascending: false }));
    return rows.map(toExam);
  },

  async get(id) {
    const rows = await select('admin_exam_overview', '*', (q) => q.eq('id', id));
    return rows[0] ? toExam(rows[0]) : null;
  },

  /** Latest non-archived exam per subject code. */
  currentBySubject(exams) {
    const map = {};
    for (const e of exams) if (!map[e.courseCode]) map[e.courseCode] = e;
    return map;
  },

  async create({ subject, title, examDate, durationMinutes, instructions, semesterLabel, resultDisplay = 'immediate' }) {
    const existing = await select('exams', 'exam_code', (q) => q.ilike('exam_code', `CBT-%-${subject.code}%`));
    const year = new Date().getFullYear();
    let code = `CBT-${year}-${subject.code}`;
    for (let n = 2; existing.some((e) => e.exam_code === code); n += 1) code = `CBT-${year}-${subject.code}-${n}`;
    const row = await insert('exams', {
      institution_id: subject.institutionId,
      subject_id: subject.id,
      exam_code: code,
      title: title || subject.title,
      semester_label: semesterLabel || null,
      instructions,
      duration_minutes: Number(durationMinutes),
      results_release_mode: resultDisplay === 'withheld' ? 'manual' : 'immediate',
      ...windowFor(examDate),
    }, 'id');
    return row.id;
  },

  /**
   * Draft configuration (the database refuses edits to published exams).
   * The window is only changed through reschedule_exam — pass `examDate`
   * only when it changed.
   */
  async updateConfig(id, { title, semesterLabel, examDate, durationMinutes, instructions }) {
    const rows = await update('exams', {
      title, semester_label: semesterLabel || null, duration_minutes: Number(durationMinutes), instructions,
    }, (q) => q.eq('id', id), 'id');
    if (!rows.length) throw new Error('The examination could not be updated.');
    if (examDate !== undefined) {
      const w = windowFor(examDate);
      await rpc('reschedule_exam', { p_exam_id: id, p_window_start: w.window_start, p_window_end: w.window_end });
    }
  },

  async masterQuestions(examId) {
    const links = await select('exam_questions', 'question_id,position', (q) => q.eq('exam_id', examId).order('position'));
    const questions = await questionsApi.byIds(links.map((l) => l.question_id));
    const byId = Object.fromEntries(questions.map((x) => [x.id, x]));
    return links.map((l) => byId[l.question_id]).filter(Boolean);
  },

  setQuestions: (examId, questionIds) => rpc('set_exam_questions', { p_exam_id: examId, p_question_ids: questionIds }),
  generatePatterns: (examId) => rpc('generate_exam_patterns', { p_exam_id: examId }),
  verification: (examId) => rpc('get_exam_verification_report', { p_exam_id: examId }, { idempotent: true }),
  publish: (examId) => rpc('publish_exam', { p_exam_id: examId }),
  unpublish: (examId) => rpc('unpublish_exam', { p_exam_id: examId }),
  close: (examId) => rpc('close_exam', { p_exam_id: examId }),
  releaseResults: (examId) => rpc('release_exam_results', { p_exam_id: examId }),

  async patterns(examId) {
    const patterns = await select('exam_patterns', 'id,pattern_label,paper_code,sequence_signature', (q) => q.eq('exam_id', examId).order('pattern_label'));
    if (!patterns.length) return [];
    const ids = patterns.map((p) => p.id);
    const [questions, keys] = await Promise.all([
      select('exam_pattern_questions', 'pattern_id,display_number,question_id,statement,options,option_order,marks,negative_marks', (q) => q.in('pattern_id', ids).order('display_number')),
      select('exam_pattern_answer_keys', 'pattern_id,display_number,correct_option', (q) => q.in('pattern_id', ids)),
    ]);
    const key = Object.fromEntries(keys.map((k) => [`${k.pattern_id}:${k.display_number}`, k.correct_option]));
    return patterns.map((p) => ({
      id: p.id,
      label: p.pattern_label,
      patternLabel: `Pattern ${p.pattern_label}`,
      paperCode: p.paper_code,
      questionOrder: p.sequence_signature.split(',').map(Number),
      questions: questions.filter((q) => q.pattern_id === p.id).map((q) => ({
        displayNumber: q.display_number, questionId: q.question_id, text: q.statement, options: q.options,
        optionOrder: q.option_order, marks: Number(q.marks), negativeMarks: Number(q.negative_marks),
        correctOption: key[`${p.id}:${q.display_number}`],
      })),
    }));
  },

  async candidates(examId) {
    const rows = await select('admin_exam_candidates', '*', (q) => q.eq('exam_id', examId).order('usn'));
    return rows.map(toCandidate);
  },

  async recentSubmissions(examIds, limit = 6) {
    if (!examIds.length) return [];
    const rows = await select('admin_exam_candidates', '*', (q) => q.in('exam_id', examIds).in('attempt_status', ['submitted', 'auto_submitted']).order('submitted_at', { ascending: false }).limit(limit));
    return rows.map(toCandidate);
  },

  assign: (examId, studentIds) => rpc('assign_students_to_exam', { p_exam_id: examId, p_student_ids: studentIds }),
  revoke: (assignmentId, reason) => rpc('revoke_exam_assignment', { p_assignment_id: assignmentId, p_reason: reason }),
  grantRetake: (assignmentId, reason) => rpc('grant_exam_retake', { p_assignment_id: assignmentId, p_reason: reason }),

  report: (examId) => rpc('get_exam_report', { p_exam_id: examId }, { idempotent: true }),
  itemAnalysis: (examId) => rpc('get_exam_item_analysis', { p_exam_id: examId }, { idempotent: true }),
  resultsExport: (examId) => rpc('get_exam_results_export', { p_exam_id: examId }, { idempotent: true }),

  async breakdown(attemptId) {
    const rows = await select('admin_attempt_breakdown', '*', (q) => q.eq('attempt_id', attemptId).order('display_number'));
    return rows.map((r) => ({
      displayNumber: r.display_number, questionId: r.question_id, questionText: r.statement, options: r.options,
      studentAnswerIndex: r.selected_option, correctAnswerIndex: r.correct_option, isAttempted: r.is_attempted,
      isCorrect: r.is_correct, marksAwarded: Number(r.marks_awarded),
      studentAnswerText: r.selected_option === null ? 'Not Attempted' : r.options[r.selected_option],
      correctAnswerText: r.options[r.correct_option],
    }));
  },
};
