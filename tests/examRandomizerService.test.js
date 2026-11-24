import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const { examQuestions } = await import('../src/data/examMockData.js');
const { generate10ExamPatterns, PATTERN_LABELS, assignPatternToStudent } =
  await import('../src/utils/randomizationEngine.js');
const { examRandomizerService: service } =
  await import('../src/services/examRandomizerService.js');

test('generates 10 valid patterns with the same 25 questions and correct mappings', () => {
  const { patterns, verificationReport } = generate10ExamPatterns(examQuestions);
  assert.equal(Object.keys(patterns).length, 10);
  assert.deepEqual(Object.keys(patterns), PATTERN_LABELS);
  assert.equal(verificationReport.isValid, true);

  const expectedIds = examQuestions.map((question) => question.id).sort((a, b) => a - b);
  const sequences = new Set();
  for (const pattern of Object.values(patterns)) {
    assert.equal(pattern.questions.length, 25);
    assert.deepEqual([...pattern.questionOrder].sort((a, b) => a - b), expectedIds);
    sequences.add(pattern.questionOrder.join(','));

    for (const question of pattern.questions) {
      const source = examQuestions.find((item) => item.id === question.originalId);
      assert.equal(question.options.length, 4);
      assert.deepEqual([...question.options].sort(), [...source.options].sort());
      assert.equal(
        question.options[pattern.answerKey[question.originalId]],
        source.options[source.correctOption],
      );
    }
  }
  assert.equal(sequences.size, 10);
});

test('assignment is stable, case-insensitive, covers all labels, and rejects missing IDs', () => {
  assert.equal(assignPatternToStudent('  '), null);
  assert.equal(assignPatternToStudent(null), null);
  assert.equal(assignPatternToStudent('student-42'), assignPatternToStudent(' STUDENT-42 '));

  const labels = new Set();
  for (let index = 0; index < 10000 && labels.size < 10; index++) {
    labels.add(assignPatternToStudent(`roster-${index}`));
  }
  assert.deepEqual(labels, new Set(PATTERN_LABELS));
  assert.equal(service.getStudentExam(''), null);
});

test('active paper survives refresh and regeneration, and grades against its saved key', async () => {
  const studentId = 'snapshot-test-student';
  const firstPaper = service.getStudentExam(studentId);
  assert.ok(firstPaper);
  assert.equal(firstPaper.questions.length, 25);
  assert.equal('answerKey' in firstPaper, false);
  assert.equal('optionMappings' in firstPaper, false);

  const registryKey = 'examsphere_paper_attempts_v2';
  const registryBefore = JSON.parse(localStorage.getItem(registryKey));
  const savedAttempt = registryBefore.attempts[firstPaper.attemptId];
  assert.ok(savedAttempt.patternData.answerKey);
  const expectedAnswers = savedAttempt.patternData.questions.map(
    (question) => savedAttempt.patternData.answerKey[question.originalId],
  );

  service.regeneratePatterns();
  const refreshedModule = await import(`../src/services/examRandomizerService.js?refresh=${Date.now()}`);
  const refreshedPaper = refreshedModule.examRandomizerService.getStudentExam(studentId);
  assert.deepEqual(refreshedPaper, firstPaper);

  const result = refreshedModule.examRandomizerService.evaluateSubmission(
    studentId,
    expectedAnswers,
    firstPaper.attemptId,
  );
  assert.equal(result.correctCount, 25);
  assert.equal(result.incorrectCount, 0);
  assert.equal(result.unattemptedCount, 0);
  assert.equal(result.patternLabel, firstPaper.patternLabel);
  assert.throws(
    () => refreshedModule.examRandomizerService.evaluateSubmission(studentId, expectedAnswers, 'wrong-attempt'),
    /could not be found/,
  );
});

test('does not start an attempt if browser storage is unavailable', async () => {
  const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const sessionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage blocked'); },
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('storage blocked'); },
    });
    const isolated = await import(`../src/services/examRandomizerService.js?blocked=${Date.now()}`);
    assert.equal(isolated.examRandomizerService.getStudentExam('no-storage-student'), null);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', localDescriptor);
    Object.defineProperty(globalThis, 'sessionStorage', sessionDescriptor);
  }
});
