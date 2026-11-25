import { questionBankService, validateQuestion } from './questionBankService.js';
import { canManageQuestion, ScopeError } from './adminScope.js';
import { subjectByCode } from '../data/subjectCatalog.js';

/**
 * Subject-scoped view over the question bank. Every read is filtered and every
 * write is checked against the admin's scope here, in the service layer, so a
 * scoped admin cannot reach another subject by changing URLs or form state.
 * Institution-wide admins and super admins get the unfiltered bank.
 */
export function scopedQuestionBank(scope) {
  const assertInScope = (question, verb) => {
    if (!canManageQuestion(scope, question)) {
      const allowed = scope?.subjectCodes?.map((c) => subjectByCode(c)?.title).filter(Boolean).join(', ') || 'none';
      throw new ScopeError(`You cannot ${verb} questions outside your subject (${allowed}).`);
    }
  };
  const findById = (id) => questionBankService.getQuestions().find((q) => q.id === id) || null;

  return {
    getQuestions() {
      return questionBankService.getQuestions().filter((q) => canManageQuestion(scope, q));
    },

    saveQuestion(input, id = null) {
      if (id !== null) {
        const existing = findById(id);
        if (!existing) throw new Error('Question not found. Refresh the bank and try again.');
        assertInScope(existing, 'edit');
      }
      const { value } = validateQuestion(input);
      assertInScope(value, id === null ? 'add' : 'move');
      return questionBankService.saveQuestion(input, id);
    },

    deleteQuestion(id) {
      const existing = findById(id);
      if (!existing) return false;
      assertInScope(existing, 'delete');
      return questionBankService.deleteQuestion(id);
    },

    importQuestions(rows) {
      rows.forEach((row) => assertInScope(validateQuestion(row).value, 'import'));
      return questionBankService.importQuestions(rows);
    },

    /** Mark import-preview rows outside the scope as Invalid (shown before importing). */
    applyScopeToPreview(rows) {
      return rows.map((row) => (row.status !== 'Invalid' && !canManageQuestion(scope, row.question)
        ? { ...row, status: 'Invalid', errors: [...row.errors, 'Subject is outside your assigned subject.'] }
        : row));
    },
  };
}
