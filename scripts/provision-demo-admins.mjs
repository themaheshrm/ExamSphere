#!/usr/bin/env node
/**
 * Provision the five subject-scoped ExamSphere demo administrators
 * (ADMIN001–ADMIN005) in Supabase Auth.
 *
 * Uses the supported Admin API (auth.admin.createUser), so each account signs
 * in through the normal Administrator login. Nothing in the app is bypassed
 * and no password exists in the codebase.
 *
 *   ADMIN001  22CS302  Data Structures and Algorithms
 *   ADMIN002  22CS402  Database Management Systems
 *   ADMIN003  22CS403  Operating Systems
 *   ADMIN004  22CS502  Computer Networks
 *   ADMIN005  22CS304  Java Programming
 *
 * Schema-aware: the live `profiles` table may not have `staff_id` / `email`
 * (migrations 003/004). The script detects the existing columns read-only and
 * writes only those. The admin's Login ID and subject are always stored in
 * app_metadata (server-controlled, part of the signed session), which the web
 * app uses to restrict the admin to its subject when `staff_id` is absent.
 * It never adds columns or applies migrations.
 *
 * SAFETY
 *  - Every account is checked BEFORE the first write; any clash with a
 *    non-demo account, Login ID or email aborts with zero changes.
 *  - Only users tagged app_metadata.examsphere_demo = true are ever updated
 *    or deleted. Re-running is idempotent (no duplicates) and repairs a demo
 *    user whose profile row is missing.
 *  - --dry-run performs the real read-only checks (schema, Auth users,
 *    profiles, institution, subject scope table) and writes nothing.
 *
 * SECURITY
 *  - Needs the project's service-role (secret) key in the environment. Run
 *    ONLY on an operator's machine; never commit it, never put it in VITE_*
 *    variables, never paste it into chat. This script never prints it.
 *  - Temporary passwords: a distinct strong one per admin (or one shared value
 *    from DEMO_ADMIN_TEMP_PASSWORD), printed ONCE to this terminal, stored
 *    nowhere.
 *
 * USAGE
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<secret> \
 *   node scripts/provision-demo-admins.mjs --dry-run  # read-only checks
 *   node scripts/provision-demo-admins.mjs            # create / rotate passwords
 *   node scripts/provision-demo-admins.mjs --delete   # remove the demo admins
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { DEMO_ADMINS } from '../src/data/demoAdmins.js';
import { subjectByCode } from '../src/data/subjectCatalog.js';
import {
  checkDemoAccount, describeSchema, detectProfileSchema, drAitInstitutionId,
  findAuthUserByEmail, isMissingTable, upsertProfileRow,
} from './lib/profileSchema.mjs';

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
if (/^sb_publishable_/.test(serviceKey)) {
  // Publishable/anon keys cannot use the Admin API; fail early (the key itself is never printed).
  fail('SUPABASE_SERVICE_ROLE_KEY holds a publishable key. Use the secret (service-role) key.');
}

const sharedPassword = process.env.DEMO_ADMIN_TEMP_PASSWORD || null;
if (!DELETE && sharedPassword !== null && sharedPassword.length < 12) {
  fail('DEMO_ADMIN_TEMP_PASSWORD must be at least 12 characters.');
}
const generatePassword = () => `Adm#7${randomBytes(18).toString('base64url')}`;

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** True when migration 011 (subject_admins) has been applied. Read-only. */
async function subjectScopingAvailable() {
  const { error } = await supabase.from('subject_admins').select('admin_id').limit(0);
  if (!error) return true;
  if (isMissingTable(error)) return false;
  throw new Error(`Could not read subject_admins: ${error.message}`);
}

/** Existing subject row id, or null. Read-only. */
async function findSubject(institutionId, subject) {
  const { data, error } = await supabase.from('subjects').select('id')
    .eq('institution_id', institutionId).eq('code', subject.code).maybeSingle();
  if (error) throw new Error(`Could not read subject ${subject.code}: ${error.message}`);
  return data?.id || null;
}

async function ensureSubject(institutionId, subject) {
  const id = await findSubject(institutionId, subject);
  if (id) return id;
  const { data, error } = await supabase.from('subjects')
    .insert({ institution_id: institutionId, code: subject.code, title: subject.title, semester: Number.parseInt(subject.semester, 10) || null })
    .select('id').single();
  if (error) throw new Error(`Could not create subject ${subject.code}: ${error.message}`);
  return data.id;
}

async function assignSubject(userId, admin, institutionId) {
  const subjectId = await ensureSubject(institutionId, subjectByCode(admin.subjectCode));
  // Exactly one subject per demo admin: drop stale rows of THIS demo user only, then upsert.
  const { error: delError } = await supabase.from('subject_admins').delete().eq('admin_id', userId).neq('subject_id', subjectId);
  if (delError) throw new Error(`Could not reset subject scope for ${admin.staffId}: ${delError.message}`);
  const { error } = await supabase.from('subject_admins')
    .upsert({ admin_id: userId, subject_id: subjectId, institution_id: institutionId }, { onConflict: 'admin_id,subject_id' });
  if (error) throw new Error(`Could not assign ${admin.subjectCode} to ${admin.staffId}: ${error.message}`);
}

async function preflight() {
  const schema = await detectProfileSchema(supabase);
  const institutionId = await drAitInstitutionId(supabase, schema);
  const scoping = institutionId ? await subjectScopingAvailable() : false;

  const plans = [];
  const conflicts = [];
  for (const admin of DEMO_ADMINS) {
    const subject = subjectByCode(admin.subjectCode);
    if (!subject) { conflicts.push(`${admin.staffId}: unknown subject ${admin.subjectCode}`); continue; }
    const check = await checkDemoAccount(supabase, schema, { email: admin.email, identifierColumn: 'staff_id', identifier: admin.staffId });
    if (check.conflicts.length) conflicts.push(...check.conflicts.map((c) => `${admin.staffId}: ${c}`));
    const demoUser = check.existing?.app_metadata?.examsphere_demo === true ? check.existing : null;
    const action = !demoUser ? 'create'
      : check.profile ? 'rotate password + refresh profile' : 'rotate password + repair missing profile';
    plans.push({ admin, subject, demoUser, action });
  }
  return { schema, institutionId, scoping, plans, conflicts };
}

async function provision() {
  const pre = await preflight();
  const { schema, institutionId, scoping, plans, conflicts } = pre;
  if (conflicts.length) {
    fail(`Pre-flight found ${conflicts.length} conflict(s). Nothing was changed:\n  - ${conflicts.join('\n  - ')}`);
  }
  if (DRY_RUN) return { ...pre, rows: plans.map((p) => ({ ...p, result: `would ${p.action}` })) };

  const rows = [];
  for (const plan of plans) {
    const { admin, demoUser } = plan;
    const password = sharedPassword || generatePassword();
    const appMetadata = {
      examsphere_demo: true,
      role: 'admin',
      staff_id: admin.staffId,
      subject_code: admin.subjectCode,
      full_name: admin.name,
      ...(institutionId ? { institution_id: institutionId } : {}),
    };
    let userId = demoUser?.id;
    if (demoUser) {
      const { error } = await supabase.auth.admin.updateUserById(demoUser.id, { password, app_metadata: appMetadata });
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
    await upsertProfileRow(supabase, schema, userId, {
      full_name: admin.name, role: 'admin', email: admin.email, staff_id: admin.staffId, usn: null,
      ...(institutionId ? { institution_id: institutionId } : {}),
    }, admin.staffId);
    if (scoping) await assignSubject(userId, admin, institutionId);
    rows.push({ ...plan, password, result: demoUser ? 'password rotated' : 'created' });
  }
  return { ...pre, rows };
}

async function remove() {
  const rows = [];
  for (const admin of DEMO_ADMINS) {
    const subject = subjectByCode(admin.subjectCode);
    const existing = await findAuthUserByEmail(supabase, admin.email);
    if (!existing) { rows.push({ admin, subject, result: 'not found' }); continue; }
    if (existing.app_metadata?.examsphere_demo !== true) {
      rows.push({ admin, subject, result: 'SKIPPED (not tagged as demo)' });
      continue;
    }
    if (!DRY_RUN) {
      const { error } = await supabase.auth.admin.deleteUser(existing.id);
      if (error) throw new Error(`deleteUser failed for ${admin.email}: ${error.message}`);
    }
    rows.push({ admin, subject, result: DRY_RUN ? 'would delete' : 'deleted' });
  }
  return { rows };
}

try {
  const out = DELETE ? await remove() : await provision();
  console.log(`\nExamSphere demo administrators — ${DELETE ? 'delete' : 'provision'}${DRY_RUN ? ' (dry run: read-only, nothing written)' : ''}\n`);
  if (out.schema) {
    console.log(describeSchema(out.schema));
    console.log(`Login ID storage: ${out.schema.has('staff_id') ? 'profiles.staff_id + Auth app_metadata.staff_id' : 'Auth app_metadata.staff_id only (profiles.staff_id not present)'}`);
    console.log(`Dr. AIT institution link: ${out.institutionId ? 'yes' : 'no (institutions table or profiles.institution_id not present)'}`);
    console.log(`Database subject scope (migration 011): ${out.scoping ? 'subject_admins table present' : 'not applied — scope enforced by the web app only'}\n`);
  }
  console.table(out.rows.map((r) => ({ 'Login ID': r.admin.staffId, Subject: `${r.subject.code} ${r.subject.title}`, Email: r.admin.email, Result: r.result })));
  if (!DELETE && !DRY_RUN) {
    console.log('\nTemporary passwords (shown once — not stored anywhere):\n');
    for (const r of out.rows) console.log(`    ${r.admin.staffId}   ${r.password}`);
    console.log('\nGive each password only to the presenter for that account, over a secure channel. Re-run to rotate,');
    console.log('and run with --delete after the demo. Do not store them in the repository or paste them into chat.\n');
  }
} catch (error) {
  fail(error.message);
}
