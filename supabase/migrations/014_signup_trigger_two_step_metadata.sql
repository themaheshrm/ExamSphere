-- =============================================================================
-- ExamSphere Migration 014: profile creation for admin-API account creation
--
-- Bug: Supabase Auth's admin createUser() INSERTs the auth.users row with only
-- {provider, providers} in raw_app_meta_data and writes the caller's
-- app_metadata (role, institution_id, staff_id, usn …) in a second statement
-- of the same transaction. The 005 trigger therefore saw no role and no
-- institution and inserted a 'student' profile with institution_id NULL,
-- which profiles_scoped_role_chk (role = 'super_admin' OR institution_id IS
-- NOT NULL) rejects — so creating admins and students failed.
--
-- Fix (no constraint is weakened):
--   * the INSERT trigger creates the profile only when the signed
--     app_metadata already carries a role AND an institution;
--   * a new AFTER UPDATE OF raw_app_meta_data trigger creates the missing
--     profile once that metadata arrives (still inside the same transaction);
--   * role/institution are still read ONLY from raw_app_meta_data (service
--     role only); super_admin can still never be granted through metadata.
-- Existing profiles are never modified by these triggers.
-- Idempotent. Requires 005. Rollback: re-run 005's handle_new_auth_user and
-- drop trigger on_auth_user_app_metadata_set.
-- =============================================================================

CREATE OR REPLACE FUNCTION private.create_profile_from_auth(p_user auth.users)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_meta jsonb := COALESCE(p_user.raw_app_meta_data, '{}'::jsonb);
BEGIN
  -- Only accounts provisioned with a role and an institution get a profile
  -- here; anything else waits for its metadata (or for the provisioning code).
  IF NOT COALESCE(v_meta->>'role' IN ('student', 'admin'), FALSE)
   OR NULLIF(v_meta->>'institution_id', '') IS NULL THEN
  RETURN;
END IF;

  INSERT INTO public.profiles (id, email, full_name, role, institution_id, department_id, usn, staff_id)
  VALUES (
    p_user.id,
    lower(p_user.email),
    COALESCE(NULLIF(v_meta->>'full_name', ''), split_part(p_user.email, '@', 1)),
    (v_meta->>'role')::public.user_role,
    (v_meta->>'institution_id')::uuid,
    NULLIF(v_meta->>'department_id', '')::uuid,
    NULLIF(upper(btrim(v_meta->>'usn')), ''),
    NULLIF(upper(btrim(v_meta->>'staff_id')), '')
  )
  ON CONFLICT (id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION private.create_profile_from_auth(auth.users) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.create_profile_from_auth(NEW);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_app_metadata_set()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    PERFORM private.create_profile_from_auth(NEW);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_auth_user()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_auth_user_app_metadata_set()  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_app_metadata_set ON auth.users;
CREATE TRIGGER on_auth_user_app_metadata_set
  AFTER UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_app_metadata_set();
