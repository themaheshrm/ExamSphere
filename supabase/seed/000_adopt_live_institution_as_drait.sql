-- =============================================================================
-- OPTIONAL, run only with the owner's explicit approval, after migrations
-- 002–013 and BEFORE seed/001_drait_catalogue.sql.
--
-- The live project has one placeholder institution ("Apex Engineering
-- University", code APEX-01) holding the existing admin and student accounts.
-- ExamSphere serves Dr. AIT only. This converts that single row into Dr. AIT
-- (code 1DA), so the existing accounts belong to Dr. AIT and the catalogue
-- seed reuses the row instead of creating a second institution.
--
-- Changes exactly one institutions row; no accounts, profiles or other rows
-- are modified or deleted. Refuses to run unless the state is exactly as
-- discovered. Rollback: restore the backup taken before the migrations.
-- =============================================================================
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.institutions WHERE upper(code::text) = '1DA') THEN
    RAISE NOTICE 'Dr. AIT (1DA) already exists; nothing to adopt.';
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.institutions) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.institutions WHERE upper(code::text) = 'APEX-01') THEN
    RAISE EXCEPTION 'Unexpected institutions state (expected exactly one row, APEX-01). Nothing changed.';
  END IF;
  UPDATE public.institutions
  SET code = '1DA',
      name = 'Dr. Ambedkar Institute of Technology',
      short_name = 'Dr. AIT',
      email_domain = 'drait.edu.in',
      domain = 'drait.edu.in'   -- the legacy column on the live project
  WHERE upper(code::text) = 'APEX-01';
  RAISE NOTICE 'APEX-01 adopted as Dr. AIT (1DA); its accounts now belong to Dr. AIT.';
END $$;
COMMIT;
