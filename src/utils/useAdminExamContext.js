import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAdminScope, examCodesFor, canAccessExam } from '../services/adminScope';
import { getExamService, examSummaries } from '../services/examRegistry';

/**
 * Admin page context: the admin's subject scope and the examination selected
 * via `?exam=<code>`. An exam outside the scope yields `allowed: false` and
 * no service, so editing the URL never reaches another subject's data.
 */
export function useAdminExamContext() {
  const { user } = useAuth();
  const scope = getAdminScope(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const codes = examCodesFor(scope);
  const examCode = String(searchParams.get('exam') || codes[0] || '').toUpperCase();
  const allowed = canAccessExam(scope, examCode);
  const service = allowed ? getExamService(examCode) : null;

  const selectExam = (code) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('exam', code);
    return next;
  });

  return { user, scope, codes, examCode, allowed, service, selectExam, summaries: examSummaries(scope) };
}
