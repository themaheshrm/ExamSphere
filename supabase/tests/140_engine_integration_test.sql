-- LOCAL TEST ONLY. Migration 013 + seed 001: settings, pattern pins,
-- portal activity, admin read models and the catalogue seed.
-- Runs after 100–130 (reuses their institution, admins, students and exams).
\set ON_ERROR_STOP 1
\pset pager off
SET client_min_messages = notice;

-- ── seed (idempotent) ────────────────────────────────────────────────────────
SET client_min_messages = warning;
\ir ../seed/001_drait_catalogue.sql
SELECT count(*) AS q_after_first FROM public.questions \gset
\ir ../seed/001_drait_catalogue.sql
SET client_min_messages = notice;
SELECT test.ok((SELECT count(*) FROM public.questions) = :q_after_first, 'seed is idempotent (second run adds nothing)');
SELECT test.ok((SELECT count(*) FROM public.subjects s JOIN public.institutions i ON i.id = s.institution_id WHERE i.code = '1DA') = 6,
               'seed: six Dr. AIT subjects (existing rows kept)');
SELECT test.ok((SELECT bool_and(n >= 25) FROM (SELECT count(*) n FROM public.questions q JOIN public.subjects s ON s.id = q.subject_id
                WHERE s.code IN ('22CS403', '22CS502', '22CS304') GROUP BY s.code) x), 'seed: 25 keyed questions per new subject');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM public.questions q LEFT JOIN public.question_answer_keys k ON k.question_id = q.id WHERE k.question_id IS NULL),
               'every seeded question has an answer key');

-- ── migration 013 re-run (pins are created once the institution exists) ─────
SET client_min_messages = warning;
\ir ../migrations/013_examination_engine_integration.sql
SET client_min_messages = notice;
SELECT test.ok((SELECT count(*) FROM public.pattern_pins) = 6, '013 is idempotent; demo pins CS001–CS006 → A–F');

-- demo + regular students (created the way provisioning does)
INSERT INTO auth.users (id, email, raw_app_meta_data)
SELECT ('00000000-0000-0000-0000-000000000c0' || n)::uuid, format('cs00%s@drait.edu.in', n),
       jsonb_build_object('role', 'student', 'institution_id', '11111111-1111-1111-1111-111111111111',
                          'department_id', 'aaaaaaaa-0000-0000-0000-000000000001', 'usn', format('CS00%s', n), 'full_name', 'CS Demo 0' || n)
FROM generate_series(1, 6) n;
INSERT INTO public.student_details (profile_id, institution_id, semester, section)
SELECT ('00000000-0000-0000-0000-000000000c0' || n)::uuid, '11111111-1111-1111-1111-111111111111', 6, 'D' FROM generate_series(1, 6) n;

-- ── platform settings ────────────────────────────────────────────────────────
SET ROLE anon;
SELECT test.ok((SELECT support_email FROM public.platform_settings) = 'coe@drait.edu.in', 'anon can read public settings');
SELECT test.fails($$UPDATE public.platform_settings SET maintenance_notice = 'x'$$, 'anon cannot write settings');
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-000000000101');
SET ROLE authenticated;
SELECT test.ok((SELECT timer_warning_minutes FROM public.platform_settings) = 5, 'student reads settings');
SELECT test.fails($$SELECT public.save_platform_settings('{"maintenanceNotice":"hacked"}')$$, 'student cannot save settings');
SELECT test.fails($$UPDATE public.platform_settings SET maintenance_notice = 'hacked'$$, 'student cannot UPDATE settings directly');
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-0000000000a1');
SET ROLE authenticated;
SELECT test.fails($$SELECT public.save_platform_settings('{"maintenanceNotice":"admin"}')$$, 'institution admin cannot save settings');
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-0000000000c1');
SET ROLE authenticated;
SELECT test.fails($$SELECT public.save_platform_settings('{"timerWarningMinutes":99}')$$, 'invalid timer warning rejected');
SELECT test.fails($$SELECT public.save_platform_settings('{"supportEmail":"not-an-email"}')$$, 'invalid support email rejected');
SELECT test.ok((public.save_platform_settings('{"resultDisplay":"withheld","maintenanceNotice":"Maintenance Sunday"}')).result_display = 'withheld',
               'super admin saves settings');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM public.exams WHERE status IN ('draft', 'published') AND results_released_at IS NULL AND results_release_mode <> 'manual'),
               'withheld policy applied to unreleased exams');
SELECT public.save_platform_settings('{"resultDisplay":"immediate","maintenanceNotice":""}');
RESET ROLE;

-- ── exam with pinned demo patterns (institution admin, OS subject) ──────────
SELECT test.login('00000000-0000-0000-0000-0000000000a1');
SET ROLE authenticated;
INSERT INTO public.exams (institution_id, subject_id, exam_code, title, duration_minutes, window_start, window_end, created_by)
SELECT '11111111-1111-1111-1111-111111111111', id, 'CBT-2026-22CS403', 'Operating Systems', 45, now() - interval '1 minute', now() + interval '3 hours', auth.uid()
FROM public.subjects WHERE code = '22CS403' AND institution_id = '11111111-1111-1111-1111-111111111111';
SELECT id AS os_exam FROM public.exams WHERE exam_code = 'CBT-2026-22CS403' \gset
SELECT public.set_exam_questions(:'os_exam', ARRAY(SELECT q.id FROM public.questions q JOIN public.subjects s ON s.id = q.subject_id
                                                    WHERE s.code = '22CS403' ORDER BY q.question_no LIMIT 25));
SELECT test.ok((public.generate_exam_patterns(:'os_exam')->>'isValid')::boolean, 'OS exam: 10 verified patterns from seeded questions');
SELECT public.assign_students_to_exam(:'os_exam', ARRAY(SELECT id FROM public.profiles WHERE usn IN ('CS001','CS002','CS003','CS004','CS005','CS006','1DA22CS001','1DA22CS002')));
SELECT test.ok((public.publish_exam(:'os_exam')->>'patternsAllocated')::int = 8, 'published; 8 candidates allocated');
SELECT test.ok((SELECT string_agg(usn || ':' || pattern_label, ',' ORDER BY usn) FROM public.admin_exam_candidates WHERE exam_id = :'os_exam' AND usn LIKE 'CS%')
               = 'CS001:A,CS002:B,CS003:C,CS004:D,CS005:E,CS006:F', 'pinned demo patterns CS001–CS006 → A–F');
SELECT test.ok((SELECT count(DISTINCT pattern_label) FROM public.admin_exam_candidates WHERE exam_id = :'os_exam') >= 7, 'others get balanced patterns');
SELECT test.ok((SELECT assigned_count = 8 AND question_count = 25 AND pattern_count = 10 AND status = 'published'
                FROM public.admin_exam_overview WHERE id = :'os_exam'), 'admin_exam_overview counts');
SELECT test.ok((SELECT count(*) FROM public.admin_candidates WHERE usn LIKE 'CS00%' AND pinned AND department = 'Computer Science & Engineering' AND semester = 6) = 6,
               'admin_candidates: department, semester, pin flag');
SELECT public.record_activity('Created student account', 'candidate', 'CS006', 'CS Demo 06');
SELECT test.ok(EXISTS (SELECT 1 FROM public.portal_activity WHERE action = 'Created student account' AND actor_identifier = 'ADM-8942'),
               'record_activity → portal_activity with actor');
SELECT test.fails($$SELECT public.record_activity('x')$$, 'too-short action rejected');
RESET ROLE;

-- ── student: attempt and isolation ───────────────────────────────────────────
SELECT test.login('00000000-0000-0000-0000-000000000c06');
SET ROLE authenticated;
SELECT test.fails($$SELECT public.record_activity('Student tries to log')$$, 'students cannot write portal activity');
SELECT (public.start_exam_attempt(:'os_exam'))->>'attemptId' AS cs6_attempt \gset
SELECT test.ok((public.get_attempt_paper(:'cs6_attempt'))->>'paperCode' = '22CS403-F', 'CS006 sits paper 22CS403-F');
SELECT test.ok(NOT (public.get_attempt_paper(:'cs6_attempt'))::text ~ '(correct|answer_key|option_order|questionId)', 'paper carries no key, option order or question ids');
SELECT public.save_attempt_responses(:'cs6_attempt', '[{"displayNumber":1,"selectedOption":2},{"displayNumber":2,"selectedOption":1,"markedForReview":true}]', 1);
SELECT test.ok((public.save_attempt_responses(:'cs6_attempt', '[{"displayNumber":1,"selectedOption":0}]', 1))->>'status' = 'stale_ignored', 'out-of-order autosave ignored');
SELECT test.ok((public.submit_exam_attempt(:'cs6_attempt'))->'result' IS NOT NULL, 'submit returns the result');
SELECT test.ok((public.submit_exam_attempt(:'cs6_attempt'))->>'attemptId' = :'cs6_attempt', 'double submit is idempotent');
SELECT test.fails(format($$SELECT public.save_attempt_responses(%L, '[{"displayNumber":3,"selectedOption":1}]', 9)$$, :'cs6_attempt'), 'no answer changes after submission');
SELECT test.ok((SELECT count(*) FROM public.admin_attempt_breakdown) = 0, 'student sees no per-question key (breakdown view empty)');
SELECT test.ok((SELECT count(*) FROM public.admin_exam_candidates) = (SELECT count(*) FROM public.exam_assignments WHERE student_id = auth.uid()),
               'student sees only their own assignment rows');
SELECT test.ok((SELECT count(*) FROM public.admin_candidates) <= 1, 'student sees at most their own candidate row');
SELECT test.ok((SELECT count(*) FROM public.portal_activity) = 0, 'student cannot read activity');
RESET ROLE;

SELECT test.login('00000000-0000-0000-0000-0000000000a1');
SET ROLE authenticated;
SELECT test.ok((SELECT count(*) FROM public.admin_attempt_breakdown WHERE attempt_id = :'cs6_attempt') = 25, 'admin sees 25-question breakdown');
SELECT test.ok((SELECT bool_and(correct_option BETWEEN 0 AND 3) FROM public.admin_attempt_breakdown WHERE attempt_id = :'cs6_attempt'), 'breakdown carries the pattern key');
SELECT test.ok((SELECT attempt_status = 'submitted' AND max_score = 50 FROM public.admin_exam_candidates WHERE attempt_id = :'cs6_attempt'), 'admin_exam_candidates shows the result');
RESET ROLE;

-- ── subject admin scope over the new views ───────────────────────────────────
SELECT test.login('00000000-0000-0000-0000-00000000ad01');
SET ROLE authenticated;
SELECT test.ok((SELECT count(*) FROM public.admin_exam_overview WHERE id = :'os_exam') = 0, 'DSA admin cannot see the OS exam overview');
SELECT test.ok((SELECT count(*) FROM public.admin_exam_candidates WHERE exam_id = :'os_exam') = 0, 'DSA admin cannot see OS candidates');
SELECT test.ok((SELECT count(*) FROM public.admin_attempt_breakdown WHERE attempt_id = :'cs6_attempt') = 0, 'DSA admin cannot see OS breakdown');
SELECT test.ok((SELECT count(*) FROM public.portal_activity WHERE user_id <> auth.uid()) = 0, 'DSA admin sees only own activity');
SELECT test.fails($$INSERT INTO public.pattern_pins VALUES ('11111111-1111-1111-1111-111111111111', 'X1', 'A')$$, 'only super admin manages pins');
RESET ROLE;

\echo ENGINE INTEGRATION TEST COMPLETE
