import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseQuestionImportMatrix, QUESTION_IMPORT_HEADERS, readQuestionImportFile } from '../src/utils/questionImport.js';
import { validateQuestion, normalizeQuestionText } from '../src/utils/questionValidation.js';

// Client-side preview only; import_questions re-validates on the server
// (covered by tests/engine.integration.test.js and supabase/tests).
const existing = [{ statement: 'Already  in the BANK?' }];

test('question validation mirrors the server rules', () => {
  const ok = validateQuestion({ subject: 'OS', topic: 'T', statement: ' Q ', options: ['a', 'b', 'c', 'd'], correctOption: 2, difficulty: 'easy', marks: 2, negativeMarks: 0 });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.difficulty, 'Easy');
  const bad = validateQuestion({ subject: '', topic: '', statement: '', options: ['a', 'a', '', 'd'], correctOption: 7, difficulty: 'x', marks: 0, negativeMarks: -1 });
  assert.ok(bad.errors.length >= 7);
  assert.equal(normalizeQuestionText('  Already  in the BANK? '), 'already in the bank?');
});

test('CSV and Excel imports preview row errors and duplicates', async () => {
  const statement = 'Imported question one';
  const matrix = [
    QUESTION_IMPORT_HEADERS,
    ['Networks', 'Routing', statement, 'A one', 'B two', 'C three', 'D four', 'B', 'Easy', 2, 0.25],
    ['Networks', 'Routing', statement, 'A one', 'B two', 'C three', 'D four', 'B', 'Easy', 2, 0],
    ['Networks', 'Routing', 'already in the bank?', 'A one', 'B two', 'C three', 'D four', 'A', 'Easy', 2, 0],
    ['Networks', 'Routing', 'Invalid question row', 'Only A', '', 'C', 'D', 'Z', 'Expert', '', 0],
  ];
  const preview = parseQuestionImportMatrix(matrix, existing);
  assert.deepEqual(preview.rows.map((r) => r.status), ['Ready', 'Duplicate', 'Duplicate', 'Invalid']);
  assert.equal(preview.rows[0].question.correctOption, 1);
  assert.ok(preview.rows[3].errors.length >= 3);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), 'Questions');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const excel = await readQuestionImportFile({ name: 'q.xlsx', arrayBuffer: async () => buffer }, existing);
  assert.deepEqual(excel.rows.map((r) => r.status), ['Ready', 'Duplicate', 'Duplicate', 'Invalid']);

  const csv = [QUESTION_IMPORT_HEADERS.join(','), `Networks,Routing,${statement},A one,B two,C three,D four,B,Easy,2,0.25`].join('\n');
  const fromCsv = await readQuestionImportFile({ name: 'q.csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer }, existing);
  assert.equal(fromCsv.rows[0].status, 'Ready');
  await assert.rejects(readQuestionImportFile({ name: 'q.txt', arrayBuffer: async () => new ArrayBuffer(0) }), /csv/);
  assert.match(parseQuestionImportMatrix([['Subject'], ['x']]).errors[0], /Missing required columns/);
});
