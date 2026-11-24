import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const { questionBankService, QUESTION_BANK_STORAGE_KEY } = await import('../src/services/questionBankService.js');
const { examRandomizerService } = await import('../src/services/examRandomizerService.js');
const { parseQuestionImportMatrix, QUESTION_IMPORT_HEADERS, readQuestionImportFile } = await import('../src/utils/questionImport.js');

const createQuestion = (overrides = {}) => ({
  subject: 'Test Subject',
  topic: 'Test Topic',
  statement: `Generated test question ${Math.random()}`,
  options: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
  correctOption: 1,
  difficulty: 'Medium',
  marks: 2,
  negativeMarks: 0.25,
  ...overrides,
});

test('manual question add, edit, duplicate validation, and delete persist in the bank', () => {
  const added = questionBankService.saveQuestion(createQuestion());
  assert.ok(added.id);
  assert.equal(questionBankService.getQuestions().some((item) => item.id === added.id), true);
  assert.throws(() => questionBankService.saveQuestion({ ...createQuestion(), statement: added.statement }), /already exists/);
  assert.throws(() => questionBankService.saveQuestion(createQuestion({ options: ['A', 'A', 'C', 'D'] })), /must be different/);

  const edited = questionBankService.saveQuestion({
    ...added,
    statement: `${added.statement} edited`,
    difficulty: 'Hard',
    correctOption: 3,
  }, added.id);
  assert.equal(edited.difficulty, 'Hard');
  assert.equal(edited.correctOption, 3);
  assert.equal(questionBankService.deleteQuestion(added.id), true);
  assert.equal(questionBankService.getQuestions().some((item) => item.id === added.id), false);
  assert.ok(localStorage.getItem(QUESTION_BANK_STORAGE_KEY));
});

test('CSV and Excel imports preview row errors and duplicates, then import valid rows', async () => {
  const existing = questionBankService.getQuestions();
  const uniqueStatement = `Imported question ${Date.now()}`;
  const matrix = [
    QUESTION_IMPORT_HEADERS,
    ['Networks', 'Routing', uniqueStatement, 'A one', 'B two', 'C three', 'D four', 'B', 'Easy', 2, 0.25],
    ['Networks', 'Routing', uniqueStatement, 'A one', 'B two', 'C three', 'D four', 'B', 'Easy', 2, 0],
    ['Networks', 'Routing', 'Invalid question row', 'Only A', '', 'C', 'D', 'Z', 'Expert', '', 0],
  ];
  const preview = parseQuestionImportMatrix(matrix, existing);
  assert.equal(preview.rows[0].status, 'Ready');
  assert.equal(preview.rows[1].status, 'Duplicate');
  assert.equal(preview.rows[2].status, 'Invalid');
  assert.ok(preview.rows[2].errors.length >= 3);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), 'Questions');
  const excelBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const excelBuffer = excelBytes instanceof ArrayBuffer
    ? excelBytes
    : excelBytes.buffer.slice(excelBytes.byteOffset, excelBytes.byteOffset + excelBytes.byteLength);
  const excelFile = {
    name: 'questions.xlsx',
    arrayBuffer: async () => excelBuffer,
  };
  const excelPreview = await readQuestionImportFile(excelFile, existing);
  assert.equal(excelPreview.rows[0].status, 'Ready');
  assert.equal(excelPreview.rows[1].status, 'Duplicate');

  const csv = [
    QUESTION_IMPORT_HEADERS.join(','),
    `Networks,Routing,${uniqueStatement},A one,B two,C three,D four,B,Easy,2,0.25`,
  ].join('\n');
  const csvFile = { name: 'questions.csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer };
  const csvPreview = await readQuestionImportFile(csvFile, existing);
  assert.equal(csvPreview.rows[0].status, 'Ready');

  const imported = questionBankService.importQuestions(preview.rows
    .filter((row) => row.status === 'Ready')
    .map((row) => row.question));
  assert.equal(imported.length, 1);
  assert.equal(questionBankService.getQuestions().some((item) => item.statement === uniqueStatement), true);
  assert.throws(() => questionBankService.importQuestions([imported[0]]), /Duplicate question/);
});

test('25 selected question records feed the existing 10-pattern generator without breaking an active attempt', () => {
  const originalState = examRandomizerService.getExamState();
  const activeId = `question-bank-integration-${Date.now()}`;
  const originalPaper = examRandomizerService.getStudentExam(activeId);
  const registry = JSON.parse(localStorage.getItem('examsphere_paper_attempts_v2'));
  const originalAttempt = registry.attempts[originalPaper.attemptId];
  const correctAnswers = originalAttempt.patternData.questions.map(
    (question) => originalAttempt.patternData.answerKey[question.originalId],
  );

  try {
    const selected = questionBankService.getQuestions().slice(0, 25).map((question) => ({
      id: Number(question.id),
      text: question.statement,
      options: [...question.options],
      correctOption: Number(question.correctOption),
      subject: question.subject,
      topic: question.topic,
      difficulty: question.difficulty,
      marks: Number(question.marks),
      negativeMarks: Number(question.negativeMarks),
    }));
    selected[0].marks = 4;
    selected[0].negativeMarks = 1;
    assert.equal(selected.length, 25);
    const updated = examRandomizerService.setMasterQuestions(selected);
    assert.equal(Object.keys(updated.patterns).length, 10);
    for (const pattern of Object.values(updated.patterns)) {
      assert.equal(pattern.questions.length, 25);
      for (const question of pattern.questions) assert.equal(question.options.length, 4);
    }
    assert.equal(updated.meta.totalMarks, 52);
    assert.equal(updated.meta.negativeMarking, true);

    const resumedPaper = examRandomizerService.getStudentExam(activeId);
    assert.deepEqual(resumedPaper, originalPaper);
    assert.equal(examRandomizerService.evaluateSubmission(activeId, correctAnswers, originalPaper.attemptId).correctCount, 25);

    const newPaper = examRandomizerService.getStudentExam(`${activeId}-new`);
    assert.equal(newPaper.questions.length, 25);
    assert.equal(newPaper.questions.some((question) => question.marks === 4 && question.negativeMarks === 1), true);
    const updatedRegistry = JSON.parse(localStorage.getItem('examsphere_paper_attempts_v2'));
    const newAttempt = updatedRegistry.attempts[newPaper.attemptId];
    const newAnswers = newAttempt.patternData.questions.map((question) => newAttempt.patternData.answerKey[question.originalId]);
    const penalizedIndex = newAttempt.patternData.questions.findIndex((question) => question.originalId === selected[0].id);
    newAnswers[penalizedIndex] = (newAnswers[penalizedIndex] + 1) % 4;
    const penalized = examRandomizerService.evaluateSubmission(`${activeId}-new`, newAnswers, newPaper.attemptId);
    assert.equal(penalized.correctCount, 24);
    assert.equal(penalized.score, 47);
    assert.equal(penalized.maxScore, 52);
  } finally {
    examRandomizerService.setMasterQuestions(originalState.masterQuestions);
  }
});
