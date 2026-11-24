import { readJson, writeJson, makeId, emitChange } from './localStore.js';
import { INSTITUTION } from '../utils/constants.js';

const USERS_KEY = 'examsphere_platform_users_v1';
const SETTINGS_KEY = 'examsphere_platform_settings_v1';
// Retired multi-institution registry (sample tenants); purged on first load.
const LEGACY_INSTITUTIONS_KEY = 'examsphere_institutions_v1';
const DRAIT_ID = 'inst-drait';

const SEED_USERS = [
  { id: 'usr-admin-1', name: 'Dr. Ramesh B.', email: 'admin@drait.edu.in', role: 'admin', staffId: 'ADM-8942', status: 'Active', createdAt: '2025-06-02T09:00:00.000Z' },
  { id: 'usr-admin-2', name: 'Prof. Kavitha S.', email: 'kavitha.s@drait.edu.in', role: 'admin', staffId: 'ADM-9120', status: 'Active', createdAt: '2025-08-19T09:00:00.000Z' },
  { id: 'usr-root-1', name: 'Platform Administrator', email: 'root@examsphere.io', role: 'super-admin', staffId: null, status: 'Active', createdAt: '2025-05-01T09:00:00.000Z' },
];

export const DEFAULT_SETTINGS = {
  supportEmail: 'coe@drait.edu.in',
  helplinePhone: '080-23211505',
  resultDisplay: 'immediate',      // 'immediate' | 'withheld'
  timerWarningMinutes: 5,
  showPatternToCandidates: true,
  maintenanceNotice: '',
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * One-time cleanup of demo data saved by the earlier multi-institution build:
 * drops the sample institution registry and any administrator who belonged to
 * an institution other than Dr. AIT. Dr. AIT accounts are kept unchanged.
 */
function purgeLegacyInstitutionData() {
  try {
    globalThis.localStorage?.removeItem(LEGACY_INSTITUTIONS_KEY);
  } catch {
    // storage unavailable
  }
  const saved = readJson(USERS_KEY, null);
  if (!Array.isArray(saved)) return;
  const kept = saved
    .filter((u) => !u.institutionId || u.institutionId === DRAIT_ID)
    .map(({ institutionId: _drop, ...rest }) => rest);
  if (kept.length !== saved.length || saved.some((u) => 'institutionId' in u)) writeJson(USERS_KEY, kept);
}
purgeLegacyInstitutionData();

/** Super-admin data for the Dr. AIT deployment: staff accounts and platform settings. */
export const platformService = {
  /** The single institution this deployment serves (read-only). */
  getInstitution() {
    return { id: DRAIT_ID, ...INSTITUTION };
  },

  listUsers() {
    const saved = readJson(USERS_KEY, null);
    if (Array.isArray(saved)) return saved;
    writeJson(USERS_KEY, SEED_USERS);
    return SEED_USERS.map((u) => ({ ...u }));
  },

  saveUser(input) {
    const errors = {};
    const name = String(input.name ?? '').trim();
    const email = String(input.email ?? '').trim().toLowerCase();
    const role = input.role === 'super-admin' ? 'super-admin' : 'admin';
    if (name.length < 2) errors.name = 'Name is required.';
    if (!EMAIL.test(email)) errors.email = 'Enter a valid email address.';
    else if (role === 'admin' && !email.endsWith(`@${INSTITUTION.emailDomain}`)) {
      errors.email = `Examination office administrators must use a @${INSTITUTION.emailDomain} address.`;
    }
    const all = this.listUsers();
    if (all.some((u) => u.email === email && u.id !== input.id)) errors.email = 'An account with this email already exists.';
    if (Object.keys(errors).length) {
      const error = new Error('Please correct the highlighted fields.');
      error.fieldErrors = errors;
      throw error;
    }
    const record = {
      id: input.id || makeId('usr'),
      name, email, role,
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
