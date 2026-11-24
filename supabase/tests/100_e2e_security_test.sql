-- LOCAL TEST ONLY. End-to-end workflow + adversarial checks.
\set ON_ERROR_STOP 1
\pset pager off
SET client_min_messages = warning;

-- ── assertion helpers (invoker rights) ──────────────────────────────────────
CREATE SCHEMA test;
GRANT USAGE ON SCHEMA test TO anon, authenticated;
CREATE FUNCTION test.ok(p boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %', p_msg; END IF;
  RAISE NOTICE 'PASS  %', p_msg;
END $$;
CREATE FUNCTION test.fails(p_sql text, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS  % (blocked: %)', p_msg, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED (no error): %', p_msg;
END $$;
CREATE FUNCTION test.login(p_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, false)
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO anon, authenticated;
SET client_min_messages = notice;

-- ── platform bootstrap (service role / SQL editor) ──────────────────────────
INSERT INTO public.institutions (id, code, name, email_domain) VALUES
  ('11111111-1111-1111-1111-111111111111', '1DA', 'Dr. Ambedkar Institute of Technology', 'drait.edu.in'),
  ('22222222-2222-2222-2222-222222222222', '2XY', 'Other Engineering College', 'other.edu');
INSERT INTO public.departments (id, institution_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CS', 'Computer Science & Engineering');

-- Accounts created the way the provisioning Edge Function would (app_metadata).
INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin@drait.edu.in',
   '{"role":"admin","institution_id":"11111111-1111-1111-1111-111111111111","staff_id":"ADM-8942","full_name":"COE Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin@other.edu',
   '{"role":"admin","institution_id":"22222222-2222-2222-2222-222222222222","staff_id":"OTH-1"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'root@examsphere.io',
   '{"role":"admin","institution_id":"11111111-1111-1111-1111-111111111111","staff_id":"ROOT-1"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'outsider@other.edu',
   '{"role":"student","institution_id":"22222222-2222-2222-2222-222222222222","usn":"2XY22CS001"}');
INSERT INTO auth.users (id, email, raw_app_meta_data)
SELECT ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       format('1da22cs%s@drait.edu.in', lpad(n::text, 3, '0')),
       jsonb_build_object('role', 'student', 'institution_id', '11111111-1111-1111-1111-111111111111',
                          'department_id', 'aaaaaaaa-0000-0000-0000-000000000001',
                          'usn', format('1da22cs%s', lpad(n::text, 3, '0')), 'full_name', 'Student ' || n)
FROM generate_series(1, 12) n;
-- super admin is promoted by SQL, never via metadata
UPDATE public.profiles SET role = 'super_admin', institution_id = NULL, staff_id = NULL
WHERE id = '00000000-0000-0000-0000-0000000000c1';
INSERT INTO public.student_details (profile_id, institution_id, semester, section)
SELECT id, institution_id, 6, 'B' FROM public.profiles WHERE role = 'student' AND institution_id = '11111111-1111-1111-1111-111111111111';

SELECT test.ok((SELECT role = 'admin' AND usn IS NULL AND staff_id = 'ADM-8942' FROM public.profiles
                WHERE id = '00000000-0000-0000-0000-0000000000a1'), 'signup trigger maps app_metadata → admin profile');
SELECT test.ok((SELECT usn FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101') = '1DA22CS001',
               'USN canonicalised to upper case');
SELECT test.fails($$INSERT INTO auth.users (email, raw_user_meta_data) VALUES ('self@signup.com', '{"role":"super_admin"}')$$,
                  'self-signup without server metadata is rejected (no orphan student, no role escalation)');

-- ── ANON ─────────────────────────────────────────────────────────────────────
SET ROLE anon;
SELECT test.ok(public.resolve_login_identifier('1da22cs001', 'student') = '1da22cs001@drait.edu.in', 'anon: USN login resolution works');
SELECT test.ok(public.resolve_login_identifier('ADM-8942', 'student') IS NULL, 'anon: staff id not resolvable on student portal');
SELECT test.ok(public.resolve_login_identifier('%', NULL) IS NULL, 'anon: wildcard probing rejected');
SELECT test.fails('SELECT * FROM public.profiles', 'anon cannot read profiles');
SELECT test.fails('SELECT * FROM public.questions', 'anon cannot read questions');
SELECT test.fails($$SELECT public.start_exam_attempt('00000000-0000-0000-0000-000000000000')$$, 'anon cannot call exam RPCs');
RESET ROLE;

-- ── INSTITUTION ADMIN (Dr. AIT) builds the bank ──────────────────────────────
SELECT test.login('00000000-0000-0000-0000-0000000000a1');
SET ROLE authenticated;
INSERT INTO public.subjects (institution_id, code, title, semester)
VALUES ('11111111-1111-1111-1111-111111111111', '22CS601', 'Software Engineering & Cloud Architecture', 6);
SELECT test.fails($$INSERT INTO public.subjects (institution_id, code, title)
                    VALUES ('22222222-2222-2222-2222-222222222222', 'X100', 'Foreign')$$, 'admin cannot create data in another institution');
SELECT test.fails($$INSERT INTO public.questions (institution_id, subject_id, topic, statement, options)
                    SELECT institution_id, id, 't', 's', ARRAY['a','b','c','d'] FROM public.subjects LIMIT 1$$,
                  'direct INSERT into questions is not allowed (RPC only)');

DO $$
BEGIN
  FOR n IN 1..26 LOOP
    PERFORM public.save_question(NULL, jsonb_build_object(
      'subject', '22CS601', 'topic', 'Unit ' || (n % 5 + 1), 'statement', 'Question number ' || n || ' about cloud?',
      'options', jsonb_build_array('Alpha ' || n, 'Beta ' || n, 'Gamma ' || n, 'Delta ' || n),
      'correctOption', n % 4, 'difficulty', (ARRAY['Easy','Medium','Hard'])[n % 3 + 1],
      'marks', 2, 'negativeMarks', CASE WHEN n <= 5 THEN 0.5 ELSE 0 END));
  END LOOP;
END $$;
SELECT test.ok((SELECT count(*) FROM public.admin_question_bank) = 26, 'admin: 26 questions saved with keys via RPC');
SELECT test.fails($$SELECT public.save_question(NULL, '{"subject":"22CS601","topic":"x","statement":"  QUESTION number 1 about   cloud? ",
                    "options":["a","b","c","d"],"correctOption":1,"difficulty":"Easy","marks":2}')$$,
                  'duplicate statement (case/space-insensitive) rejected');
SELECT test.fails($$SELECT public.save_question(NULL, '{"subject":"22CS601","topic":"x","statement":"dup options",
                    "options":["a","A","c","d"],"correctOption":1,"difficulty":"Easy","marks":2}')$$,
                  'non-distinct options rejected');

SELECT test.ok((public.import_questions('bank.xlsx', '[
  {"rowNumber":2,"subject":"22CS601","topic":"Imported","statement":"Imported Q1","options":["w","x","y","z"],"correctOption":2,"difficulty":"Hard","marks":"2"},
  {"rowNumber":3,"subject":"22CS601","topic":"Imported","statement":"Imported Q1","options":["w","x","y","z"],"correctOption":2,"difficulty":"Hard","marks":"2"},
  {"rowNumber":4,"subject":"NOPE","topic":"Imported","statement":"Bad subject","options":["w","x","y","z"],"correctOption":2,"difficulty":"Hard","marks":"2"},
  {"rowNumber":5,"subject":"22CS601","topic":"","statement":"No topic","options":["w","x","y","z"],"correctOption":9,"difficulty":"Insane","marks":"0"}
]'::jsonb)->>'imported')::int = 1, 'import: 1 valid row imported, duplicate/invalid rows rejected server-side');

-- ── exam creation, composition, generation, publication ──────────────────────
INSERT INTO public.exams (institution_id, subject_id, exam_code, title, semester_label, duration_minutes,
                          window_start, window_end, instructions, created_by)
SELECT '11111111-1111-1111-1111-111111111111', id, 'CBT-2026-CS601', 'Software Engineering & Cloud Architecture',
       '6th Semester B.E. (Autonomous)', 90, now() - interval '1 minute', now() + interval '3 hours',
       ARRAY['Select exactly one option.'], auth.uid()
FROM public.subjects WHERE code = '22CS601';
SELECT id AS exam_id FROM public.exams WHERE exam_code = 'CBT-2026-CS601' \gset

SELECT test.fails(format($$SELECT public.set_exam_questions(%L, ARRAY(SELECT id FROM public.questions LIMIT 24))$$, :'exam_id'),
                  'exactly 25 questions enforced');
SELECT public.set_exam_questions(:'exam_id', ARRAY(SELECT id FROM public.questions WHERE topic <> 'Imported' ORDER BY question_no LIMIT 25));
SELECT test.fails(format($$SELECT public.publish_exam(%L)$$, :'exam_id'), 'cannot publish before patterns are generated');
SELECT test.ok((public.generate_exam_patterns(:'exam_id')->>'isValid')::boolean, 'generate: verification report valid');
SELECT test.ok((SELECT count(*) = 10 AND count(DISTINCT sequence_signature) = 10 FROM public.exam_patterns WHERE exam_id = :'exam_id'),
               '10 patterns A–J with 10 distinct question orders');
SELECT test.ok((SELECT count(DISTINCT question_id) = 25 AND count(*) = 250 FROM public.exam_pattern_questions pq
                JOIN public.exam_patterns p ON p.id = pq.pattern_id WHERE p.exam_id = :'exam_id'),
               'same 25 questions in every pattern');
SELECT test.ok((SELECT bool_and(pq.options[k.correct_option + 1] = q.options[mk.correct_option + 1])
                FROM public.exam_pattern_questions pq
                JOIN public.exam_patterns p ON p.id = pq.pattern_id AND p.exam_id = :'exam_id'
                JOIN public.exam_pattern_answer_keys k USING (pattern_id, display_number)
                JOIN public.questions q ON q.id = pq.question_id
                JOIN public.question_answer_keys mk ON mk.question_id = q.id),
               'every pattern key points to the original correct option text');
SELECT test.ok((SELECT count(DISTINCT array_to_string(option_order, '')) > 1 FROM public.exam_pattern_questions pq
                JOIN public.exam_patterns p ON p.id = pq.pattern_id WHERE p.exam_id = :'exam_id'),
               'options are shuffled independently');
SELECT public.assign_cohort_to_exam(:'exam_id', 'aaaaaaaa-0000-0000-0000-000000000001', 6::smallint, 'B');
SELECT test.ok((public.publish_exam(:'exam_id')->>'patternsAllocated')::int = 12, 'publish: patterns allocated to 12 students');
SELECT test.ok((SELECT max(c) - min(c) <= 1 FROM (SELECT count(*) c FROM public.exam_assignments WHERE exam_id = :'exam_id'
                GROUP BY pattern_id) x) AND (SELECT count(DISTINCT pattern_id) FROM public.exam_assignments WHERE exam_id = :'exam_id') = 10,
               'balanced allocation across all 10 patterns');
SELECT test.ok((SELECT a1.pattern_id <> a2.pattern_id FROM public.exam_assignments a1, public.exam_assignments a2
                WHERE a1.student_id = '00000000-0000-0000-0000-000000000101' AND a2.student_id = '00000000-0000-0000-0000-000000000102'
                  AND a1.exam_id = :'exam_id' AND a2.exam_id = :'exam_id'), 'adjacent USNs get different patterns');
SELECT test.fails($$UPDATE public.exams SET status = 'draft'$$, 'admin cannot flip status directly (column privilege)');
SELECT test.fails(format($$SELECT public.save_question(id, jsonb_build_object('subject','22CS601','topic','x','statement','edited',
                    'options',options,'correctOption',0,'difficulty','Easy','marks',2)) FROM public.questions q
                    JOIN public.exam_questions eq ON eq.question_id = q.id WHERE eq.exam_id = %L LIMIT 1$$, :'exam_id'),
                  'questions in a published exam cannot be edited');
RESET ROLE;

-- ── FOREIGN ADMIN (other institution) ────────────────────────────────────────
SELECT test.login('00000000-0000-0000-0000-0000000000b1');
SET ROLE authenticated;
SELECT test.ok((SELECT count(*) FROM public.exams) = 0, 'foreign admin sees no Dr. AIT exams');
SELECT test.ok((SELECT count(*) FROM public.question_answer_keys) = 0, 'foreign admin sees no Dr. AIT keys');
SELECT test.ok((SELECT count(*) FROM public.profiles) = 2, 'foreign admin sees only own institution profiles');
SELECT test.fails(format($$SELECT public.get_exam_report(%L)$$, :'exam_id'), 'foreign admin cannot read reports');
SELECT test.fails(format($$SELECT public.close_exam(%L)$$, :'exam_id'), 'foreign admin cannot close the exam');
RESET ROLE;

-- ── STUDENT 1: confidentiality ───────────────────────────────────────────────
SELECT test.login('00000000-0000-0000-0000-000000000101');
SET ROLE authenticated;
SELECT test.ok((SELECT count(*) FROM public.profiles) = 1, 'student sees only own profile');
SELECT test.ok((SELECT count(*) FROM public.questions) = 0, 'student cannot read the question bank');
SELECT test.ok((SELECT count(*) FROM public.question_answer_keys) = 0, 'student cannot read master keys');
SELECT test.ok((SELECT count(*) FROM public.exam_patterns) + (SELECT count(*) FROM public.exam_pattern_questions)
               + (SELECT count(*) FROM public.exam_pattern_answer_keys) = 0, 'student cannot read patterns or pattern keys');
SELECT test.ok((SELECT count(*) FROM public.admin_question_bank) = 0, 'student gets nothing from the admin view');
SELECT test.ok((SELECT count(*) FROM public.exams) = 1, 'student sees exactly the exam assigned to them');
SELECT test.ok((SELECT count(*) FROM public.get_my_exams() WHERE availability = 'live') = 1, 'dashboard feed shows the live exam');

SELECT public.start_exam_attempt(:'exam_id', '{"ua":"test"}') AS paper \gset
SELECT (:'paper'::jsonb)->>'attemptId' AS attempt_id \gset
SELECT test.ok(jsonb_array_length((:'paper'::jsonb)->'questions') = 25, 'start: 25 questions delivered');
SELECT test.ok((:'paper')::text !~* 'correct|answerKey|option_order|question_id', 'paper payload contains no key material or question ids');
SELECT test.ok(((public.start_exam_attempt(:'exam_id'))->>'attemptId') = :'attempt_id', 'start again → resumes the same attempt');
SELECT test.fails(format($$UPDATE public.exam_attempts SET deadline_at = deadline_at + interval '1 hour' WHERE id = %L$$, :'attempt_id'),
                  'student cannot alter the timer');
SELECT test.fails(format($$UPDATE public.attempt_responses SET selected_option = 1 WHERE attempt_id = %L$$, :'attempt_id'),
                  'student cannot write responses directly');
SELECT test.fails($$INSERT INTO public.exam_results (attempt_id, exam_id, student_id, institution_id, pattern_id, raw_score, score,
                    max_score, percentage, passed, correct_count, incorrect_count, unattempted_count)
                    SELECT id, exam_id, student_id, institution_id, pattern_id, 50, 50, 50, 100, true, 25, 0, 0 FROM public.exam_attempts$$,
                  'student cannot forge a result');
SELECT test.fails(format($$SELECT public.save_attempt_responses(%L, '[{"displayNumber":26,"selectedOption":1}]')$$, :'attempt_id'),
                  'out-of-range question rejected');
SELECT test.fails(format($$SELECT public.save_attempt_responses(%L, '[{"displayNumber":1,"selectedOption":7}]')$$, :'attempt_id'),
                  'out-of-range option rejected');
RESET ROLE;

-- Build a known answer sheet: Q1-18 correct, Q19-23 wrong, Q24-25 blank (computed with admin knowledge).
SELECT jsonb_agg(jsonb_build_object('displayNumber', k.display_number,
         'selectedOption', CASE WHEN k.display_number <= 18 THEN k.correct_option
                                WHEN k.display_number <= 23 THEN (k.correct_option + 1) % 4 END,
         'visited', true)) AS sheet,
       sum(CASE WHEN k.display_number <= 18 THEN pq.marks WHEN k.display_number <= 23 THEN -pq.negative_marks ELSE 0 END) AS expected
FROM public.exam_attempts a
JOIN public.exam_pattern_answer_keys k ON k.pattern_id = a.pattern_id
JOIN public.exam_pattern_questions pq ON pq.pattern_id = k.pattern_id AND pq.display_number = k.display_number
WHERE a.id = :'attempt_id' \gset

SET ROLE authenticated;
SELECT test.ok((public.save_attempt_responses(:'attempt_id', :'sheet', 5)->>'status') = 'saved', 'autosave accepted');
SELECT test.ok((public.save_attempt_responses(:'attempt_id', '[{"displayNumber":1,"selectedOption":null}]', 3)->>'status') = 'stale_ignored',
               'out-of-order autosave ignored');
SELECT public.submit_exam_attempt(:'attempt_id') AS outcome \gset
SELECT test.ok(((:'outcome'::jsonb)->'result'->>'score')::numeric = :'expected'::numeric,
               format('graded server-side with negative marking: %s', (:'outcome'::jsonb)->'result'->>'score'));
SELECT test.ok(((:'outcome'::jsonb)->'result'->>'correctCount')::int = 18 AND ((:'outcome'::jsonb)->'result'->>'unattemptedCount')::int = 2,
               'counts: 18 correct / 5 wrong / 2 unattempted');
SELECT test.ok((:'outcome')::text !~* 'correctAnswer|correct_option', 'result payload never reveals the key');
SELECT test.ok(((public.submit_exam_attempt(:'attempt_id'))->'result'->>'score')::numeric = :'expected'::numeric, 'double submit is idempotent');
SELECT test.fails(format($$SELECT public.save_attempt_responses(%L, '[{"displayNumber":1,"selectedOption":0}]')$$, :'attempt_id'),
                  'no answer changes after submission');
SELECT test.fails(format($$SELECT public.start_exam_attempt(%L)$$, :'exam_id'), 'retake blocked');
SELECT test.ok((SELECT count(*) FROM public.result_question_scores) = 0, 'student cannot read per-question key/scoring rows');
RESET ROLE;

-- ── STUDENT from another institution ─────────────────────────────────────────
SELECT test.login('00000000-0000-0000-0000-0000000000f1');
SET ROLE authenticated;
SELECT test.fails(format($$SELECT public.start_exam_attempt(%L)$$, :'exam_id'), 'unassigned student cannot start');
SELECT test.fails(format($$SELECT public.get_attempt_paper(%L)$$, :'attempt_id'), 'cannot read another student''s attempt');
SELECT test.ok((SELECT count(*) FROM public.exams) = 0, 'unassigned student sees no exam');
RESET ROLE;

-- ── Server timer: expired attempts are auto-submitted ────────────────────────
SELECT test.login('00000000-0000-0000-0000-000000000102');
SET ROLE authenticated;
SELECT (public.start_exam_attempt(:'exam_id'))->>'attemptId' AS att2 \gset
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-000000000103');
SET ROLE authenticated;
SELECT (public.start_exam_attempt(:'exam_id'))->>'attemptId' AS att3 \gset
RESET ROLE;
-- simulate time passing (maintenance-only manipulation)
ALTER TABLE public.exam_attempts DISABLE TRIGGER exam_attempts_guard_update;
UPDATE public.exam_attempts SET started_at = now() - interval '2 hours', deadline_at = now() - interval '1 minute'
WHERE id IN (:'att2', :'att3');
ALTER TABLE public.exam_attempts ENABLE TRIGGER exam_attempts_guard_update;
SELECT test.login('00000000-0000-0000-0000-000000000102');
SET ROLE authenticated;
SELECT test.ok((public.save_attempt_responses(:'att2', '[{"displayNumber":1,"selectedOption":0}]')->>'status') = 'auto_submitted',
               'late autosave rejected and attempt auto-submitted');
RESET ROLE;
SELECT test.ok((private.finalize_expired_attempts()->>'finalizedAttempts')::int = 1, 'cron sweeper finalises abandoned attempt');
SELECT test.ok((SELECT bool_and(status = 'auto_submitted' AND submission_source = 'timer') FROM public.exam_attempts
                WHERE id IN (:'att2', :'att3')), 'both expired attempts recorded as timer auto-submissions');

-- ── Immutability for API sessions (authenticator), not just privileges ───────
SELECT test.ok((SELECT count(*) FROM public.exam_results) = 3, '3 results stored');

-- ── Admin: release workflow, retake, reports ─────────────────────────────────
SELECT test.login('00000000-0000-0000-0000-0000000000a1');
SET ROLE authenticated;
SELECT test.fails(format($$SELECT public.unpublish_exam(%L)$$, :'exam_id'), 'cannot unpublish once attempts exist');
UPDATE public.exams SET results_release_mode = 'manual' WHERE id = :'exam_id';
SELECT public.grant_exam_retake(id, 'Power failure in CCC Lab 2 at 10:14') FROM public.exam_assignments
WHERE exam_id = :'exam_id' AND student_id = '00000000-0000-0000-0000-000000000104';
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-000000000101');
SET ROLE authenticated;
SELECT test.ok((SELECT count(*) FROM public.exam_results) = 0, 'manual release: student cannot see result yet');
SELECT test.ok((public.get_my_result(:'exam_id')->>'released')::boolean = false, 'get_my_result hides score before release');
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-000000000104');
SET ROLE authenticated;
SELECT test.ok((public.start_exam_attempt(:'exam_id')->>'status') = 'active', 'student with granted retake can start');
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-0000000000a1');
SET ROLE authenticated;
SELECT test.ok((public.close_exam(:'exam_id')->>'forceSubmitted')::int = 1, 'close_exam force-submits running attempts');
SELECT public.release_exam_results(:'exam_id');
SELECT test.ok((public.get_exam_report(:'exam_id')->>'assigned')::int = 12, 'exam report');
SELECT test.ok((SELECT count(*) FROM public.get_exam_item_analysis(:'exam_id')) = 25, 'item analysis: 25 rows');
SELECT test.ok((SELECT count(*) FROM public.get_exam_results_export(:'exam_id')) = 12, 'results export: 12 rows');
SELECT test.ok((public.get_admin_dashboard()->>'enrolledCandidates')::int = 12, 'admin dashboard counts');
SELECT test.fails($$SELECT public.get_platform_overview()$$, 'institution admin cannot read platform overview');
SELECT test.fails(format($$DELETE FROM public.exam_attempts WHERE id = %L$$, :'attempt_id'), 'admin cannot delete attempts');
SELECT test.ok((SELECT count(*) FROM public.activity_logs) >= 5, 'activity log populated');
SELECT test.ok((SELECT count(*) FROM public.audit_log WHERE table_name = 'exams') > 0, 'audit history populated');
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-000000000101');
SET ROLE authenticated;
SELECT test.ok((public.get_my_result(:'exam_id')->'result'->>'score')::numeric = :'expected'::numeric, 'released result visible to student');
SELECT test.ok((SELECT count(*) FROM public.activity_logs) + (SELECT count(*) FROM public.audit_log) = 0,
               'student cannot read logs');
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-0000000000c1');
SET ROLE authenticated;
SELECT test.ok((public.get_platform_overview()->>'institutions')::int = 2, 'super admin platform overview');
SELECT test.ok((SELECT count(*) FROM public.exams) = 1, 'super admin sees all institutions');
RESET ROLE;
\echo E2E SECURITY TEST COMPLETE
