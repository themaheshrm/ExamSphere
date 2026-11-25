import { rpc, select } from './core.js';

export const DEFAULT_SETTINGS = {
  supportEmail: 'coe@drait.edu.in',
  helplinePhone: '080-23211505',
  resultDisplay: 'immediate',
  timerWarningMinutes: 5,
  showPatternToCandidates: true,
  maintenanceNotice: '',
};

const toSettings = (r) => (r ? {
  supportEmail: r.support_email,
  helplinePhone: r.helpline_phone,
  resultDisplay: r.result_display,
  timerWarningMinutes: r.timer_warning_minutes,
  showPatternToCandidates: r.show_pattern_to_candidates,
  maintenanceNotice: r.maintenance_notice || '',
  updatedAt: r.updated_at,
} : { ...DEFAULT_SETTINGS });

export const platformApi = {
  async settings() {
    const rows = await select('platform_settings', '*', (q) => q.limit(1));
    return toSettings(rows[0]);
  },

  async saveSettings(input) {
    return toSettings(await rpc('save_platform_settings', { p_settings: input }));
  },

  async institution() {
    const rows = await select('institutions', '*', (q) => q.eq('code', '1DA').limit(1));
    return rows[0] || null;
  },

  async activity({ limit = 200 } = {}) {
    const rows = await select('portal_activity', '*', (q) => q.order('created_at', { ascending: false }).limit(limit));
    return rows.map((r) => ({
      id: r.id,
      at: r.created_at,
      action: r.action,
      category: r.details?.category || r.entity_type || 'system',
      target: r.details?.target || '',
      details: r.details?.details || '',
      severity: /REVOKED|VOID|FORCE|DEACTIVAT/i.test(r.action) ? 'warning' : 'info',
      actor: { name: r.actor_name || 'System', role: r.actor_role || 'system', identifier: r.actor_identifier || null },
      userId: r.user_id,
    }));
  },

  /** Best effort: activity logging never blocks the action that caused it. */
  record(action, { category = 'portal', target = '', details = '' } = {}) {
    return rpc('record_activity', { p_action: action, p_category: category, p_target: String(target || ''), p_details: String(details || '') }).catch(() => {});
  },

  /** Circulars visible to the signed-in user (RLS: institution, audience, department, not expired). */
  async announcements(limit = 10) {
    const rows = await select('announcements', 'id,title,body,priority,issuer,published_at', (q) => q.order('published_at', { ascending: false }).limit(limit));
    return rows.map((a) => ({
      id: a.id, title: a.title, content: a.body, priority: a.priority, issuer: a.issuer || 'Office of the Controller of Examinations',
      at: a.published_at, date: new Date(a.published_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    }));
  },

  overview: () => rpc('get_platform_overview', {}, { idempotent: true }),
  adminDashboard: () => rpc('get_admin_dashboard', {}, { idempotent: true }),

  async staffCounts() {
    const rows = await select('profiles', 'id,role,is_active', (q) => q.in('role', ['admin', 'super_admin']));
    return { total: rows.length, active: rows.filter((r) => r.is_active !== false).length };
  },
};
