/**
 * End-to-end examination engine test: the REAL frontend API modules
 * (src/services/api/*) against a local stand-in for Supabase built from the
 * REAL migrations 001–013, seed, RLS policies, RPCs and Edge Function code
 * (tests/helpers/localSupabase.mjs). Covers all four roles and multi-user /
 * multi-device behaviour.
 *
 * Needs a DISPOSABLE PostgreSQL (superuser) via PG* env vars and the `pg`
 * package; skipped otherwise. Never point it at a real project.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const hasPg = (() => { try { require.resolve('pg'); return true; } catch { return false; } })();
const dbReady = hasPg && spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', 'SELECT 1'], { env: { PGUSER: 'postgres', ...process.env } }).status === 0;
// CI sets REQUIRE_DB=1 so a missing database fails instead of silently skipping.
const skip = dbReady || process.env.REQUIRE_DB ? false : 'needs a local PostgreSQL (PGHOST/PGUSER) and the pg package';

const PASSWORD = 'Local-Test-Passw0rd!';
const STUDENTS = ['CS001', 'CS002', 'CS003', 'CS004', 'CS005', 'CS006', '1DA22CS001', '1DA22CS002'];

test('examination engine on Supabase: four roles, server patterns, attempts, grading, isolation', { skip, timeout: 120000 }, async (t) => {
  const { startLocalSupabase, ANON_KEY } = await import('./helpers/localSupabase.mjs');
  const env = await startLocalSupabase({ database: 'examsphere_engine_it' });
  t.after(() => env.close());
  process.env.VITE_SUPABASE_URL = env.url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;

  const { supabase } = await import('../src/services/supabase.js');
  const { questionsApi } = await import('../src/services/api/questionsApi.js');
  const { examsApi, PATTERN_LABELS } = await import('../src/services/api/examsApi.js');
  const { rosterApi } = await import('../src/services/api/rosterApi.js');
  const { studentExamApi } = await import('../src/services/api/studentExamApi.js');
  const { platformApi } = await import('../src/services/api/platformApi.js');
  const { createClient } = require('@supabase/supabase-js');

  // ── accounts ──────────────────────────────────────────────────────────────
  await env.createSuperAdmin({ email: 'root@examsphere.io', name: 'Platform Administrator', password: PASSWORD });
  // Legacy institution-wide admin kept as an existing account (no subject); the
  // examination office work below is done by the super admin and subject admins.
  await env.createAdmin({ staffId: 'ADM-8942', name: 'Dr. Ramesh B.', password: PASSWORD, email: 'admin@drait.edu.in' });
  await env.createAdmin({ staffId: 'ADMIN001', name: 'Admin 01', password: PASSWORD, subjectCode: '22CS302' });
  await env.createAdmin({ staffId: 'ADMIN003', name: 'Admin 03', password: PASSWORD, subjectCode: '22CS403' });
  for (const usn of STUDENTS) await env.createStudent({ usn, name: `Student ${usn}`, password: PASSWORD });

  const signIn = async (email) => {
    await supabase.auth.signOut().catch(() => {});
    const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
    assert.ifError(error);
  };
  const student = (usn) => `${usn.toLowerCase()}@drait.edu.in`;
  /** A second, independent browser/device for the same or another account. */
  const device = async (email) => {
    const c = createClient(env.url, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
    assert.ifError(error);
    return c;
  };

  let examId;
  let patterns;
  let master;

  await t.test('super admin: question bank CRUD and import (server-validated, Dr. AIT institution passed explicitly)', async () => {
    await signIn('root@examsphere.io');
    const institutionId = env.institutionId;
    const bank = await questionsApi.list();
    assert.ok(bank.length >= 150, `seeded bank visible (${bank.length})`);
    const saved = await questionsApi.save({ institutionId, subject: 'Operating Systems', topic: 'Scheduling', statement: 'Integration test: which scheduler is non-preemptive?', options: ['FCFS', 'Round robin', 'SRTF', 'Preemptive priority'], correctOption: 0, difficulty: 'Easy', marks: 2, negativeMarks: 0 });
    assert.equal(saved.subjectCode, '22CS403');
    const edited = await questionsApi.save({ subject: '22CS403', topic: 'CPU Scheduling', statement: saved.statement, options: saved.options, correctOption: 0, difficulty: 'Medium', marks: 2, negativeMarks: 0 }, saved.id);
    assert.equal(edited.topic, 'CPU Scheduling');
    await assert.rejects(questionsApi.save({ institutionId, subject: '22CS403', topic: 'x', statement: saved.statement, options: ['a', 'b', 'c', 'd'], correctOption: 1, difficulty: 'Easy', marks: 2 }), /duplicate|already/i, 'duplicate statement rejected by the server');
    assert.equal(await questionsApi.remove(saved.id), 'deleted');
    const imported = await questionsApi.import('it.csv', [
      { rowNumber: 2, subject: 'Computer Networks', topic: 'Layers', statement: 'Integration import: which layer routes packets?', options: ['Network', 'Transport', 'Session', 'Physical'], correctOption: 0, difficulty: 'Easy', marks: 2 },
      { rowNumber: 3, subject: 'Computer Networks', topic: 'Layers', statement: bank[0].statement, options: ['a', 'b', 'c', 'd'], correctOption: 0, difficulty: 'Easy', marks: 2 },
    ], institutionId);
    assert.equal(imported.imported, 1);
    assert.equal(imported.rejected, 1);
  });

  await t.test('admin creates the OS exam; the server generates and verifies patterns A–J', async () => {
    const subjects = await questionsApi.listSubjects();
    const os = subjects.find((s) => s.code === '22CS403');
    examId = await examsApi.create({ subject: os, title: 'Operating Systems', examDate: '', durationMinutes: 30, semesterLabel: 'Semester 4', instructions: ['Answer all questions.'] });
    const osBank = (await questionsApi.list()).filter((q) => q.subjectCode === '22CS403').sort((a, b) => a.questionNo - b.questionNo);
    await examsApi.setQuestions(examId, osBank.slice(0, 25).map((q) => q.id));
    const report = await examsApi.generatePatterns(examId);
    assert.equal(report.isValid, true, JSON.stringify(report.checks));
    assert.equal((await examsApi.verification(examId)).isValid, true);
    master = await examsApi.masterQuestions(examId);
    assert.equal(master.length, 25);
    patterns = await examsApi.patterns(examId);
    assert.deepEqual(patterns.map((p) => p.label), PATTERN_LABELS);
    assert.equal(new Set(patterns.map((p) => p.questionOrder.join(','))).size, 10, 'ten distinct question orders');
    const byId = Object.fromEntries(master.map((q) => [q.id, q]));
    for (const p of patterns) {
      assert.equal(p.paperCode, `22CS403-${p.label}`);
      assert.equal(p.questions.length, 25);
      assert.equal(new Set(p.questions.map((q) => q.questionId)).size, 25, 'same 25 master questions');
      for (const q of p.questions) {
        const m = byId[q.questionId];
        assert.equal(q.options[q.correctOption], m.options[m.correctOption], `answer mapping preserved (${p.label} Q${q.displayNumber})`);
        assert.deepEqual([...q.options].sort(), [...m.options].sort());
      }
    }
  });

  await t.test('roster, assignment, publish: demo pins CS001–CS006 → A–F', async () => {
    const roster = await rosterApi.list();
    const ids = roster.filter((s) => STUDENTS.includes(s.usn)).map((s) => s.id);
    assert.equal(ids.length, STUDENTS.length);
    assert.ok(roster.find((s) => s.usn === 'CS001').pinned, 'demo account flagged');
    await rosterApi.update(roster.find((s) => s.usn === '1DA22CS001').id, { name: 'Renamed Student', semester: 6, section: 'B' });
    assert.equal((await rosterApi.list()).find((s) => s.usn === '1DA22CS001').section, 'B');
    await examsApi.assign(examId, ids);
    const pub = await examsApi.publish(examId);
    assert.equal(pub.patternsAllocated, STUDENTS.length);
    const cands = await examsApi.candidates(examId);
    const pinned = Object.fromEntries(cands.filter((c) => /^CS00/.test(c.usn)).map((c) => [c.usn, c.patternLabel]));
    assert.deepEqual(pinned, { CS001: 'A', CS002: 'B', CS003: 'C', CS004: 'D', CS005: 'E', CS006: 'F' });
    await assert.rejects(examsApi.generatePatterns(examId), /draft/, 'published papers are frozen');
    await assert.rejects(examsApi.updateConfig(examId, { title: 'x', durationMinutes: 99, instructions: ['x'] }), /draft|Unpublish|updated/i);
  });

  await t.test('subject admin: database-level isolation to their own subject', async () => {
    await signIn('admin001@drait.edu.in');
    assert.ok((await questionsApi.list()).every((q) => q.subjectCode === '22CS302'), 'bank limited to DSA');
    assert.equal((await examsApi.list()).some((e) => e.id === examId), false, 'OS exam invisible');
    assert.deepEqual(await examsApi.candidates(examId), []);
    await assert.rejects(examsApi.generatePatterns(examId));
    await assert.rejects(examsApi.publish(examId));
    await assert.rejects(questionsApi.save({ subject: '22CS403', topic: 'x', statement: 'Subject admin writes into another subject?', options: ['a', 'b', 'c', 'd'], correctOption: 0, difficulty: 'Easy', marks: 2 }));
    await assert.rejects(platformApi.saveSettings({ maintenanceNotice: 'x' }));
    await signIn('admin003@drait.edu.in');
    assert.ok((await examsApi.list()).some((e) => e.id === examId), 'OS admin sees the OS exam');
    assert.equal((await examsApi.candidates(examId)).length, STUDENTS.length);
  });

  let attemptId;
  await t.test('student: start, autosave, resume on another device, concurrent submit, server grading', async () => {
    await signIn(student('CS003'));
    const mine = await studentExamApi.myExams();
    assert.equal(mine.length, 1);
    assert.equal(mine[0].availability, 'live');
    assert.equal(mine[0].patternLabel, 'C');
    const paper = await studentExamApi.start(examId);
    attemptId = paper.attemptId;
    assert.equal(paper.paperCode, '22CS403-C');
    assert.equal(paper.questions.length, 25);
    assert.ok(paper.remainingSeconds > 29 * 60 && paper.remainingSeconds <= 30 * 60, 'server timer');
    const wire = JSON.stringify(paper);
    assert.doesNotMatch(wire, /correct|answer_?key|optionOrder|option_order|questionId/i, 'no key, permutation or question ids reach the student');
    for (const table of ['question_answer_keys', 'exam_pattern_answer_keys', 'result_question_scores', 'admin_attempt_breakdown']) {
      const { data } = await supabase.from(table).select('*');
      assert.equal((data || []).length, 0, `${table} hidden from students`);
    }

    // Answer every question correctly using the admin's key (the student never sees it).
    const key = patterns.find((p) => p.label === 'C').questions;
    const half = key.slice(0, 12).map((q) => ({ displayNumber: q.displayNumber, selectedOption: q.correctOption, visited: true }));
    assert.equal((await studentExamApi.save(attemptId, half, 1000)).status, 'saved');
    assert.equal((await studentExamApi.save(attemptId, [{ displayNumber: 1, selectedOption: (key[0].correctOption + 1) % 4 }], 999)).status, 'stale_ignored', 'reordered save ignored');

    // Same student, second device: the same attempt resumes with saved answers.
    const tablet = await device(student('CS003'));
    const resumed = (await tablet.rpc('start_exam_attempt', { p_exam_id: examId })).data;
    assert.equal(resumed.attemptId, attemptId, 'no second attempt');
    assert.equal(resumed.responses.filter((r) => r.selectedOption !== null).length, 12);
    const rest = key.slice(12).map((q) => ({ displayNumber: q.displayNumber, selectedOption: q.correctOption }));
    assert.equal((await tablet.rpc('save_attempt_responses', { p_attempt_id: attemptId, p_responses: rest, p_client_seq: 2000 })).data.status, 'saved');

    // Concurrent submit from both devices: one grading, identical outcome.
    const [a, b] = await Promise.all([
      studentExamApi.submit(attemptId, null),
      tablet.rpc('submit_exam_attempt', { p_attempt_id: attemptId }).then((r) => r.data),
    ]);
    assert.equal(a.attemptId, attemptId);
    assert.equal(b.attemptId, attemptId);
    assert.equal(a.score, 50);
    assert.equal(a.maxScore, 50);
    assert.equal(a.passed, true);
    await assert.rejects(studentExamApi.save(attemptId, [{ displayNumber: 1, selectedOption: 0 }], 3000), /submitted/, 'no tampering after submission');
    assert.equal((await studentExamApi.myResult(examId)).score, 50);
    assert.equal((await studentExamApi.myExams())[0].availability, 'completed');
    await assert.rejects(studentExamApi.start(examId), /already attempted/, 'no unauthorised retake');
  });

  await t.test('cross-student access is refused', async () => {
    await signIn(student('CS004'));
    await assert.rejects(studentExamApi.paper(attemptId), /not found/i);
    await assert.rejects(studentExamApi.submit(attemptId, null), /not found/i);
    await assert.rejects(studentExamApi.save(attemptId, [{ displayNumber: 1, selectedOption: 0 }], 5000), /not found/i);
    const visible = await examsApi.candidates(examId);
    assert.ok(visible.every((c) => c.usn === 'CS004'), 'a student sees only their own assignment');
    assert.equal((await rosterApi.list()).length, 1, 'and only their own student record');
    const own = await studentExamApi.start(examId);
    assert.equal(own.paperCode, '22CS403-D');
    await studentExamApi.submit(own.attemptId, [{ displayNumber: 1, selectedOption: 0 }]);
  });

  await t.test('admin results: register, per-question breakdown with key, item analysis', async () => {
    await signIn('root@examsphere.io');
    const cands = await examsApi.candidates(examId);
    const cs003 = cands.find((c) => c.usn === 'CS003');
    assert.equal(cs003.attemptStatus, 'submitted');
    assert.equal(cs003.score, 50);
    const sheet = await examsApi.breakdown(cs003.attemptId);
    assert.equal(sheet.length, 25);
    assert.ok(sheet.every((r) => r.isCorrect && r.studentAnswerIndex === r.correctAnswerIndex));
    const items = await examsApi.itemAnalysis(examId);
    assert.equal(items.length, 25);
    assert.equal((await examsApi.report(examId)) !== null, true);
  });

  await t.test('withhold, restore and demo retake', async () => {
    let cands = await examsApi.candidates(examId);
    const target = cands.find((c) => c.usn === '1DA22CS002');
    await examsApi.revoke(target.assignmentId, 'Attendance below 85%');
    await assert.rejects(examsApi.revoke(cands.find((c) => c.usn === 'CS003').assignmentId, 'Too late'), /already attempted/);

    await signIn(student('1DA22CS002'));
    assert.deepEqual(await studentExamApi.myExams(), []);
    assert.equal((await studentExamApi.withheld())[0].reason, 'Attendance below 85%');
    await assert.rejects(studentExamApi.start(examId), /not assigned/);

    await signIn('root@examsphere.io');
    await examsApi.assign(examId, [target.studentId]);
    cands = await examsApi.candidates(examId);
    assert.equal(cands.find((c) => c.usn === '1DA22CS002').assignmentStatus, 'assigned');
    assert.ok(cands.find((c) => c.usn === '1DA22CS002').patternLabel, 'restored candidate re-allocated a pattern');
    await examsApi.grantRetake(cands.find((c) => c.usn === 'CS003').assignmentId, 'Demo account reset: fresh attempt allowed by the administrator.');

    await signIn(student('CS003'));
    assert.equal((await studentExamApi.myExams())[0].availability, 'live');
    const second = await studentExamApi.start(examId);
    assert.notEqual(second.attemptId, attemptId);
    assert.equal(second.paperCode, '22CS403-C', 'pattern unchanged after reset');
  });

  await t.test('Admin Management (manage-admins / create-student on the real schema): subject admin and student creation', async () => {
    await signIn('root@examsphere.io');
    const call = async (fn, body) => {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) {
        const detail = await error.context?.json?.().catch(() => null);
        return { error: detail?.error || error.message, fieldErrors: detail?.fieldErrors, status: error.context?.status };
      }
      return data;
    };
    const created = await call('manage-admins', { action: 'create', name: 'OS Examiner', adminId: 'ADMIN006', email: '', adminType: 'subject', subjectCode: '22CS502', status: 'Inactive' });
    assert.ok(created.admin, JSON.stringify(created));
    const [profile] = await env.sql('SELECT role::text, institution_id, staff_id, email, is_active FROM public.profiles WHERE id = $1', [created.admin.id]);
    assert.deepEqual([profile.role, profile.institution_id, profile.staff_id, profile.email, profile.is_active],
      ['admin', env.institutionId, 'ADMIN006', 'admin006@drait.edu.in', false], 'admin profile with the Dr. AIT institution (no profiles_scoped_role_chk error)');
    const [link] = await env.sql("SELECT s.code FROM public.subject_admins sa JOIN public.subjects s ON s.id = sa.subject_id WHERE sa.admin_id = $1", [created.admin.id]);
    assert.equal(link.code, '22CS502', 'subject_admins row written → database-level subject scope');
    const refused = await call('manage-admins', { action: 'create', name: 'Inst Admin', adminId: 'ADMIN012', email: '', adminType: 'institution', subjectCode: '', status: 'Active' });
    assert.equal(refused.status, 422, 'Institution Admin cannot be created');

    const student = await call('create-student', { name: 'New Student', usn: '1DA22CS777', mobile: '+91 90000 00777', semester: 5, section: 'B' });
    assert.ok(student.credentials, JSON.stringify(student));
    const [sp] = await env.sql('SELECT role::text, institution_id, usn FROM public.profiles WHERE usn = $1', ['1DA22CS777']);
    assert.deepEqual([sp.role, sp.institution_id, sp.usn], ['student', env.institutionId, '1DA22CS777']);

    await signIn('admin001@drait.edu.in');
    assert.equal((await call('create-student', { name: 'Other', usn: '1DA22CS778', mobile: '+91 90000 00778', semester: 5, section: 'B' })).status, 403, 'subject admin cannot create students');
  });

  await t.test('super admin: platform settings and overview; settings readable by all', async () => {
    await signIn('admin001@drait.edu.in');
    await assert.rejects(platformApi.saveSettings({ maintenanceNotice: 'nope' }));
    await signIn('root@examsphere.io');
    const saved = await platformApi.saveSettings({ ...(await platformApi.settings()), maintenanceNotice: 'Maintenance on Sunday', timerWarningMinutes: 10 });
    assert.equal(saved.timerWarningMinutes, 10);
    assert.ok(await platformApi.overview());
    assert.ok((await examsApi.list()).some((e) => e.id === examId), 'super admin sees every exam');
    await signIn(student('CS005'));
    assert.equal((await platformApi.settings()).maintenanceNotice, 'Maintenance on Sunday');
    await supabase.auth.signOut();
    assert.equal((await platformApi.settings()).timerWarningMinutes, 10, 'anon (login page) reads public settings');
  });
});
