/** Client-side question validation (the server validates again in save_question / import_questions). */
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

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
