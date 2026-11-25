import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startMockSupabase, LIVE_PROFILE_COLUMNS, FULL_PROFILE_COLUMNS } from './helpers/mockSupabase.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE_KEY = 'test-only-service-role-placeholder';
const DRAIT = '00000000-0000-4000-8000-00000000d1a1';

function run(script, args, mock, extraEnv = {}) {
  return new Promise((resolve) => {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, SUPABASE_URL: mock.url, SUPABASE_SERVICE_ROLE_KEY: FAKE_KEY, ...extraEnv };
    execFile(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { cwd: ROOT, env, timeout: 30000 }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, out: `${stdout}\n${stderr}` });
    });
  });
}

const liveTables = () => ({ profiles: { columns: LIVE_PROFILE_COLUMNS, rows: [] } });
const fullTables = () => ({
  profiles: { columns: FULL_PROFILE_COLUMNS, rows: [] },
  institutions: { columns: ['id', 'code', 'name'], rows: [{ id: DRAIT, code: '1DA', name: 'Dr. Ambedkar Institute of Technology' }] },
  subjects: { columns: ['id', 'institution_id', 'code', 'title', 'semester'], rows: [] },
  subject_admins: { columns: ['admin_id', 'subject_id', 'institution_id'], rows: [] },
});
const realInstitutionAdmin = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@drait.edu.in', app_metadata: {} };
const realStudent = { id: '00000000-0000-4000-8000-0000000000bb', email: '1da22cs001@drait.edu.in', app_metadata: {} };

async function withMock(config, fn) {
  const mock = await startMockSupabase(config);
  try { await fn(mock); } finally { await mock.close(); }
}

test('admin: live schema (no staff_id/email) — dry run is read-only and reports the schema', () => withMock({ tables: liveTables(), users: [realInstitutionAdmin] }, async (mock) => {
  const r = await run('provision-demo-admins.mjs', ['--dry-run'], mock);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /optional columns missing: email, staff_id/);
  assert.match(r.out, /app_metadata\.staff_id only/);
  assert.equal((r.out.match(/would create/g) || []).length, 5);
  assert.deepEqual(mock.state.writes, [], 'dry run wrote nothing');
  assert.ok(!r.out.includes(FAKE_KEY), 'key never printed');
}));

test('admin: live schema — provisions 5 admins using existing columns only; re-run is idempotent', () => withMock({ tables: liveTables(), users: [realInstitutionAdmin] }, async (mock) => {
  const r = await run('provision-demo-admins.mjs', [], mock);
  assert.equal(r.code, 0, r.out);
  const demo = mock.state.users.filter((u) => u.app_metadata.examsphere_demo);
  assert.equal(demo.length, 5);
  for (const u of demo) {
    assert.match(u.app_metadata.staff_id, /^ADMIN00[1-5]$/);
    assert.match(u.app_metadata.subject_code, /^22CS\d{3}$/);
    const p = mock.state.tables.profiles.rows.find((row) => row.id === u.id);
    assert.equal(p.role, 'admin');
    assert.ok(!('staff_id' in p) && !('email' in p), 'no write to missing columns');
  }
  assert.equal(new Set(demo.map((u) => u.password)).size, 5, 'distinct passwords');
  assert.ok(!r.out.includes(FAKE_KEY));

  const again = await run('provision-demo-admins.mjs', [], mock);
  assert.equal(again.code, 0, again.out);
  assert.equal(mock.state.users.length, 6, 'no duplicate accounts');
  assert.equal(mock.state.users.filter((u) => u.rotated).length, 5);
  assert.equal(mock.state.tables.profiles.rows.length, 5);
  assert.deepEqual(mock.state.users.find((u) => u.id === realInstitutionAdmin.id), realInstitutionAdmin, 'real admin untouched');
}));

test('admin: full schema with migration 011 — writes staff_id, email, institution and subject_admins', () => withMock({ tables: fullTables() }, async (mock) => {
  const r = await run('provision-demo-admins.mjs', [], mock);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /subject_admins table present/);
  const byStaff = Object.fromEntries(mock.state.tables.profiles.rows.map((p) => [p.staff_id, p]));
  assert.equal(byStaff.ADMIN003.email, 'admin003@drait.edu.in');
  assert.equal(byStaff.ADMIN003.institution_id, DRAIT);
  const code = Object.fromEntries(mock.state.tables.subjects.rows.map((s) => [s.id, s.code]));
  const pairs = mock.state.tables.subject_admins.rows.map((r2) => `${mock.state.tables.profiles.rows.find((p) => p.id === r2.admin_id).staff_id}:${code[r2.subject_id]}`).sort();
  assert.deepEqual(pairs, ['ADMIN001:22CS302', 'ADMIN002:22CS402', 'ADMIN003:22CS403', 'ADMIN004:22CS502', 'ADMIN005:22CS304']);
  await run('provision-demo-admins.mjs', [], mock);
  assert.equal(mock.state.tables.subject_admins.rows.length, 5, 'no duplicate subject assignments');
  assert.equal(mock.state.tables.subjects.rows.length, 5, 'no duplicate subjects');
}));

test('admin: clashes abort before any write (non-demo auth user, staff_id, email)', async () => {
  const cases = [
    { users: [{ id: '00000000-0000-4000-8000-0000000000c2', email: 'admin002@drait.edu.in', app_metadata: {} }], tables: liveTables(), why: /NOT a demo account/ },
    { users: [], tables: (() => { const t = fullTables(); t.profiles.rows.push({ id: 'p-real', role: 'admin', staff_id: 'admin004', full_name: 'Real' }); return t; })(), why: /staff_id ADMIN004 is already used/ },
    { users: [], tables: (() => { const t = fullTables(); t.profiles.rows.push({ id: 'p-real', role: 'student', email: 'admin005@drait.edu.in', full_name: 'Real' }); return t; })(), why: /email admin005@drait\.edu\.in is already used/ },
  ];
  for (const c of cases) {
    for (const args of [['--dry-run'], []]) {
      await withMock({ tables: c.tables, users: c.users }, async (mock) => {
        const r = await run('provision-demo-admins.mjs', args, mock);
        assert.notEqual(r.code, 0);
        assert.match(r.out, c.why);
        assert.match(r.out, /Nothing was changed/);
        assert.deepEqual(mock.state.writes, [], `no writes (${args.join(' ') || 'real run'})`);
      });
    }
  }
});

test('admin: repairs a demo user whose profile is missing; never creates a duplicate', () => withMock({
  tables: liveTables(), signupTrigger: false,
  users: [{ id: '00000000-0000-4000-8000-0000000000d1', email: 'admin001@drait.edu.in', app_metadata: { examsphere_demo: true } }],
}, async (mock) => {
  const dry = await run('provision-demo-admins.mjs', ['--dry-run'], mock);
  assert.match(dry.out, /repair missing profile/);
  const r = await run('provision-demo-admins.mjs', [], mock);
  assert.equal(r.code, 0, r.out);
  assert.equal(mock.state.users.filter((u) => u.email === 'admin001@drait.edu.in').length, 1);
  assert.equal(mock.state.tables.profiles.rows.find((p) => p.id === '00000000-0000-4000-8000-0000000000d1').role, 'admin');
}));

test('admin: --delete removes only demo-tagged users', () => withMock({ tables: liveTables(), users: [realInstitutionAdmin, { id: 'x', email: 'admin003@drait.edu.in', app_metadata: {} }] }, async (mock) => {
  const r = await run('provision-demo-admins.mjs', ['--delete'], mock);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /SKIPPED \(not tagged as demo\)/);
  assert.equal(mock.state.users.length, 2, 'non-demo users kept');
}));

test('both scripts refuse a publishable key and missing env', async () => {
  await withMock({ tables: liveTables() }, async (mock) => {
    for (const script of ['provision-demo-admins.mjs', 'provision-demo-students.mjs']) {
      const r = await run(script, ['--dry-run'], mock, { SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_TEST' });
      assert.notEqual(r.code, 0);
      assert.match(r.out, /publishable key/);
      assert.ok(!r.out.includes('sb_publishable_TEST'));
      const r2 = await run(script, ['--dry-run'], mock, { SUPABASE_SERVICE_ROLE_KEY: '' });
      assert.match(r2.out, /Set SUPABASE_URL/);
      assert.deepEqual(mock.state.writes, []);
    }
  });
});

test('admin: unexpected schema (no role column) aborts without writes', () => withMock({ tables: { profiles: { columns: ['id', 'full_name'], rows: [] } } }, async (mock) => {
  const r = await run('provision-demo-admins.mjs', [], mock);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /missing required column\(s\): role/);
  assert.deepEqual(mock.state.writes, []);
}));

test('student: live schema — dry run read-only; provisioning skips missing email column', () => withMock({ tables: liveTables(), users: [realStudent] }, async (mock) => {
  const dry = await run('provision-demo-students.mjs', ['--dry-run'], mock);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /optional columns missing: email, staff_id/);
  assert.deepEqual(mock.state.writes, []);
  assert.ok(!/Temporary password/.test(dry.out), 'no password printed on dry run');

  const r = await run('provision-demo-students.mjs', [], mock);
  assert.equal(r.code, 0, r.out);
  const rows = mock.state.tables.profiles.rows;
  assert.deepEqual(rows.map((p) => p.usn).sort(), ['CS001', 'CS002', 'CS003', 'CS004', 'CS005', 'CS006']);
  assert.ok(rows.every((p) => p.role === 'student' && !('email' in p)));
  await run('provision-demo-students.mjs', [], mock);
  assert.equal(mock.state.users.length, 7, 'idempotent');
  assert.deepEqual(mock.state.users.find((u) => u.id === realStudent.id), realStudent, 'real student untouched');
}));

test('student: USN clash and missing usn column abort without writes', async () => {
  const clash = liveTables();
  clash.profiles.rows.push({ id: 'p-real', role: 'student', usn: 'cs003', full_name: 'Real' });
  await withMock({ tables: clash }, async (mock) => {
    const r = await run('provision-demo-students.mjs', [], mock);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /usn CS003 is already used/);
    assert.deepEqual(mock.state.writes, []);
  });
  await withMock({ tables: { profiles: { columns: ['id', 'full_name', 'role'], rows: [] } } }, async (mock) => {
    const r = await run('provision-demo-students.mjs', ['--dry-run'], mock);
    assert.match(r.out, /missing required column\(s\): usn/);
    assert.deepEqual(mock.state.writes, []);
  });
});

test('student: repairs CS demo users left without a usable profile by an earlier failed run', () => withMock({
  tables: liveTables(),
  users: [{ id: '00000000-0000-4000-8000-0000000000e1', email: 'cs001@drait.edu.in', app_metadata: { examsphere_demo: true } }],
}, async (mock) => {
  // Signup trigger left a default student profile without usn.
  mock.state.tables.profiles.rows.push({ id: '00000000-0000-4000-8000-0000000000e1', full_name: 'cs001', role: 'student' });
  const r = await run('provision-demo-students.mjs', [], mock);
  assert.equal(r.code, 0, r.out);
  assert.equal(mock.state.users.filter((u) => u.email === 'cs001@drait.edu.in').length, 1);
  assert.equal(mock.state.tables.profiles.rows.find((p) => p.id === '00000000-0000-4000-8000-0000000000e1').usn, 'CS001');
}));

// CS001–CS005 already provisioned (demo-tagged, with their profiles and a shared password).
const existingCs = () => ['CS001', 'CS002', 'CS003', 'CS004', 'CS005'].map((usn, i) => ({
  id: `00000000-0000-4000-8000-00000000010${i + 1}`, email: `${usn.toLowerCase()}@drait.edu.in`,
  app_metadata: { examsphere_demo: true, role: 'student', usn }, password: 'existing-shared-password',
}));
const existingCsProfiles = () => existingCs().map((u) => ({ id: u.id, full_name: `CS Demo 0${u.app_metadata.usn.slice(-1)}`, role: 'student', usn: u.app_metadata.usn }));

test('student --only CS006: dry run checks only CS006, writes nothing', () => withMock({ tables: liveTables(), users: [...existingCs(), realStudent] }, async (mock) => {
  mock.state.tables.profiles.rows.push(...existingCsProfiles());
  const r = await run('provision-demo-students.mjs', ['--only', 'CS006', '--dry-run'], mock);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Scope: CS006 only/);
  assert.match(r.out, /CS006.*would create/);
  assert.doesNotMatch(r.out, /'CS00[1-5]'/, 'CS001–CS005 not listed');
  assert.deepEqual(mock.state.writes, []);
}));

test('student --only CS006: creates only CS006 (pattern F account); CS001–CS005 and their password untouched; re-run idempotent', () => withMock({ tables: liveTables(), users: [...existingCs(), realStudent] }, async (mock) => {
  mock.state.tables.profiles.rows.push(...existingCsProfiles());
  const before = structuredClone({ users: mock.state.users, profiles: mock.state.tables.profiles.rows });
  const r = await run('provision-demo-students.mjs', ['--only=cs006'], mock);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Temporary password \(shown once for CS006\)/);
  const cs006 = mock.state.users.filter((u) => u.email === 'cs006@drait.edu.in');
  assert.equal(cs006.length, 1);
  assert.deepEqual(cs006[0].app_metadata, { examsphere_demo: true, role: 'student', usn: 'CS006', full_name: 'CS Demo 06' });
  assert.deepEqual(mock.state.tables.profiles.rows.find((p) => p.id === cs006[0].id), { id: cs006[0].id, full_name: 'CS Demo 06', role: 'student', usn: 'CS006' });
  assert.deepEqual(mock.state.users.filter((u) => u.email !== 'cs006@drait.edu.in'), before.users, 'CS001–CS005 and the real student unchanged (incl. passwords)');
  assert.deepEqual(mock.state.tables.profiles.rows.filter((p) => p.usn !== 'CS006'), before.profiles, 'their profiles unchanged');
  assert.ok(mock.state.writes.every((w) => !/0000000010[1-5]/.test(w)), 'no request touched CS001–CS005');

  const again = await run('provision-demo-students.mjs', ['--only', 'CS006'], mock);
  assert.equal(again.code, 0, again.out);
  assert.equal(mock.state.users.filter((u) => u.email === 'cs006@drait.edu.in').length, 1, 'no duplicate CS006');
  assert.equal(mock.state.users.find((u) => u.email === 'cs006@drait.edu.in').rotated, true);
}));

test('student --only: CS006 clashes abort with zero writes; unknown IDs refused', async () => {
  const t = liveTables();
  t.profiles.rows.push({ id: 'p-real', role: 'student', usn: 'cs006', full_name: 'Real person' });
  await withMock({ tables: t }, async (mock) => {
    const r = await run('provision-demo-students.mjs', ['--only', 'CS006'], mock);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /usn CS006 is already used by profile p-real/);
    assert.deepEqual(mock.state.writes, []);
  });
  await withMock({ tables: liveTables(), users: [{ id: 'real-6', email: 'cs006@drait.edu.in', app_metadata: {} }] }, async (mock) => {
    const r = await run('provision-demo-students.mjs', ['--only', 'CS006', '--dry-run'], mock);
    assert.match(r.out, /cs006@drait\.edu\.in already exists in Auth and is NOT a demo account/);
    assert.deepEqual(mock.state.writes, []);
  });
  await withMock({ tables: liveTables() }, async (mock) => {
    for (const bad of [['--only', '1DA22CS001'], ['--only'], ['--only', '--dry-run']]) {
      const r = await run('provision-demo-students.mjs', bad, mock);
      assert.notEqual(r.code, 0);
      assert.match(r.out, /--only/);
    }
    assert.deepEqual(mock.state.writes, []);
  });
});

test('student --only CS006 --delete removes only CS006', () => withMock({ tables: liveTables(), users: existingCs() }, async (mock) => {
  await run('provision-demo-students.mjs', ['--only', 'CS006'], mock);
  const r = await run('provision-demo-students.mjs', ['--only', 'CS006', '--delete'], mock);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(mock.state.users.map((u) => u.email).sort(), existingCs().map((u) => u.email).sort());
}));
