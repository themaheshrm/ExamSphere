-- =============================================================================
-- ExamSphere Migration 002: reconcile the LIVE legacy schema (apply before 003)
--
-- Discovery on 2026-11-26 found an earlier, never-committed exam schema on the
-- live project. Its tables are EMPTY, but they share names with tables that
-- 006–010 create (questions, exams, exam_attempts) and its enums have other
-- labels (exam_status, attempt_status). Because 005–013 use IF NOT EXISTS,
-- they would silently keep the old shapes and fail later.
--
-- This migration:
--   * refuses to run if any legacy exam table contains rows (nothing is lost);
--   * RENAMES (never drops) the six legacy exam tables and two enums to
--     legacy_* (indexes and constraints too, so new names do not collide) and
--     revokes API access to them;
--   * replaces two legacy institutions policies (005 recreates equivalents);
--   * adds the institutions / profiles columns that 005+ expect, carrying
--     profiles.is_suspended over to is_active.
-- Accounts, profiles, institutions, activity_logs, the signup trigger and all
-- existing rows are kept. Idempotent; a no-op on databases without the legacy
-- schema (fresh projects, CI). Rollback: restore the pre-migration backup.
-- =============================================================================

DO $$
DECLARE
  t text;
  n bigint;
  idx record;
  legacy_tables text[] := ARRAY['answers', 'results', 'question_keys', 'exam_attempts', 'questions', 'exams'];
  is_legacy boolean;
BEGIN
  -- The legacy shape is recognised by legacy-only columns, so the new tables
  -- created by 006–009 are never touched on a re-run.
  is_legacy := EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'question_text')
            OR EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'start_time');
  IF NOT is_legacy THEN
    RAISE NOTICE '002: no legacy exam schema found; nothing to reconcile.';
    RETURN;
  END IF;

  -- 1. Safety: refuse if any legacy exam table holds data.
  FOREACH t IN ARRAY legacy_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION '002: legacy table public.% has % row(s). Export it first; nothing was changed.', t, n;
      END IF;
    END IF;
  END LOOP;

  -- 2. Rename tables, then their indexes (constraint names follow the index).
  FOREACH t IN ARRAY legacy_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND to_regclass('public.legacy_' || t) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', t, 'legacy_' || t);
      FOR idx IN
        SELECT i.relname FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        WHERE x.indrelid = format('public.%I', 'legacy_' || t)::regclass AND i.relname NOT LIKE 'legacy\_%'
      LOOP
        EXECUTE format('ALTER INDEX public.%I RENAME TO %I', idx.relname, 'legacy_' || idx.relname);
      END LOOP;
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', 'legacy_' || t);
    END IF;
  END LOOP;

  -- 3. Rename the enums whose labels differ from 005's definitions.
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid
             WHERE ty.typnamespace = 'public'::regnamespace AND ty.typname = 'exam_status' AND e.enumlabel = 'active')
     AND to_regtype('public.legacy_exam_status') IS NULL THEN
    ALTER TYPE public.exam_status RENAME TO legacy_exam_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid
             WHERE ty.typnamespace = 'public'::regnamespace AND ty.typname = 'attempt_status' AND e.enumlabel = 'in_progress')
     AND to_regtype('public.legacy_attempt_status') IS NULL THEN
    ALTER TYPE public.attempt_status RENAME TO legacy_attempt_status;
  END IF;

  -- 4. The legacy paper generator reads public.questions by name; detach it
  --    from the renamed table (the function itself is kept).
  IF to_regclass('public.legacy_exam_attempts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_generate_attempt_paper ON public.legacy_exam_attempts;
  END IF;
END $$;

-- 5. Legacy institution policies duplicate 005's institutions_select /
--    institutions_write_super; drop them so one definition governs access.
DO $$
BEGIN
  IF to_regclass('public.institutions') IS NOT NULL THEN
    DROP POLICY IF EXISTS super_admin_manage_institutions ON public.institutions;
    DROP POLICY IF EXISTS users_read_own_institution ON public.institutions;
  END IF;
END $$;

-- 6. Columns 005+ expect on existing tables (all additive).
DO $$
BEGIN
  IF to_regclass('public.institutions') IS NOT NULL THEN
    ALTER TABLE public.institutions
      ADD COLUMN IF NOT EXISTS short_name   text,
      ADD COLUMN IF NOT EXISTS email_domain text,
      ADD COLUMN IF NOT EXISTS address      text,
      ADD COLUMN IF NOT EXISTS settings     jsonb NOT NULL DEFAULT '{}'::jsonb;
    -- carry the legacy `domain` column over (kept as is)
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'institutions' AND column_name = 'domain') THEN
      UPDATE public.institutions SET email_domain = domain WHERE email_domain IS NULL AND domain IS NOT NULL;
    END IF;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_suspended')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_active') THEN
    ALTER TABLE public.profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
    UPDATE public.profiles SET is_active = NOT is_suspended WHERE is_suspended;
  END IF;
END $$;
