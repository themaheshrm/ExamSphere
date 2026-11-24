import { readJson, writeJson, makeId, emitChange } from './localStore.js';

const KEY = 'examsphere_activity_log_v1';
const MAX_ENTRIES = 500;

export const ACTIVITY_CATEGORIES = ['exam', 'question-bank', 'candidate', 'attempt', 'institution', 'user', 'settings'];

function describeActor(actor) {
  if (!actor) return { name: 'System', role: 'system', identifier: null };
  return {
    name: actor.name || actor.email || 'Unknown user',
    role: actor.role || 'unknown',
    identifier: actor.usn || actor.staffId || actor.email || null,
  };
}

/** Append-only client activity trail shown to administrators. */
export const activityLogService = {
  log({ action, category = 'exam', actor, target = '', details = '', severity = 'info' }) {
    const entry = {
      id: makeId('log'),
      at: new Date().toISOString(),
      action,
      category,
      target,
      details,
      severity,
      actor: describeActor(actor),
    };
    const entries = readJson(KEY, []);
    writeJson(KEY, [entry, ...entries].slice(0, MAX_ENTRIES));
    emitChange('activity');
    return entry;
  },

  list() {
    const entries = readJson(KEY, []);
    return Array.isArray(entries) ? entries : [];
  },
};
