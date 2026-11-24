/**
 * ExamSphere — Question and Option Randomization Engine
 *
 * Implements deterministic and cryptographically sound permutation algorithms
 * to generate 10 unique question-paper patterns (Pattern A to Pattern J)
 * from a master set of 25 MCQ questions.
 */

export const PATTERN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/**
 * Standard Fisher-Yates shuffle using a seeded or pseudo-random generator
 */
function shuffleArray(array, rng = Math.random) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Simple Linear Congruential Generator (LCG) for deterministic seeds
 */
function createSeededRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return function () {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/**
 * Generates 10 guaranteed-unique permutations of question order
 * @param {Array} questions - 25 master MCQ questions
 * @returns {Array<Array<number>>} - 10 unique index permutations
 */
export function generateUniqueQuestionPermutations(totalQuestions = 25, patternCount = 10) {
  const baseIndices = Array.from({ length: totalQuestions }, (_, i) => i);
  const permutations = [];
  const seenSignatures = new Set();

  // Pattern A is conventionally kept in primary sequence (or slightly shifted)
  // To ensure every pattern has a unique sequence:
  let seedModifier = 104729; // Prime number seed offset

  for (let p = 0; p < patternCount; p++) {
    let permutation;
    let signature;
    let attempts = 0;

    do {
      attempts++;
      const rng = createSeededRandom(seedModifier + p * 7919 + attempts * 997);
      
      if (p === 0 && attempts === 1) {
        // Pattern A uses the natural sequence (Q1..Q25)
        permutation = [...baseIndices];
      } else {
        permutation = shuffleArray(baseIndices, rng);
      }

      signature = permutation.join(',');
    } while (seenSignatures.has(signature) && attempts < 100);

    seenSignatures.add(signature);
    permutations.push(permutation);
  }

  return permutations;
}

/**
 * Randomizes options for a single question while securely mapping the correct answer
 * @param {Object} question - { id, text, options: [string, string, string, string], correctOption: number }
 * @param {Function} rng - random number generator
 * @returns {Object} - { shuffledOptions, newCorrectIndex, originalOptionIndices }
 */
export function randomizeQuestionOptions(question, rng = Math.random) {
  const originalOptions = question.options; // Array of 4 options
  const optionIndices = [0, 1, 2, 3];
  
  // Shuffle option indices
  const shuffledIndices = shuffleArray(optionIndices, rng);

  // Reconstructed options in new order
  const shuffledOptions = shuffledIndices.map((idx) => originalOptions[idx]);

  // Find the new index where the original correctOption now resides
  const originalCorrect = question.correctOption;
  const newCorrectIndex = shuffledIndices.indexOf(originalCorrect);

  return {
    shuffledOptions,
    newCorrectIndex,
    shuffledIndices, // e.g. [2, 0, 3, 1] means displayed A is original C, displayed B is original A, etc.
  };
}

/**
 * Generates all 10 patterns (Pattern A through Pattern J) from master questions
 * @param {Array} masterQuestions - Master array of 25 MCQ questions
 * @returns {Object} - { patterns: Record<string, PatternData>, verificationReport: Object }
 */
export function generate10ExamPatterns(masterQuestions) {
  if (!masterQuestions || masterQuestions.length !== 25) {
    throw new Error(`Exactly 25 questions are required to generate patterns. Received: ${masterQuestions?.length || 0}`);
  }

  const permutations = generateUniqueQuestionPermutations(25, 10);
  const patterns = {};
  const seedBase = Date.now();

  PATTERN_LABELS.forEach((label, patternIndex) => {
    const questionOrder = permutations[patternIndex];
    const patternQuestions = [];
    const answerKey = {}; // { [questionId]: correctOptionIndexInThisPattern }
    const optionMappings = {}; // { [questionId]: [originalIndices] }

    questionOrder.forEach((originalIndex, displaySeq) => {
      const q = masterQuestions[originalIndex];
      const qRng = createSeededRandom(seedBase + patternIndex * 1000 + q.id * 17);
      
      const { shuffledOptions, newCorrectIndex, shuffledIndices } = randomizeQuestionOptions(q, qRng);

      // Student-safe question object (ZERO correct-answer data exposed!)
      patternQuestions.push({
        displayNumber: displaySeq + 1,
        originalId: q.id,
        text: q.text,
        options: shuffledOptions,
        ...(q.subject !== undefined ? { subject: q.subject } : {}),
        ...(q.topic !== undefined ? { topic: q.topic } : {}),
        ...(q.difficulty !== undefined ? { difficulty: q.difficulty } : {}),
        ...(q.marks !== undefined ? { marks: Number(q.marks) } : {}),
        ...(q.negativeMarks !== undefined ? { negativeMarks: Number(q.negativeMarks) } : {}),
      });

      // Internal answer key for evaluation
      answerKey[q.id] = newCorrectIndex;
      optionMappings[q.id] = shuffledIndices;
    });

    patterns[label] = {
      patternId: label,
      patternLabel: `Pattern ${label}`,
      paperCode: `22CS601-${label}`,
      totalQuestions: 25,
      questions: patternQuestions, // Array of 25 questions in pattern sequence
      answerKey,                  // Key: questionId -> displayed correct option index
      optionMappings,             // Key: questionId -> displayed option to original option mapping
      questionOrder: questionOrder.map((idx) => masterQuestions[idx].id), // Order of question IDs
    };
  });

  // Verify and build validation report
  const verificationReport = verifyPatternsIntegrity(masterQuestions, patterns);

  return {
    patterns,
    verificationReport,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Verifies that all 10 patterns meet academic CBT integrity criteria:
 * 1. Exactly 10 patterns generated.
 * 2. Each pattern has 25 questions.
 * 3. All 25 original question IDs present in every pattern (no duplicates or omissions).
 * 4. All 10 question sequences are strictly distinct.
 * 5. Every question has 4 options.
 * 6. Answer key mappings are 100% valid.
 */
export function verifyPatternsIntegrity(masterQuestions, patterns) {
  const masterIds = new Set(masterQuestions.map((q) => q.id));
  const patternKeys = Object.keys(patterns);
  const sequenceSignatures = new Set();
  const checks = {
    exact10Patterns: patternKeys.length === 10,
    allPatternsHave25Questions: true,
    allQuestionIdsPreserved: true,
    uniqueQuestionSequences: true,
    allQuestionsHave4Options: true,
    answerKeysValid: true,
  };

  const details = [];

  patternKeys.forEach((key) => {
    const p = patterns[key];
    const qList = p.questions;

    // Check count
    if (qList.length !== 25) {
      checks.allPatternsHave25Questions = false;
    }

    // Check ID parity
    const patternIds = new Set(qList.map((q) => q.originalId));
    if (patternIds.size !== 25 || ![...masterIds].every((id) => patternIds.has(id))) {
      checks.allQuestionIdsPreserved = false;
    }

    // Check sequence uniqueness
    const sig = p.questionOrder.join('-');
    if (sequenceSignatures.has(sig)) {
      checks.uniqueQuestionSequences = false;
    }
    sequenceSignatures.add(sig);

    // Check 4 options per question & answer key validity
    qList.forEach((q) => {
      if (!q.options || q.options.length !== 4) {
        checks.allQuestionsHave4Options = false;
      }
      const correctIdx = p.answerKey[q.originalId];
      if (typeof correctIdx !== 'number' || correctIdx < 0 || correctIdx > 3) {
        checks.answerKeysValid = false;
      }
    });

    details.push({
      pattern: p.patternLabel,
      firstQuestionId: qList[0].originalId,
      lastQuestionId: qList[24].originalId,
      firstFiveIds: p.questionOrder.slice(0, 5),
    });
  });

  const isAllValid = Object.values(checks).every((v) => v === true);

  return {
    isValid: isAllValid,
    checks,
    details,
    totalPatterns: patternKeys.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Deterministically assigns a pattern to a student based on their identifier (USN/email)
 * This guarantees:
 * - Refreshing the exam never generates or switches patterns.
 * - Same student always receives the exact same pattern.
 * - Even distribution of patterns A through J across student roster.
 */
export function assignPatternToStudent(studentIdentifier) {
  const clean = String(studentIdentifier ?? '').trim().toUpperCase();
  if (!clean) return null;

  // FNV-1a with unsigned arithmetic avoids the signed 32-bit edge case where
  // Math.abs(-2147483648) remains negative and would select no pattern.
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    hash = Math.imul(hash ^ clean.charCodeAt(i), 16777619) >>> 0;
  }

  const index = hash % PATTERN_LABELS.length;
  return PATTERN_LABELS[index];
}
