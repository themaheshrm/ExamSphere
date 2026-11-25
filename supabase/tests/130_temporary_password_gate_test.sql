-- LOCAL TEST ONLY. Migration 012: a student with a temporary password cannot
-- start an examination until the flag is cleared. Runs after 120 (reuses its
-- published DSA exam, to which 1DA22CS002 is assigned and has not started).
\set ON_ERROR_STOP 1
\pset pager off
SET client_min_messages = notice;

SELECT id AS dsa_exam FROM public.exams WHERE exam_code = 'CBT-2026-22CS302' \gset
CREATE FUNCTION test.login_claims(p_uid uuid, p_app jsonb) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'app_metadata', p_app)::text, false)
$$;
GRANT EXECUTE ON FUNCTION test.login_claims(uuid, jsonb) TO authenticated;

SELECT test.login_claims('00000000-0000-0000-0000-000000000102', '{"role":"student","must_change_password":true}');
SET ROLE authenticated;
SELECT test.fails(format($$SELECT public.start_exam_attempt(%L)$$, :'dsa_exam'),
                  'student with a temporary password cannot start an examination');
SELECT test.ok((SELECT count(*) FROM public.exam_attempts WHERE exam_id = :'dsa_exam') = 0, 'no attempt was created');
SELECT test.ok((SELECT count(*) FROM public.get_my_exams()) >= 1, 'the student can still see their assigned examinations');
RESET ROLE;

SELECT test.login_claims('00000000-0000-0000-0000-000000000102', '{"role":"student","must_change_password":"false"}');
SET ROLE authenticated;
SELECT test.ok((public.start_exam_attempt(:'dsa_exam')->>'status') = 'active', 'after the password change the student starts the exam');
RESET ROLE;

SELECT test.login_claims('00000000-0000-0000-0000-000000000103', '{"role":"student"}');
SET ROLE authenticated;
SELECT test.fails(format($$SELECT public.start_exam_attempt(%L)$$, :'dsa_exam'),
                  'unassigned student is still refused (gate does not loosen anything)');
RESET ROLE;

\echo TEMPORARY PASSWORD GATE TEST COMPLETE
