import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startMockSupabase, LIVE_PROFILE_COLUMNS, FULL_PROFILE_COLUMNS } from './helpers/mockSupabase.mjs';
import {
  DEMO_ADMIN_IDS, DEMO_STUDENT_IDS, generateTemporaryPassword, handleChangeTemporaryPassword, handleCreateStudent,
  passwordProblems, validateStudentInput,
} from '../supabase/functions/_shared/studentAccounts.js';
import { DEMO_STUDENTS } from '../src/data/demoAccounts.js';
import { DEMO_ADMINS } from '../src/data/demoAdmins.js';

const SERVICE_KEY = 'test-service-role-placeholder';
const ANON_KEY = 'test-anon-placeholder';
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const DRAIT = '00000000-0000-4000-8000-00000000d1a1';
const PW = 'Existing#Pass2026';

const seedUsers = () => [
  { id: 'u-inst', email: 'admin@drait.edu.in', app_metadata: {}, password: PW },
  { id: 'u-root', email: 'root@examsphere.io', app_metadata: {}, password: PW },
  { id: 'u-subj', email: 'admin001@drait.edu.in', app_metadata: { staff_id: 'ADMIN001', examsphere_demo: true }, password: PW },
  { id: 'u-stud', email: '1da22cs001@drait.edu.in', app_metadata: { role: 'student', usn: '1DA22CS001' }, password: PW },
  { id: 'u-off', email: 'former@drait.edu.in', app_metadata: {}, password: PW },
];
const seedProfiles = (full) => [
  { id: 'u-inst', full_name: 'Dr. Ramesh B.', role: 'admin', usn: null, ...(full ? { staff_id: 'ADM-8942', email: 'admin@drait.edu.in', institution_id: DRAIT, is_active: true } : {}) },
  { id: 'u-root', full_name: 'Platform Administrator', role: 'super_admin', usn: null, ...(full ? { is_active: true } : {}) },
  { id: 'u-subj', full_name: 'Admin 01', role: 'admin', usn: null, ...(full ? { staff_id: 'ADMIN001', institution_id: DRAIT, is_active: true } : {}) },
  { id: 'u-stud', full_name: 'Student One', role: 'student', usn: '1DA22CS001', ...(full ? { email: '1da22cs001@drait.edu.in', institution_id: DRAIT, is_active: true } : {}) },
  { id: 'u-off', full_name: 'Former Admin', role: 'admin', usn: null, ...(full ? { institution_id: DRAIT, is_active: false } : {}) },
];
const liveTables = () => ({ profiles: { columns: LIVE_PROFILE_COLUMNS, rows: seedProfiles(false) } });
const fullTables = () => ({
  profiles: { columns: FULL_PROFILE_COLUMNS, rows: seedProfiles(true) },
  institutions: { columns: ['id', 'code', 'name'], rows: [{ id: DRAIT, code: '1DA', name: 'Dr. Ambedkar Institute of Technology' }] },
  departments: { columns: ['id', 'institution_id', 'code', 'name'], rows: [{ id: 'dep-cs', institution_id: DRAIT, code: 'CS', name: 'Computer Science & Engineering' }] },
  student_details: { columns: ['profile_id', 'institution_id', 'semester', 'section', 'phone'], rows: [] },
  subject_admins: { columns: ['admin_id', 'subject_id', 'institution_id'], rows: [] },
});

async function setup(tables) {
  const functions = {};
  const logs = [];
  const mock = await startMockSupabase({ tables, users: seedUsers(), serviceKey: SERVICE_KEY, functions });
  const admin = createClient(mock.url, SERVICE_KEY, opts);
  const log = (message, fields) => logs.push(`${message} ${JSON.stringify(fields)}`);
  const verifyPassword = async (email, password) => !(await createClient(mock.url, ANON_KEY, opts).auth.signInWithPassword({ email, password })).error;
  functions['create-student'] = (req) => handleCreateStudent(req, { admin, log });
  functions['change-temporary-password'] = (req) => handleChangeTemporaryPassword(req, { admin, verifyPassword, log });
  const signIn = async (email, password = PW) => {
    const client = createClient(mock.url, ANON_KEY, opts);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { client, token: data.session.access_token };
  };
  const call = async (name, token, body, extraHeaders = {}) => {
    const res = await fetch(`${mock.url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: ANON_KEY, ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, json: await res.json().catch(() => null) };
  };
  return { mock, signIn, call, logs, close: () => mock.close() };
}

const CS006 = { name: 'CS Demo 06', usn: 'cs006', email: '', mobile: '+91 98450 12345', department: 'Computer Science & Engineering', semester: 6, section: 'd' };

test('server lists match the app (demo students and subject admins)', () => {
  assert.deepEqual(DEMO_STUDENT_IDS, DEMO_STUDENTS.map((s) => s.usn));
  assert.deepEqual(DEMO_ADMIN_IDS, DEMO_ADMINS.map((a) => a.staffId));
});

test('temporary passwords: 16 chars, all classes, CSPRNG-unique', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) {
    const p = generateTemporaryPassword();
    assert.equal(p.length, 16);
    assert.deepEqual(passwordProblems(p), []);
    assert.doesNotMatch(p, /[0O1lI]/, 'no ambiguous characters');
    seen.add(p);
  }
  assert.equal(seen.size, 500);
  assert.deepEqual(passwordProblems('short'), ['at least 12 characters', 'an upper-case letter', 'a digit', 'a symbol']);
  assert.ok(passwordProblems('Cs006#Password', { usn: 'CS006' }).includes('not your Student ID'));
});

test('input validation: institutional email generated; role and other fields ignored', () => {
  const { errors, value } = validateStudentInput({ ...CS006, role: 'super_admin', institution_id: 'x', app_metadata: { role: 'admin' } });
  assert.deepEqual(errors, {});
  assert.equal(value.usn, 'CS006');
  assert.equal(value.email, 'cs006@drait.edu.in');
  assert.equal(value.section, 'D');
  assert.ok(!('role' in value) && !('institution_id' in value));
  const bad = validateStudentInput({ name: 'X', usn: 'ABC', email: 'a@gmail.com', mobile: '12', semester: 9, section: 'AB' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['email', 'mobile', 'name', 'section', 'semester', 'usn']);
});

test('live schema: institution admin creates CS006 → student role, flag set, one-time password, nothing sensitive stored', async () => {
  const t = await setup(liveTables());
  try {
    const { token } = await t.signIn('admin@drait.edu.in');
    const r = await t.call('create-student', token, { ...CS006, role: 'admin' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const { credentials, student } = r.json;
    assert.equal(credentials.studentId, 'CS006');
    assert.equal(credentials.email, 'cs006@drait.edu.in');
    assert.deepEqual(passwordProblems(credentials.temporaryPassword), []);
    assert.equal(student.usn, 'CS006');

    const user = t.mock.state.users.find((u) => u.email === 'cs006@drait.edu.in');
    assert.equal(user.password, credentials.temporaryPassword, 'Auth holds the password (hashed in real Supabase)');
    assert.equal(user.app_metadata.role, 'student', 'client-sent role ignored');
    assert.equal(user.app_metadata.must_change_password, true);
    assert.equal(user.app_metadata.examsphere_demo, true, 'demo ID tagged so the provisioning scripts recognise it');
    assert.deepEqual(user.app_metadata.student, { department: 'Computer Science & Engineering', semester: 6, section: 'D', mobile: '+91 98450 12345' });
    const profile = t.mock.state.tables.profiles.rows.find((p) => p.id === user.id);
    assert.deepEqual(profile, { id: user.id, full_name: 'CS Demo 06', role: 'student', usn: 'CS006' }, 'only existing live columns written');

    const everything = JSON.stringify({ tables: t.mock.state.tables, logs: t.logs, appMetadata: t.mock.state.users.map((u) => u.app_metadata) });
    assert.ok(!everything.includes(credentials.temporaryPassword), 'password not in profiles, metadata or logs');
    assert.ok(t.mock.state.requests.filter((q) => q.path.startsWith('/auth/v1/admin/')).every((q) => q.auth === 'service'), 'admin API only with the service key');
    assert.ok(t.logs.some((l) => l.includes('create-student: created') && l.includes('CS006')));
  } finally { await t.close(); }
});

test('full schema: email, institution, department and student_details (with phone) are written', async () => {
  const t = await setup(fullTables());
  try {
    const { token } = await t.signIn('admin@drait.edu.in');
    const r = await t.call('create-student', token, { ...CS006, usn: '1DA22CS042', name: 'Asha Rao' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const id = r.json.student.id;
    const profile = t.mock.state.tables.profiles.rows.find((p) => p.id === id);
    assert.equal(profile.email, '1da22cs042@drait.edu.in');
    assert.equal(profile.institution_id, DRAIT);
    assert.equal(profile.department_id, 'dep-cs');
    assert.equal(profile.staff_id, null);
    assert.deepEqual(t.mock.state.tables.student_details.rows, [{ profile_id: id, institution_id: DRAIT, semester: 6, section: 'D', phone: '+91 98450 12345' }]);
  } finally { await t.close(); }
});

test('authorisation: anonymous, invalid token, student, subject admin and inactive admin are refused; super admin allowed', async () => {
  const t = await setup(fullTables());
  try {
    assert.equal((await t.call('create-student', null, CS006)).status, 401);
    assert.equal((await t.call('create-student', 'forged.token.value', CS006)).status, 401);
    assert.equal((await t.call('create-student', ANON_KEY, CS006)).status, 401, 'anon key is not a session');
    for (const email of ['1da22cs001@drait.edu.in', 'admin001@drait.edu.in', 'former@drait.edu.in']) {
      const { token } = await t.signIn(email);
      const r = await t.call('create-student', token, CS006);
      assert.equal(r.status, 403, `${email}: ${JSON.stringify(r.json)}`);
    }
    assert.equal(t.mock.state.users.filter((u) => u.email === 'cs006@drait.edu.in').length, 0, 'nothing created by refused callers');
    const { token } = await t.signIn('root@examsphere.io');
    const ok = await t.call('create-student', token, CS006);
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(t.mock.state.tables.profiles.rows.find((p) => p.usn === 'CS006').institution_id, DRAIT);
  } finally { await t.close(); }
});

test('subject admin listed in subject_admins (not a demo ID) is refused', async () => {
  const tables = fullTables();
  tables.profiles.rows.push({ id: 'u-dsa', full_name: 'DSA Examiner', role: 'admin', usn: null, staff_id: 'ADM-7001', institution_id: DRAIT, is_active: true });
  tables.subject_admins.rows.push({ admin_id: 'u-dsa', subject_id: 's1', institution_id: DRAIT });
  const t = await setup(tables);
  t.mock.state.users.push({ id: 'u-dsa', email: 'dsa.examiner@drait.edu.in', app_metadata: {}, password: PW });
  try {
    const { token } = await t.signIn('dsa.examiner@drait.edu.in');
    assert.equal((await t.call('create-student', token, CS006)).status, 403);
  } finally { await t.close(); }
});

test('duplicates: existing USN, existing email and a second CS006 are rejected; existing accounts untouched', async () => {
  const t = await setup(liveTables());
  try {
    const { token } = await t.signIn('admin@drait.edu.in');
    const before = structuredClone(t.mock.state.users);
    const dupUsn = await t.call('create-student', token, { ...CS006, usn: '1da22cs001' });
    assert.equal(dupUsn.status, 409);
    assert.match(dupUsn.json.fieldErrors.usn, /already has an account/);
    const dupEmail = await t.call('create-student', token, { ...CS006, usn: '1DA22CS099', email: '1da22cs001@drait.edu.in' });
    assert.equal(dupEmail.status, 422, 'custom email refused on the live schema (login needs the convention)');
    const first = await t.call('create-student', token, CS006);
    assert.equal(first.status, 200);
    const second = await t.call('create-student', token, CS006);
    assert.equal(second.status, 409);
    assert.equal(t.mock.state.users.filter((u) => u.email === 'cs006@drait.edu.in').length, 1);
    assert.deepEqual(t.mock.state.users.filter((u) => u.email !== 'cs006@drait.edu.in'), before);
  } finally { await t.close(); }
});

test('full schema: an email already on a profile is a duplicate', async () => {
  const t = await setup(fullTables());
  try {
    const { token } = await t.signIn('admin@drait.edu.in');
    t.mock.state.tables.profiles.rows.push({ id: 'p-x', full_name: 'X', role: 'student', usn: '1DA22CS777', email: 'asha.rao@drait.edu.in' });
    const r = await t.call('create-student', token, { ...CS006, usn: '1DA22CS043', email: 'asha.rao@drait.edu.in' });
    assert.equal(r.status, 409);
    assert.match(r.json.fieldErrors.email, /already used/);
  } finally { await t.close(); }
});

test('failure after the Auth user is created rolls it back', async () => {
  const tables = fullTables();
  tables.student_details.columns = ['profile_id', 'institution_id', 'semester']; // phone/section missing → write fails
  const t = await setup(tables);
  try {
    const { token } = await t.signIn('admin@drait.edu.in');
    const r = await t.call('create-student', token, CS006);
    assert.equal(r.status, 500);
    assert.match(r.json.error, /Nothing was saved/);
    assert.ok(!JSON.stringify(r.json).includes('student_details'), 'no internals leaked');
    assert.equal(t.mock.state.users.filter((u) => u.email === 'cs006@drait.edu.in').length, 0, 'auth user deleted again');
  } finally { await t.close(); }
});

test('validation errors, bad JSON, oversized body and wrong method', async () => {
  const t = await setup(liveTables());
  try {
    const { token } = await t.signIn('admin@drait.edu.in');
    const r = await t.call('create-student', token, { name: '', usn: 'nope' });
    assert.equal(r.status, 422);
    assert.ok(r.json.fieldErrors.usn && r.json.fieldErrors.name && r.json.fieldErrors.mobile);
    assert.equal((await t.call('create-student', token, '{not json')).status, 400);
    assert.equal((await t.call('create-student', token, JSON.stringify({ pad: 'x'.repeat(9000) }))).status, 413);
    const get = await fetch(`${t.mock.url}/functions/v1/create-student`, { method: 'GET', headers: { authorization: `Bearer ${token}` } });
    assert.equal(get.status, 405);
  } finally { await t.close(); }
});

test('first-login password change: wrong/weak refused; success sets the new password and clears the flag', async () => {
  const t = await setup(liveTables());
  try {
    const { token: adminToken } = await t.signIn('admin@drait.edu.in');
    const { credentials } = (await t.call('create-student', adminToken, CS006)).json;
    const { token } = await t.signIn('cs006@drait.edu.in', credentials.temporaryPassword);
    assert.equal(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).app_metadata.must_change_password, true, 'flag in the signed token');

    assert.equal((await t.call('change-temporary-password', null, {})).status, 401);
    const wrong = await t.call('change-temporary-password', token, { currentPassword: 'Wrong#Pass12345', newPassword: 'Brand#NewPass2026' });
    assert.equal(wrong.status, 401);
    const weak = await t.call('change-temporary-password', token, { currentPassword: credentials.temporaryPassword, newPassword: 'password' });
    assert.equal(weak.status, 422);
    const same = await t.call('change-temporary-password', token, { currentPassword: credentials.temporaryPassword, newPassword: credentials.temporaryPassword });
    assert.equal(same.status, 422);

    const ok = await t.call('change-temporary-password', token, { currentPassword: credentials.temporaryPassword, newPassword: 'Brand#NewPass2026' });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    const user = t.mock.state.users.find((u) => u.email === 'cs006@drait.edu.in');
    assert.equal(user.app_metadata.must_change_password, false);
    assert.equal(user.app_metadata.role, 'student', 'other metadata preserved');
    await assert.rejects(t.signIn('cs006@drait.edu.in', credentials.temporaryPassword), 'temporary password no longer works');
    const { token: fresh } = await t.signIn('cs006@drait.edu.in', 'Brand#NewPass2026');
    assert.equal(JSON.parse(Buffer.from(fresh.split('.')[1], 'base64url')).app_metadata.must_change_password, false);
    assert.equal((await t.call('change-temporary-password', fresh, { currentPassword: 'Brand#NewPass2026', newPassword: 'Another#Pass2027' })).status, 409, 'only for temporary passwords');
    assert.ok(!JSON.stringify(t.logs).includes('Brand#NewPass2026'));
  } finally { await t.close(); }
});

test('a user can only change their own password (token decides the account)', async () => {
  const t = await setup(liveTables());
  try {
    const { token: adminToken } = await t.signIn('admin@drait.edu.in');
    await t.call('create-student', adminToken, CS006);
    const r = await t.call('change-temporary-password', adminToken, { currentPassword: PW, newPassword: 'Hijack#Attempt2026', userId: 'whatever' });
    assert.equal(r.status, 409, 'admin has no temporary password; body cannot target another user');
    assert.equal(t.mock.state.users.find((u) => u.email === 'admin@drait.edu.in').password, PW);
  } finally { await t.close(); }
});
