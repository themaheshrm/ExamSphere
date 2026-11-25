import { examQuestions, examMeta } from '../data/examMockData.js';
import { SUBJECT_QUESTIONS } from '../data/subjectQuestionBanks.js';

export const QUESTION_BANK_STORAGE_KEY = 'examsphere_question_bank_v1';
const SUBJECT_BANKS_ADDED_KEY = 'examsphere_subject_banks_added_v1';
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeQuestionText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function validateQuestion(question) {
  const errors = [];
  const subject = String(question.subject ?? '').trim();
  const topic = String(question.topic ?? '').trim();
  const statement = String(question.statement ?? question.text ?? '').trim();
  const options = Array.isArray(question.options)
    ? question.options.map((option) => String(option ?? '').trim())
    : [];
  const difficulty = DIFFICULTIES.find(
    (value) => value.toLowerCase() === String(question.difficulty ?? '').trim().toLowerCase(),
  );
  const correctOption = question.correctOption === '' || question.correctOption === null || question.correctOption === undefined
    ? NaN
    : Number(question.correctOption);
  const marks = Number(question.marks);
  const negativeMarks = Number(question.negativeMarks);

  if (!subject) errors.push('Subject is required.');
  if (!topic) errors.push('Topic is required.');
  if (!statement) errors.push('Question statement is required.');
  if (options.length !== 4 || options.some((option) => !option)) {
    errors.push('Exactly four non-empty options are required.');
  } else if (new Set(options.map((option) => option.toLowerCase())).size !== 4) {
    errors.push('Options A, B, C, and D must be different.');
  }
  if (!Number.isInteger(correctOption) || correctOption < 0 || correctOption > 3) {
    errors.push('Select exactly one correct answer.');
  }
  if (!difficulty) errors.push('Difficulty must be Easy, Medium, or Hard.');
  if (!Number.isFinite(marks) || marks <= 0) errors.push('Marks must be greater than zero.');
  if (!Number.isFinite(negativeMarks) || negativeMarks < 0) {
    errors.push('Negative marks must be zero or greater.');
  }

  return {
    errors,
    value: {
      ...question,
      subject,
      topic,
      statement,
      text: statement,
      options,
      correctOption,
      difficulty,
      marks,
      negativeMarks,
    },
  };
}

function seededQuestions() {
  const now = Date.now();
  return examQuestions.map((question, index) => ({
    id: question.id,
    subject: examMeta.courseTitle,
    topic: 'Core Concepts',
    statement: question.text,
    text: question.text,
    options: [...question.options],
    correctOption: question.correctOption,
    difficulty: ['Easy', 'Medium', 'Hard'][index % 3],
    marks: examMeta.marksPerQuestion || 2,
    negativeMarks: 0,
    createdAt: new Date(now - index * 60_000).toISOString(),
    updatedAt: new Date(now - index * 60_000).toISOString(),
  }));
}

class QuestionBankService {
  constructor() {
    this.memoryQuestions = null;
    this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem(QUESTION_BANK_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.memoryQuestions = parsed;
          this.addSubjectBanksOnce();
          return;
        }
      }
    } catch {
      // Keep the demo usable in memory when storage is unavailable or invalid.
    }
    this.memoryQuestions = seededQuestions();
    this.addSubjectBanksOnce();
    this.persist();
  }

  /**
   * Append the five demo subject banks (DSA, DBMS, OS, CN, Java) exactly
   * once. Existing questions are never changed; a subject question is skipped
   * if its id or statement is already present.
   */
  addSubjectBanksOnce() {
    try {
      if (localStorage.getItem(SUBJECT_BANKS_ADDED_KEY)) return;
    } catch {
      // storage unavailable: still add for this in-memory session
    }
    const ids = new Set(this.memoryQuestions.map((q) => q.id));
    const statements = new Set(this.memoryQuestions.map((q) => normalizeQuestionText(q.statement ?? q.text)));
    const now = new Date().toISOString();
    const additions = SUBJECT_QUESTIONS
      .filter((q) => !ids.has(q.id) && !statements.has(normalizeQuestionText(q.statement)))
      .map(({ subjectCode: _code, ...q }) => ({ ...q, options: [...q.options], createdAt: now, updatedAt: now }));
    this.memoryQuestions = [...this.memoryQuestions, ...additions];
    this.persist();
    try {
      localStorage.setItem(SUBJECT_BANKS_ADDED_KEY, '1');
    } catch {
      // ignore
    }
  }

  persist() {
    try {
      localStorage.setItem(QUESTION_BANK_STORAGE_KEY, JSON.stringify(this.memoryQuestions));
    } catch {
      // In-memory persistence is the mock-data fallback for this browser session.
    }
  }

  getQuestions() {
    return clone(this.memoryQuestions || []);
  }

  ensureUnique(question, exceptId = null) {
    const normalized = normalizeQuestionText(question.statement ?? question.text);
    const duplicate = this.memoryQuestions.find(
      (item) => item.id !== exceptId && normalizeQuestionText(item.statement ?? item.text) === normalized,
    );
    if (duplicate) throw new Error(`This question already exists (ID ${duplicate.id}).`);
  }

  saveQuestion(input, id = null) {
    const { errors, value } = validateQuestion(input);
    if (errors.length) throw new Error(errors.join(' '));
    this.ensureUnique(value, id);
    const timestamp = new Date().toISOString();
    if (id === null) {
      const nextId = this.memoryQuestions.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
      const record = { ...value, id: nextId, createdAt: timestamp, updatedAt: timestamp };
      this.memoryQuestions = [record, ...this.memoryQuestions];
      this.persist();
      return clone(record);
    }

    const index = this.memoryQuestions.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Question not found. Refresh the bank and try again.');
    const record = { ...this.memoryQuestions[index], ...value, id, updatedAt: timestamp };
    this.memoryQuestions = this.memoryQuestions.map((item, itemIndex) => itemIndex === index ? record : item);
    this.persist();
    return clone(record);
  }

  deleteQuestion(id) {
    const previousCount = this.memoryQuestions.length;
    this.memoryQuestions = this.memoryQuestions.filter((question) => question.id !== id);
    if (this.memoryQuestions.length === previousCount) return false;
    this.persist();
    return true;
  }

  importQuestions(rows) {
    const additions = [];
    const known = new Set(this.memoryQuestions.map((question) => normalizeQuestionText(question.statement)));
    for (const row of rows) {
      const { errors, value } = validateQuestion(row);
      if (errors.length) throw new Error(errors.join(' '));
      const normalized = normalizeQuestionText(value.statement);
      if (known.has(normalized)) throw new Error(`Duplicate question: ${value.statement}`);
      known.add(normalized);
      additions.push(value);
    }

    const timestamp = new Date().toISOString();
    let nextId = this.memoryQuestions.reduce((max, question) => Math.max(max, Number(question.id) || 0), 0) + 1;
    const records = additions.map((question) => ({
      ...question,
      id: nextId++,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    this.memoryQuestions = [...records, ...this.memoryQuestions];
    this.persist();
    return clone(records);
  }
}

export const questionBankService = new QuestionBankService();
