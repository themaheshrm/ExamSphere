import { normalizeQuestionText, validateQuestion } from '../services/questionBankService.js';

export const QUESTION_IMPORT_HEADERS = [
  'Subject', 'Topic', 'Question', 'Option A', 'Option B', 'Option C', 'Option D',
  'Correct Answer', 'Difficulty', 'Marks', 'Negative Marks',
];

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_ALIASES = {
  subject: ['subject', 'course'],
  topic: ['topic', 'unit', 'chapter'],
  statement: ['question', 'questionstatement', 'statement'],
  optionA: ['optiona', 'a'],
  optionB: ['optionb', 'b'],
  optionC: ['optionc', 'c'],
  optionD: ['optiond', 'd'],
  correctAnswer: ['correctanswer', 'correctoption', 'answer', 'key'],
  difficulty: ['difficulty', 'level'],
  marks: ['marks', 'mark'],
  negativeMarks: ['negativemarks', 'negativemark', 'penalty'],
};

export function parseQuestionImportMatrix(matrix, existingQuestions = []) {
  if (!Array.isArray(matrix) || matrix.length < 2) {
    return { rows: [], errors: ['The file must contain a header row and at least one question.'] };
  }
  const headers = matrix[0].map(normalizeHeader);
  const indexes = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    indexes[field] = headers.findIndex((header) => aliases.includes(header));
  }
  const missingHeaders = Object.entries(indexes)
    .filter(([field, index]) => index < 0 && field !== 'negativeMarks')
    .map(([field]) => QUESTION_IMPORT_HEADERS[{
      subject: 0, topic: 1, statement: 2, optionA: 3, optionB: 4, optionC: 5,
      optionD: 6, correctAnswer: 7, difficulty: 8, marks: 9,
    }[field]]);
  if (missingHeaders.length) {
    return { rows: [], errors: [`Missing required columns: ${missingHeaders.join(', ')}.`] };
  }

  const known = new Set(existingQuestions.map((question) => normalizeQuestionText(question.statement ?? question.text)));
  const rows = [];
  for (let index = 1; index < matrix.length; index++) {
    const values = matrix[index] || [];
    if (values.every((value) => String(value ?? '').trim() === '')) continue;
    const get = (field) => indexes[field] < 0 ? '' : String(values[indexes[field]] ?? '').trim();
    const answerValue = get('correctAnswer').toUpperCase();
    const answerMap = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
    const question = {
      subject: get('subject'),
      topic: get('topic'),
      statement: get('statement'),
      options: [get('optionA'), get('optionB'), get('optionC'), get('optionD')],
      correctOption: answerMap[answerValue] ?? null,
      difficulty: get('difficulty'),
      marks: get('marks'),
      negativeMarks: get('negativeMarks') || 0,
    };
    const { errors: validationErrors, value } = validateQuestion(question);
    const duplicate = value.statement && known.has(normalizeQuestionText(value.statement));
    if (value.statement) known.add(normalizeQuestionText(value.statement));
    rows.push({
      rowNumber: index + 1,
      question: value,
      errors: validationErrors,
      duplicate: Boolean(duplicate),
      status: validationErrors.length ? 'Invalid' : duplicate ? 'Duplicate' : 'Ready',
    });
  }

  return { rows, errors: [] };
}

export async function readQuestionImportFile(file, existingQuestions = []) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(extension)) {
    throw new Error('Choose a .csv, .xlsx, or .xls file.');
  }
  const XLSX = await import('xlsx');
  const bytes = await file.arrayBuffer();
  const workbook = extension === 'csv'
    ? XLSX.read(new TextDecoder().decode(bytes), { type: 'string', cellDates: false })
    : XLSX.read(bytes, { type: 'array', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('The workbook has no worksheets.');
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: '',
    raw: false,
  });
  return parseQuestionImportMatrix(matrix, existingQuestions);
}

export function downloadQuestionTemplate() {
  const csv = `${QUESTION_IMPORT_HEADERS.join(',')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'examsphere-question-import-template.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
