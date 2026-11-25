import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const { DEMO_ADMINS } = await import('../src/data/demoAdmins.js');
const { SUBJECTS, subjectByCode } = await import('../src/data/subjectCatalog.js');
const { DEMO_STUDENTS } = await import('../src/data/demoAccounts.js');
const { getAdminScope, canAccessExam } = await import('../src/services/adminScope.js');
const { scopedQuestionBank } = await import('../src/services/scopedQuestionBank.js');
const { questionBankService } = await import('../src/services/questionBankService.js');
const { getExamService, getScopedExamService, defaultSubjectMeta } = await import('../src/services/examRegistry.js');
const { examRandomizerService } = await import('../src/services/examRandomizerService.js');

const admin = (staffId, role = 'admin') => ({ id: staffId, role, staffId, name: staffId });
const toMaster = (q) => ({ id: q.id, text: q.statement, options: [...q.options], correctOption: q.correctOption, subject: q.subject, topic: q.topic, difficulty: q.difficulty, marks: q.marks, negativeMarks: q.negativeMarks });

test('ADMIN001–005 map to exactly one subject each; hierarchy unchanged for other roles', () => {
  const expected = { ADMIN001: 'Data Structures and Algorithms', ADMIN002: 'Database Management Systems', ADMIN003: 'Operating Systems', ADMIN004: 'Computer Networks', ADMIN005: 'Java Programming' };
  for (const a of DEMO_ADMINS) {
    const scope = getAdminScope(admin(a.staffId));
    assert.equal(scope.scoped, true);
    assert.deepEqual(scope.subjectCodes.map((c) => subjectByCode(c).title), [expected[a.staffId]]);
  }
  assert.equal(getAdminScope(admin('ADM-8942')).scoped, false, 'institution admin stays institution-wide');
  assert.equal(getAdminScope({ role: 'super-admin' }).scoped, false, 'super admin stays unrestricted');
  assert.deepEqual(getAdminScope({ role: 'student', usn: 'CS001' }).subjectCodes, []);
});

test('each scoped admin sees only their own 25-question subject bank', () => {
  for (const a of DEMO_ADMINS) {
    const bank = scopedQuestionBank(getAdminScope(admin(a.staffId))).getQuestions();
    const title = subjectByCode(a.subjectCode).title;
    assert.equal(bank.length, 25, `${a.staffId} should see 25 questions`);
    assert.ok(bank.every((q) => q.subject === title));
  }
  assert.ok(scopedQuestionBank(getAdminScope(admin('ADM-8942'))).getQuestions().length >= 150, 'institution admin sees all banks');
});

test('scoped writes: own subject allowed; other subjects rejected even with a known question id', () => {
  const dsa = scopedQuestionBank(getAdminScope(admin('ADMIN001')));
  const own = dsa.saveQuestion({ subject: 'Data Structures and Algorithms', topic: 'Demo', statement: 'Which structure gives O(1) average lookup by key?', options: ['Array scan', 'Hash table', 'Linked list', 'Binary heap'], correctOption: 1, difficulty: 'Easy', marks: 2, negativeMarks: 0 });
  assert.ok(own.id);
  dsa.saveQuestion({ ...own, topic: 'Demo (edited)' }, own.id);
  assert.equal(dsa.deleteQuestion(own.id), true);

  const dbmsQuestion = questionBankService.getQuestions().find((q) => q.subject === 'Database Management Systems');
  assert.throws(() => dsa.saveQuestion({ ...dbmsQuestion, topic: 'tampered' }, dbmsQuestion.id), /outside your subject/);
  assert.throws(() => dsa.deleteQuestion(dbmsQuestion.id), /outside your subject/);
  assert.throws(() => dsa.saveQuestion({ ...dbmsQuestion, id: undefined, statement: 'A new DBMS question?' }), /outside your subject/);
  assert.throws(() => dsa.importQuestions([{ ...dbmsQuestion, statement: 'Imported into DBMS?' }]), /outside your subject/);
  assert.ok(questionBankService.getQuestions().some((q) => q.id === dbmsQuestion.id && q.topic !== 'tampered'), 'DBMS question unchanged');

  const preview = dsa.applyScopeToPreview([{ rowNumber: 2, status: 'Ready', errors: [], question: { subject: 'Operating Systems' } }]);
  assert.equal(preview[0].status, 'Invalid');
});

test('exam access is scoped: other subjects and 22CS601 are rejected for scoped admins', () => {
  const scope = getAdminScope(admin('ADMIN002'));
  assert.equal(canAccessExam(scope, '22CS402'), true);
  for (const code of ['22CS302', '22CS403', '22CS502', '22CS304', '22CS601']) {
    assert.throws(() => getScopedExamService(scope, code), /not authorised/);
  }
  assert.ok(getScopedExamService(getAdminScope(admin('ADM-8942')), '22CS302'));
});

test('every subject creates its own exam with 10 patterns <code>-A … -J from its own bank', () => {
  for (const subject of SUBJECTS) {
    const service = getExamService(subject.code);
    assert.equal(service.exists(), false, 'not created until an admin creates it');
    const questions = scopedQuestionBank(getAdminScope(admin(DEMO_ADMINS.find((a) => a.subjectCode === subject.code).staffId))).getQuestions().slice(0, 25).map(toMaster);
    const state = service.createExam(defaultSubjectMeta(subject.code), questions);
    assert.equal(state.isPublished, false);
    assert.equal(state.verificationReport.isValid, true);
    assert.deepEqual(Object.values(state.patterns).map((p) => p.paperCode), 'ABCDEFGHIJ'.split('').map((l) => `${subject.code}-${l}`));
    const orders = Object.values(state.patterns).map((p) => p.questionOrder.join(','));
    assert.equal(new Set(orders).size, 10);
    for (const p of Object.values(state.patterns)) {
      assert.ok(p.questions.every((q) => q.subject === subject.title), 'only this subject’s questions');
    }
    service.publishExam();
  }
  assert.equal(examRandomizerService.getExamState().meta.courseCode, '22CS601', 'original exam untouched');
});

test('CS demo students keep their patterns (A–E, CS006 F) on subject exams; grading and results stay per subject', () => {
  const dsa = getExamService('22CS302');
  const dbms = getExamService('22CS402');
  for (const s of DEMO_STUDENTS) {
    const paper = dsa.getStudentExam(s.usn);
    assert.equal(paper.paperCode, `22CS302-${s.pattern}`);
    const master = Object.fromEntries(dsa.getExamState().masterQuestions.map((q) => [q.id, q]));
    const answers = paper.questions.map((q) => q.options.indexOf(master[q.id].options[master[q.id].correctOption]));
    assert.equal(dsa.evaluateSubmission(s.usn, answers, paper.attemptId).correctCount, 25);
  }
  assert.equal(dsa.listAttempts().length, DEMO_STUDENTS.length);
  assert.equal(dbms.listAttempts().length, 0, 'DBMS reports do not include DSA attempts');
  assert.equal(examRandomizerService.listAttempts().length, 0, '22CS601 reports do not include subject attempts');
  assert.equal(dbms.getStudentAttempt('CS001'), null);

  const dbmsPaper = dbms.getStudentExam('CS002');
  assert.equal(dbmsPaper.paperCode, '22CS402-B');
  assert.throws(() => dsa.evaluateSubmission('CS002', Array(25).fill(0), dbmsPaper.attemptId), /could not be found/, 'cannot grade a DBMS attempt through the DSA exam');
});
