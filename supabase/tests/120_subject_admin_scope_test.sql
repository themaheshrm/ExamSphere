-- LOCAL TEST ONLY. Subject-scoped administrators (migration 011).
-- Runs after 100_e2e_security_test.sql (reuses its test schema, institution,
-- institution admin a1, super admin c1, students 1DA22CS001–012 and the
-- 22CS601 examination).
\set ON_ERROR_STOP 1
\pset pager off
SET client_min_messages = notice;

-- ── bootstrap (service role): two subjects, two scoped demo admins ──────────
INSERT INTO public.subjects (id, institution_id, code, title, semester) VALUES
  ('5b000000-0000-0000-0000-000000000302', '11111111-1111-1111-1111-111111111111', '22CS302', 'Data Structures and Algorithms', 3),
  ('5b000000-0000-0000-0000-000000000402', '11111111-1111-1111-1111-111111111111', '22CS402', 'Database Management Systems', 4);
INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
  ('00000000-0000-0000-0000-00000000ad01', 'admin001@drait.edu.in',
   '{"role":"admin","institution_id":"11111111-1111-1111-1111-111111111111","staff_id":"ADMIN001","full_name":"Admin 01"}'),
  ('00000000-0000-0000-0000-00000000ad02', 'admin002@drait.edu.in',
   '{"role":"admin","institution_id":"11111111-1111-1111-1111-111111111111","staff_id":"ADMIN002","full_name":"Admin 02"}');
INSERT INTO public.subject_admins (admin_id, subject_id, institution_id) VALUES
  ('00000000-0000-0000-0000-00000000ad01', '5b000000-0000-0000-0000-000000000302', '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-00000000ad02', '5b000000-0000-0000-0000-000000000402', '11111111-1111-1111-1111-111111111111');
SELECT test.fails($$INSERT INTO public.subject_admins (admin_id, subject_id, institution_id) VALUES
  ('00000000-0000-0000-0000-000000000101', '5b000000-0000-0000-0000-000000000302', '11111111-1111-1111-1111-111111111111')$$,
  'a student cannot be made a subject administrator');
SELECT test.ok(public.resolve_login_identifier('ADMIN001', 'admin') = 'admin001@drait.edu.in',
               'ADMIN001 signs in through the existing staff-ID resolution');

SELECT id AS cs601_exam FROM public.exams WHERE exam_code = 'CBT-2026-CS601' \gset
SELECT id AS cs601_q FROM public.questions q WHERE q.subject_id = (SELECT id FROM public.subjects WHERE code = '22CS601') LIMIT 1 \gset

-- ── ADMIN002 prepares a DBMS bank and a DRAFT exam (targets for tampering) ──
SELECT test.login('00000000-0000-0000-0000-00000000ad02');
SET ROLE authenticated;
DO $$
BEGIN
  FOR n IN 1..25 LOOP
    PERFORM public.save_question(NULL, jsonb_build_object(
      'subject', '22CS402', 'topic', 'Normalisation', 'statement', 'DBMS question ' || n || ' on keys?',
      'options', jsonb_build_array('Key A ' || n, 'Key B ' || n, 'Key C ' || n, 'Key D ' || n),
      'correctOption', n % 4, 'difficulty', 'Easy', 'marks', 2));
  END LOOP;
END $$;
INSERT INTO public.exams (institution_id, subject_id, exam_code, title, duration_minutes, window_start, window_end, created_by)
VALUES ('11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-000000000402', 'CBT-2026-22CS402',
        'Database Management Systems', 45, now() + interval '1 day', now() + interval '2 days', auth.uid());
SELECT public.set_exam_questions((SELECT id FROM public.exams), ARRAY(SELECT id FROM public.questions ORDER BY question_no LIMIT 25));
SELECT test.ok((public.generate_exam_patterns((SELECT id FROM public.exams))->>'isValid')::boolean, 'ADMIN002 builds a draft DBMS exam with 10 patterns');
RESET ROLE;
SELECT id AS dbms_exam FROM public.exams WHERE exam_code = 'CBT-2026-22CS402' \gset
SELECT id AS dbms_q FROM public.questions WHERE subject_id = '5b000000-0000-0000-0000-000000000402' ORDER BY question_no DESC LIMIT 1 \gset

-- ── ADMIN001 (DSA) ───────────────────────────────────────────────────────────
SELECT test.login('00000000-0000-0000-0000-00000000ad01');
SET ROLE authenticated;
SELECT test.ok((SELECT array_agg(code) FROM public.subjects) = ARRAY['22CS302'], 'ADMIN001 sees only its subject');
SELECT test.ok((SELECT count(*) FROM public.questions) = 0 AND (SELECT count(*) FROM public.question_answer_keys) = 0,
               'ADMIN001 cannot read other subjects'' questions or keys');
SELECT test.ok((SELECT count(*) FROM public.exams) = 0, 'ADMIN001 cannot see the 22CS601 examination');
SELECT test.ok((SELECT count(*) FROM public.exam_attempts) = 0 AND (SELECT count(*) FROM public.exam_results) = 0,
               'ADMIN001 cannot see other subjects'' attempts or results');
SELECT test.ok((SELECT count(*) FROM public.activity_logs WHERE user_id <> auth.uid()) = 0, 'ADMIN001 sees only its own activity');
SELECT test.ok((SELECT count(*) FROM public.profiles WHERE role = 'student') = 12, 'ADMIN001 can view candidates');

DO $$
BEGIN
  FOR n IN 1..26 LOOP
    PERFORM public.save_question(NULL, jsonb_build_object(
      'subject', '22CS302', 'topic', 'Unit ' || (n % 5 + 1), 'statement', 'DSA question ' || n || ' on trees?',
      'options', jsonb_build_array('Opt A ' || n, 'Opt B ' || n, 'Opt C ' || n, 'Opt D ' || n),
      'correctOption', n % 4, 'difficulty', 'Medium', 'marks', 2));
  END LOOP;
END $$;
SELECT test.ok((SELECT count(*) FROM public.admin_question_bank) = 26, 'ADMIN001 adds questions to its own bank');
SELECT test.fails($$SELECT public.save_question(NULL, '{"subject":"22CS402","topic":"x","statement":"Smuggled DBMS question?",
                    "options":["a","b","c","d"],"correctOption":1,"difficulty":"Easy","marks":2}')$$,
                  'ADMIN001 cannot add a question to DBMS');
SELECT test.fails(format($$SELECT public.save_question(%L, '{"subject":"22CS402","topic":"x","statement":"Tampered?",
                    "options":["a","b","c","d"],"correctOption":1,"difficulty":"Easy","marks":2}')$$, :'dbms_q'),
                  'ADMIN001 cannot edit a DBMS question by id');
SELECT test.fails(format($$SELECT public.save_question(%L, '{"subject":"22CS302","topic":"x","statement":"Moved into DSA?",
                    "options":["a","b","c","d"],"correctOption":1,"difficulty":"Easy","marks":2}')$$, :'dbms_q'),
                  'ADMIN001 cannot move a DBMS question into its subject');
SELECT test.fails(format($$SELECT public.delete_question(%L)$$, :'dbms_q'), 'ADMIN001 cannot delete a DBMS question by id');
SELECT test.fails($$SELECT public.import_questions('mixed.csv', '[
  {"rowNumber":2,"subject":"22CS302","topic":"Imp","statement":"DSA import ok?","options":["w","x","y","z"],"correctOption":1,"difficulty":"Easy","marks":"2"},
  {"rowNumber":3,"subject":"22CS402","topic":"Imp","statement":"DBMS import smuggled?","options":["w","x","y","z"],"correctOption":1,"difficulty":"Easy","marks":"2"}]'::jsonb)$$,
  'import with a row for another subject is rejected as a whole');
SELECT test.ok((public.import_questions('dsa.csv', '[
  {"rowNumber":2,"subject":"22CS302","topic":"Imp","statement":"DSA import ok?","options":["w","x","y","z"],"correctOption":1,"difficulty":"Easy","marks":"2"}]'::jsonb)->>'imported')::int = 1,
  'ADMIN001 imports questions for its own subject');

SELECT test.fails($$INSERT INTO public.exams (institution_id, subject_id, exam_code, title, duration_minutes, window_start, window_end)
                    VALUES ('11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-000000000402', 'CBT-X-402', 'DBMS', 45,
                            now(), now() + interval '2 hours')$$, 'ADMIN001 cannot create a DBMS examination');
INSERT INTO public.exams (institution_id, subject_id, exam_code, title, duration_minutes, window_start, window_end, created_by)
VALUES ('11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-000000000302', 'CBT-2026-22CS302',
        'Data Structures and Algorithms', 45, now() - interval '1 minute', now() + interval '2 hours', auth.uid());
SELECT id AS dsa_exam FROM public.exams WHERE exam_code = 'CBT-2026-22CS302' \gset
SELECT test.fails(format($$SELECT public.set_exam_questions(%L, ARRAY(SELECT id FROM public.questions LIMIT 24) || %L::uuid)$$, :'dsa_exam', :'cs601_q'),
                  'ADMIN001 cannot compose its exam from another subject''s question');
SELECT test.fails(format($$SELECT public.set_exam_questions(%L, ARRAY(SELECT id FROM public.questions LIMIT 24) || %L::uuid)$$, :'dsa_exam', :'dbms_q'),
                  'ADMIN001 cannot compose its exam from a DBMS question');
SELECT test.fails(format($$UPDATE public.exams SET subject_id = '5b000000-0000-0000-0000-000000000402' WHERE id = %L$$, :'dsa_exam'),
                  'ADMIN001 cannot move its draft exam to another subject');
SELECT public.set_exam_questions(:'dsa_exam', ARRAY(SELECT id FROM public.questions ORDER BY question_no LIMIT 25));
SELECT test.ok((public.generate_exam_patterns(:'dsa_exam')->>'isValid')::boolean, 'ADMIN001 generates verified patterns');
SELECT test.ok((SELECT array_agg(pattern_label ORDER BY pattern_label) FROM public.exam_patterns WHERE exam_id = :'dsa_exam')
               = ARRAY['A','B','C','D','E','F','G','H','I','J'] AND
               (SELECT count(DISTINCT sequence_signature) FROM public.exam_patterns WHERE exam_id = :'dsa_exam') = 10,
               'DSA exam has its own 10 distinct patterns A–J');
SELECT public.assign_students_to_exam(:'dsa_exam', ARRAY(SELECT id FROM public.profiles WHERE usn IN ('1DA22CS001', '1DA22CS002')));
SELECT test.ok((public.publish_exam(:'dsa_exam')->>'patternsAllocated')::int = 2, 'ADMIN001 publishes its exam to 2 candidates');
SELECT test.ok((public.get_exam_report(:'dsa_exam')->>'assigned')::int = 2, 'ADMIN001 reads its own exam report');

SELECT test.fails(format($$SELECT public.get_exam_report(%L)$$, :'cs601_exam'), 'ADMIN001: 22CS601 report denied');
SELECT test.fails(format($$SELECT * FROM public.get_exam_results_export(%L)$$, :'cs601_exam'), 'ADMIN001: 22CS601 results export denied');
SELECT test.fails(format($$SELECT * FROM public.get_exam_item_analysis(%L)$$, :'cs601_exam'), 'ADMIN001: 22CS601 item analysis denied');
SELECT test.fails(format($$SELECT public.get_exam_verification_report(%L)$$, :'cs601_exam'), 'ADMIN001: 22CS601 verification report denied');
SELECT test.fails(format($$SELECT public.get_exam_verification_report(%L)$$, :'dbms_exam'), 'ADMIN001: DBMS verification report denied');
SELECT test.fails(format($$SELECT public.generate_exam_patterns(%L)$$, :'dbms_exam'), 'ADMIN001 cannot regenerate DBMS patterns');
SELECT test.fails(format($$SELECT public.set_exam_questions(%L, ARRAY(SELECT id FROM public.questions ORDER BY question_no LIMIT 25))$$, :'dbms_exam'),
                  'ADMIN001 cannot replace the DBMS exam''s questions');
SELECT test.fails(format($$SELECT public.assign_students_to_exam(%L, ARRAY['00000000-0000-0000-0000-000000000105'::uuid])$$, :'dbms_exam'),
                  'ADMIN001 cannot assign candidates to the DBMS exam');
SELECT test.fails(format($$SELECT public.publish_exam(%L)$$, :'dbms_exam'), 'ADMIN001 cannot publish the DBMS exam');
UPDATE public.exams SET title = 'hijacked' WHERE id = :'dbms_exam';
UPDATE public.exams SET title = 'hijacked' WHERE id = :'cs601_exam';
SELECT test.fails('SELECT public.get_admin_dashboard()', 'institution dashboard RPC denied to a subject admin');
SELECT test.fails($$SELECT public.admin_provision_user('00000000-0000-0000-0000-000000000103', 'admin', '11111111-1111-1111-1111-111111111111', 'X1')$$,
                  'ADMIN001 cannot provision or promote accounts');
SELECT test.fails($$UPDATE public.student_details SET section = 'Z' WHERE profile_id = '00000000-0000-0000-0000-000000000101'$$,
                  'ADMIN001 cannot edit the student roster');
SELECT test.fails($$INSERT INTO public.subject_admins (admin_id, subject_id, institution_id) VALUES
  ('00000000-0000-0000-0000-00000000ad01', '5b000000-0000-0000-0000-000000000402', '11111111-1111-1111-1111-111111111111')$$,
  'ADMIN001 cannot grant itself another subject');
SELECT test.fails($$DELETE FROM public.subject_admins WHERE admin_id = '00000000-0000-0000-0000-00000000ad01'$$,
                  'ADMIN001 cannot drop its scope to become institution-wide');
SELECT test.fails($$UPDATE public.profiles SET role = 'super_admin' WHERE id = auth.uid()$$, 'ADMIN001 cannot escalate its role');
RESET ROLE;
SELECT test.ok((SELECT title FROM public.exams WHERE id = :'cs601_exam') <> 'hijacked'
               AND (SELECT title FROM public.exams WHERE id = :'dbms_exam') <> 'hijacked', 'direct UPDATEs of other subjects'' exams had no effect');
SELECT test.ok((SELECT status = 'draft' FROM public.exams WHERE id = :'dbms_exam')
               AND (SELECT count(*) FROM public.exam_questions WHERE exam_id = :'dbms_exam') = 25
               AND (SELECT count(*) FROM public.questions WHERE subject_id = '5b000000-0000-0000-0000-000000000402') = 25,
               'DBMS exam and bank unchanged after ADMIN001''s attempts');

-- ── ADMIN002 (DBMS) cannot reach DSA ─────────────────────────────────────────
SELECT test.login('00000000-0000-0000-0000-00000000ad02');
SET ROLE authenticated;
SELECT test.ok((SELECT array_agg(code) FROM public.subjects) = ARRAY['22CS402'], 'ADMIN002 sees only DBMS');
SELECT test.ok((SELECT count(*) FROM public.questions) = 25 AND (SELECT count(*) FROM public.exams) = 1
               AND (SELECT count(*) FROM public.exam_patterns) = 10, 'ADMIN002 sees only its DBMS bank, exam and patterns');
SELECT test.fails(format($$SELECT public.get_exam_report(%L)$$, :'dsa_exam'), 'ADMIN002: DSA report denied');
SELECT test.fails(format($$SELECT public.unpublish_exam(%L)$$, :'dsa_exam'), 'ADMIN002 cannot unpublish the DSA exam');
SELECT test.fails(format($$SELECT public.save_question(NULL, '{"subject":"22CS302","topic":"x","statement":"Into DSA?","options":["a","b","c","d"],"correctOption":1,"difficulty":"Easy","marks":2}')$$),
                  'ADMIN002 cannot add questions to DSA');
RESET ROLE;

-- ── Student sits the DSA exam (student flow unchanged) ──────────────────────
SELECT test.login('00000000-0000-0000-0000-000000000101');
SET ROLE authenticated;
SELECT (public.start_exam_attempt(:'dsa_exam'))->>'attemptId' AS dsa_attempt \gset
SELECT test.ok((public.submit_exam_attempt(:'dsa_attempt')->>'status') IS NOT NULL, 'candidate submits the DSA exam');
RESET ROLE;

SELECT test.login('00000000-0000-0000-0000-00000000ad01');
SET ROLE authenticated;
SELECT test.ok((SELECT count(*) FROM public.exam_results) = 1, 'ADMIN001 sees the DSA result');
SELECT test.ok((SELECT count(*) FROM public.get_exam_results_export(:'dsa_exam')) = 2, 'ADMIN001 exports its candidates');
SELECT test.ok(jsonb_array_length(public.get_student_performance('00000000-0000-0000-0000-000000000101')->'exams') = 1,
               'student performance for ADMIN001 lists only DSA (22CS601 result hidden)');
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-00000000ad02');
SET ROLE authenticated;
SELECT test.ok((SELECT count(*) FROM public.exam_results) = 0 AND (SELECT count(*) FROM public.exam_attempts) = 0,
               'ADMIN002 cannot see DSA attempts or results');
RESET ROLE;

-- ── Hierarchy unchanged ─────────────────────────────────────────────────────
SELECT test.login('00000000-0000-0000-0000-0000000000a1');
SET ROLE authenticated;
SELECT test.ok((SELECT count(*) FROM public.subjects) = 3, 'institution admin still sees every subject');
SELECT test.ok((SELECT count(*) FROM public.exams) = 3, 'institution admin sees 22CS601, DSA and DBMS exams');
SELECT test.ok((public.get_exam_report(:'dsa_exam')->>'assigned')::int = 2, 'institution admin reads the DSA report');
SELECT test.ok(public.get_admin_dashboard() ? 'draftExams', 'institution dashboard still works');
SELECT test.ok(jsonb_array_length(public.get_student_performance('00000000-0000-0000-0000-000000000101')->'exams') = 2,
               'institution admin sees all of a student''s results');
RESET ROLE;
SELECT test.login('00000000-0000-0000-0000-0000000000c1');
SET ROLE authenticated;
SELECT test.ok((SELECT count(*) FROM public.exams) = 3 AND (SELECT count(*) FROM public.subject_admins) = 2,
               'super admin sees all exams and subject assignments');
RESET ROLE;

\echo SUBJECT ADMIN SCOPE TEST COMPLETE
