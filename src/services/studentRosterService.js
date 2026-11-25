import { readJson, writeJson, emitChange } from './localStore.js';
import { INSTITUTION } from '../utils/constants.js';
import { DEMO_STUDENTS, isDemoStudent } from '../data/demoAccounts.js';

const KEY = 'examsphere_candidate_roster_v1';
const DEMO_SEEDED_KEY = 'examsphere_demo_candidates_added_v1'; // legacy: true once CS001–CS005 were added
const DEMO_ADDED_KEY = 'examsphere_demo_candidates_added_v2';  // list of demo USNs already added
// Dr. AIT USNs always carry the VTU college code 1DA (e.g. 1DA22CS001).
export const USN_PATTERN = new RegExp(`^${INSTITUTION.code}\\d{2}[A-Z]{2,3}\\d{3}$`);

const SEED = [
  ['1DA22CS001', 'Alex Chen', 'B'], ['1DA22CS002', 'Bhavana K.', 'B'], ['1DA22CS003', 'Chirag M. Gowda', 'B'],
  ['1DA22CS004', 'Deepa R. Rao', 'B'], ['1DA22CS005', 'Eshwar S.', 'B'], ['1DA22CS006', 'Farhan Akhtar', 'A'],
  ['1DA22CS007', 'Gowri Shankar', 'A'], ['1DA22CS008', 'Harish Babu', 'A'], ['1DA22CS009', 'Isha Nambiar', 'A'],
  ['1DA22CS010', 'Jayant V.', 'A'],
].map(([usn, name, section]) => ({
  usn,
  name,
  email: `${usn.toLowerCase()}@drait.edu.in`,
  department: 'Computer Science & Engineering',
  semester: 6,
  section,
  status: 'Eligible',
  remarks: '',
}));

const DEMO_CANDIDATES = DEMO_STUDENTS.map((d) => ({
  usn: d.usn,
  name: d.name,
  email: d.email,
  department: d.department,
  semester: d.semester,
  section: d.section,
  status: 'Eligible',
  remarks: '',
  demo: true,
}));

/**
 * Adds each demo candidate once (append-only; existing entries are never
 * changed). Tracked per USN, so a newly introduced demo account (CS006) is
 * added to rosters that already have CS001–CS005, while a demo candidate an
 * admin removed stays removed.
 */
function withDemoCandidates(roster) {
  const legacy = readJson(DEMO_SEEDED_KEY, false) ? ['CS001', 'CS002', 'CS003', 'CS004', 'CS005'] : [];
  const stored = readJson(DEMO_ADDED_KEY, null);
  const added = new Set(Array.isArray(stored) ? stored : legacy);
  const pending = DEMO_CANDIDATES.filter((d) => !added.has(d.usn));
  if (!pending.length) {
    if (!Array.isArray(stored)) writeJson(DEMO_ADDED_KEY, [...added]);
    return roster;
  }
  const present = new Set(roster.map((s) => s.usn));
  const next = [...roster, ...pending.filter((d) => !present.has(d.usn)).map((d) => ({ ...d }))];
  writeJson(KEY, next);
  writeJson(DEMO_ADDED_KEY, [...added, ...pending.map((d) => d.usn)]);
  return next;
}

function load() {
  const saved = readJson(KEY, null);
  if (Array.isArray(saved)) return withDemoCandidates(saved);
  writeJson(KEY, SEED);
  return withDemoCandidates(SEED.map((s) => ({ ...s })));
}

export function validateCandidate(input) {
  const errors = {};
  const usn = String(input.usn ?? '').trim().toUpperCase();
  const name = String(input.name ?? '').trim();
  const email = String(input.email ?? '').trim().toLowerCase();
  const semester = Number(input.semester);
  const section = String(input.section ?? '').trim().toUpperCase();
  if (!USN_PATTERN.test(usn) && !isDemoStudent(usn)) errors.usn = `Enter a valid ${INSTITUTION.shortName} USN starting with ${INSTITUTION.code}, e.g. ${INSTITUTION.code}22CS011.`;
  if (name.length < 2) errors.name = 'Full name is required.';
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Enter a valid email address.';
  else if (email && !email.endsWith(`@${INSTITUTION.emailDomain}`)) errors.email = `Use the candidate's @${INSTITUTION.emailDomain} address.`;
  if (!Number.isInteger(semester) || semester < 1 || semester > 8) errors.semester = 'Semester must be 1–8.';
  if (!/^[A-Z]$/.test(section)) errors.section = 'Section must be a single letter.';
  return {
    errors,
    value: {
      usn,
      name,
      email: email || `${usn.toLowerCase()}@${INSTITUTION.emailDomain}`,
      department: String(input.department ?? '').trim() || 'Computer Science & Engineering',
      semester,
      section,
      status: input.status === 'Withheld' ? 'Withheld' : 'Eligible',
      remarks: String(input.remarks ?? '').trim(),
      ...(isDemoStudent(usn) ? { demo: true } : {}),
    },
  };
}

/** Examination candidate roster (eligibility for the current CBT). */
export const studentRosterService = {
  list() {
    return load();
  },

  find(usn) {
    const id = String(usn ?? '').trim().toUpperCase();
    return load().find((s) => s.usn === id) || null;
  },

  /**
   * Candidates not on the roster are treated as eligible so authenticated
   * students outside this demo roster keep their existing access.
   */
  isEligible(usn) {
    const entry = this.find(usn);
    return !entry || entry.status !== 'Withheld';
  },

  save(input, originalUsn = null) {
    const { errors, value } = validateCandidate(input);
    if (Object.keys(errors).length) {
      const error = new Error(Object.values(errors).join(' '));
      error.fieldErrors = errors;
      throw error;
    }
    const roster = load();
    const clash = roster.find((s) => s.usn === value.usn && s.usn !== originalUsn);
    if (clash) {
      const error = new Error(`USN ${value.usn} is already on the roster.`);
      error.fieldErrors = { usn: 'This USN is already registered.' };
      throw error;
    }
    const next = originalUsn
      ? roster.map((s) => (s.usn === originalUsn ? value : s))
      : [...roster, value];
    writeJson(KEY, next.sort((a, b) => a.usn.localeCompare(b.usn)));
    emitChange('roster');
    return value;
  },

  setStatus(usns, status, remarks = '') {
    const ids = new Set(usns);
    writeJson(KEY, load().map((s) => (ids.has(s.usn) ? { ...s, status, remarks: status === 'Withheld' ? remarks : '' } : s)));
    emitChange('roster');
  },

  remove(usn) {
    writeJson(KEY, load().filter((s) => s.usn !== usn));
    emitChange('roster');
  },
};
