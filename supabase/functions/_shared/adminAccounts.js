/**
 * Super-admin management of administrator accounts (Edge Function
 * `manage-admins`). Plain JavaScript shared by Deno and the Node tests; the
 * service-role client is injected and never reaches the browser.
 *
 * Roles: Super Admin (profiles.role 'super_admin', platform-wide), Subject
 * Admin and Student. There is no institution-wide administrator.
 *  - A Subject Admin is a `profiles` row with role 'admin' (institution Dr.
 *    AIT) plus its Auth user, with app_metadata.admin_type = 'subject' and a
 *    valid subject_code — writable only with the service role and carried in
 *    the signed session token the web app reads.
 *  - Older admins without a subject are listed as "No subject assigned" and
 *    can be given one; they are never deleted or changed automatically.
 *  - When migration 011 is applied, `subject_admins` is kept in sync so the
 *    database enforces the same subject scope (RLS + write guards).
 *
 * Rules enforced here (server-side):
 *  - Caller must be an active super admin (verified profile). Everyone else 403.
 *  - Targets must be existing role-'admin' accounts. Roles are never changed:
 *    nobody can be promoted to super admin (or demoted to student) here.
 *  - Admin ID and email must be unique (Auth + profiles); one active subject
 *    admin per subject.
 *  - Temporary passwords are generated server-side, returned once with
 *    Cache-Control: no-store, never stored or logged; accounts get
 *    app_metadata.must_change_password = true.
 *  - Deactivation bans the Auth user (no sign-in, no token refresh).
 */
import {
  detectProfileSchema, drAitInstitutionId, findAuthUserByEmail, findProfilesBy, getProfileById, upsertProfileRow,
} from './profileSchema.js';
import {
  DEMO_ADMIN_IDS, EMAIL_DOMAIN, HttpError, authenticatedCall, generateTemporaryPassword, tableExists,
} from './studentAccounts.js';

/** Kept in sync with src/data/subjectCatalog.js and src/data/demoAdmins.js (tested). */
export const SUBJECT_CATALOG = [
  { code: '22CS302', title: 'Data Structures and Algorithms', short: 'DSA' },
  { code: '22CS402', title: 'Database Management Systems', short: 'DBMS' },
  { code: '22CS403', title: 'Operating Systems', short: 'OS' },
  { code: '22CS502', title: 'Computer Networks', short: 'CN' },
  { code: '22CS304', title: 'Java Programming', short: 'Java' },
];
export const DEMO_ADMIN_SUBJECTS = { ADMIN001: '22CS302', ADMIN002: '22CS402', ADMIN003: '22CS403', ADMIN004: '22CS502', ADMIN005: '22CS304' };
const ADMIN_ID_PATTERN = /^[A-Z][A-Z0-9-]{2,19}$/;
const BAN_FOREVER = '876000h';

// ─── Lookups ─────────────────────────────────────────────────────────────────
async function listAuthUsers(admin) {
  const users = [];
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
  throw new Error('Too many auth users to scan safely.');
}

/** Subjects from public.subjects (migration 006) when present, else the built-in catalogue. */
export async function loadSubjects(admin, institutionId) {
  if (institutionId && await tableExists(admin, 'subjects', 'code')) {
    const { data, error } = await admin.from('subjects').select('id,code,title').eq('institution_id', institutionId);
    if (error) throw new Error(`Could not read subjects: ${error.message}`);
    if (data?.length) {
      return data.map((s) => ({ id: s.id, code: s.code, title: s.title, short: SUBJECT_CATALOG.find((c) => c.code === s.code)?.short || s.code }))
        .sort((a, b) => a.code.localeCompare(b.code));
    }
  }
  return SUBJECT_CATALOG.map((s) => ({ ...s, id: null }));
}

const isBanned = (user) => Boolean(user.banned_until) && new Date(user.banned_until).getTime() > Date.now();

/** The effective assignment — same precedence as the web app (src/services/adminScope.js). */
export function effectiveAssignment(user, profile) {
  const md = user.app_metadata || {};
  const adminId = String(profile?.staff_id || md.staff_id || '').toUpperCase() || null;
  if (md.subject_code) return { adminId, adminType: 'subject', subjectCode: String(md.subject_code).toUpperCase() };
  const demo = DEMO_ADMIN_SUBJECTS[adminId] || DEMO_ADMIN_SUBJECTS[String(user.email || '').split('@')[0].toUpperCase()];
  if (demo) return { adminId: adminId || String(user.email).split('@')[0].toUpperCase(), adminType: 'subject', subjectCode: demo };
  // Every administrator is a subject admin; one without a subject has no exam access yet.
  return { adminId, adminType: 'subject', subjectCode: null };
}

function toRecord(user, profile, subjects) {
  const assignment = effectiveAssignment(user, profile);
  const subject = subjects.find((s) => s.code === assignment.subjectCode) || null;
  return {
    id: user.id,
    adminId: assignment.adminId,
    name: profile?.full_name || user.user_metadata?.full_name || user.email,
    email: user.email,
    adminType: assignment.adminType,
    subjectCode: assignment.subjectCode,
    subjectTitle: subject?.title || null,
    subjectShort: subject?.short || null,
    status: isBanned(user) || profile?.is_active === false ? 'Inactive' : 'Active',
    mustChangePassword: user.app_metadata?.must_change_password === true,
    lastSignInAt: user.last_sign_in_at || null,
    createdAt: user.created_at || null,
  };
}

async function context(admin) {
  const schema = await detectProfileSchema(admin, { optional: ['is_active'] });
  const institutionId = await drAitInstitutionId(admin, schema);
  const subjects = await loadSubjects(admin, institutionId);
  return { schema, institutionId, subjects };
}

async function adminRecords(admin, { schema, subjects }) {
  const { data: profiles, error } = await admin.from('profiles').select(schema.present.join(',')).eq('role', 'admin');
  if (error) throw new Error(`Could not read profiles: ${error.message}`);
  const users = await listAuthUsers(admin);
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    users,
    records: (profiles || []).filter((p) => byId.has(p.id)).map((p) => toRecord(byId.get(p.id), p, subjects))
      .sort((a, b) => String(a.adminId || a.email).localeCompare(String(b.adminId || b.email))),
  };
}

// ─── Authorisation ───────────────────────────────────────────────────────────
async function requireSuperAdmin(admin, schema, callerUser) {
  const profile = await getProfileById(admin, schema, callerUser.id);
  if (!profile || profile.role !== 'super_admin' || (schema.has('is_active') && profile.is_active === false) || isBanned(callerUser)) {
    throw new HttpError(403, 'Only the super administrator can manage administrator accounts.');
  }
  return profile;
}

async function requireAdminTarget(admin, schema, userId) {
  if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new HttpError(400, 'Invalid administrator.');
  const profile = await getProfileById(admin, schema, userId);
  if (!profile || profile.role !== 'admin') throw new HttpError(404, 'Administrator not found.');
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new HttpError(404, 'Administrator not found.');
  return { profile, user: data.user };
}

// ─── Validation ──────────────────────────────────────────────────────────────
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max + 1);

/** Administrators are always Subject Admins with exactly one valid subject. */
function validateAssignment(input, subjects, errors) {
  if (input.adminType !== undefined && input.adminType !== null && input.adminType !== 'subject') {
    errors.adminType = 'Administrators are Subject Admins. Institution-wide administrators are not supported.';
  }
  const subjectCode = clean(input.subjectCode, 16).toUpperCase();
  if (!subjects.some((s) => s.code === subjectCode)) errors.subjectCode = 'Choose a subject.';
  return { adminType: 'subject', subjectCode };
}

export function validateAdminInput(input, subjects) {
  const src = input && typeof input === 'object' ? input : {};
  const errors = {};
  const name = clean(src.name, 120);
  const adminId = clean(src.adminId, 20).toUpperCase().replace(/\s/g, '');
  const emailRaw = clean(src.email, 254).toLowerCase();
  const status = src.status === 'Inactive' ? 'Inactive' : 'Active';
  if (name.length < 2 || name.length > 120) errors.name = 'Full name is required.';
  if (!ADMIN_ID_PATTERN.test(adminId)) errors.adminId = 'Admin ID: 3–20 letters, digits or hyphens, starting with a letter.';
  if (emailRaw && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(emailRaw)) errors.email = 'Enter a valid email address.';
  else if (emailRaw && !emailRaw.endsWith(`@${EMAIL_DOMAIN}`)) errors.email = `Use an @${EMAIL_DOMAIN} address.`;
  const { adminType, subjectCode } = validateAssignment(src, subjects, errors);
  const email = emailRaw || (errors.adminId ? '' : `${adminId.toLowerCase()}@${EMAIL_DOMAIN}`);
  return { errors, value: { name, adminId, email, emailProvided: Boolean(emailRaw), adminType, subjectCode, status } };
}

function assertSubjectFree(records, subjectCode, exceptUserId) {
  const holder = records.find((r) => r.id !== exceptUserId && r.status === 'Active' && r.adminType === 'subject' && r.subjectCode === subjectCode);
  if (holder) {
    throw new HttpError(409, `${subjectCode} is already assigned to ${holder.adminId || holder.email}.`, { subjectCode: `Assigned to ${holder.adminId || holder.email}.` });
  }
}

async function syncSubjectAdmins(admin, ctx, userId, adminType, subjectCode) {
  if (!ctx.institutionId || !(await tableExists(admin, 'subject_admins', 'admin_id'))) return;
  const subject = ctx.subjects.find((s) => s.code === subjectCode);
  const del = admin.from('subject_admins').delete().eq('admin_id', userId);
  const { error: delError } = adminType === 'subject' && subject?.id ? await del.neq('subject_id', subject.id) : await del;
  if (delError) throw new Error(`subject_admins: ${delError.message}`);
  if (adminType === 'subject' && subject?.id) {
    const { error } = await admin.from('subject_admins')
      .upsert({ admin_id: userId, subject_id: subject.id, institution_id: ctx.institutionId }, { onConflict: 'admin_id,subject_id' });
    if (error) throw new Error(`subject_admins: ${error.message}`);
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────
async function listAdmins(admin, ctx) {
  const { records } = await adminRecords(admin, ctx);
  return {
    admins: records,
    subjects: ctx.subjects.map((s) => ({
      code: s.code, title: s.title, short: s.short,
      assignedTo: records.filter((r) => r.status === 'Active' && r.adminType === 'subject' && r.subjectCode === s.code).map((r) => r.adminId || r.email),
    })),
  };
}

async function createAdmin(admin, ctx, callerUser, input, log) {
  const { errors, value } = validateAdminInput(input, ctx.subjects);
  if (value.emailProvided && value.email !== `${value.adminId.toLowerCase()}@${EMAIL_DOMAIN}` && !(ctx.schema.has('email') && ctx.schema.has('staff_id'))) {
    errors.email = `Sign-in by Admin ID needs ${value.adminId.toLowerCase()}@${EMAIL_DOMAIN} until migrations 003/004 are applied. Leave blank.`;
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields.', errors);

  const { users, records } = await adminRecords(admin, ctx);
  const idTaken = users.some((u) => String(u.app_metadata?.staff_id || '').toUpperCase() === value.adminId)
    || records.some((r) => r.adminId === value.adminId)
    || (await findProfilesBy(admin, ctx.schema, 'staff_id', value.adminId)).length > 0;
  if (idTaken) throw new HttpError(409, `Admin ID ${value.adminId} already exists.`, { adminId: 'This Admin ID already exists.' });
  if (await findAuthUserByEmail(admin, value.email) || (await findProfilesBy(admin, ctx.schema, 'email', value.email)).length) {
    throw new HttpError(409, `${value.email} is already used by another account.`, { email: 'This email is already used.' });
  }
  if (value.status === 'Active') assertSubjectFree(records, value.subjectCode, null);

  const temporaryPassword = generateTemporaryPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email: value.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: value.name },
    ...(value.status === 'Inactive' ? { ban_duration: BAN_FOREVER } : {}),
    app_metadata: {
      role: 'admin',
      staff_id: value.adminId,
      full_name: value.name,
      admin_type: 'subject',
      subject_code: value.subjectCode,
      must_change_password: true,
      created_by: callerUser.id,
      ...(ctx.institutionId ? { institution_id: ctx.institutionId } : {}),
      ...(DEMO_ADMIN_IDS.includes(value.adminId) ? { examsphere_demo: true } : {}),
    },
  });
  if (error || !data?.user) {
    if (/already|exists|registered/i.test(error?.message || '')) throw new HttpError(409, `${value.email} is already used by another account.`, { email: 'This email is already used.' });
    throw new Error(`createUser failed: ${error?.message || 'no user'}`);
  }
  const userId = data.user.id;
  try {
    // Writes the full profile (the signup trigger may not have created it yet).
    await upsertProfileRow(admin, ctx.schema, userId, {
      full_name: value.name, role: 'admin', staff_id: value.adminId, email: value.email, usn: null,
      ...(ctx.institutionId ? { institution_id: ctx.institutionId } : {}),
      ...(ctx.schema.has('is_active') ? { is_active: value.status === 'Active' } : {}),
    }, value.adminId);
    await syncSubjectAdmins(admin, ctx, userId, value.adminType, value.subjectCode);
  } catch (e) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    log('manage-admins: create rolled back', { adminId: value.adminId });
    throw e;
  }
  log('manage-admins: created', { adminId: value.adminId, type: value.adminType, subject: value.subjectCode, by: callerUser.id });
  const { data: fresh } = await admin.auth.admin.getUserById(userId);
  return {
    admin: toRecord(fresh?.user || data.user, { full_name: value.name, staff_id: value.adminId, is_active: value.status === 'Active' }, ctx.subjects),
    credentials: { adminId: value.adminId, email: value.email, temporaryPassword },
  };
}

async function assignSubject(admin, ctx, callerUser, input, log) {
  const { profile, user } = await requireAdminTarget(admin, ctx.schema, input.userId);
  const errors = {};
  const { adminType, subjectCode } = validateAssignment(input, ctx.subjects, errors);
  if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields.', errors);
  const { records } = await adminRecords(admin, ctx);
  const current = records.find((r) => r.id === user.id);
  if (current?.status === 'Active') assertSubjectFree(records, subjectCode, user.id);
  const { subject_code: _drop, ...rest } = user.app_metadata || {};
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...rest, role: 'admin', staff_id: current?.adminId || rest.staff_id, admin_type: adminType, subject_code: subjectCode },
  });
  if (error) throw new Error(`updateUserById failed: ${error.message}`);
  await syncSubjectAdmins(admin, ctx, user.id, adminType, subjectCode);
  log('manage-admins: subject assigned', { target: user.id, type: adminType, subject: subjectCode, by: callerUser.id });
  const { data } = await admin.auth.admin.getUserById(user.id);
  return { admin: toRecord(data.user, profile, ctx.subjects) };
}

async function resetPassword(admin, ctx, callerUser, input, log) {
  const { profile, user } = await requireAdminTarget(admin, ctx.schema, input.userId);
  const temporaryPassword = generateTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: temporaryPassword,
    app_metadata: { ...(user.app_metadata || {}), must_change_password: true, password_reset_at: new Date().toISOString(), password_reset_by: callerUser.id },
  });
  if (error) throw new Error(`updateUserById failed: ${error.message}`);
  log('manage-admins: password reset', { target: user.id, by: callerUser.id });
  const record = toRecord({ ...user, app_metadata: { ...user.app_metadata, must_change_password: true } }, profile, ctx.subjects);
  return { admin: record, credentials: { adminId: record.adminId, email: user.email, temporaryPassword } };
}

async function setStatus(admin, ctx, callerUser, input, log) {
  const { profile, user } = await requireAdminTarget(admin, ctx.schema, input.userId);
  const status = input.status === 'Inactive' ? 'Inactive' : input.status === 'Active' ? 'Active' : null;
  if (!status) throw new HttpError(422, 'Choose Active or Inactive.');
  if (status === 'Active') {
    const { records } = await adminRecords(admin, ctx);
    const current = records.find((r) => r.id === user.id);
    if (current?.adminType === 'subject' && current.subjectCode) assertSubjectFree(records, current.subjectCode, user.id);
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, { ban_duration: status === 'Inactive' ? BAN_FOREVER : 'none' });
  if (error) throw new Error(`updateUserById failed: ${error.message}`);
  if (ctx.schema.has('is_active')) {
    const { error: pErr } = await admin.from('profiles').update({ is_active: status === 'Active' }).eq('id', user.id);
    if (pErr) throw new Error(`profiles: ${pErr.message}`);
  }
  log('manage-admins: status', { target: user.id, status, by: callerUser.id });
  const { data } = await admin.auth.admin.getUserById(user.id);
  return { admin: toRecord(data.user, { ...profile, is_active: status === 'Active' }, ctx.subjects) };
}

const ACTIONS = { list: listAdmins, create: createAdmin, 'assign-subject': assignSubject, 'reset-password': resetPassword, 'set-status': setStatus };

export async function manageAdmins({ admin, callerUser, input, log = () => {} }) {
  const ctx = await context(admin);

  // Temporary diagnostic: verify Dr. AIT institution ID resolution.
  log('admin-create diagnostic', {
    institutionId: ctx.institutionId,
    hasInstitutionId: Boolean(ctx.institutionId),
    institutionColumnExists: ctx.schema.has('institution_id'),
  });

  await requireSuperAdmin(admin, ctx.schema, callerUser);

  const action = ACTIONS[input?.action];

  if (!action) {
    throw new HttpError(400, 'Unknown action.');
  }

  return action === listAdmins
    ? action(admin, ctx)
    : action(admin, ctx, callerUser, input, log);
}

export function handleManageAdmins(request, deps) {
  return authenticatedCall(request, deps, (callerUser, input) => manageAdmins({ admin: deps.admin, callerUser, input, log: deps.log }));
}
