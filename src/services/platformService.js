import { readJson, writeJson, makeId, emitChange } from './localStore.js';

const INSTITUTIONS_KEY = 'examsphere_institutions_v1';
const USERS_KEY = 'examsphere_platform_users_v1';
const SETTINGS_KEY = 'examsphere_platform_settings_v1';

const SEED_INSTITUTIONS = [
  { id: 'inst-drait', code: '1DA', name: 'Dr. Ambedkar Institute of Technology', city: 'Bengaluru', domain: 'drait.edu.in', contactEmail: 'coe@drait.edu.in', status: 'Active', createdAt: '2025-06-02T09:00:00.000Z' },
  { id: 'inst-nit', code: 'NIT', name: 'National Institute of Technology (Sample)', city: 'Surathkal', domain: 'nit.example.edu', contactEmail: 'exams@nit.example.edu', status: 'Active', createdAt: '2025-10-14T09:00:00.000Z' },
  { id: 'inst-speb', code: 'SPEB', name: 'State Polytechnic Examination Board (Sample)', city: 'Mysuru', domain: 'speb.example.gov', contactEmail: 'coe@speb.example.gov', status: 'Suspended', createdAt: '2026-01-10T09:00:00.000Z' },
];

const SEED_USERS = [
  { id: 'usr-admin-1', name: 'Dr. Ramesh B.', email: 'admin@drait.edu.in', role: 'admin', institutionId: 'inst-drait', staffId: 'ADM-8942', status: 'Active', createdAt: '2025-06-02T09:00:00.000Z' },
  { id: 'usr-admin-2', name: 'Prof. Kavitha S.', email: 'kavitha.s@drait.edu.in', role: 'admin', institutionId: 'inst-drait', staffId: 'ADM-9120', status: 'Active', createdAt: '2025-08-19T09:00:00.000Z' },
  { id: 'usr-admin-3', name: 'Exam Cell Coordinator', email: 'exams@nit.example.edu', role: 'admin', institutionId: 'inst-nit', staffId: 'NIT-001', status: 'Disabled', createdAt: '2025-10-14T09:00:00.000Z' },
  { id: 'usr-root-1', name: 'Platform Administrator', email: 'root@examsphere.io', role: 'super-admin', institutionId: null, staffId: null, status: 'Active', createdAt: '2025-05-01T09:00:00.000Z' },
];

export const DEFAULT_SETTINGS = {
  supportEmail: 'coe@drait.edu.in',
  helplinePhone: '080-23211505',
  resultDisplay: 'immediate',      // 'immediate' | 'withheld'
  timerWarningMinutes: 5,
  showPatternToCandidates: true,
  maintenanceNotice: '',
};

function list(key, seed) {
  const saved = readJson(key, null);
  if (Array.isArray(saved)) return saved;
  writeJson(key, seed);
  return seed.map((x) => ({ ...x }));
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Super-admin data: institutions, administrator accounts, platform settings. */
export const platformService = {
  listInstitutions() {
    return list(INSTITUTIONS_KEY, SEED_INSTITUTIONS);
  },

  saveInstitution(input) {
    const errors = {};
    const code = String(input.code ?? '').trim().toUpperCase();
    const name = String(input.name ?? '').trim();
    const domain = String(input.domain ?? '').trim().toLowerCase();
    const contactEmail = String(input.contactEmail ?? '').trim().toLowerCase();
    if (!/^[A-Z0-9]{2,10}$/.test(code)) errors.code = 'Use 2–10 letters or digits.';
    if (name.length < 3) errors.name = 'Institution name is required.';
    if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) errors.domain = 'Enter a domain such as college.edu.in.';
    if (contactEmail && !EMAIL.test(contactEmail)) errors.contactEmail = 'Enter a valid email address.';
    const all = this.listInstitutions();
    if (all.some((i) => i.code === code && i.id !== input.id)) errors.code = 'This code is already in use.';
    if (Object.keys(errors).length) {
      const error = new Error('Please correct the highlighted fields.');
      error.fieldErrors = errors;
      throw error;
    }
    const record = {
      id: input.id || makeId('inst'),
      code, name, domain, contactEmail,
      city: String(input.city ?? '').trim(),
      status: input.status === 'Suspended' ? 'Suspended' : 'Active',
      createdAt: input.createdAt || new Date().toISOString(),
    };
    writeJson(INSTITUTIONS_KEY, input.id ? all.map((i) => (i.id === input.id ? record : i)) : [...all, record]);
    emitChange('institutions');
    return record;
  },

  listUsers() {
    return list(USERS_KEY, SEED_USERS);
  },

  saveUser(input) {
    const errors = {};
    const name = String(input.name ?? '').trim();
    const email = String(input.email ?? '').trim().toLowerCase();
    const role = input.role === 'super-admin' ? 'super-admin' : 'admin';
    const institutionId = role === 'admin' ? input.institutionId || '' : null;
    if (name.length < 2) errors.name = 'Name is required.';
    if (!EMAIL.test(email)) errors.email = 'Enter a valid email address.';
    if (role === 'admin' && !institutionId) errors.institutionId = 'Select the institution this admin manages.';
    const all = this.listUsers();
    if (all.some((u) => u.email === email && u.id !== input.id)) errors.email = 'An account with this email already exists.';
    if (Object.keys(errors).length) {
      const error = new Error('Please correct the highlighted fields.');
      error.fieldErrors = errors;
      throw error;
    }
    const record = {
      id: input.id || makeId('usr'),
      name, email, role, institutionId,
      staffId: role === 'admin' ? String(input.staffId ?? '').trim().toUpperCase() || null : null,
      status: input.status === 'Disabled' ? 'Disabled' : 'Active',
      createdAt: input.createdAt || new Date().toISOString(),
    };
    writeJson(USERS_KEY, input.id ? all.map((u) => (u.id === input.id ? record : u)) : [...all, record]);
    emitChange('users');
    return record;
  },

  getSettings() {
    return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) };
  },

  saveSettings(input) {
    const minutes = Number(input.timerWarningMinutes);
    const errors = {};
    if (!EMAIL.test(String(input.supportEmail ?? '').trim())) errors.supportEmail = 'Enter a valid email address.';
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 30) errors.timerWarningMinutes = 'Choose between 1 and 30 minutes.';
    if (Object.keys(errors).length) {
      const error = new Error('Please correct the highlighted fields.');
      error.fieldErrors = errors;
      throw error;
    }
    const value = {
      supportEmail: String(input.supportEmail).trim().toLowerCase(),
      helplinePhone: String(input.helplinePhone ?? '').trim(),
      resultDisplay: input.resultDisplay === 'withheld' ? 'withheld' : 'immediate',
      timerWarningMinutes: minutes,
      showPatternToCandidates: Boolean(input.showPatternToCandidates),
      maintenanceNotice: String(input.maintenanceNotice ?? '').trim().slice(0, 240),
    };
    writeJson(SETTINGS_KEY, value);
    emitChange('settings');
    return value;
  },
};
