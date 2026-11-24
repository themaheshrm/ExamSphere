-- =============================================================================
-- ExamSphere · 000 PRE-FLIGHT DISCOVERY  (READ-ONLY — changes nothing)
-- Run in Supabase SQL Editor BEFORE any new migration and share the output.
-- Purpose: reveal the undeclared baseline (migrations 001/002 were never
-- committed) so 005+ can be reconciled instead of blindly duplicating objects.
-- =============================================================================

-- 1. Which ExamSphere objects already exist?
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Exact column layout of the tables the frontend / 003 / 004 depend on
SELECT table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'activity_logs', 'institutions', 'departments')
ORDER BY table_name, ordinal_position;

-- 3. Enum types and their labels (user_role is required by 004)
SELECT t.typname, e.enumlabel, e.enumsortorder
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;

-- 4. Constraints (PK / FK / UNIQUE / CHECK) on existing tables
SELECT conrelid::regclass AS table_name, conname, contype,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

-- 5. Existing RLS state and policies (names are needed to replace them safely)
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r';

SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY tablename, policyname;

-- 6. Functions and triggers (handle_new_auth_user, RPCs from 004, anything else)
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'private')
ORDER BY p.proname;

SELECT event_object_schema, event_object_table, trigger_name,
       action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'auth')
ORDER BY event_object_table, trigger_name;

-- 7. Grants given to anon / authenticated on public tables
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- 8. Data-quality checks that would block new UNIQUE / FK / CHECK constraints
SELECT 'duplicate usn' AS issue, upper(usn) AS value, count(*)
FROM public.profiles WHERE usn IS NOT NULL GROUP BY upper(usn) HAVING count(*) > 1
UNION ALL
SELECT 'duplicate staff_id', upper(staff_id), count(*)
FROM public.profiles WHERE staff_id IS NOT NULL GROUP BY upper(staff_id) HAVING count(*) > 1
UNION ALL
SELECT 'duplicate email', lower(email), count(*)
FROM public.profiles WHERE email IS NOT NULL GROUP BY lower(email) HAVING count(*) > 1;

SELECT role, count(*) AS total,
       count(*) FILTER (WHERE institution_id IS NULL) AS without_institution,
       count(*) FILTER (WHERE usn IS NULL)            AS without_usn,
       count(*) FILTER (WHERE email IS NULL)          AS without_email
FROM public.profiles
GROUP BY role;

-- profiles whose institution_id points nowhere (only meaningful if institutions exists)
-- SELECT p.id, p.institution_id FROM public.profiles p
-- LEFT JOIN public.institutions i ON i.id = p.institution_id
-- WHERE p.institution_id IS NOT NULL AND i.id IS NULL;

-- 9. Platform facts that affect the design
SELECT version();
SELECT extname, extversion FROM pg_extension ORDER BY extname;   -- pg_cron? pgcrypto?
SELECT count(*) AS auth_users FROM auth.users;
