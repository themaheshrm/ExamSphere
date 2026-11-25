import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAdminScope, examCodesFor, canAccessExam, DEFAULT_EXAM_CODE } from '../services/adminScope';
import { examsApi } from '../services/api/examsApi';
import { questionsApi } from '../services/api/questionsApi';
import { useAsync } from './useAsync';
import { useDataVersion } from './useDataVersion';

/**
 * Admin page context: the admin's subject scope, the subject selected via
 * `?exam=<course code>` and its current examination from Supabase. A subject
 * outside the scope yields `allowed: false`; the database applies the same
 * restriction independently (RLS on subjects / exams / questions).
 */
export function useAdminExamContext() {
  const { user } = useAuth();
  const scope = getAdminScope(user);
  const version = useDataVersion();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const [exams, subjects] = await Promise.all([examsApi.list(), questionsApi.listSubjects()]);
    return { exams, subjects };
  }, [user?.id, version]);

  const subjects = data?.subjects || [];
  const exams = data?.exams || [];
  const scopeCodes = examCodesFor(scope);
  const visible = scope.scoped ? scopeCodes : [...new Set([DEFAULT_EXAM_CODE, ...scopeCodes, ...subjects.map((s) => s.code)])];
  const codes = visible.filter((c) => !data || subjects.some((s) => s.code === c));
  const examCode = String(searchParams.get('exam') || codes[0] || scopeCodes[0] || '').toUpperCase();
  const allowed = canAccessExam(scope, examCode) || (!scope.scoped && subjects.some((s) => s.code === examCode));
  const bySubject = examsApi.currentBySubject(exams);
  const exam = allowed ? bySubject[examCode] || null : null;
  const subject = subjects.find((s) => s.code === examCode) || null;

  const selectExam = (code) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('exam', code);
    return next;
  });

  const summaries = codes.map((code) => {
    const e = bySubject[code];
    return { code, title: e?.title || subjects.find((s) => s.code === code)?.title || code, exists: Boolean(e), isPublished: e?.status === 'published', subject: subjects.find((s) => s.code === code) };
  });

  return { user, scope, codes, examCode, allowed, exam, subject, exams, subjects, summaries, selectExam, ready: Boolean(data), loading, error, reload };
}
