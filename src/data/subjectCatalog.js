/**
 * Demo subjects for Dr. AIT, each owned by one subject-scoped administrator.
 * Codes follow the Dr. AIT/VTU 2022-scheme style (e.g. 22CS302). Each subject
 * has its own examination with its own 10 paper patterns (`<code>-A … -J`).
 * The existing 22CS601 examination is unchanged and remains institution-wide.
 */
export const SUBJECTS = [
  { code: '22CS302', title: 'Data Structures and Algorithms', short: 'DSA', semester: '3rd Semester B.E. (Autonomous)', idBase: 1000 },
  { code: '22CS402', title: 'Database Management Systems', short: 'DBMS', semester: '4th Semester B.E. (Autonomous)', idBase: 2000 },
  { code: '22CS403', title: 'Operating Systems', short: 'OS', semester: '4th Semester B.E. (Autonomous)', idBase: 3000 },
  { code: '22CS502', title: 'Computer Networks', short: 'CN', semester: '5th Semester B.E. (Autonomous)', idBase: 4000 },
  { code: '22CS304', title: 'Java Programming', short: 'Java', semester: '3rd Semester B.E. (Autonomous)', idBase: 5000 },
].map((s) => ({ ...s, examId: `CBT-2026-${s.code}` }));

const BY_CODE = new Map(SUBJECTS.map((s) => [s.code, s]));
const BY_TITLE = new Map(SUBJECTS.map((s) => [s.title.toLowerCase(), s]));

export function subjectByCode(code) {
  return BY_CODE.get(String(code ?? '').trim().toUpperCase()) || null;
}

/** Match a question's free-text subject (title or code) to a catalogue subject. */
export function subjectForQuestion(subjectText) {
  const t = String(subjectText ?? '').trim();
  return BY_TITLE.get(t.toLowerCase()) || BY_CODE.get(t.toUpperCase()) || null;
}
