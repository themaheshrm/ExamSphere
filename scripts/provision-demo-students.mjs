#!/usr/bin/env node
/**
 * Provision the five ExamSphere demo CS student accounts in Supabase Auth.
 *
 * Uses the supported Admin API (auth.admin.createUser) so the accounts sign
 * in through the normal ExamSphere login (USN → resolve_login_identifier →
 * signInWithPassword → profiles). Nothing in the app is bypassed.
 *
 * SECURITY
 *  - Needs the project's service-role key. Run this ONLY on an operator's
 *    machine; never put the key in .env files that Vite bundles (VITE_*),
 *    never commit it, never paste it into chat.
 *  - A strong temporary password is generated (or taken from
 *    DEMO_TEMP_PASSWORD) and printed ONCE to this terminal. It is not stored
 *    anywhere by this script.
 *  - Only accounts tagged app_metadata.examsphere_demo = true are ever
 *    updated or deleted. Existing non-demo users/profiles are never touched.
 *
 * USAGE
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/provision-demo-students.mjs            # create / rotate password
 *   node scripts/provision-demo-students.mjs --dry-run  # show what would happen
 *   node scripts/provision-demo-students.mjs --delete   # remove the demo accounts
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { DEMO_STUDENTS } from '../src/data/demoAccounts.js';

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

function generatePassword() {
  // 18 random bytes → 24 URL-safe chars, plus a fixed prefix that satisfies
  // typical upper/lower/digit/symbol policies.
  return `Demo#7${randomBytes(18).toString('base64url')}`;
}

const password = process.env.DEMO_TEMP_PASSWORD || generatePassword();
if (!DELETE && password.length < 12) fail('DEMO_TEMP_PASSWORD must be at least 12 characters.');

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

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

/** Dr. AIT institution id when migration 005 (institutions table) is applied, else null. */
async function drAitInstitutionId() {
  const { data, error } = await supabase.from('institutions').select('id').eq('code', '1DA').maybeSingle();
  if (error) {
    if (/relation .*institutions.* does not exist|Could not find the table/i.test(error.message)) return null;
    throw new Error(`Could not read institutions: ${error.message}`);
  }
  if (!data) {
    fail('Table public.institutions exists but has no Dr. AIT row (code 1DA). Seed it first (see docs/DEMO_ACCOUNTS.md).');
  }
  return data.id;
}

async function assertUsnFree(usn, ownUserId) {
  const { data, error } = await supabase.from('profiles').select('id').ilike('usn', usn);
  if (error) throw new Error(`Could not check profiles for ${usn}: ${error.message}`);
  const clash = (data || []).find((p) => p.id !== ownUserId);
  if (clash) fail(`USN ${usn} already belongs to another (non-demo) profile ${clash.id}. Refusing to continue.`);
}

async function upsertProfile(userId, student, institutionId) {
  const fields = { full_name: student.name, usn: student.usn, role: 'student', email: student.email };
  if (institutionId) fields.institution_id = institutionId;
  const { data, error } = await supabase.from('profiles').update(fields).eq('id', userId).select('id');
  if (error) throw new Error(`Profile update failed for ${student.usn}: ${error.message}`);
  if (data?.length) return;
  // No signup trigger row: create the profile explicitly.
  const { error: insertError } = await supabase.from('profiles').insert({ id: userId, ...fields });
  if (insertError) throw new Error(`Profile insert failed for ${student.usn}: ${insertError.message}`);
}

async function provision() {
  // Pre-flight: check every account BEFORE writing anything, so a clash never
  // leaves the demo set half-provisioned.
  const existingByUsn = {};
  for (const student of DEMO_STUDENTS) {
    const existing = await findUserByEmail(student.email);
    if (existing && existing.app_metadata?.examsphere_demo !== true) {
      fail(`${student.email} already exists and is NOT a demo account. Refusing to modify anything.`);
    }
    if (!DRY_RUN) await assertUsnFree(student.usn, existing?.id);
    existingByUsn[student.usn] = existing || null;
  }

  const institutionId = DRY_RUN ? null : await drAitInstitutionId();
  const rows = [];
  for (const student of DEMO_STUDENTS) {
    const existing = existingByUsn[student.usn];
    if (DRY_RUN) {
      rows.push({ ...student, action: existing ? 'rotate password + refresh profile' : 'create' });
      continue;
    }
    const appMetadata = {
      examsphere_demo: true,
      role: 'student',
      usn: student.usn,
      full_name: student.name,
      ...(institutionId ? { institution_id: institutionId } : {}),
    };
    let userId = existing?.id;
    if (existing) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, { password, app_metadata: appMetadata });
      if (error) throw new Error(`Password rotation failed for ${student.email}: ${error.message}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: student.email,
        password,
        email_confirm: true,           // no confirmation mail is sent
        user_metadata: { full_name: student.name },
        app_metadata: appMetadata,
      });
      if (error) throw new Error(`createUser failed for ${student.email}: ${error.message}`);
      userId = data.user.id;
    }
    await upsertProfile(userId, student, institutionId);
    rows.push({ ...student, action: existing ? 'password rotated' : 'created' });
  }
  return rows;
}

async function remove() {
  const rows = [];
  for (const student of DEMO_STUDENTS) {
    const existing = await findUserByEmail(student.email);
    if (!existing) { rows.push({ ...student, action: 'not found' }); continue; }
    if (existing.app_metadata?.examsphere_demo !== true) {
      rows.push({ ...student, action: 'SKIPPED (not tagged as demo)' });
      continue;
    }
    if (!DRY_RUN) {
      const { error } = await supabase.auth.admin.deleteUser(existing.id);
      if (error) throw new Error(`deleteUser failed for ${student.email}: ${error.message}`);
    }
    rows.push({ ...student, action: DRY_RUN ? 'would delete' : 'deleted' });
  }
  return rows;
}

try {
  const rows = DELETE ? await remove() : await provision();
  console.log(`\nExamSphere demo accounts — ${DELETE ? 'delete' : 'provision'}${DRY_RUN ? ' (dry run)' : ''}\n`);
  console.table(rows.map((r) => ({ 'Student ID': r.usn, Name: r.name, Email: r.email, Pattern: r.pattern, Result: r.action })));
  if (!DELETE && !DRY_RUN) {
    console.log('\nTemporary password (shown once, shared by all five demo accounts):\n');
    console.log(`    ${password}\n`);
    console.log('Share it only with the demo presenter over a secure channel. Re-run this script to rotate it,');
    console.log('and run with --delete after the demo. Do not store it in the repository or in chat.\n');
  }
} catch (error) {
  fail(error.message);
}
