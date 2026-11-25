import { platformApi } from './api/platformApi.js';

export const ACTIVITY_CATEGORIES = ['exam', 'question-bank', 'candidate', 'attempt', 'user', 'account', 'settings', 'portal'];

const ROLE = { super_admin: 'super-admin', admin: 'admin', student: 'student' };

/**
 * Activity trail in Supabase (activity_logs; append-only). Server RPCs record
 * their own actions; portal actions are added through record_activity().
 * Visibility follows RLS: super admin all, institution admin their
 * institution, subject admins only their own actions.
 */
export const activityLogService = {
  /** Fire-and-forget; never blocks or fails the action being logged. */
  log({ action, category = 'portal', target = '', details = '' }) {
    platformApi.record(action, { category, target, details });
  },

  async list({ limit = 200 } = {}) {
    const rows = await platformApi.activity({ limit });
    return rows.map((e) => ({ ...e, actor: { ...e.actor, role: ROLE[e.actor.role] || e.actor.role } }));
  },
};
