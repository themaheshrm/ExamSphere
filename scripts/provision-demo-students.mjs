#!/usr/bin/env node
/**
 * Provision the five ExamSphere demo CS student accounts in Supabase Auth.
 *
 * Uses the supported Admin API (auth.admin.createUser) so the accounts sign
 * in through the normal ExamSphere login (USN → resolve_login_identifier or
 * the usn@drait.edu.in fallback → signInWithPassword → profiles). Nothing in
 * the app is bypassed.
 *
 * Schema-aware: the live `profiles` table may not have `email` / `staff_id`
 * (migrations 003/004). Columns are detected read-only and only existing ones
 * are written. `profiles.usn` is required (the app identifies students by it);
 * the script never adds columns or applies migrations.
 *
 * SAFETY
 *  - All five accounts are checked BEFORE the first write; any clash with a
 *    non-demo account, USN or email aborts with zero changes.
 *  - Only users tagged app_metadata.examsphere_demo = true are ever updated or
 *    deleted. Re-running is idempotent and repairs a demo user whose profile
 *    row is missing (e.g. after an earlier failed run).
 *  - --dry-run performs the real read-only checks and writes nothing.
 *
 * SECURITY
 *  - Needs the service-role (secret) key in the environment. Run ONLY on an
 *    operator's machine; never commit it or paste it into chat. Never printed.
 *  - One strong temporary password (or DEMO_TEMP_PASSWORD) is printed ONCE.
 *
 * USAGE
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<secret> \
 *   node scripts/provision-demo-students.mjs --dry-run  # read-only checks
 *   node scripts/provision-demo-students.mjs            # create / rotate password
 *   node scripts/provision-demo-students.mjs --delete   # remove the demo accounts
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { DEMO_STUDENTS } from '../src/data/demoAccounts.js';
import {
  checkDemoAccount, describeSchema, detectProfileSchema, drAitInstitutionId,
  findAuthUserByEmail, upsertProfileRow,
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
  fail('SUPABASE_SERVICE_ROLE_KEY holds a publishable key. Use the secret (service-role) key.');
}

const password = process.env.DEMO_TEMP_PASSWORD || `Demo#7${randomBytes(18).toString('base64url')}`;
if (!DELETE && password.length < 12) fail('DEMO_TEMP_PASSWORD must be at least 12 characters.');

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function preflight() {
  const schema = await detectProfileSchema(supabase, { required: ['usn'] });
  const institutionId = await drAitInstitutionId(supabase, schema);
  const plans = [];
  const conflicts = [];
  for (const student of DEMO_STUDENTS) {
    const check = await checkDemoAccount(supabase, schema, { email: student.email, identifierColumn: 'usn', identifier: student.usn });
    if (check.conflicts.length) conflicts.push(...check.conflicts.map((c) => `${student.usn}: ${c}`));
    const demoUser = check.existing?.app_metadata?.examsphere_demo === true ? check.existing : null;
    const action = !demoUser ? 'create'
      : check.profile ? 'rotate password + refresh profile' : 'rotate password + repair missing profile';
    plans.push({ student, demoUser, action });
  }
  return { schema, institutionId, plans, conflicts };
}

async function provision() {
  const pre = await preflight();
  if (pre.conflicts.length) {
    fail(`Pre-flight found ${pre.conflicts.length} conflict(s). Nothing was changed:\n  - ${pre.conflicts.join('\n  - ')}`);
  }
  if (DRY_RUN) return { ...pre, rows: pre.plans.map((p) => ({ ...p, result: `would ${p.action}` })) };

  const rows = [];
  for (const plan of pre.plans) {
    const { student, demoUser } = plan;
    const appMetadata = {
      examsphere_demo: true,
      role: 'student',
      usn: student.usn,
      full_name: student.name,
      ...(pre.institutionId ? { institution_id: pre.institutionId } : {}),
    };
    let userId = demoUser?.id;
    if (demoUser) {
      const { error } = await supabase.auth.admin.updateUserById(demoUser.id, { password, app_metadata: appMetadata });
      if (error) throw new Error(`Password rotation failed for ${student.email}: ${error.message}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: student.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: student.name },
        app_metadata: appMetadata,
      });
      if (error) throw new Error(`createUser failed for ${student.email}: ${error.message}`);
      userId = data.user.id;
    }
    await upsertProfileRow(supabase, pre.schema, userId, {
      full_name: student.name, role: 'student', usn: student.usn, email: student.email, staff_id: null,
      ...(pre.institutionId ? { institution_id: pre.institutionId } : {}),
    }, student.usn);
    rows.push({ ...plan, result: demoUser ? 'password rotated' : 'created' });
  }
  return { ...pre, rows };
}

async function remove() {
  const rows = [];
  for (const student of DEMO_STUDENTS) {
    const existing = await findAuthUserByEmail(supabase, student.email);
    if (!existing) { rows.push({ student, result: 'not found' }); continue; }
    if (existing.app_metadata?.examsphere_demo !== true) {
      rows.push({ student, result: 'SKIPPED (not tagged as demo)' });
      continue;
    }
    if (!DRY_RUN) {
      const { error } = await supabase.auth.admin.deleteUser(existing.id);
      if (error) throw new Error(`deleteUser failed for ${student.email}: ${error.message}`);
    }
    rows.push({ student, result: DRY_RUN ? 'would delete' : 'deleted' });
  }
  return { rows };
}

try {
  const out = DELETE ? await remove() : await provision();
  console.log(`\nExamSphere demo accounts — ${DELETE ? 'delete' : 'provision'}${DRY_RUN ? ' (dry run: read-only, nothing written)' : ''}\n`);
  if (out.schema) {
    console.log(describeSchema(out.schema));
    console.log(`Dr. AIT institution link: ${out.institutionId ? 'yes' : 'no (institutions table or profiles.institution_id not present)'}\n`);
  }
  console.table(out.rows.map((r) => ({ 'Student ID': r.student.usn, Name: r.student.name, Email: r.student.email, Pattern: r.student.pattern, Result: r.result })));
  if (!DELETE && !DRY_RUN) {
    console.log('\nTemporary password (shown once, shared by all five demo accounts):\n');
    console.log(`    ${password}\n`);
    console.log('Share it only with the demo presenter over a secure channel. Re-run this script to rotate it,');
    console.log('and run with --delete after the demo. Do not store it in the repository or in chat.\n');
  }
} catch (error) {
  fail(error.message);
}
