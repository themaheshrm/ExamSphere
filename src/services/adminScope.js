import { SUBJECTS, subjectByCode, subjectForQuestion } from '../data/subjectCatalog.js';
import { demoAdmin } from '../data/demoAdmins.js';
import { USER_ROLES } from '../utils/constants.js';

/** The institution-wide examination that predates subject scoping. */
export const DEFAULT_EXAM_CODE = '22CS601';

/**
 * Resolve what an administrator may manage.
 *
 * The scope is derived from the server-verified profile (role + staff_id are
 * re-read from Supabase `profiles` on every sign-in / page load, never from
 * client storage). Subject-scoped admins get exactly one subject; the
 * hierarchy is unchanged: institution admins and super admins see everything.
 *
 * Returns { scoped, subjectCodes, canManageInstitution, label }.
 */
export function getAdminScope(user) {
  if (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.SUPER_ADMIN)) {
    return { scoped: true, subjectCodes: [], canManageInstitution: false, label: 'No access' };
  }
  const assigned = user.role === USER_ROLES.ADMIN ? demoAdmin(user.staffId) : null;
  if (assigned) {
    const subject = subjectByCode(assigned.subjectCode);
    return { scoped: true, subjectCodes: [subject.code], canManageInstitution: false, label: `${subject.code} · ${subject.title}` };
  }
  return { scoped: false, subjectCodes: SUBJECTS.map((s) => s.code), canManageInstitution: true, label: 'All subjects' };
}

export function canManageSubject(scope, subjectCode) {
  if (!scope) return false;
  if (!scope.scoped) return true;
  return scope.subjectCodes.includes(String(subjectCode ?? '').toUpperCase());
}

/** Exam codes an admin may open: subject exams in scope (+ 22CS601 for institution-wide admins). */
export function examCodesFor(scope) {
  if (!scope) return [];
  return scope.scoped ? [...scope.subjectCodes] : [DEFAULT_EXAM_CODE, ...scope.subjectCodes];
}

export function canAccessExam(scope, examCode) {
  return examCodesFor(scope).includes(String(examCode ?? '').toUpperCase());
}

/** Whether a question (by its subject text) is within the admin's scope. */
export function canManageQuestion(scope, question) {
  if (!scope) return false;
  if (!scope.scoped) return true;
  const subject = subjectForQuestion(question?.subject);
  return Boolean(subject) && scope.subjectCodes.includes(subject.code);
}

export class ScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScopeError';
    this.code = 'FORBIDDEN';
  }
}
