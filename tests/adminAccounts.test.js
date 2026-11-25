import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startMockSupabase, LIVE_PROFILE_COLUMNS, FULL_PROFILE_COLUMNS } from './helpers/mockSupabase.mjs';
import { DEMO_ADMIN_SUBJECTS, SUBJECT_CATALOG, handleManageAdmins } from '../supabase/functions/_shared/adminAccounts.js';
import { handleChangeTemporaryPassword, handleCreateStudent } from '../supabase/functions/_shared/studentAccounts.js';
import { SUBJECTS } from '../src/data/subjectCatalog.js';
import { DEMO_ADMINS } from '../src/data/demoAdmins.js';

const SERVICE_KEY = 'test-service-role-placeholder';
const ANON = 'test-anon-placeholder';
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const PW = 'Existing#Pass2026';
const DRAIT = '00000000-0000-4000-8000-00000000d1a1';

const demoUsers = () => DEMO_ADMINS.map((a, i) => ({ id: `00000000-0000-4000-8000-0000000000a${i + 1}`, email: a.email, app_metadata: { role: 'admin', staff_id: a.staffId, subject_code: a.subjectCode, examsphere_demo: true }, password: PW }));
const seedUsers = () => [
  ...demoUsers(),
  { id: '00000000-0000-4000-8000-0000000000a0', email: 'admin@drait.edu.in', app_metadata: {}, password: PW },
  { id: '00000000-0000-4000-8000-0000000000f0', email: 'root@examsphere.io', app_metadata: {}, password: PW },
  { id: '00000000-0000-4000-8000-0000000000e0', email: 'cs006@drait.edu.in', app_metadata: { role: 'student', usn: 'CS006' }, password: PW },
];
const seedProfiles = (full) => [
  ...DEMO_ADMINS.map((a, i) => ({ id: `00000000-0000-4000-8000-0000000000a${i + 1}`, full_name: a.name, role: 'admin', usn: null, ...(full ? { staff_id: a.staffId, email: a.email, institution_id: DRAIT, is_active: true } : {}) })),
  { id: '00000000-0000-4000-8000-0000000000a0', full_name: 'Dr. Ramesh B.', role: 'admin', usn: null, ...(full ? { staff_id: 'ADM-8942', email: 'admin@drait.edu.in', institution_id: DRAIT, is_active: true } : {}) },
  { id: '00000000-0000-4000-8000-0000000000f0', full_name: 'Platform Administrator', role: 'super_admin', usn: null, ...(full ? { is_active: true } : {}) },
  { id: '00000000-0000-4000-8000-0000000000e0', full_name: 'CS Demo 06', role: 'student', usn: 'CS006', ...(full ? { institution_id: DRAIT, is_active: true } : {}) },
];
const liveTables = () => ({ profiles: { columns: LIVE_PROFILE_COLUMNS, rows: seedProfiles(false) } });
const fullTables = () => {
  const subjects = SUBJECT_CATALOG.map((s, i) => ({ id: `sub-${i}`, institution_id: DRAIT, code: s.code, title: s.title }));
  return {
    profiles: { columns: FULL_PROFILE_COLUMNS, rows: seedProfiles(true) },
    institutions: { columns: ['id', 'code', 'name'], rows: [{ id: DRAIT, code: '1DA', name: 'Dr. AIT' }] },
    subjects: { columns: ['id', 'institution_id', 'code', 'title'], rows: subjects },
    subject_admins: { columns: ['admin_id', 'subject_id', 'institution_id'], rows: DEMO_ADMINS.map((a, i) => ({ admin_id: `00000000-0000-4000-8000-0000000000a${i + 1}`, subject_id: subjects.find((s) => s.code === a.subjectCode).id, institution_id: DRAIT })) },
  };
};

async function setup(tables) {
  const functions = {};
  const logs = [];
  const mock = await startMockSupabase({ tables, users: seedUsers(), serviceKey: SERVICE_KEY, functions });
  const admin = createClient(mock.url, SERVICE_KEY, opts);
  const log = (m, f) => logs.push(`${m} ${JSON.stringify(f)}`);
  functions['manage-admins'] = (req) => handleManageAdmins(req, { admin, log });
  functions['create-student'] = (req) => handleCreateStudent(req, { admin, log });
  functions['change-temporary-password'] = (req) => handleChangeTemporaryPassword(req, {
    admin, log, verifyPassword: async (email, password) => !(await createClient(mock.url, ANON, opts).auth.signInWithPassword({ email, password })).error,
  });
  const signIn = async (email, password = PW) => {
    const { data, error } = await createClient(mock.url, ANON, opts).auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session.access_token;
  };
  const call = async (name, token, body) => {
    const res = await fetch(`${mock.url}/functions/v1/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, headers: res.headers, json: await res.json().catch(() => null) };
  };
  const root = () => signIn('root@examsphere.io');
  return { mock, signIn, call, root, logs, close: () => mock.close() };
}
const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
const NEW_ADMIN = { name: 'Admin 06', adminId: 'admin006', email: '', adminType: 'subject', subjectCode: '22CS304', status: 'Active' };

test('server catalogue and demo assignments match the app', () => {
  assert.deepEqual(SUBJECT_CATALOG.map((s) => [s.code, s.title, s.short]), SUBJECTS.map((s) => [s.code, s.title, s.short]));
  assert.deepEqual(DEMO_ADMIN_SUBJECTS, Object.fromEntries(DEMO_ADMINS.map((a) => [a.staffId, a.subjectCode])));
});

test('super admin lists all six admins from actual records (five subject admins + institution admin)', async () => {
  for (const tables of [liveTables(), fullTables()]) {
    const t = await setup(tables);
    try {
      const r = await t.call('manage-admins', await t.root(), { action: 'list' });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const rows = Object.fromEntries(r.json.admins.map((a) => [a.adminId || a.email, a]));
      assert.deepEqual(Object.keys(rows).sort(), ['ADM-8942', 'ADMIN001', 'ADMIN002', 'ADMIN003', 'ADMIN004', 'ADMIN005'].filter((k) => k !== 'ADM-8942' || tables.subjects).concat(tables.subjects ? [] : ['admin@drait.edu.in']).sort());
      assert.deepEqual([rows.ADMIN001.subjectCode, rows.ADMIN001.subjectShort, rows.ADMIN001.status, rows.ADMIN001.adminType], ['22CS302', 'DSA', 'Active', 'subject']);
      assert.equal(rows.ADMIN005.subjectTitle, 'Java Programming');
      assert.ok(!r.json.admins.some((a) => a.email === 'root@examsphere.io' || a.email === 'cs006@drait.edu.in'), 'super admin and students are not listed');
      assert.deepEqual(r.json.subjects.find((s) => s.code === '22CS402').assignedTo, ['ADMIN002']);
      assert.ok(!JSON.stringify(r.json).match(/password/i) || !JSON.stringify(r.json).includes(PW), 'no passwords in the listing');
    } finally { await t.close(); }
  }
});

test('only an active super admin may call manage-admins (institution admin, subject admin, student, anon, forged → refused)', async () => {
  const t = await setup(liveTables());
  try {
    assert.equal((await t.call('manage-admins', null, { action: 'list' })).status, 401);
    assert.equal((await t.call('manage-admins', 'forged.token', { action: 'list' })).status, 401);
    for (const email of ['admin@drait.edu.in', 'admin001@drait.edu.in', 'cs006@drait.edu.in']) {
      const token = await t.signIn(email);
      for (const body of [{ action: 'list' }, { action: 'create', ...NEW_ADMIN }, { action: 'reset-password', userId: '00000000-0000-4000-8000-0000000000a2' }, { action: 'set-status', userId: '00000000-0000-4000-8000-0000000000a2', status: 'Inactive' }]) {
        assert.equal((await t.call('manage-admins', token, body)).status, 403, `${email} ${body.action}`);
      }
    }
    assert.equal(t.mock.state.users.length, 8, 'nothing created');
    assert.ok(!t.mock.state.users.find((u) => u.id === '00000000-0000-4000-8000-0000000000a2').banned_until, 'nothing deactivated');
  } finally { await t.close(); }
});

test('create: validates, generates email and one-time password, assigns subject; role injection ignored', async () => {
  const t = await setup(liveTables());
  try {
    const token = await t.root();
    const bad = await t.call('manage-admins', token, { action: 'create', name: '', adminId: '1x', adminType: 'subject', subjectCode: 'NOPE' });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.json.fieldErrors).sort(), ['adminId', 'name', 'subjectCode']);
    const taken = await t.call('manage-admins', token, { action: 'create', ...NEW_ADMIN, subjectCode: '22CS302' });
    assert.equal(taken.status, 409, 'DSA already held by active ADMIN001');
    assert.match(taken.json.fieldErrors.subjectCode, /ADMIN001/);

    // free Java by deactivating ADMIN005, then create ADMIN006 on Java
    assert.equal((await t.call('manage-admins', token, { action: 'set-status', userId: '00000000-0000-4000-8000-0000000000a5', status: 'Inactive' })).status, 200);
    const r = await t.call('manage-admins', token, { action: 'create', ...NEW_ADMIN, role: 'super_admin', app_metadata: { role: 'super_admin' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const { credentials, admin: rec } = r.json;
    assert.deepEqual([credentials.adminId, credentials.email, credentials.temporaryPassword.length], ['ADMIN006', 'admin006@drait.edu.in', 16]);
    assert.deepEqual([rec.adminId, rec.subjectCode, rec.adminType, rec.status], ['ADMIN006', '22CS304', 'subject', 'Active']);
    const user = t.mock.state.users.find((u) => u.email === 'admin006@drait.edu.in');
    assert.equal(user.app_metadata.role, 'admin', 'never super admin');
    assert.equal(user.app_metadata.subject_code, '22CS304');
    assert.equal(user.app_metadata.must_change_password, true);
    assert.deepEqual(t.mock.state.tables.profiles.rows.find((p) => p.id === user.id), { id: user.id, full_name: 'Admin 06', role: 'admin', usn: null }, 'live columns only');
    assert.ok(!JSON.stringify({ t: t.mock.state.tables, l: t.logs, m: t.mock.state.users.map((u) => u.app_metadata) }).includes(credentials.temporaryPassword), 'password not stored or logged');

    // signed token carries the subject; Staff-Login style sign-in works with the temp password
    assert.equal(claims(await t.signIn('admin006@drait.edu.in', credentials.temporaryPassword)).app_metadata.subject_code, '22CS304');

    // duplicates
    assert.equal((await t.call('manage-admins', token, { action: 'create', ...NEW_ADMIN, adminType: 'institution' })).status, 409, 'Admin ID taken');
    assert.equal((await t.call('manage-admins', token, { action: 'create', ...NEW_ADMIN, adminId: 'ADMIN007', email: 'admin006@drait.edu.in', adminType: 'institution' })).status, 422, 'custom email refused on live schema');
    const dupId = await t.call('manage-admins', token, { action: 'create', ...NEW_ADMIN, adminId: 'ADMIN001', adminType: 'institution' });
    assert.equal(dupId.status, 409, 'existing demo Admin ID (from app_metadata, no staff_id column)');
  } finally { await t.close(); }
});

test('reactivation is refused while the subject is held; reassignment conflicts are refused', async () => {
  const t = await setup(liveTables());
  try {
    const token = await t.root();
    await t.call('manage-admins', token, { action: 'set-status', userId: '00000000-0000-4000-8000-0000000000a5', status: 'Inactive' });
    await t.call('manage-admins', token, { action: 'create', ...NEW_ADMIN });
    const react = await t.call('manage-admins', token, { action: 'set-status', userId: '00000000-0000-4000-8000-0000000000a5', status: 'Active' });
    assert.equal(react.status, 409);
    assert.match(react.json.error, /22CS304 is already assigned to ADMIN006/);
    const clash = await t.call('manage-admins', token, { action: 'assign-subject', userId: '00000000-0000-4000-8000-0000000000a1', adminType: 'subject', subjectCode: '22CS402' });
    assert.equal(clash.status, 409);
    // move ADMIN005 to institution-wide, then it can be activated
    const inst = await t.call('manage-admins', token, { action: 'assign-subject', userId: '00000000-0000-4000-8000-0000000000a5', adminType: 'institution' });
    assert.equal(inst.status, 200);
    assert.equal(inst.json.admin.adminType, 'institution');
    assert.equal(t.mock.state.users.find((u) => u.id === '00000000-0000-4000-8000-0000000000a5').app_metadata.subject_code, undefined);
    assert.equal((await t.call('manage-admins', token, { action: 'set-status', userId: '00000000-0000-4000-8000-0000000000a5', status: 'Active' })).status, 200);
  } finally { await t.close(); }
});

test('full schema: create and reassignment keep subject_admins in sync; staff_id and email written', async () => {
  const t = await setup(fullTables());
  try {
    const token = await t.root();
    await t.call('manage-admins', token, { action: 'set-status', userId: '00000000-0000-4000-8000-0000000000a3', status: 'Inactive' });
    assert.equal(t.mock.state.tables.profiles.rows.find((p) => p.id === '00000000-0000-4000-8000-0000000000a3').is_active, false);
    const r = await t.call('manage-admins', token, { action: 'create', ...NEW_ADMIN, adminId: 'OS-EXAMINER', subjectCode: '22CS403' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const id = r.json.admin.id;
    const profile = t.mock.state.tables.profiles.rows.find((p) => p.id === id);
    assert.deepEqual([profile.staff_id, profile.email, profile.institution_id, profile.is_active], ['OS-EXAMINER', 'os-examiner@drait.edu.in', DRAIT, true]);
    const subjectOf = (uid) => t.mock.state.tables.subject_admins.rows.filter((x) => x.admin_id === uid).map((x) => t.mock.state.tables.subjects.rows.find((s) => s.id === x.subject_id).code);
    assert.deepEqual(subjectOf(id), ['22CS403']);
    await t.call('manage-admins', token, { action: 'set-status', userId: '00000000-0000-4000-8000-0000000000a4', status: 'Inactive' });
    await t.call('manage-admins', token, { action: 'assign-subject', userId: id, adminType: 'subject', subjectCode: '22CS502' });
    assert.deepEqual(subjectOf(id), ['22CS502']);
    await t.call('manage-admins', token, { action: 'assign-subject', userId: id, adminType: 'institution' });
    assert.deepEqual(subjectOf(id), []);
  } finally { await t.close(); }
});

test('reset password: new one-time password, old stops working, change enforced and completable', async () => {
  const t = await setup(liveTables());
  try {
    const token = await t.root();
    const r = await t.call('manage-admins', token, { action: 'reset-password', userId: '00000000-0000-4000-8000-0000000000a2' });
    assert.equal(r.status, 200);
    const temp = r.json.credentials.temporaryPassword;
    assert.equal(r.json.credentials.adminId, 'ADMIN002');
    await assert.rejects(t.signIn('admin002@drait.edu.in', PW), 'old password no longer works');
    const adminToken = await t.signIn('admin002@drait.edu.in', temp);
    assert.equal(claims(adminToken).app_metadata.must_change_password, true);
    assert.equal(claims(adminToken).app_metadata.subject_code, '22CS402', 'subject kept');
    const ch = await t.call('change-temporary-password', adminToken, { currentPassword: temp, newPassword: 'Admin02#Fresh2026' });
    assert.equal(ch.status, 200, JSON.stringify(ch.json));
    assert.equal(claims(await t.signIn('admin002@drait.edu.in', 'Admin02#Fresh2026')).app_metadata.must_change_password, false);
  } finally { await t.close(); }
});

test('deactivated admins cannot sign in; super admin and students cannot be targeted', async () => {
  const t = await setup(liveTables());
  try {
    const token = await t.root();
    await t.call('manage-admins', token, { action: 'set-status', userId: '00000000-0000-4000-8000-0000000000a4', status: 'Inactive' });
    await assert.rejects(t.signIn('admin004@drait.edu.in'), /banned/i);
    const list = await t.call('manage-admins', token, { action: 'list' });
    assert.equal(list.json.admins.find((a) => a.adminId === 'ADMIN004').status, 'Inactive');
    await t.call('manage-admins', token, { action: 'set-status', userId: '00000000-0000-4000-8000-0000000000a4', status: 'Active' });
    assert.ok(await t.signIn('admin004@drait.edu.in'));
    for (const userId of ['00000000-0000-4000-8000-0000000000f0', '00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000dd']) {
      for (const body of [{ action: 'reset-password', userId }, { action: 'set-status', userId, status: 'Inactive' }, { action: 'assign-subject', userId, adminType: 'institution' }]) {
        assert.equal((await t.call('manage-admins', token, body)).status, 404, `${userId} ${body.action}`);
      }
    }
    assert.equal(t.mock.state.users.find((u) => u.id === '00000000-0000-4000-8000-0000000000f0').password, PW, 'super admin untouched');
    assert.equal((await t.call('manage-admins', token, { action: 'promote' })).status, 400);
  } finally { await t.close(); }
});

test('a new subject admin (signed subject_code) cannot create students; an institution-type admin can', async () => {
  const t = await setup(liveTables());
  try {
    const token = await t.root();
    await t.call('manage-admins', token, { action: 'set-status', userId: '00000000-0000-4000-8000-0000000000a5', status: 'Inactive' });
    const sub = (await t.call('manage-admins', token, { action: 'create', ...NEW_ADMIN })).json.credentials;
    const inst = (await t.call('manage-admins', token, { action: 'create', ...NEW_ADMIN, adminId: 'ADMIN010', adminType: 'institution' })).json.credentials;
    const student = { name: 'New Student', usn: '1DA22CS501', mobile: '+91 90000 00001', semester: 5, section: 'A' };
    assert.equal((await t.call('create-student', await t.signIn(sub.email, sub.temporaryPassword), student)).status, 403);
    assert.equal((await t.call('create-student', await t.signIn(inst.email, inst.temporaryPassword), student)).status, 200);
  } finally { await t.close(); }
});
