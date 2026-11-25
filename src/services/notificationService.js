import { readJson, writeJson, emitChange } from './localStore.js';
import { select } from './api/core.js';
import { examsApi } from './api/examsApi.js';
import { studentExamApi } from './api/studentExamApi.js';
import { questionsApi } from './api/questionsApi.js';
import { activityLogService } from './activityLogService.js';
import { getAdminScope } from './adminScope.js';
import { USER_ROLES } from '../utils/constants.js';

// Which notifications a user has opened is a UI preference: browser storage is fine.
const READ_KEY = 'examsphere_notifications_read_v1';
const PREFS_KEY = 'examsphere_profile_prefs_v1';
const userKey = (user) => user?.id || user?.identifier || 'anonymous';

async function announcements(link) {
  const rows = await select('announcements', 'id,title,body,priority,issuer,published_at', (q) => q.order('published_at', { ascending: false }).limit(10)).catch(() => []);
  return rows.map((a) => ({ id: `ann-${a.id}`, tone: a.priority === 'Urgent' ? 'danger' : 'neutral', title: a.title, message: a.body, at: a.published_at, link }));
}

async function studentNotifications(settings) {
  const items = [];
  if (settings.maintenanceNotice) items.push({ id: `maint-${settings.maintenanceNotice.length}`, tone: 'warning', title: 'Platform notice', message: settings.maintenanceNotice, at: null, link: '/student' });
  const exams = await studentExamApi.myExams();
  for (const e of exams) {
    if (e.availability === 'live' || e.availability === 'in_progress') {
      items.push({
        id: `open-${e.examId}`, tone: 'info', title: `${e.courseCode} examination is open`,
        message: `${e.courseTitle}${e.patternLabel && settings.showPatternToCandidates ? ` (Pattern ${e.patternLabel})` : ''}. Closes ${new Date(e.windowEnd).toLocaleString('en-IN')}.`,
        at: e.windowStart, link: '/student?tab=exams',
      });
    }
    if (e.attemptStatus === 'submitted' || e.attemptStatus === 'auto_submitted') {
      items.push({
        id: `result-${e.attemptId}`, tone: 'success', title: e.score === null ? 'Submission recorded' : 'Result available',
        message: e.score === null ? `Your ${e.courseCode} answer sheet was submitted. Results will be published by the examination office.` : `${e.courseCode}: ${e.score} / ${e.maxScore} (${e.percentage}%).`,
        at: null, link: '/student?tab=results',
      });
    }
  }
  return [...items, ...(await announcements('/student?tab=notifications'))];
}

async function adminNotifications(user, settings) {
  const prefs = { submissionAlerts: true, publicationAlerts: true, ...(readJson(PREFS_KEY, {})[userKey(user)] || {}) };
  const scope = getAdminScope(user);
  const [exams, bank] = await Promise.all([examsApi.list(), questionsApi.list()]);
  const items = [];
  if (settings.maintenanceNotice) items.push({ id: `maint-${settings.maintenanceNotice.length}`, tone: 'warning', title: 'Platform notice', message: settings.maintenanceNotice, at: null, link: '/admin' });
  for (const code of scope.subjectCodes.filter((c) => scope.scoped && !exams.some((e) => e.courseCode === c))) {
    items.push({ id: `create-${code}`, tone: 'info', title: `Create the ${scope.label} examination`, message: 'Select 25 questions to generate patterns A–J.', at: null, link: `/admin/exams?exam=${code}` });
  }
  for (const e of exams) {
    const q = `?exam=${e.courseCode}`;
    if (e.status === 'draft' && prefs.publicationAlerts) items.push({ id: `draft-${e.id}-${e.patternsGeneratedAt}`, tone: 'warning', title: `${e.courseCode} is in draft`, message: 'Candidates cannot start the examination until it is published.', at: e.createdAt, link: `/admin/exams${q}` });
    if (e.status === 'draft' && (e.patternsStale || e.patternCount !== 10)) items.push({ id: `patterns-${e.id}-${e.questionCount}`, tone: 'danger', title: `${e.courseCode}: patterns not generated`, message: 'Generate the 10 patterns before publishing.', at: null, link: `/admin/exams${q}` });
    if (e.activeAttempts) items.push({ id: `active-${e.id}-${e.activeAttempts}`, tone: 'info', title: `${e.activeAttempts} attempt${e.activeAttempts === 1 ? '' : 's'} in progress · ${e.courseCode}`, message: 'Candidates are currently writing the examination.', at: null, link: `/admin/results${q}` });
  }
  if (bank.length < 25) items.push({ id: `bank-${bank.length}`, tone: 'warning', title: 'Question bank below 25 questions', message: `Only ${bank.length} questions are available; an examination needs 25.`, at: null, link: '/admin/questions' });
  if (prefs.submissionAlerts) {
    const recent = await examsApi.recentSubmissions(exams.map((e) => e.id), 5);
    recent.forEach((a) => items.push({ id: `sub-${a.attemptId}`, tone: 'success', title: `Answer sheet submitted · ${a.usn}`, message: `${a.paperCode}: ${a.score ?? '—'} / ${a.maxScore ?? '—'}`, at: a.submittedAt, link: `/admin/results?exam=${exams.find((e) => e.id === a.examId)?.courseCode || ''}` }));
  }
  return [...items, ...(await announcements('/admin/notifications'))];
}

async function superAdminNotifications(settings) {
  const items = [];
  if (settings.maintenanceNotice) items.push({ id: `maint-${settings.maintenanceNotice.length}`, tone: 'warning', title: 'Maintenance notice is live', message: settings.maintenanceNotice, at: null, link: '/super-admin/settings' });
  const log = await activityLogService.list({ limit: 8 });
  log.forEach((e) => items.push({ id: `log-${e.id}`, tone: e.severity === 'warning' ? 'warning' : 'neutral', title: e.action, message: `${e.actor.name}${e.target ? ` · ${e.target}` : ''}`, at: e.at, link: '/super-admin/activity' }));
  return items;
}

/** Role-aware notifications derived from live Supabase data. */
export const notificationService = {
  async load(user, settings) {
    if (!user) return [];
    const raw = user.role === USER_ROLES.STUDENT ? await studentNotifications(settings)
      : user.role === USER_ROLES.SUPER_ADMIN ? await superAdminNotifications(settings)
        : await adminNotifications(user, settings);
    const read = new Set(readJson(READ_KEY, {})[userKey(user)] || []);
    return raw.map((n) => ({ ...n, read: read.has(n.id) }));
  },

  markRead(user, ids) {
    const all = readJson(READ_KEY, {});
    const key = userKey(user);
    all[key] = [...new Set([...(all[key] || []), ...ids])].slice(-300);
    writeJson(READ_KEY, all);
    emitChange('notifications');
  },
};
