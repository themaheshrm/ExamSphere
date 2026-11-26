import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.VITE_SUPABASE_URL ||= 'http://127.0.0.1:9';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||= 'unit-test-anon-key';
const { toApiError, ApiError } = await import('../src/services/api/core.js');
const { getAdminScope, canAccessExam } = await import('../src/services/adminScope.js');
const { DEMO_ADMINS } = await import('../src/data/demoAdmins.js');
const { subjectByCode } = await import('../src/data/subjectCatalog.js');

test('API errors: network failures are retryable, expired sessions are recognised', () => {
  const net = toApiError(new TypeError('Failed to fetch'));
  assert.ok(net instanceof ApiError);
  assert.equal(net.code, 'NETWORK');
  assert.equal(net.retryable, true);
  assert.equal(toApiError({ code: 'PGRST301', message: 'JWT expired' }).code, 'SESSION');
  const server = toApiError({ code: '42501', message: 'This attempt has already been submitted.' });
  assert.equal(server.retryable, false);
  assert.equal(server.message, 'This attempt has already been submitted.');
});

test('ADMIN001–005 map to exactly one subject each; admins without a subject get none (UI scope; the database enforces it independently)', () => {
  const expected = { ADMIN001: '22CS302', ADMIN002: '22CS402', ADMIN003: '22CS403', ADMIN004: '22CS502', ADMIN005: '22CS304' };
  for (const a of DEMO_ADMINS) {
    const scope = getAdminScope({ id: a.staffId, role: 'admin', staffId: a.staffId });
    assert.equal(scope.scoped, true);
    assert.deepEqual(scope.subjectCodes, [expected[a.staffId]]);
    assert.ok(subjectByCode(expected[a.staffId]));
    assert.equal(canAccessExam(scope, '22CS601'), false);
  }
  assert.deepEqual(getAdminScope({ role: 'admin', staffId: 'ADM-8942' }).subjectCodes, [], 'no institution-wide administrator');
  assert.equal(getAdminScope({ role: 'super-admin' }).scoped, false);
});

// Answer keys must never be bundled into the browser application.
test('no answer keys or exam business data in the frontend source', () => {
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(f)) files.push(p);
  });
  walk(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src'));
  for (const file of files) {
    const code = readFileSync(file, 'utf8');
    assert.doesNotMatch(code, /correctOption:\s*\d/, `${file} embeds a keyed question`);
    assert.doesNotMatch(code, /examMockData|subjectQuestionBanks|examRandomizerService|studentRosterService|questionBankService/, `${file} references the removed local engine`);
    assert.doesNotMatch(code, /localStorage\.(setItem|getItem)\(['"`]examsphere_(exam|attempt|question|roster)/, `${file} keeps exam data in browser storage`);
  }
});
