import { rpc, select } from './core.js';

const toQuestion = (r) => ({
  id: r.id,
  questionNo: Number(r.question_no),
  subject: r.subject,
  subjectCode: r.subject_code,
  subjectId: r.subject_id,
  topic: r.topic,
  statement: r.statement,
  options: r.options || [],
  correctOption: r.correct_option,
  difficulty: r.difficulty,
  marks: Number(r.marks),
  negativeMarks: Number(r.negative_marks),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Question bank (admin_question_bank view; RLS limits subject admins to their subject). */
export const questionsApi = {
  async listSubjects() {
    const rows = await select('subjects', 'id,code,title,semester,institution_id,is_active', (q) => q.eq('is_active', true).order('code'));
    return rows.map((s) => ({ id: s.id, code: s.code, title: s.title, semester: s.semester, institutionId: s.institution_id }));
  },

  async list() {
    const rows = await select('admin_question_bank', '*', (q) => q.eq('is_archived', false).order('question_no', { ascending: false }));
    return rows.map(toQuestion);
  },

  async byIds(ids) {
    if (!ids.length) return [];
    const rows = await select('admin_question_bank', '*', (q) => q.in('id', ids));
    return rows.map(toQuestion);
  },

  async save(form, id = null) {
    const payload = {
      subject: form.subjectCode || form.subject,
      topic: form.topic,
      statement: form.statement,
      options: form.options,
      correctOption: form.correctOption,
      difficulty: form.difficulty,
      marks: form.marks,
      negativeMarks: form.negativeMarks ?? 0,
    };
    return toQuestion(await rpc('save_question', { p_question_id: id, p_payload: payload }));
  },

  /** Unused questions are deleted; questions already used in an exam are archived. */
  remove(id) {
    return rpc('delete_question', { p_question_id: id });
  },

  /** Server-side validation + duplicate checks; returns { imported, rejected, rejections }. */
  import(fileName, questions) {
    return rpc('import_questions', {
      p_file_name: fileName,
      p_rows: questions.map((q, i) => ({
        rowNumber: q.rowNumber ?? i + 2, subject: q.subjectCode || q.subject, topic: q.topic, statement: q.statement,
        options: q.options, correctOption: q.correctOption, difficulty: q.difficulty, marks: q.marks, negativeMarks: q.negativeMarks ?? 0,
      })),
    });
  },
};
