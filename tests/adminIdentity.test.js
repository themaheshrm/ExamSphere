import test from 'node:test';
import assert from 'node:assert/strict';

const { buildUserObject, decodeJwtClaims } = await import('../src/services/userObject.js');
const { getAdminScope } = await import('../src/services/adminScope.js');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (claims) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
// Live-like profile: no staff_id / email columns (migrations 003/004 not applied).
const liveProfile = (over = {}) => ({ id: 'u1', full_name: 'Admin 01', role: 'admin', usn: null, ...over });
const authUser = (email) => ({ id: 'u1', email });

test('decodeJwtClaims reads payloads and rejects garbage', () => {
  assert.equal(decodeJwtClaims(token({ sub: 'x', email: 'é@x' })).email, 'é@x');
  for (const bad of [null, undefined, 42, '', 'abc', 'a.%%%.c', `a.${b64('str')}.c`]) {
    assert.equal(decodeJwtClaims(bad), null);
  }
});

test('without profiles.staff_id, the signed app_metadata.staff_id identifies the admin', () => {
  const user = buildUserObject(authUser('admin001@drait.edu.in'), liveProfile(), 'admin',
    token({ sub: 'u1', email: 'admin001@drait.edu.in', app_metadata: { staff_id: 'ADMIN001', subject_code: '22CS302' } }));
  assert.equal(user.staffId, 'ADMIN001');
  assert.equal(user.identifier, 'ADMIN001');
  assert.deepEqual(getAdminScope(user).subjectCodes, ['22CS302']);
});

test('without staff_id anywhere, the verified sign-in email still restricts the admin', () => {
  for (const [email, code] of [['admin002@drait.edu.in', '22CS402'], ['ADMIN005@drait.edu.in', '22CS304']]) {
    const user = buildUserObject(authUser(email), liveProfile(), 'admin', token({ sub: 'u1', email }));
    const scope = getAdminScope(user);
    assert.equal(scope.scoped, true);
    assert.deepEqual(scope.subjectCodes, [code]);
  }
  // No token at all (older session shape): email on the user object is enough.
  assert.deepEqual(getAdminScope(buildUserObject(authUser('admin003@drait.edu.in'), liveProfile(), 'admin')).subjectCodes, ['22CS403']);
});

test('tampering with the stored session user cannot widen access (token claims still match)', () => {
  const tampered = buildUserObject(authUser('admin@drait.edu.in'), liveProfile(), 'admin',
    token({ sub: 'u1', email: 'admin004@drait.edu.in', app_metadata: { staff_id: 'ADMIN004' } }));
  assert.deepEqual(getAdminScope(tampered).subjectCodes, ['22CS502']);
  const stripped = { ...tampered, staffId: null, scopeSignals: undefined };
  assert.equal(getAdminScope({ ...stripped, email: 'admin004@drait.edu.in' }).scoped, true);
});

test('conflicting subject-admin identities are denied, not guessed', () => {
  const user = buildUserObject(authUser('admin001@drait.edu.in'), liveProfile(), 'admin',
    token({ sub: 'u1', email: 'admin001@drait.edu.in', app_metadata: { staff_id: 'ADMIN002' } }));
  const scope = getAdminScope(user);
  assert.equal(scope.scoped, true);
  assert.deepEqual(scope.subjectCodes, []);
});

test('institution admin and super admin keep full access on the live schema', () => {
  const inst = buildUserObject(authUser('admin@drait.edu.in'), liveProfile({ full_name: 'Dr. Ramesh B.' }), 'admin',
    token({ sub: 'u1', email: 'admin@drait.edu.in', app_metadata: {} }));
  assert.equal(getAdminScope(inst).scoped, false);
  assert.equal(getAdminScope(inst).canManageInstitution, true);
  const withStaff = buildUserObject(authUser('admin@drait.edu.in'), liveProfile({ staff_id: 'ADM-8942' }), 'admin');
  assert.equal(getAdminScope(withStaff).scoped, false);
  const root = buildUserObject(authUser('root@examsphere.io'), liveProfile({ role: 'super_admin' }), 'super-admin', token({ email: 'root@examsphere.io' }));
  assert.equal(getAdminScope(root).scoped, false);
});

test('students are never given admin scope', () => {
  const student = buildUserObject(authUser('cs001@drait.edu.in'), liveProfile({ role: 'student', usn: 'CS001' }), 'student');
  assert.equal(student.usn, 'CS001');
  assert.deepEqual(getAdminScope(student).subjectCodes, []);
});

test('signed super-admin assignment (app_metadata.subject_code / admin_type) is authoritative', () => {
  const t = (md, email = 'admin006@drait.edu.in', role = 'admin') => buildUserObject(authUser(email), liveProfile({ role: role === 'admin' ? 'admin' : 'super_admin' }), role, token({ sub: 'u1', email, app_metadata: md }));
  assert.deepEqual(getAdminScope(t({ staff_id: 'ADMIN006', admin_type: 'subject', subject_code: '22CS304' })).subjectCodes, ['22CS304'], 'new subject admin restricted');
  assert.deepEqual(getAdminScope(t({ staff_id: 'ADMIN001', subject_code: '22CS402' }, 'admin001@drait.edu.in')).subjectCodes, ['22CS402'], 'reassigned demo admin follows the server');
  assert.equal(getAdminScope(t({ staff_id: 'ADMIN001', admin_type: 'institution' }, 'admin001@drait.edu.in')).scoped, false, 'converted to institution admin by the super admin');
  assert.deepEqual(getAdminScope(t({ staff_id: 'X', subject_code: 'NOPE' })).subjectCodes, [], 'unknown subject denies');
  assert.deepEqual(getAdminScope(t({ staff_id: 'X', admin_type: 'subject' })).subjectCodes, [], 'subject admin without subject denies');
  assert.equal(getAdminScope(t({ staff_id: 'ADM-1', admin_type: 'institution' })).scoped, false);
  // the stored session user cannot inject a subject or institution type: signals come from the token only
  const stored = buildUserObject({ id: 'u1', email: 'admin006@drait.edu.in', app_metadata: { admin_type: 'institution' } }, liveProfile(), 'admin', token({ sub: 'u1', email: 'admin006@drait.edu.in', app_metadata: { subject_code: '22CS304' } }));
  assert.deepEqual(getAdminScope(stored).subjectCodes, ['22CS304']);
});
