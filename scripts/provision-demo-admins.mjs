#!/usr/bin/env node
/**
 * Provision the five subject-scoped ExamSphere demo administrators
 * (ADMIN001–ADMIN005) in Supabase Auth.
 *
 * Uses the supported Admin API (auth.admin.createUser), so each account signs
 * in through the normal Administrator login (staff ID →
 * resolve_login_identifier → signInWithPassword → profiles). Nothing in the
 * app is bypassed and no password exists in the codebase.
 *
 *   ADMIN001  22CS302  Data Structures and Algorithms
 *   ADMIN002  22CS402  Database Management Systems
 *   ADMIN003  22CS403  Operating Systems
 *   ADMIN004  22CS502  Computer Networks
 *   ADMIN005  22CS304  Java Programming
 *
 * Subject scope
 *  - The web app derives each admin's subject from the server-verified
 *    profile (staff_id → src/data/demoAdmins.js).
 *  - When migration 011 (public.subject_admins) has been reviewed and
 *    applied, this script also writes the subject_admins rows, so the
 *    database enforces the same scope (RLS + write guards). It never applies
 *    migrations itself; it only detects whether the table exists.
 *
 * SECURITY
 *  - Needs the project's service-role key. Run ONLY on an operator's machine;
 *    never put the key in VITE_* variables, never commit it, never paste it
 *    into chat.
 *  - A distinct strong temporary password is generated per admin (or one
 *    shared value is taken from DEMO_ADMIN_TEMP_PASSWORD) and printed ONCE to
 *    this terminal. It is not stored anywhere by this script.
 *  - Only accounts tagged app_metadata.examsphere_demo = true are updated or
 *    deleted. Existing non-demo users, profiles and staff IDs are never
 *    touched: any clash aborts before the first write.
 *
 * USAGE
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/provision-demo-admins.mjs            # create / rotate passwords
 *   node scripts/provision-demo-admins.mjs --dry-run  # show what would happen
 *   node scripts/provision-demo-admins.mjs --delete   # remove the demo admins
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { DEMO_ADMINS } from '../src/data/demoAdmins.js';
import { subjectByCode } from '../src/data/subjectCatalog.js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const DELETE = args.has('--delete');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment.');
}

const sharedPassword = process.env.DEMO_ADMIN_TEMP_PASSWORD || null;
if (!DELETE && sharedPassword !== null && sharedPassword.length < 12) {
  fail('DEMO_ADMIN_TEMP_PASSWORD must be at least 12 characters.');
}
const generatePassword = () => `Adm#7${randomBytes(18).toString('base64url')}`;

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const missingTable = (error) => /does not exist|Could not find the table|schema cache/i.test(error?.message || '');

async function findUserByEmail(email) {
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Dr. AIT institution id when migration 005 is applied, else null. */
async function drAitInstitutionId() {
  const { data, error } = await supabase.from('institutions').select('id').eq('code', '1DA').maybeSingle();
  if (error) {
    if (missingTable(error)) return null;
    throw new Error(`Could not read institutions: ${error.message}`);
  }
  if (!data) fail('Table public.institutions exists but has no Dr. AIT row (code 1DA). Seed it first (see docs/DEMO_ADMINS.md).');
  return data.id;
}

/** True when migration 011 (subject_admins) has been applied. */
async function subjectScopingAvailable() {
  const { error } = await supabase.from('subject_admins').select('admin_id').limit(1);
  if (!error) return true;
  if (missingTable(error)) return false;
  throw new Error(`Could not read subject_admins: ${error.message}`);
}

async function assertStaffIdFree(staffId, ownUserId) {
  const { data, error } = await supabase.from('profiles').select('id').ilike('staff_id', staffId);
  if (error) throw new Error(`Could not check profiles for ${staffId}: ${error.message}`);
  const clash = (data || []).find((p) => p.id !== ownUserId);
  if (clash) fail(`Staff ID ${staffId} already belongs to another (non-demo) profile ${clash.id}. Refusing to continue.`);
}

async function upsertProfile(userId, admin, institutionId) {
  const fields = { full_name: admin.name, staff_id: admin.staffId, usn: null, role: 'admin', email: admin.email };
  if (institutionId) fields.institution_id = institutionId;
  const { data, error } = await supabase.from('profiles').update(fields).eq('id', userId).select('id');
  if (error) throw new Error(`Profile update failed for ${admin.staffId}: ${error.message}`);
  if (data?.length) return;
  const { error: insertError } = await supabase.from('profiles').insert({ id: userId, ...fields });
  if (insertError) throw new Error(`Profile insert failed for ${admin.staffId}: ${insertError.message}`);
}

/** Subject row (catalogue entry) for the admin's subject; created only if missing. */
async function ensureSubject(institutionId, subject) {
  const { data, error } = await supabase.from('subjects').select('id')
    .eq('institution_id', institutionId).eq('code', subject.code).maybeSingle();
  if (error) throw new Error(`Could not read subject ${subject.code}: ${error.message}`);
  if (data) return data.id;
  const { data: created, error: insertError } = await supabase.from('subjects')
    .insert({ institution_id: institutionId, code: subject.code, title: subject.title, semester: Number.parseInt(subject.semester, 10) || null })
    .select('id').single();
  if (insertError) throw new Error(`Could not create subject ${subject.code}: ${insertError.message}`);
  return created.id;
}

async function assignSubject(userId, admin, institutionId) {
  const subjectId = await ensureSubject(institutionId, subjectByCode(admin.subjectCode));
  // Exactly one subject per demo admin: drop stale rows, then upsert.
  const { error: delError } = await supabase.from('subject_admins').delete().eq('admin_id', userId).neq('subject_id', subjectId);
  if (delError) throw new Error(`Could not reset subject scope for ${admin.staffId}: ${delError.message}`);
  const { error } = await supabase.from('subject_admins')
    .upsert({ admin_id: userId, subject_id: subjectId, institution_id: institutionId }, { onConflict: 'admin_id,subject_id' });
  if (error) throw new Error(`Could not assign ${admin.subjectCode} to ${admin.staffId}: ${error.message}`);
}

async function provision() {
  // Pre-flight: check every account BEFORE writing anything.
  const existingById = {};
  for (const admin of DEMO_ADMINS) {
    if (!subjectByCode(admin.subjectCode)) fail(`Unknown subject ${admin.subjectCode} for ${admin.staffId}.`);
    const existing = await findUserByEmail(admin.email);
    if (existing && existing.app_metadata?.examsphere_demo !== true) {
      fail(`${admin.email} already exists and is NOT a demo account. Refusing to modify anything.`);
    }
    if (!DRY_RUN) await assertStaffIdFree(admin.staffId, existing?.id);
    existingById[admin.staffId] = existing || null;
  }

  const institutionId = DRY_RUN ? null : await drAitInstitutionId();
  const scoping = DRY_RUN ? null : Boolean(institutionId) && await subjectScopingAvailable();
  const rows = [];
  for (const admin of DEMO_ADMINS) {
    const existing = existingById[admin.staffId];
    const subject = subjectByCode(admin.subjectCode);
    if (DRY_RUN) {
      rows.push({ ...admin, subject, action: existing ? 'rotate password + refresh profile' : 'create' });
      continue;
    }
    const password = sharedPassword || generatePassword();
    const appMetadata = {
      examsphere_demo: true,
      role: 'admin',
      staff_id: admin.staffId,
      subject_code: admin.subjectCode,
      full_name: admin.name,
      ...(institutionId ? { institution_id: institutionId } : {}),
    };
    let userId = existing?.id;
    if (existing) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, { password, app_metadata: appMetadata });
      if (error) throw new Error(`Password rotation failed for ${admin.email}: ${error.message}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: admin.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: admin.name },
        app_metadata: appMetadata,
      });
      if (error) throw new Error(`createUser failed for ${admin.email}: ${error.message}`);
      userId = data.user.id;
    }
    await upsertProfile(userId, admin, institutionId);
    if (scoping) await assignSubject(userId, admin, institutionId);
    rows.push({ ...admin, subject, password, action: existing ? 'password rotated' : 'created' });
  }
  return { rows, scoping };
}

async function remove() {
  const rows = [];
  for (const admin of DEMO_ADMINS) {
    const subject = subjectByCode(admin.subjectCode);
    const existing = await findUserByEmail(admin.email);
    if (!existing) { rows.push({ ...admin, subject, action: 'not found' }); continue; }
    if (existing.app_metadata?.examsphere_demo !== true) {
      rows.push({ ...admin, subject, action: 'SKIPPED (not tagged as demo)' });
      continue;
    }
    if (!DRY_RUN) {
      // Profile and subject_admins rows cascade from auth.users / profiles.
      const { error } = await supabase.auth.admin.deleteUser(existing.id);
      if (error) throw new Error(`deleteUser failed for ${admin.email}: ${error.message}`);
    }
    rows.push({ ...admin, subject, action: DRY_RUN ? 'would delete' : 'deleted' });
  }
  return { rows };
}

try {
  const { rows, scoping } = DELETE ? await remove() : await provision();
  console.log(`\nExamSphere demo administrators — ${DELETE ? 'delete' : 'provision'}${DRY_RUN ? ' (dry run)' : ''}\n`);
  console.table(rows.map((r) => ({ 'Login ID': r.staffId, Name: r.name, Subject: `${r.subject.code} ${r.subject.title}`, Email: r.email, Result: r.action })));
  if (!DELETE && !DRY_RUN) {
    console.log(scoping
      ? '\nDatabase subject scope: subject_admins rows written (migration 011 is applied).'
      : '\nDatabase subject scope: migration 011 not applied — scope is enforced by the web app only. Review and apply 011 for server-side enforcement.');
    console.log('\nTemporary passwords (shown once — not stored anywhere):\n');
    for (const r of rows) console.log(`    ${r.staffId}   ${r.password}`);
    console.log('\nGive each password only to the presenter for that account, over a secure channel. Re-run to rotate,');
    console.log('and run with --delete after the demo. Do not store them in the repository or paste them into chat.\n');
  }
} catch (error) {
  fail(error.message);
}
