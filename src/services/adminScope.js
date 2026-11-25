import { SUBJECTS, subjectByCode, subjectForQuestion } from '../data/subjectCatalog.js';
import { demoAdmin, demoAdminByEmail } from '../data/demoAdmins.js';
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
const NO_ACCESS = { scoped: true, subjectCodes: [], canManageInstitution: false, label: 'No access' };

/**
 * Subject-admin identities matched by ANY signal: profiles.staff_id, the
 * signed app_metadata.staff_id, or the verified sign-in email. Works when the
 * live profiles table has no staff_id column. Fail-closed: matching more
 * signals can only restrict, never widen, access.
 */
function matchedSubjectAdmins(user) {
  const staffIds = [user.staffId, ...(user.scopeSignals?.staffIds || [])];
  const emails = [user.email, ...(user.scopeSignals?.emails || [])];
  const matches = [...staffIds.map(demoAdmin), ...emails.map(demoAdminByEmail)].filter(Boolean);
  return [...new Map(matches.map((a) => [a.staffId, a])).values()];
}

const subjectScope = (subject) => ({ scoped: true, subjectCodes: [subject.code], canManageInstitution: false, label: `${subject.code} · ${subject.title}` });

export function getAdminScope(user) {
  if (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.SUPER_ADMIN)) return NO_ACCESS;
  // 1. Assignment set by the super admin (signed app_metadata) is authoritative.
  const signed = user.scopeSignals || {};
  if (user.role === USER_ROLES.ADMIN && signed.subjectCode) {
    const subject = subjectByCode(signed.subjectCode);
    return subject ? subjectScope(subject) : NO_ACCESS; // unknown subject: deny
  }
  if (user.role === USER_ROLES.ADMIN && signed.adminType === 'subject') return NO_ACCESS; // subject admin without a subject
  if (user.role === USER_ROLES.ADMIN && signed.adminType === 'institution') {
    return { scoped: false, subjectCodes: SUBJECTS.map((s) => s.code), canManageInstitution: true, label: 'All subjects' };
  }
  // 2. Otherwise the demo registry (ADMIN001–005), fail-closed.
  const matches = matchedSubjectAdmins(user);
  if (matches.length > 1) return NO_ACCESS; // conflicting identities: deny rather than guess
  if (matches.length === 1) {
    // Any role carrying a subject-admin identity is held to that subject.
    return subjectScope(subjectByCode(matches[0].subjectCode));
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
