import { readJson, writeJson, emitChange } from './localStore.js';
import { examRandomizerService } from './examRandomizerService.js';
import { questionBankService } from './questionBankService.js';
import { studentRosterService } from './studentRosterService.js';
import { activityLogService } from './activityLogService.js';
import { platformService } from './platformService.js';
import { assignPatternToStudent } from '../utils/randomizationEngine.js';
import { notifications as studentCirculars } from '../data/studentMockData.js';
import { USER_ROLES } from '../utils/constants.js';

const READ_KEY = 'examsphere_notifications_read_v1';
const PREFS_KEY = 'examsphere_profile_prefs_v1';

function userKey(user) {
  return user?.id || user?.identifier || 'anonymous';
}

function studentNotifications(user) {
  const state = examRandomizerService.getExamState();
  const identity = String(user?.usn || user?.identifier || '').trim().toUpperCase();
  const items = [];
  const settings = platformService.getSettings();

  if (settings.maintenanceNotice) {
    items.push({ id: `maint-${settings.maintenanceNotice.length}`, tone: 'warning', title: 'Platform notice', message: settings.maintenanceNotice, at: null, link: '/student' });
  }
  if (identity && !studentRosterService.isEligible(identity)) {
    items.push({ id: `withheld-${identity}`, tone: 'danger', title: 'Examination access withheld', message: 'Your eligibility for the current examination has been withheld. Contact the examination office.', at: null, link: '/student?tab=exams' });
  } else if (state.isPublished) {
    const pattern = assignPatternToStudent(identity);
    items.push({
      id: `published-${state.meta.id}-${state.publishedAt}`,
      tone: 'info',
      title: `${state.meta.courseCode} examination is open`,
      message: `${state.meta.courseTitle} is available${pattern && settings.showPatternToCandidates ? ` (assigned Pattern ${pattern})` : ''}. Read the instructions before you start.`,
      at: state.publishedAt,
      link: '/student?tab=exams',
    });
  }
  const attempt = identity ? examRandomizerService.getStudentAttempt(identity) : null;
  if (attempt) {
    items.push({
      id: `result-${attempt.attemptId}`,
      tone: 'success',
      title: settings.resultDisplay === 'withheld' ? 'Submission recorded' : 'Result available',
      message: settings.resultDisplay === 'withheld'
        ? `Your ${attempt.courseCode} answer sheet was submitted. Results will be published by the examination office.`
        : `${attempt.courseCode}: ${attempt.score} / ${attempt.maxScore} (${attempt.percentage}%).`,
      at: attempt.submittedAt,
      link: '/student?tab=results',
    });
  }
  studentCirculars.forEach((n) => items.push({ id: `circular-${n.id}`, tone: 'neutral', title: n.title, message: n.message, at: null, timeLabel: n.time, link: '/student?tab=notifications' }));
  return items;
}

function adminNotifications(user) {
  const prefs = { submissionAlerts: true, publicationAlerts: true, ...(readJson(PREFS_KEY, {})[userKey(user)] || {}) };
  const state = examRandomizerService.getExamState();
  const items = [];
  const bankSize = questionBankService.getQuestions().length;
  const attempts = examRandomizerService.listAttempts();
  const active = attempts.filter((a) => a.status === 'active');
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const withheld = studentRosterService.list().filter((s) => s.status === 'Withheld');

  if (!state.isPublished && prefs.publicationAlerts) {
    items.push({ id: `draft-${state.lastGeneratedAt}`, tone: 'warning', title: `${state.meta.courseCode} is in draft`, message: 'Candidates cannot start the examination until it is published.', at: state.lastGeneratedAt, link: '/admin/exams' });
  }
  if (state.verificationReport && !state.verificationReport.isValid) {
    items.push({ id: `verify-${state.lastGeneratedAt}`, tone: 'danger', title: 'Pattern verification failed', message: 'Regenerate the 10 patterns before publishing.', at: state.lastGeneratedAt, link: '/admin/exams' });
  }
  if (bankSize < 25) {
    items.push({ id: `bank-${bankSize}`, tone: 'warning', title: 'Question bank below 25 questions', message: `Only ${bankSize} questions are available; an examination needs 25.`, at: null, link: '/admin/questions' });
  }
  if (active.length) {
    items.push({ id: `active-${active.length}-${active[0].attemptId}`, tone: 'info', title: `${active.length} attempt${active.length === 1 ? '' : 's'} in progress`, message: 'Candidates are currently writing the examination.', at: active[0].startedAt, link: '/admin/results' });
  }
  if (prefs.submissionAlerts) submitted.slice(0, 5).forEach((a) => items.push({ id: `sub-${a.attemptId}`, tone: 'success', title: `Answer sheet submitted · ${a.studentIdentifier}`, message: `${a.paperCode}: ${a.result?.score ?? '—'} / ${a.result?.maxScore ?? '—'}`, at: a.submittedAt, link: '/admin/results' }));
  if (withheld.length) {
    items.push({ id: `withheld-${withheld.length}`, tone: 'neutral', title: `${withheld.length} candidate${withheld.length === 1 ? '' : 's'} withheld`, message: 'Withheld candidates cannot start the examination.', at: null, link: '/admin/students' });
  }
  return items;
}

function superAdminNotifications() {
  const items = [];
  const suspended = platformService.listInstitutions().filter((i) => i.status === 'Suspended');
  const settings = platformService.getSettings();
  if (settings.maintenanceNotice) {
    items.push({ id: `maint-${settings.maintenanceNotice.length}`, tone: 'warning', title: 'Maintenance notice is live', message: settings.maintenanceNotice, at: null, link: '/super-admin/settings' });
  }
  if (suspended.length) {
    items.push({ id: `susp-${suspended.length}`, tone: 'warning', title: `${suspended.length} institution${suspended.length === 1 ? '' : 's'} suspended`, message: suspended.map((i) => i.code).join(', '), at: null, link: '/super-admin/organizations' });
  }
  activityLogService.list().slice(0, 8).forEach((e) => items.push({ id: `log-${e.id}`, tone: e.severity === 'warning' ? 'warning' : 'neutral', title: e.action, message: `${e.actor.name}${e.target ? ` · ${e.target}` : ''}`, at: e.at, link: '/super-admin/activity' }));
  return items;
}

/** Role-aware notifications derived from live application state. */
export const notificationService = {
  list(user) {
    if (!user) return [];
    const raw = user.role === USER_ROLES.STUDENT ? studentNotifications(user)
      : user.role === USER_ROLES.SUPER_ADMIN ? superAdminNotifications()
        : adminNotifications(user);
    const read = new Set(readJson(READ_KEY, {})[userKey(user)] || []);
    return raw.map((n) => ({ ...n, read: read.has(n.id) }));
  },

  unreadCount(user) {
    return this.list(user).filter((n) => !n.read).length;
  },

  markRead(user, ids) {
    const all = readJson(READ_KEY, {});
    const key = userKey(user);
    all[key] = [...new Set([...(all[key] || []), ...ids])].slice(-300);
    writeJson(READ_KEY, all);
    emitChange('notifications');
  },
};
