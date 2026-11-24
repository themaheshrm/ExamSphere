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

const { DEMO_STUDENTS, isDemoStudent } = await import('../src/data/demoAccounts.js');
const { assignPatternForCandidate } = await import('../src/utils/patternAssignment.js');
const { assignPatternToStudent } = await import('../src/utils/randomizationEngine.js');
const { examRandomizerService: service } = await import('../src/services/examRandomizerService.js');

const state = service.getExamState();
const master = Object.fromEntries(state.masterQuestions.map((q) => [q.id, q]));
const papers = Object.fromEntries(DEMO_STUDENTS.map((s) => [s.usn, service.getStudentExam(s.usn)]));

test('CS001–CS005 are assigned patterns A–E (explicit, stable, case-insensitive)', () => {
  assert.deepEqual(DEMO_STUDENTS.map((s) => [s.usn, s.name, s.branch, s.pattern]), [
    ['CS001', 'CS Demo 01', 'CSE', 'A'], ['CS002', 'CS Demo 02', 'CSE', 'B'], ['CS003', 'CS Demo 03', 'CSE', 'C'],
    ['CS004', 'CS Demo 04', 'CSE', 'D'], ['CS005', 'CS Demo 05', 'CSE', 'E'],
  ]);
  for (const s of DEMO_STUDENTS) {
    assert.equal(assignPatternForCandidate(s.usn.toLowerCase()), s.pattern);
    assert.equal(papers[s.usn].patternLabel, `Pattern ${s.pattern}`);
    assert.equal(papers[s.usn].paperCode, `22CS601-${s.pattern}`);
  }
});

test('non-demo candidates keep the existing hash-based assignment', () => {
  for (const id of ['1DA22CS001', '1DA22CS007', 'student-42']) {
    assert.equal(assignPatternForCandidate(id), assignPatternToStudent(id));
    assert.equal(isDemoStudent(id), false);
  }
});

test('same 25 questions for all five, in five different orders', () => {
  const orders = DEMO_STUDENTS.map((s) => papers[s.usn].questions.map((q) => q.id));
  const expected = Object.keys(master).map(Number).sort((a, b) => a - b);
  for (const order of orders) {
    assert.equal(order.length, 25);
    assert.deepEqual([...order].sort((a, b) => a - b), expected);
  }
  assert.equal(new Set(orders.map((o) => o.join(','))).size, 5, 'question sequences must all differ');
  assert.equal(new Set(orders.map((o) => o[0])).size > 1, true, 'first questions should differ across patterns');
});

test('options are shuffled independently but are always the same four options', () => {
  let differingPlacements = 0;
  for (const id of Object.keys(master).map(Number)) {
    const placements = DEMO_STUDENTS.map((s) => papers[s.usn].questions.find((q) => q.id === id).options);
    for (const opts of placements) assert.deepEqual([...opts].sort(), [...master[id].options].sort());
    if (new Set(placements.map((o) => o.join('|'))).size > 1) differingPlacements += 1;
  }
  assert.ok(differingPlacements >= 20, `expected most questions to have different option orders, got ${differingPlacements}/25`);
});

test('student papers contain no answer key', () => {
  for (const s of DEMO_STUDENTS) {
    const text = JSON.stringify(papers[s.usn]);
    assert.doesNotMatch(text, /correctOption|answerKey|optionMappings/);
  }
});

test('correct-answer mapping survives shuffling: choosing the master answer scores full marks on every pattern', () => {
  for (const s of DEMO_STUDENTS) {
    const paper = papers[s.usn];
    const answers = paper.questions.map((q) => q.options.indexOf(master[q.id].options[master[q.id].correctOption]));
    const result = service.evaluateSubmission(s.usn, answers, paper.attemptId);
    assert.equal(result.correctCount, 25, `${s.usn} should score 25/25`);
    assert.equal(result.score, result.maxScore);
    assert.equal(result.patternLabel, `Pattern ${s.pattern}`);
  }
});

test('refresh / re-login keeps the same attempt and order; reset is demo-only', async () => {
  // fresh students on a clean slate after resetting the graded attempts above
  assert.equal(service.resetDemoAttempts(DEMO_STUDENTS.map((s) => s.usn)), 5);
  const first = service.getStudentExam('CS003');
  const again = service.getStudentExam('cs003');               // refresh / sign in again
  assert.equal(again.attemptId, first.attemptId);
  assert.deepEqual(again.questions.map((q) => [q.id, q.options]), first.questions.map((q) => [q.id, q.options]));

  // a "reload": new module instance reading the same storage
  const reloaded = await import(`../src/services/examRandomizerService.js?reload=${Date.now()}`);
  const afterReload = reloaded.examRandomizerService.getStudentExam('CS003');
  assert.equal(afterReload.attemptId, first.attemptId);
  assert.equal(afterReload.patternLabel, 'Pattern C');

  assert.throws(() => service.resetDemoAttempts(['1DA22CS001']), /Only demo accounts/);
  assert.throws(() => service.resetDemoAttempts(['CS001', '1DA22CS002']), /rejected: 1DA22CS002/);
});

test("one student cannot submit to or grade another student's attempt", () => {
  const cs001 = service.getStudentExam('CS001');
  const cs002 = service.getStudentExam('CS002');
  assert.notEqual(cs001.attemptId, cs002.attemptId);
  assert.throws(
    () => service.evaluateSubmission('CS002', Array(25).fill(0), cs001.attemptId),
    /could not be found for this student/,
  );
  assert.equal(service.getStudentAttempt('CS002'), null, 'CS002 has no result of its own yet');
});
