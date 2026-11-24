/**
 * Demo CS student accounts used to demonstrate question-paper randomisation.
 *
 * These are ordinary student accounts (same Supabase Auth sign-in, same exam,
 * same attempt and grading rules). The only difference is that each has an
 * explicitly assigned paper pattern (A–E) instead of the USN-hash assignment,
 * so a live demo can show five consecutive patterns side by side.
 *
 * No passwords live here: credentials are generated at provisioning time by
 * scripts/provision-demo-students.mjs and never committed.
 */
export const DEMO_STUDENTS = [
  { usn: 'CS001', name: 'CS Demo 01', branch: 'CSE', pattern: 'A' },
  { usn: 'CS002', name: 'CS Demo 02', branch: 'CSE', pattern: 'B' },
  { usn: 'CS003', name: 'CS Demo 03', branch: 'CSE', pattern: 'C' },
  { usn: 'CS004', name: 'CS Demo 04', branch: 'CSE', pattern: 'D' },
  { usn: 'CS005', name: 'CS Demo 05', branch: 'CSE', pattern: 'E' },
].map((s) => ({
  ...s,
  email: `${s.usn.toLowerCase()}@drait.edu.in`,
  department: 'Computer Science & Engineering',
  semester: 6,
  section: 'D',
}));

const BY_USN = new Map(DEMO_STUDENTS.map((s) => [s.usn, s]));

const normalize = (id) => String(id ?? '').trim().toUpperCase();

export function isDemoStudent(identifier) {
  return BY_USN.has(normalize(identifier));
}

export function demoStudent(identifier) {
  return BY_USN.get(normalize(identifier)) || null;
}

/** Explicitly assigned pattern letter for a demo account, otherwise null. */
export function demoPatternFor(identifier) {
  return BY_USN.get(normalize(identifier))?.pattern || null;
}
