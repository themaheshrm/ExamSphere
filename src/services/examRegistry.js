import { ExamRandomizerService, examRandomizerService } from './examRandomizerService.js';
import { SUBJECTS, subjectByCode } from '../data/subjectCatalog.js';
import { DEFAULT_EXAM_CODE, canAccessExam, examCodesFor, ScopeError } from './adminScope.js';
import { INSTITUTION } from '../utils/constants.js';

/**
 * One examination per subject, each its own ExamRandomizerService instance
 * (own storage, own 10 patterns, own results), sharing the attempt registry
 * with the original 22CS601 examination. No second randomisation engine.
 */
const services = new Map([[DEFAULT_EXAM_CODE, examRandomizerService]]);

export function getExamService(code) {
  const key = String(code ?? DEFAULT_EXAM_CODE).trim().toUpperCase();
  if (services.has(key)) return services.get(key);
  const subject = subjectByCode(key);
  if (!subject) return null;
  const service = new ExamRandomizerService({
    storageKey: `examsphere_subject_exam_v1_${subject.code}`,
    resultsKey: `examsphere_subject_results_v1_${subject.code}`,
    examId: subject.examId,
    autoCreate: false,
  });
  services.set(key, service);
  return service;
}

/** Service lookup that enforces the admin's subject scope. */
export function getScopedExamService(scope, code) {
  if (!canAccessExam(scope, code)) {
    throw new ScopeError(`You are not authorised to manage examination ${String(code ?? '').toUpperCase()}.`);
  }
  return getExamService(code);
}

export function allExamCodes() {
  return [DEFAULT_EXAM_CODE, ...SUBJECTS.map((s) => s.code)];
}

/** Lightweight summaries of the exams an admin may see (created or not). */
export function examSummaries(scope) {
  return examCodesFor(scope).map((code) => {
    const service = getExamService(code);
    const state = service.getExamState();
    const subject = subjectByCode(code);
    return {
      code,
      title: state?.meta.courseTitle || subject?.title || code,
      exists: Boolean(state),
      isPublished: Boolean(state?.isPublished),
      subject,
    };
  });
}

/** Default meta for a newly created subject examination. */
export function defaultSubjectMeta(code) {
  const subject = subjectByCode(code);
  return {
    courseCode: subject.code,
    courseTitle: subject.title,
    institution: INSTITUTION.name,
    semester: subject.semester,
    examDate: '',
    durationMinutes: 45,
    instructions: [
      'This examination contains 25 Multiple Choice Questions (MCQ).',
      'Each question carries 2 marks. There is no negative marking.',
      'Select exactly one option for each question.',
      'The examination will auto-submit when the timer reaches zero.',
      'Once submitted, answers cannot be changed.',
    ],
  };
}

/** Published subject examinations a student may sit (newest code order). */
export function publishedSubjectExams() {
  return SUBJECTS.map((s) => ({ subject: s, service: getExamService(s.code) }))
    .filter(({ service }) => service.getExamState()?.isPublished);
}
