-- LOCAL TEST ONLY. Post-upgrade checks on the replica of the live project
-- (fixtures/live_baseline_2026_11.sql → 002–013 → 000 adoption → seed → 013).
\set ON_ERROR_STOP 1
\pset pager off
SET client_min_messages = warning;
CREATE SCHEMA test;
GRANT USAGE ON SCHEMA test TO anon, authenticated;
CREATE FUNCTION test.ok(p boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %', p_msg; END IF;
  RAISE NOTICE 'PASS  %', p_msg;
END $$;
CREATE FUNCTION test.fails(p_sql text, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql; EXCEPTION WHEN others THEN RAISE NOTICE 'PASS  % (blocked: %)', p_msg, SQLERRM; RETURN; END;
  RAISE EXCEPTION 'ASSERTION FAILED (no error): %', p_msg;
END $$;
CREATE FUNCTION test.login(p_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, false)
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO anon, authenticated;
SET client_min_messages = notice;

-- ── existing accounts are intact ────────────────────────────────────────────
SELECT test.ok((SELECT count(*) FROM public.profiles WHERE id::text LIKE 'aaaa0000-%') = 3, 'all 3 existing accounts kept');
SELECT test.ok((SELECT role FROM public.profiles WHERE id = 'aaaa0000-0000-0000-0000-0000000000f1') = 'super_admin', 'super admin role kept');
SELECT test.ok((SELECT role FROM public.profiles WHERE id = 'aaaa0000-0000-0000-0000-0000000000f2') = 'admin', 'admin role kept');
SELECT test.ok((SELECT usn FROM public.profiles WHERE id = 'aaaa0000-0000-0000-0000-0000000000f3') = '1AP22CS001', 'student USN kept');
SELECT test.ok((SELECT bool_and(is_active) FROM public.profiles WHERE id::text LIKE 'aaaa0000-%'), 'is_active carried over from is_suspended');

-- ── one institution: the placeholder was adopted as Dr. AIT ─────────────────
SELECT test.ok((SELECT count(*) FROM public.institutions) = 1, 'single institution after adoption + seed');
SELECT test.ok((SELECT code::text FROM public.institutions) = '1DA', 'institution is Dr. AIT (1DA)');
SELECT test.ok((SELECT institution_id FROM public.profiles WHERE id = 'aaaa0000-0000-0000-0000-0000000000f2')
               = (SELECT id FROM public.institutions WHERE code = '1DA'), 'existing admin belongs to Dr. AIT');
SELECT test.ok((SELECT count(*) FROM public.subjects) = 6 AND (SELECT count(*) FROM public.questions) = 150, 'catalogue seeded into the adopted institution');

-- ── legacy schema quarantined, not dropped ──────────────────────────────────
SELECT test.ok((SELECT count(*) FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
                AND relname IN ('legacy_exams','legacy_questions','legacy_question_keys','legacy_exam_attempts','legacy_answers','legacy_results')) = 6,
               'six legacy exam tables kept as legacy_*');
SELECT test.ok(to_regtype('public.legacy_exam_status') IS NOT NULL AND to_regtype('public.legacy_attempt_status') IS NOT NULL, 'legacy enums renamed');
SELECT test.ok((SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = 'public.attempt_status'::regtype)
               = ARRAY['active','submitted','auto_submitted','voided'], 'new attempt_status enum in place');
SELECT test.ok(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'statement'),
               'public.questions is the new question bank');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'institutions'
                           AND policyname IN ('super_admin_manage_institutions', 'users_read_own_institution')), 'legacy institution policies replaced');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'activity_logs'
                           AND policyname = 'users_append_activity_logs'), 'legacy forgeable activity-log insert policy removed');

-- ── API roles cannot use the legacy tables ──────────────────────────────────
SELECT test.login('aaaa0000-0000-0000-0000-0000000000f2');
SET ROLE authenticated;
SELECT test.fails($$SELECT count(*) FROM public.legacy_exams$$, 'authenticated cannot read legacy_exams');
SELECT test.ok((SELECT count(*) FROM public.admin_question_bank) = 150, 'existing admin sees the Dr. AIT bank');
RESET ROLE;
SELECT test.login('aaaa0000-0000-0000-0000-0000000000f3');
SET ROLE authenticated;
SELECT test.ok((SELECT count(*) FROM public.question_answer_keys) = 0, 'existing student sees no answer keys');
SELECT test.ok((SELECT count(*) FROM public.get_my_exams()) = 0, 'get_my_exams works for the existing student');
RESET ROLE;

-- ── new signups still get a profile (signup trigger replaced by 005) ────────
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES ('aaaa0000-0000-0000-0000-0000000000f4', 'cs009@drait.edu.in',
        jsonb_build_object('role', 'student', 'usn', 'CS009', 'full_name', 'New Student',
                           'institution_id', (SELECT id FROM public.institutions WHERE code = '1DA')));
SELECT test.ok((SELECT usn FROM public.profiles WHERE id = 'aaaa0000-0000-0000-0000-0000000000f4') = 'CS009', 'new student account gets a profile');

\echo LIVE UPGRADE TEST COMPLETE
