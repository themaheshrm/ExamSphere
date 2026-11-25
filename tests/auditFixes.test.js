// Regression tests for the audit fixes F1–F7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { startMockSupabase, LIVE_PROFILE_COLUMNS } from './helpers/mockSupabase.mjs';
import { handleChangeTemporaryPassword, handleCreateStudent, isRecentRecoverySession, jwtClaims } from '../supabase/functions/_shared/studentAccounts.js';
import { buildUserObject } from '../src/services/userObject.js';
import { sessionEventAction } from '../src/context/authEvents.js';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const SERVICE = 'test-service-role-placeholder';
const PW = 'Existing#Pass2026';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (claims) => `${b64({ alg: 'none' })}.${b64(claims)}.sig`;

// ── F1: password recovery ────────────────────────────────────────────────────
async function recoverySetup() {
  const functions = {};
  const mock = await startMockSupabase({
    serviceKey: SERVICE, functions,
    tables: { profiles: { columns: LIVE_PROFILE_COLUMNS, rows: [
      { id: '00000000-0000-4000-8000-0000000000a0', full_name: 'Dr. Ramesh B.', role: 'admin', usn: null },
      { id: '00000000-0000-4000-8000-0000000000e0', full_name: 'Student One', role: 'student', usn: '1DA22CS001' },
    ] } },
    users: [
      { id: '00000000-0000-4000-8000-0000000000a0', email: 'admin@drait.edu.in', app_metadata: {}, password: PW },
      { id: '00000000-0000-4000-8000-0000000000e0', email: '1da22cs001@drait.edu.in', app_metadata: { role: 'student', usn: '1DA22CS001' }, password: PW },
    ],
  });
  const admin = createClient(mock.url, SERVICE, opts);
  const verifyPassword = async (email, password) => !(await createClient(mock.url, 'anon', opts).auth.signInWithPassword({ email, password })).error;
  functions['change-temporary-password'] = (req) => handleChangeTemporaryPassword(req, { admin, verifyPassword });
  functions['create-student'] = (req) => handleCreateStudent(req, { admin });
  const anon = () => createClient(mock.url, 'anon', opts);
  const signIn = async (email, password) => {
    const { data, error } = await anon().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session.access_token;
  };
  const call = async (tok, body) => {
    const res = await fetch(`${mock.url}/functions/v1/change-temporary-password`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  // Request a reset email the way the app does and return the access token from the emailed link.
  const recoveryToken = async (email) => {
    await anon().auth.resetPasswordForEmail(email, { redirectTo: 'http://localhost:5173/reset-password' });
    const mail = mock.state.recoveryEmails.filter((m) => m.email === email).at(-1);
    assert.ok(mail, 'reset email recorded');
    assert.ok(mail.link.startsWith('http://localhost:5173/reset-password#'), 'link targets /reset-password');
    return new URLSearchParams(mail.link.split('#')[1]).get('access_token');
  };
  return { mock, signIn, call, recoveryToken, close: () => mock.close() };
}

test('F1 server: a recovery-link session sets a new password (policy enforced); an ordinary session cannot', async () => {
  const t = await recoverySetup();
  try {
    const normal = await t.signIn('1da22cs001@drait.edu.in', PW);
    assert.equal((await t.call(normal, { mode: 'recovery', newPassword: 'Recovered#Pass2026' })).status, 403, 'stolen ordinary session cannot reset');
    const rec = await t.recoveryToken('1da22cs001@drait.edu.in');
    assert.equal((await t.call(rec, { mode: 'recovery', newPassword: 'weak' })).status, 422);
    assert.equal((await t.call(rec, { mode: 'recovery', newPassword: '1DA22CS001#Xyz' })).status, 422, 'cannot contain the Student ID');
    const ok = await t.call(rec, { mode: 'recovery', newPassword: 'Recovered#Pass2026' });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    await assert.rejects(t.signIn('1da22cs001@drait.edu.in', PW), 'old password stops working');
    assert.ok(await t.signIn('1da22cs001@drait.edu.in', 'Recovered#Pass2026'));
    assert.equal((await t.call(null, { mode: 'recovery', newPassword: 'Recovered#Pass2027' })).status, 401);
  } finally { await t.close(); }
});

test('F1 server: recovery also clears a temporary-password flag (no lock-out)', async () => {
  const t = await recoverySetup();
  try {
    const adminTok = await t.signIn('admin@drait.edu.in', PW);
    const res = await fetch(`${t.mock.url}/functions/v1/create-student`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${adminTok}` }, body: JSON.stringify({ name: 'CS Demo 06', usn: 'CS006', mobile: '+91 90000 00006', semester: 6, section: 'D' }) });
    assert.equal(res.status, 200);
    assert.equal(t.mock.state.users.find((u) => u.email === 'cs006@drait.edu.in').app_metadata.must_change_password, true);
    const rec = await t.recoveryToken('cs006@drait.edu.in');
    assert.equal((await t.call(rec, { mode: 'recovery', newPassword: 'Own#Password2026' })).status, 200);
    const fresh = await t.signIn('cs006@drait.edu.in', 'Own#Password2026');
    assert.equal(jwtClaims(fresh).app_metadata.must_change_password, false);
  } finally { await t.close(); }
});

test('F1: recovery detection (server window and client flag)', () => {
  const now = Date.now();
  assert.equal(isRecentRecoverySession({ amr: [{ method: 'recovery', timestamp: Math.floor(now / 1000) - 60 }] }, now), true);
  assert.equal(isRecentRecoverySession({ amr: [{ method: 'recovery', timestamp: Math.floor(now / 1000) - 7200 }] }, now), false, 'older than 1 h');
  assert.equal(isRecentRecoverySession({ amr: [{ method: 'password', timestamp: Math.floor(now / 1000) }] }, now), false);
  assert.equal(isRecentRecoverySession({}, now), false);
  const user = (amr) => buildUserObject({ id: 'u', email: 'a@drait.edu.in' }, { role: 'student', usn: 'CS001' }, 'student', token({ sub: 'u', amr }));
  assert.equal(user([{ method: 'recovery', timestamp: 1 }]).recoverySession, true);
  assert.equal(user([{ method: 'password', timestamp: 1 }]).recoverySession, false);
  assert.match(src('src/services/authService.js'), /redirectTo: `\$\{window\.location\.origin\}\/reset-password`/);
  assert.match(src('src/routes/AppRoutes.jsx'), /path="\/reset-password" element=\{<ResetPasswordPage \/>\}/);
});

// ── F2 / F6: no sample academic data or mock names in signed-in screens ──────
test('F2/F6: student dashboard, sidebar and exam screen use no sample student data', () => {
  for (const file of ['src/pages/student/StudentDashboard.jsx', 'src/components/navigation/Sidebar.jsx', 'src/pages/student/ExamInterface.jsx']) {
    const code = src(file);
    for (const banned of ['studentInfo', 'recentResults', 'upcomingExams', 'activeExam']) {
      assert.ok(!code.includes(banned), `${file} still uses ${banned}`);
    }
  }
  const dash = src('src/pages/student/StudentDashboard.jsx');
  assert.ok(!/Statement of marks|CGPA|SGPA|Attendance|Mentor|Invigilator/.test(dash), 'fake academic sections removed');
  assert.match(dash, /studentRosterService\.find\(normalizedId\)/, 'department/semester/section from the roster');
});

// ── F3: session events ───────────────────────────────────────────────────────
test('F3: token refresh rebuilds the user (forced) without signing out on a transient error', () => {
  assert.deepEqual(sessionEventAction('TOKEN_REFRESHED'), { hydrate: true, force: true, keepOnError: true });
  assert.deepEqual(sessionEventAction('USER_UPDATED'), { hydrate: true, force: true, keepOnError: false });
  assert.deepEqual(sessionEventAction('PASSWORD_RECOVERY'), { hydrate: true, force: true, keepOnError: false });
  assert.deepEqual(sessionEventAction('SIGNED_IN'), { hydrate: true, force: false, keepOnError: false });
  assert.deepEqual(sessionEventAction('SIGNED_OUT'), { signOut: true });
  assert.deepEqual(sessionEventAction('INITIAL_SESSION'), {});
  assert.match(src('src/context/AuthContext.jsx'), /sessionEventAction\(event\)/);
});

// ── F4: examination attempts for students only ───────────────────────────────
test('F4: /student/exam is guarded for students only, and the exam screen refuses other roles', () => {
  const routes = src('src/routes/AppRoutes.jsx');
  const block = routes.slice(routes.lastIndexOf('<ProtectedRoute', routes.indexOf('path="/student/exam"')), routes.indexOf('path="/student/exam"'));
  assert.match(block, /allowedRoles=\{\[USER_ROLES\.STUDENT\]\}/);
  const exam = src('src/pages/student/ExamInterface.jsx');
  assert.match(exam, /const studentIdentity = isStudentAccount \?/);
  assert.match(exam, /Examinations can only be taken from a student account\./);
  assert.match(src('src/pages/student/StudentDashboard.jsx'), /Students only/);
});

// ── F5: directory vs admin management ────────────────────────────────────────
test('F5: Staff Directory is labelled as directory-only and links to Admin Management', () => {
  const users = src('src/pages/super-admin/UsersPage.jsx');
  assert.match(users, /title="Staff Directory"/);
  assert.match(users, /cannot sign in/);
  assert.match(users, /to="\/super-admin\/admins"/);
  const nav = src('src/utils/constants.js');
  assert.match(nav, /label: 'Staff Directory', path: '\/super-admin\/users'/);
  assert.match(nav, /label: 'Admin Management', path: '\/super-admin\/admins'/);
});

// ── F7: CI workflow ──────────────────────────────────────────────────────────
test('F7: CI runs unit tests, lint, build and the database tests', () => {
  const path = new URL('../.github/workflows/ci.yml', import.meta.url);
  assert.ok(existsSync(path));
  const ci = readFileSync(path, 'utf8');
  for (const step of ['npm test', 'npm run lint', 'npm run build', 'supabase/tests/run_local.sh', 'postgres:16']) {
    assert.ok(ci.includes(step), `CI missing ${step}`);
  }
  assert.ok(!/SERVICE_ROLE|sb_secret_/i.test(ci), 'no secrets in CI');
});
