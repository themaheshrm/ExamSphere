-- 012_temporary_password_gate.sql
-- Accounts created by the `create-student` Edge Function start with a
-- temporary password and app_metadata.must_change_password = true. The web
-- app sends such students to a change-password screen; this migration makes
-- the database refuse to START an examination attempt until the flag has been
-- cleared by the `change-temporary-password` Edge Function.
--
-- REVIEW BEFORE APPLYING. Not applied to any Supabase project; verified only
-- against a disposable local PostgreSQL (supabase/tests/130_*).
--
-- How: private.require_active_student() (005) — the gate used by
-- start_exam_attempt (008) — also checks the caller's signed JWT claim.
-- app_metadata can only be written with the service role, so a student cannot
-- clear the flag themselves. Accounts without the flag are unaffected.
-- Idempotent (CREATE OR REPLACE); body otherwise identical to 005.

CREATE OR REPLACE FUNCTION private.require_active_student()
RETURNS public.profiles LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile public.profiles;
BEGIN
  SELECT * INTO v_profile FROM public.profiles
  WHERE id = auth.uid() AND is_active AND role = 'student';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active student account is required.' USING ERRCODE = '42501';
  END IF;
  -- 012: a temporary password must be replaced before any examination starts.
  IF COALESCE((auth.jwt() -> 'app_metadata' ->> 'must_change_password')::boolean, false) THEN
    RAISE EXCEPTION 'Change your temporary password before starting an examination.' USING ERRCODE = '42501';
  END IF;
  RETURN v_profile;
END $$;
