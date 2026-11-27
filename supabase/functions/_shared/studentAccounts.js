/**
 * Server-side student account provisioning for ExamSphere (Dr. AIT).
 *
 * Used by the Edge Functions `create-student` and `change-temporary-password`
 * (Deno) and by the Node tests. Plain JavaScript; the Supabase clients are
 * injected, so the service-role key only ever exists in the function's
 * server environment — never in the browser bundle.
 *
 * Guarantees
 *  - Caller must present a valid Supabase session (verified server-side with
 *    auth.getUser) and be an active institution admin or super admin.
 *    Subject-scoped admins (ADMIN001–005 / subject_admins rows) and students
 *    are refused.
 *  - The new account's role is always `student`; no client-supplied role,
 *    institution or metadata is ever used.
 *  - Duplicate Student ID (USN) or email → 409, before anything is written.
 *    Existing accounts and profiles are never modified.
 *  - The temporary password is generated server-side, returned once in the
 *    HTTPS response (Cache-Control: no-store) and never stored or logged.
 *    Supabase Auth keeps only its hash.
 *  - Any failure after the Auth user is created deletes that new user again,
 *    so a half-created account is never left behind.
 *  - New accounts carry app_metadata.must_change_password = true (only the
 *    service role can change app_metadata); the student must set a new
 *    password through `change-temporary-password` after first sign-in.
 */
import {
  detectProfileSchema, drAitInstitutionId, findAuthUserByEmail, findProfilesBy,
  getProfileById, isMissingColumn, isMissingTable, upsertProfileRow,
} from './profileSchema.js';

export const EMAIL_DOMAIN = 'drait.edu.in';
export const INSTITUTION_CODE = '1DA';
/** Kept in sync with src/data/demoAccounts.js and src/data/demoAdmins.js (tested). */
export const DEMO_STUDENT_IDS = ['CS001', 'CS002', 'CS003', 'CS004', 'CS005', 'CS006'];
export const DEMO_ADMIN_IDS = ['ADMIN001', 'ADMIN002', 'ADMIN003', 'ADMIN004', 'ADMIN005'];
const USN_PATTERN = new RegExp(`^${INSTITUTION_CODE}\\d{2}[A-Z]{2,3}\\d{3}$`);
const MAX_BODY_BYTES = 8 * 1024;

export class HttpError extends Error {
  constructor(status, message, fieldErrors = null) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

// ─── Passwords ───────────────────────────────────────────────────────────────
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '#$%&*+=?@';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** Unbiased random index in [0, n) from the platform CSPRNG. */
function randomIndex(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** 16-character temporary password: CSPRNG, unambiguous characters, all four classes. */
export function generateTemporaryPassword(length = 16) {
  const chars = [UPPER, LOWER, DIGITS, SYMBOLS].map((set) => set[randomIndex(set.length)]);
  while (chars.length < length) chars.push(ALL[randomIndex(ALL.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Rules for the password a student chooses on first sign-in. */
export function passwordProblems(password, { usn = '', current = '' } = {}) {
  const p = String(password ?? '');
  const problems = [];
  if (p.length < 12) problems.push('at least 12 characters');
  if (p.length > 72) problems.push('at most 72 characters');
  if (!/[A-Z]/.test(p)) problems.push('an upper-case letter');
  if (!/[a-z]/.test(p)) problems.push('a lower-case letter');
  if (!/[0-9]/.test(p)) problems.push('a digit');
  if (!/[^A-Za-z0-9]/.test(p)) problems.push('a symbol');
  if (usn && p.toUpperCase().includes(String(usn).toUpperCase())) problems.push('not your Student ID');
  if (current && p === current) problems.push('different from the temporary password');
  return problems;
}

// ─── Input ───────────────────────────────────────────────────────────────────
// Strip control characters from form input (intentional control-character class).
// oxlint-disable-next-line no-control-regex
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max + 1);

export function institutionalEmailFor(usn) {
  return `${String(usn).toLowerCase()}@${EMAIL_DOMAIN}`;
}

/** Validate the Add Student form. Only these fields are read; anything else (role, institution…) is ignored. */
export function validateStudentInput(input) {
  const src = input && typeof input === 'object' ? input : {};
  const errors = {};
  const name = clean(src.name ?? src.fullName, 120);
  const usn = clean(src.usn ?? src.studentId, 20).toUpperCase().replace(/\s/g, '');
  const emailRaw = clean(src.email, 254).toLowerCase();
  const mobile = clean(src.mobile, 25);
  const department = clean(src.department, 80) || 'Computer Science & Engineering';
  const semester = Number(src.semester);
  const section = clean(src.section, 4).toUpperCase();

  if (name.length < 2 || name.length > 120) errors.name = 'Full name is required (2–120 characters).';
  if (!USN_PATTERN.test(usn) && !DEMO_STUDENT_IDS.includes(usn)) {
    errors.usn = `Enter a valid Dr. AIT USN starting with ${INSTITUTION_CODE}, e.g. ${INSTITUTION_CODE}22CS011.`;
  }
  if (emailRaw && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(emailRaw)) errors.email = 'Enter a valid email address.';
  else if (emailRaw && !emailRaw.endsWith(`@${EMAIL_DOMAIN}`)) errors.email = `Use an @${EMAIL_DOMAIN} address, or leave it blank.`;
  if (!/^\+?[0-9][0-9 -]{6,18}[0-9]$/.test(mobile)) errors.mobile = 'Enter a valid mobile number (digits, optional + country code).';
  if (department.length < 2 || department.length > 80) errors.department = 'Department is required.';
  if (!Number.isInteger(semester) || semester < 1 || semester > 8) errors.semester = 'Semester must be 1–8.';
  if (!/^[A-Z]$/.test(section)) errors.section = 'Section must be a single letter.';

  const email = emailRaw || (errors.usn ? '' : institutionalEmailFor(usn));
  return { errors, value: { name, usn, email, emailProvided: Boolean(emailRaw), mobile, department, semester, section } };
}

// ─── Authorisation ───────────────────────────────────────────────────────────
export async function tableExists(admin, table, column) {
  const { error } = await admin.from(table).select(column).limit(0);
  if (!error) return true;
  if (isMissingTable(error) || isMissingColumn(error)) return false;
  throw new Error(`Could not inspect ${table}: ${error.message}`);
}

/**
 * Resolve and authorise the caller from their (server-verified) Auth user.
 * Roles: Super Admin, Subject Admin, Student. Only the active Super Admin
 * manages the student roster; Subject Admins (role 'admin') are refused.
 */
export async function authorizeCaller(admin, schema, callerUser) {
  const profile = await getProfileById(admin, schema, callerUser.id);
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    throw new HttpError(403, 'Only examination office administrators can create student accounts.');
  }
  if (schema.has('is_active') && profile.is_active === false) {
    throw new HttpError(403, 'This administrator account is inactive.');
  }
  if (profile.role !== 'super_admin') {
    throw new HttpError(403, 'Subject administrators cannot create student accounts. Ask the super administrator.');
  }
  return profile;
}

// ─── Create ──────────────────────────────────────────────────────────────────
async function departmentIdFor(admin, institutionId, name) {
  if (!institutionId || !(await tableExists(admin, 'departments', 'id'))) return null;
  const { data, error } = await admin.from('departments').select('id,name').eq('institution_id', institutionId);
  if (error) throw new Error(`Could not read departments: ${error.message}`);
  return (data || []).find((d) => d.name.toLowerCase() === name.toLowerCase())?.id || null;
}

export async function createStudentAccount({ admin, callerUser, input, log = () => {} }) {
  const schema = await detectProfileSchema(admin, { required: ['usn'], optional: ['is_active', 'department_id'] });
  await authorizeCaller(admin, schema, callerUser);

  const { errors, value } = validateStudentInput(input);
  if (value.emailProvided && value.email !== institutionalEmailFor(value.usn) && !schema.has('email')) {
    errors.email = `Sign-in by Student ID needs the institutional address ${institutionalEmailFor(value.usn)} until migrations 003/004 add profiles.email. Leave the email blank.`;
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields.', errors);

  // Students always belong to Dr. AIT (profiles_scoped_role_chk requires an
  // institution). Throws if the institutions table exists without the 1DA row.
  const institutionId = await drAitInstitutionId(admin, schema);

  // Duplicates: Student ID / USN and email, across Auth and profiles. Nothing is written yet.
  if ((await findProfilesBy(admin, schema, 'usn', value.usn)).length) {
    throw new HttpError(409, `Student ID ${value.usn} already has an account.`, { usn: 'This Student ID already has an account.' });
  }
  if (await findAuthUserByEmail(admin, value.email) || (await findProfilesBy(admin, schema, 'email', value.email)).length) {
    throw new HttpError(409, `${value.email} is already used by another account.`, { email: 'This email is already used by another account.' });
  }

  const temporaryPassword = generateTemporaryPassword();
  const isDemo = DEMO_STUDENT_IDS.includes(value.usn);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: value.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: value.name },
    app_metadata: {
      role: 'student',
      usn: value.usn,
      full_name: value.name,
      must_change_password: true,
      created_by: callerUser.id,
      student: { department: value.department, semester: value.semester, section: value.section, mobile: value.mobile },
      ...(institutionId ? { institution_id: institutionId } : {}),
      ...(isDemo ? { examsphere_demo: true } : {}),
    },
  });
  if (createError || !created?.user) {
    // Lost a race with a concurrent request for the same email.
    if (/already|exists|registered/i.test(createError?.message || '')) throw new HttpError(409, `${value.email} is already used by another account.`, { email: 'This email is already used by another account.' });
    throw new Error(`createUser failed: ${createError?.message || 'no user returned'}`);
  }
  const userId = created.user.id;

  try {
    const departmentId = await departmentIdFor(admin, institutionId, value.department);
    await upsertProfileRow(admin, schema, userId, {
      full_name: value.name, role: 'student', usn: value.usn, email: value.email, staff_id: null,
      ...(institutionId ? { institution_id: institutionId } : {}),
      ...(departmentId ? { department_id: departmentId } : {}),
    }, value.usn);
    if (institutionId && await tableExists(admin, 'student_details', 'profile_id')) {
      const { error } = await admin.from('student_details').upsert({
        profile_id: userId, institution_id: institutionId, semester: value.semester, section: value.section, phone: value.mobile,
      }, { onConflict: 'profile_id' });
      if (error) throw new Error(`student_details: ${error.message}`);
    }
    // A concurrent request may have claimed the same USN meanwhile: keep exactly one.
    const sameUsn = await findProfilesBy(admin, schema, 'usn', value.usn);
    if (sameUsn.some((p) => p.id !== userId)) throw new HttpError(409, `Student ID ${value.usn} already has an account.`, { usn: 'This Student ID already has an account.' });
  } catch (error) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    log('create-student: rolled back', { usn: value.usn });
    throw error;
  }

  log('create-student: created', { usn: value.usn, by: callerUser.id });
  return {
    student: { id: userId, usn: value.usn, name: value.name, email: value.email, mobile: value.mobile, department: value.department, semester: value.semester, section: value.section },
    credentials: { studentId: value.usn, email: value.email, temporaryPassword },
    mustChangePassword: true,
  };
}

// ─── First-login password change ─────────────────────────────────────────────
/** Payload of a JWT already verified by auth.getUser (no signature check here). */
export function jwtClaims(token) {
  try {
    const part = String(token).split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

const RECOVERY_WINDOW_SECONDS = 60 * 60;

/** True when the session was created from a password-recovery email link within the last hour. */
export function isRecentRecoverySession(claims, now = Date.now()) {
  const entries = Array.isArray(claims?.amr) ? claims.amr : [];
  return entries.some((e) => {
    if (e === 'recovery') return true; // RFC 8176 string form carries no timestamp; token expiry bounds it
    return e?.method === 'recovery' && Number(e.timestamp) * 1000 > now - RECOVERY_WINDOW_SECONDS * 1000;
  });
}

/**
 * Password set from a recovery email link (any role). The caller proved email
 * ownership through Supabase's recovery flow, so no current password is asked;
 * the server enforces the policy and clears any temporary-password flag.
 */
async function setRecoveredPassword({ admin, callerUser, input, claims, log }) {
  if (!isRecentRecoverySession(claims)) {
    throw new HttpError(403, 'This reset link has expired. Request a new one.');
  }
  const newPassword = String(input?.newPassword ?? '');
  const problems = passwordProblems(newPassword, { usn: callerUser.app_metadata?.usn || callerUser.app_metadata?.staff_id });
  if (problems.length) throw new HttpError(422, `The new password needs ${problems.join(', ')}.`, { newPassword: `Needs ${problems.join(', ')}.` });
  const { error } = await admin.auth.admin.updateUserById(callerUser.id, {
    password: newPassword,
    app_metadata: { ...callerUser.app_metadata, must_change_password: false, password_changed_at: new Date().toISOString() },
  });
  if (error) throw new Error(`updateUserById failed: ${error.message}`);
  log('change-temporary-password: recovered', { user: callerUser.id });
  return { ok: true };
}

export async function changeTemporaryPassword({ admin, callerUser, input, verifyPassword, claims = {}, log = () => {} }) {
  if (input?.mode === 'recovery') return setRecoveredPassword({ admin, callerUser, input, claims, log });
  if (callerUser.app_metadata?.must_change_password !== true) {
    throw new HttpError(409, 'This account has no temporary password to change.');
  }
  const currentPassword = String(input?.currentPassword ?? '');
  const newPassword = String(input?.newPassword ?? '');
  const problems = passwordProblems(newPassword, { usn: callerUser.app_metadata?.usn, current: currentPassword });
  if (problems.length) throw new HttpError(422, `The new password needs ${problems.join(', ')}.`, { newPassword: `Needs ${problems.join(', ')}.` });
  if (!currentPassword || !(await verifyPassword(callerUser.email, currentPassword))) {
    throw new HttpError(401, 'The temporary password is incorrect.', { currentPassword: 'The temporary password is incorrect.' });
  }
  const { error } = await admin.auth.admin.updateUserById(callerUser.id, {
    password: newPassword,
    app_metadata: { ...callerUser.app_metadata, must_change_password: false, password_changed_at: new Date().toISOString() },
  });
  if (error) throw new Error(`updateUserById failed: ${error.message}`);
  log('change-temporary-password: changed', { user: callerUser.id });
  return { ok: true };
}

// ─── HTTP layer (shared by both functions) ───────────────────────────────────
function corsHeaders(request, allowedOrigins) {
  const origin = request.headers.get('origin') || '';
  const allow = !allowedOrigins?.length ? '*' : (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function respond(request, allowedOrigins, status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request, allowedOrigins), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function authenticatedCall(request, { admin, allowedOrigins = [], log = () => {} }, action) {
  if (request.method === 'OPTIONS') return respond(request, allowedOrigins, 204);
  if (request.method !== 'POST') return respond(request, allowedOrigins, 405, { error: 'Method not allowed.' });
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Sign in again to continue.');
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) throw new HttpError(401, 'Your session has expired. Sign in again.');
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large.');
    let input;
    try { input = raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, 'Invalid JSON body.'); }
    const result = await action(data.user, input, jwtClaims(token));
    return respond(request, allowedOrigins, 200, result);
  } catch (error) {
    if (error instanceof HttpError) {
      return respond(request, allowedOrigins, error.status, { error: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) });
    }
    log('student-accounts: internal error', { message: error.message });
    return respond(request, allowedOrigins, 500, { error: 'The account service could not complete the request. Nothing was saved.' });
  }
}

export function handleCreateStudent(request, deps) {
  return authenticatedCall(request, deps, (callerUser, input) => createStudentAccount({ admin: deps.admin, callerUser, input, log: deps.log }));
}

export function handleChangeTemporaryPassword(request, deps) {
  return authenticatedCall(request, deps, (callerUser, input, claims) => changeTemporaryPassword({
    admin: deps.admin, callerUser, input, claims, verifyPassword: deps.verifyPassword, log: deps.log,
  }));
}
