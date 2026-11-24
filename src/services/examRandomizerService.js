/**
 * ExamSphere mock examination service.
 * Active attempts keep an immutable copy of the exact paper and grading key so
 * regeneration, refreshes, and exam-state changes cannot alter an attempt.
 */

import { examMeta, examQuestions } from '../data/examMockData.js';
import {
  generate10ExamPatterns,
  assignPatternToStudent,
} from '../utils/randomizationEngine.js';

const STORAGE_KEY = 'examsphere_randomized_exam_v1';
const ATTEMPTS_STORAGE_KEY = 'examsphere_student_attempts_v1';
const PAPER_ATTEMPTS_STORAGE_KEY = 'examsphere_paper_attempts_v2';

function safeStorageRead(key, preferSession = false) {
  const stores = getStorages(preferSession);
  for (const storage of stores) {
    try {
      const value = storage?.getItem(key);
      if (value !== null && value !== undefined) return value;
    } catch {
      // Try the other browser storage, then fall back to the service memory cache.
    }
  }
  return null;
}

function safeStorageWrite(key, value) {
  let saved = false;
  for (const storage of getStorages()) {
    try {
      if (!storage) continue;
      storage.setItem(key, value);
      saved = true;
    } catch {
      // Try session storage when local storage is unavailable or full.
    }
  }
  return saved;
}

function safeStorageRemove(key) {
  for (const storage of getStorages()) {
    try {
      storage?.removeItem(key);
    } catch {
      // Ignore unavailable storage.
    }
  }
}

function getStorages(preferSession = false) {
  let local = null;
  let session = null;
  try { local = globalThis.localStorage; } catch { /* Browser storage may be blocked. */ }
  try { session = globalThis.sessionStorage; } catch { /* Browser storage may be blocked. */ }
  return preferSession ? [session, local] : [local, session];
}

function makeExamState() {
  const generated = generate10ExamPatterns(examQuestions);
  return {
    meta: examMeta,
    masterQuestions: examQuestions,
    patterns: generated.patterns,
    verificationReport: generated.verificationReport,
    status: 'Published',
    isPublished: true,
    publishedAt: new Date().toISOString(),
    lastGeneratedAt: generated.generatedAt,
  };
}

function makeAttemptId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class ExamRandomizerService {
  constructor() {
    this.memoryExamState = null;
    this.memoryPaperAttempts = { attempts: {}, activeByStudent: {} };
    this.memoryStudentResults = {};
    this.initStore();
  }

  initStore() {
    const stored = safeStorageRead(STORAGE_KEY);
    if (stored) {
      try {
        this.memoryExamState = JSON.parse(stored);
        return;
      } catch {
        // Replace malformed saved state with a valid in-memory state.
      }
    }

    this.memoryExamState = makeExamState();
    safeStorageWrite(STORAGE_KEY, JSON.stringify(this.memoryExamState));
  }

  getExamState() {
    const stored = safeStorageRead(STORAGE_KEY);
    if (stored) {
      try {
        this.memoryExamState = JSON.parse(stored);
        return this.memoryExamState;
      } catch {
        // Keep the last valid in-memory copy if storage was corrupted.
      }
    }

    if (!this.memoryExamState) this.memoryExamState = makeExamState();
    return this.memoryExamState;
  }

  saveExamState(state) {
    this.memoryExamState = state;
    if (!safeStorageWrite(STORAGE_KEY, JSON.stringify(state))) {
      console.warn('Exam state is only available in memory; browser storage is unavailable.');
    }
  }

  getMasterQuestions() {
    const state = this.getExamState();
    return state.masterQuestions || examQuestions;
  }

  setMasterQuestions(newQuestions) {
    if (!Array.isArray(newQuestions) || newQuestions.length !== 25) {
      throw new Error('Examination requires exactly 25 questions.');
    }
    const state = this.getExamState();
    const generated = generate10ExamPatterns(newQuestions);
    const fallbackMarks = Number(state.meta.marksPerQuestion) || 2;
    const questionMarks = newQuestions.map((question) => Number(question.marks ?? fallbackMarks));
    const commonMarks = questionMarks.every((marks) => marks === questionMarks[0]);
    state.masterQuestions = newQuestions;
    state.patterns = generated.patterns;
    state.verificationReport = generated.verificationReport;
    state.lastGeneratedAt = generated.generatedAt;
    state.meta = {
      ...state.meta,
      totalMarks: questionMarks.reduce((sum, marks) => sum + marks, 0),
      marksPerQuestion: commonMarks ? questionMarks[0] : null,
      negativeMarking: newQuestions.some((question) => Number(question.negativeMarks) > 0),
    };
    this.saveExamState(state);
    return state;
  }

  regeneratePatterns() {
    const state = this.getExamState();
    const generated = generate10ExamPatterns(state.masterQuestions || examQuestions);
    state.patterns = generated.patterns;
    state.verificationReport = generated.verificationReport;
    state.lastGeneratedAt = generated.generatedAt;
    this.saveExamState(state);
    return state;
  }

  publishExam() {
    const state = this.getExamState();
    state.isPublished = true;
    state.status = 'Published';
    state.publishedAt = new Date().toISOString();
    this.saveExamState(state);
    return state;
  }

  unpublishExam() {
    const state = this.getExamState();
    state.isPublished = false;
    state.status = 'Draft';
    this.saveExamState(state);
    return state;
  }

  /**
   * Edit exam configuration (title, semester, date, duration, instructions).
   * Only allowed while the exam is a draft; active attempts keep their own
   * snapshot of meta, so this can never alter a paper being taken.
   */
  updateExamMeta(changes) {
    const state = this.getExamState();
    if (state.isPublished) {
      throw new Error('Unpublish the examination before changing its configuration.');
    }
    const next = { ...state.meta };
    if (changes.courseTitle !== undefined) {
      const title = String(changes.courseTitle).trim();
      if (title.length < 3) throw new Error('Course title must be at least 3 characters.');
      next.courseTitle = title;
    }
    if (changes.semester !== undefined) next.semester = String(changes.semester).trim();
    if (changes.examDate !== undefined) next.examDate = String(changes.examDate).trim();
    if (changes.durationMinutes !== undefined) {
      const minutes = Number(changes.durationMinutes);
      if (!Number.isInteger(minutes) || minutes < 5 || minutes > 300) {
        throw new Error('Duration must be a whole number between 5 and 300 minutes.');
      }
      next.durationMinutes = minutes;
    }
    if (changes.instructions !== undefined) {
      const lines = (Array.isArray(changes.instructions) ? changes.instructions : String(changes.instructions).split('\n'))
        .map((line) => String(line).trim())
        .filter(Boolean);
      if (!lines.length) throw new Error('Provide at least one instruction for candidates.');
      next.instructions = lines;
    }
    state.meta = next;
    this.saveExamState(state);
    return state;
  }

  resetToDefaults() {
    safeStorageRemove(STORAGE_KEY);
    this.memoryExamState = makeExamState();
    this.saveExamState(this.memoryExamState);
    return this.memoryExamState;
  }

  readPaperAttempts() {
    const stored = safeStorageRead(PAPER_ATTEMPTS_STORAGE_KEY, true);
    if (stored) {
      try {
        this.memoryPaperAttempts = JSON.parse(stored);
      } catch {
        // Preserve the last valid in-memory registry.
      }
    }
    return this.memoryPaperAttempts;
  }

  savePaperAttempts(registry) {
    this.memoryPaperAttempts = registry;
    return safeStorageWrite(PAPER_ATTEMPTS_STORAGE_KEY, JSON.stringify(registry));
  }

  makeStudentPaper(attempt) {
    const { meta, patternData } = attempt;
    return {
      attemptId: attempt.attemptId,
      examId: meta.id,
      courseCode: meta.courseCode,
      courseTitle: meta.courseTitle,
      institution: meta.institution,
      semester: meta.semester,
      durationMinutes: meta.durationMinutes,
      totalMarks: meta.totalMarks,
      totalQuestions: meta.totalQuestions,
      marksPerQuestion: meta.marksPerQuestion,
      negativeMarking: Boolean(meta.negativeMarking),
      instructions: [...(meta.instructions || [])],
      patternId: patternData.patternId,
      patternLabel: patternData.patternLabel,
      paperCode: patternData.paperCode,
      questions: patternData.questions.map((question, index) => ({
        index,
        displayNumber: index + 1,
        id: question.originalId,
        text: question.text,
        options: [...question.options],
        ...(question.marks !== undefined ? { marks: question.marks } : {}),
        ...(question.negativeMarks !== undefined ? { negativeMarks: question.negativeMarks } : {}),
      })),
    };
  }

  getStudentExam(studentIdentifier) {
    const normalizedId = String(studentIdentifier ?? '').trim().toUpperCase();
    if (!normalizedId) return null;

    const state = this.getExamState();
    const attemptKey = `${state.meta.id}:${normalizedId}`;
    const registry = this.readPaperAttempts();
    const activeAttemptId = registry.activeByStudent[attemptKey];
    const activeAttempt = activeAttemptId && registry.attempts[activeAttemptId];

    // Existing attempts remain available even if the exam is unpublished or regenerated.
    if (activeAttempt?.status === 'active') return this.makeStudentPaper(activeAttempt);
    if (!state.isPublished) return null;

    const patternLabel = assignPatternToStudent(normalizedId);
    const patternData = state.patterns?.[patternLabel];
    if (!patternData) return null;

    const attempt = {
      attemptId: makeAttemptId(),
      attemptKey,
      studentIdentifier: normalizedId,
      status: 'active',
      startedAt: new Date().toISOString(),
      meta: JSON.parse(JSON.stringify(state.meta)),
      patternData: JSON.parse(JSON.stringify(patternData)),
    };

    registry.attempts[attempt.attemptId] = attempt;
    registry.activeByStudent[attemptKey] = attempt.attemptId;
    if (!this.savePaperAttempts(registry)) {
      // Fail closed: without persistence, refresh-safe assignment and grading cannot be guaranteed.
      delete registry.attempts[attempt.attemptId];
      delete registry.activeByStudent[attemptKey];
      return null;
    }

    return this.makeStudentPaper(attempt);
  }

  evaluateSubmission(studentIdentifier, answers, attemptId) {
    const normalizedId = String(studentIdentifier ?? '').trim().toUpperCase();
    if (!normalizedId || !attemptId) {
      throw new Error('A valid student identifier and attempt ID are required for evaluation.');
    }

    const registry = this.readPaperAttempts();
    const attempt = registry.attempts[attemptId];
    if (!attempt || attempt.studentIdentifier !== normalizedId) {
      throw new Error('The assigned exam attempt could not be found for this student.');
    }
    if (attempt.status !== 'active') {
      throw new Error('This exam attempt has already been submitted.');
    }

    const { meta, patternData } = attempt;
    const { answerKey, questions } = patternData;
    if (!Array.isArray(answers) || answers.length !== questions.length) {
      throw new Error(`Exactly ${questions.length} answer slots are required.`);
    }
    if (answers.some((answer) => answer !== null && answer !== undefined &&
      (!Number.isInteger(answer) || answer < 0 || answer > 3))) {
      throw new Error('Answers must be null or an option index from 0 to 3.');
    }

    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;
    const breakdown = questions.map((question, index) => {
      const studentChosenIndex = answers[index];
      const correctIndex = answerKey[question.originalId];
      const isAttempted = studentChosenIndex !== null && studentChosenIndex !== undefined;
      const isCorrect = isAttempted && studentChosenIndex === correctIndex;
      if (!isAttempted) unattemptedCount++;
      else if (isCorrect) correctCount++;
      else incorrectCount++;

      return {
        displayNumber: index + 1,
        questionId: question.originalId,
        questionText: question.text,
        studentAnswerIndex: studentChosenIndex,
        correctAnswerIndex: correctIndex,
        studentAnswerText: isAttempted ? question.options[studentChosenIndex] : 'Not Attempted',
        correctAnswerText: question.options[correctIndex],
        isCorrect,
        isAttempted,
        marksAwarded: isCorrect
          ? Number(question.marks ?? meta.marksPerQuestion ?? 2)
          : isAttempted ? -Number(question.negativeMarks || 0) : 0,
      };
    });

    const totalQuestions = questions.length;
    const marksPerQuestion = meta.marksPerQuestion || 2;
    const score = Number(breakdown.reduce((sum, item) => sum + item.marksAwarded, 0).toFixed(2));
    const maxScore = Number(questions.reduce(
      (sum, question) => sum + Number(question.marks ?? marksPerQuestion),
      0,
    ).toFixed(2));
    const percentage = Number(((score / maxScore) * 100).toFixed(1));
    const result = {
      studentIdentifier: normalizedId,
      attemptId,
      patternLabel: patternData.patternLabel,
      paperCode: patternData.paperCode,
      courseCode: meta.courseCode,
      courseTitle: meta.courseTitle,
      score,
      maxScore,
      percentage,
      passed: percentage >= 40,
      correctCount,
      incorrectCount,
      unattemptedCount,
      totalQuestions,
      submittedAt: new Date().toISOString(),
      breakdown,
    };

    attempt.status = 'submitted';
    attempt.submittedAt = result.submittedAt;
    attempt.result = result;
    delete registry.activeByStudent[attempt.attemptKey];
    if (!this.savePaperAttempts(registry)) {
      throw new Error('Could not persist the submitted attempt. Please retry while browser storage is available.');
    }
    this.saveStudentAttempt(normalizedId, result);
    return result;
  }

  /**
   * Read-only view of every attempt in the registry for administrator reports.
   * Never used by student screens.
   */
  listAttempts() {
    const registry = this.readPaperAttempts();
    return Object.values(registry.attempts || {})
      .map((attempt) => ({
        attemptId: attempt.attemptId,
        studentIdentifier: attempt.studentIdentifier,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt || null,
        patternLabel: attempt.patternData?.patternLabel,
        paperCode: attempt.patternData?.paperCode,
        courseCode: attempt.meta?.courseCode,
        courseTitle: attempt.meta?.courseTitle,
        durationMinutes: attempt.meta?.durationMinutes,
        result: attempt.result || null,
      }))
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  }

  saveStudentAttempt(studentIdentifier, result) {
    let attempts = this.memoryStudentResults;
    const stored = safeStorageRead(ATTEMPTS_STORAGE_KEY);
    if (stored) {
      try { attempts = JSON.parse(stored); } catch { /* retain memory copy */ }
    }
    attempts[studentIdentifier] = result;
    this.memoryStudentResults = attempts;
    safeStorageWrite(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
  }

  getStudentAttempt(studentIdentifier) {
    const stored = safeStorageRead(ATTEMPTS_STORAGE_KEY);
    if (stored) {
      try {
        this.memoryStudentResults = JSON.parse(stored);
      } catch {
        // Return last valid memory copy.
      }
    }
    return this.memoryStudentResults[studentIdentifier] || null;
  }
}

export const examRandomizerService = new ExamRandomizerService();
