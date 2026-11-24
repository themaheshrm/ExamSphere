-- =============================================================================
-- ExamSphere Migration 005: Multi-institution tenancy & access-control core
--
--  * private schema (NOT exposed through PostgREST) for RLS helpers & internals
--  * enums used across later migrations
--  * institutions, departments, student_details
--  * profiles hardening (new columns, case-insensitive uniqueness, tenancy FKs,
--    column-level privileges, policies rebuilt from scratch)
--  * hardened signup trigger (role/institution only from server-set app_metadata)
--  * activity_logs extended + made append-only
--  * 004's RPCs re-issued with the same signatures but stricter checks
-- =============================================================================

-- ─── 0. Private schema & shared utilities ────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
-- RLS policies execute helper functions as the querying role → USAGE required.
GRANT USAGE ON SCHEMA private TO authenticated;

DO $$ BEGIN
  CREATE TYPE public.question_difficulty AS ENUM ('easy', 'medium', 'hard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.exam_status AS ENUM ('draft', 'published', 'closed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.assignment_status AS ENUM ('assigned', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.attempt_status AS ENUM ('active', 'submitted', 'auto_submitted', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.results_release_mode AS ENUM ('immediate', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- True only for direct maintenance sessions (SQL editor / migrations), never for
-- API traffic (PostgREST connects as "authenticator").
CREATE OR REPLACE FUNCTION private.is_maintenance_session()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT session_user IN ('postgres', 'supabase_admin')
$$;

CREATE OR REPLACE FUNCTION private.block_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF private.is_maintenance_session() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION '% on %.% is not permitted (append-only / immutable record).',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '42501';
END $$;

-- ─── 1. Institutions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.institutions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL,                       -- e.g. '1DA' (VTU college code)
  name         text NOT NULL,
  short_name   text,
  email_domain text,                                -- e.g. 'drait.edu.in'
  address      text,
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institutions_code_format CHECK (code ~ '^[A-Z0-9]{2,12}$'),
  CONSTRAINT institutions_name_len    CHECK (length(btrim(name)) BETWEEN 2 AND 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS institutions_code_key ON public.institutions (code);
DROP TRIGGER IF EXISTS institutions_updated_at ON public.institutions;
CREATE TRIGGER institutions_updated_at BEFORE UPDATE ON public.institutions
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ─── 2. Departments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE RESTRICT,
  code           text NOT NULL,                     -- e.g. 'CS'
  name           text NOT NULL,                     -- 'Computer Science & Engineering'
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departments_code_format CHECK (code ~ '^[A-Z0-9]{1,12}$'),
  CONSTRAINT departments_institution_code_key UNIQUE (institution_id, code),
  -- target for composite FKs that guarantee same-institution references
  CONSTRAINT departments_id_institution_key UNIQUE (id, institution_id)
);
DROP TRIGGER IF EXISTS departments_updated_at ON public.departments;
CREATE TRIGGER departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ─── 3. Profiles hardening ───────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email          text,
  ADD COLUMN IF NOT EXISTS staff_id       text,
  ADD COLUMN IF NOT EXISTS usn            text,
  ADD COLUMN IF NOT EXISTS institution_id uuid,
  ADD COLUMN IF NOT EXISTS department_id  uuid,
  ADD COLUMN IF NOT EXISTS is_active      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

-- Canonicalise identifiers once so every lookup is case-insensitive & indexable.
UPDATE public.profiles
SET usn      = NULLIF(upper(btrim(usn)), ''),
    staff_id = NULLIF(upper(btrim(staff_id)), ''),
    email    = NULLIF(lower(btrim(email)), '')
WHERE usn IS DISTINCT FROM NULLIF(upper(btrim(usn)), '')
   OR staff_id IS DISTINCT FROM NULLIF(upper(btrim(staff_id)), '')
   OR email IS DISTINCT FROM NULLIF(lower(btrim(email)), '');

-- 003 created plain btree indexes that the UPPER(...) lookups in 004 never use.
DROP INDEX IF EXISTS public.idx_profiles_usn;
DROP INDEX IF EXISTS public.idx_profiles_staff_id;
DROP INDEX IF EXISTS public.idx_profiles_email;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_usn_key      ON public.profiles (upper(usn))      WHERE usn IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_staff_id_key ON public.profiles (upper(staff_id)) WHERE staff_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_key    ON public.profiles (lower(email))    WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_institution_role_idx ON public.profiles (institution_id, role);
CREATE INDEX IF NOT EXISTS profiles_department_idx       ON public.profiles (department_id) WHERE department_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_institution_id_fkey'
                 AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_institution_id_fkey
      FOREIGN KEY (institution_id) REFERENCES public.institutions (id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_department_same_institution_fkey') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_department_same_institution_fkey
      FOREIGN KEY (department_id, institution_id)
      REFERENCES public.departments (id, institution_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_institution_key') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_institution_key UNIQUE (id, institution_id);
  END IF;
  -- NOT VALID: enforced for every new/changed row, existing rows are left alone
  -- until cleaned up (then run VALIDATE CONSTRAINT).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_scoped_role_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_scoped_role_chk
      CHECK (role = 'super_admin' OR institution_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_student_usn_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_student_usn_chk
      CHECK (role <> 'student' OR usn IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_identifier_format_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_identifier_format_chk CHECK (
      (usn IS NULL OR usn ~ '^[A-Z0-9]{5,20}$') AND
      (staff_id IS NULL OR staff_id ~ '^[A-Z0-9-]{3,30}$') AND
      (email IS NULL OR email = lower(email))
    ) NOT VALID;
  END IF;
END $$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ─── 4. Student academic details (sensitive PII kept out of profiles) ────────
CREATE TABLE IF NOT EXISTS public.student_details (
  profile_id      uuid PRIMARY KEY,
  institution_id  uuid NOT NULL,
  semester        smallint CHECK (semester BETWEEN 1 AND 12),
  section         text CHECK (section ~ '^[A-Z0-9]{1,4}$'),
  admission_year  smallint CHECK (admission_year BETWEEN 1990 AND 2100),
  academic_scheme text,                              -- '2022 Scheme (Autonomous)'
  phone           text CHECK (phone ~ '^\+?[0-9 -]{7,20}$'),
  date_of_birth   date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_details_profile_fkey FOREIGN KEY (profile_id, institution_id)
    REFERENCES public.profiles (id, institution_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS student_details_cohort_idx
  ON public.student_details (institution_id, semester, section);
DROP TRIGGER IF EXISTS student_details_updated_at ON public.student_details;
CREATE TRIGGER student_details_updated_at BEFORE UPDATE ON public.student_details
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ─── 5. RLS helper functions (SECURITY DEFINER, cached per statement via
--        `(SELECT private.fn())` in policies) ──────────────────────────────────
CREATE OR REPLACE FUNCTION private.my_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active
$$;

CREATE OR REPLACE FUNCTION private.my_institution_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active
$$;

CREATE OR REPLACE FUNCTION private.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT p.role = 'super_admin' FROM public.profiles p
                   WHERE p.id = auth.uid() AND p.is_active), false)
$$;

-- Institution an *institution admin* manages; NULL for everyone else.
CREATE OR REPLACE FUNCTION private.my_admin_institution_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.institution_id FROM public.profiles p
  WHERE p.id = auth.uid() AND p.is_active AND p.role = 'admin'
$$;

CREATE OR REPLACE FUNCTION private.can_manage_institution(p_institution_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active
      AND (p.role = 'super_admin'
           OR (p.role = 'admin' AND p.institution_id = p_institution_id))
  )
$$;

CREATE OR REPLACE FUNCTION private.assert_can_manage(p_institution_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_institution_id IS NULL OR NOT private.can_manage_institution(p_institution_id) THEN
    RAISE EXCEPTION 'Access denied for this institution.' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.require_active_student()
RETURNS public.profiles LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile public.profiles;
BEGIN
  SELECT * INTO v_profile FROM public.profiles
  WHERE id = auth.uid() AND is_active AND role = 'student';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active student account is required.' USING ERRCODE = '42501';
  END IF;
  RETURN v_profile;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  private.my_role(), private.my_institution_id(), private.is_super_admin(),
  private.my_admin_institution_id(), private.can_manage_institution(uuid)
TO authenticated;

-- ─── 6. Activity log: extend + append-only ───────────────────────────────────
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institutions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type    text,
  ADD COLUMN IF NOT EXISTS entity_id      uuid,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS activity_logs_institution_time_idx ON public.activity_logs (institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_entity_idx           ON public.activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS activity_logs_user_time_idx        ON public.activity_logs (user_id, created_at DESC);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS activity_logs_append_only ON public.activity_logs;
CREATE TRIGGER activity_logs_append_only BEFORE UPDATE OR DELETE ON public.activity_logs
  FOR EACH ROW EXECUTE FUNCTION private.block_mutation();

CREATE OR REPLACE FUNCTION private.log_activity(
  p_action text, p_institution_id uuid, p_entity_type text, p_entity_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.activity_logs (user_id, action, institution_id, entity_type, entity_id, details)
  VALUES (auth.uid(), p_action, p_institution_id, p_entity_type, p_entity_id,
          COALESCE(p_details, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION private.log_activity(text, uuid, text, uuid, jsonb) FROM PUBLIC;

-- ─── 7. Hardened signup trigger ──────────────────────────────────────────────
-- Role / institution / identifiers are read ONLY from raw_app_meta_data, which
-- end users cannot write (only the service role via auth.admin.createUser).
-- super_admin can never be granted through metadata.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb);
  v_role public.user_role := 'student';
BEGIN
  IF v_meta->>'role' IN ('student', 'admin') THEN
    v_role := (v_meta->>'role')::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, institution_id, department_id, usn, staff_id)
  VALUES (
    NEW.id,
    lower(NEW.email),
    COALESCE(NULLIF(v_meta->>'full_name', ''), split_part(NEW.email, '@', 1)),
    v_role,
    NULLIF(v_meta->>'institution_id', '')::uuid,
    NULLIF(v_meta->>'department_id', '')::uuid,
    NULLIF(upper(btrim(v_meta->>'usn')), ''),
    NULLIF(upper(btrim(v_meta->>'staff_id')), '')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email
    WHERE public.profiles.email IS NULL;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_email_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.profiles SET email = lower(NEW.email) WHERE id = NEW.id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_auth_user()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_auth_user_email_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_auth_user_email_change();

-- ─── 8. 004 RPCs re-issued (same signatures → frontend unchanged) ────────────
CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier text, p_role text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id    text := upper(btrim(p_identifier));
  v_email text;
BEGIN
  IF v_id IS NULL OR length(v_id) NOT BETWEEN 3 AND 60 OR v_id !~ '^[A-Z0-9-]+$' THEN
    RETURN NULL;
  END IF;

  IF p_role IS NULL OR p_role = 'student' THEN
    SELECT p.email INTO v_email FROM public.profiles p
    WHERE upper(p.usn) = v_id AND p.role = 'student' AND p.is_active AND p.email IS NOT NULL;
    IF v_email IS NOT NULL THEN RETURN v_email; END IF;
  END IF;

  IF p_role IS NULL OR p_role = 'admin' THEN
    SELECT p.email INTO v_email FROM public.profiles p
    WHERE upper(p.staff_id) = v_id AND p.role = 'admin' AND p.is_active AND p.email IS NOT NULL;
    IF v_email IS NOT NULL THEN RETURN v_email; END IF;
  END IF;

  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.resolve_login_identifier(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_provision_user(
  p_target_user_id uuid, p_new_role public.user_role,
  p_institution_id uuid DEFAULT NULL, p_staff_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_target public.profiles;
BEGIN
  IF NOT private.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Only Super Administrators can provision roles.' USING ERRCODE = '42501';
  END IF;
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role.' USING ERRCODE = '42501';
  END IF;
  IF p_new_role <> 'super_admin' AND p_institution_id IS NULL THEN
    RAISE EXCEPTION 'An institution is required for % accounts.', p_new_role;
  END IF;
  IF p_institution_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.institutions WHERE id = p_institution_id AND is_active) THEN
    RAISE EXCEPTION 'Institution not found or inactive.';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user profile not found.';
  END IF;

  UPDATE public.profiles
  SET role           = p_new_role,
      institution_id = CASE WHEN p_new_role = 'super_admin' THEN NULL ELSE p_institution_id END,
      department_id  = CASE WHEN institution_id IS DISTINCT FROM p_institution_id THEN NULL ELSE department_id END,
      staff_id       = CASE WHEN p_new_role = 'student' THEN NULL
                            ELSE NULLIF(upper(btrim(p_staff_id)), '') END
  WHERE id = p_target_user_id;

  PERFORM private.log_activity('ROLE_PROVISIONED', p_institution_id, 'profile', p_target_user_id,
    jsonb_build_object('previous_role', v_target.role, 'assigned_role', p_new_role,
                       'previous_institution_id', v_target.institution_id,
                       'institution_id', p_institution_id, 'staff_id', p_staff_id));

  RETURN jsonb_build_object('success', true, 'user_id', p_target_user_id, 'role', p_new_role);
END $$;
REVOKE ALL ON FUNCTION public.admin_provision_user(uuid, public.user_role, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_provision_user(uuid, public.user_role, uuid, text) TO authenticated;

-- Institution admins maintain their own students' academic data.
CREATE OR REPLACE FUNCTION public.admin_update_student(
  p_student_id uuid, p_full_name text DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_semester smallint DEFAULT NULL, p_section text DEFAULT NULL,
  p_admission_year smallint DEFAULT NULL, p_is_active boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student public.profiles;
BEGIN
  SELECT * INTO v_student FROM public.profiles WHERE id = p_student_id AND role = 'student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found.'; END IF;
  PERFORM private.assert_can_manage(v_student.institution_id);

  UPDATE public.profiles
  SET full_name     = COALESCE(NULLIF(btrim(p_full_name), ''), full_name),
      department_id = COALESCE(p_department_id, department_id),
      is_active     = COALESCE(p_is_active, is_active)
  WHERE id = p_student_id;

  INSERT INTO public.student_details (profile_id, institution_id, semester, section, admission_year)
  VALUES (p_student_id, v_student.institution_id, p_semester, upper(p_section), p_admission_year)
  ON CONFLICT (profile_id) DO UPDATE
    SET semester       = COALESCE(EXCLUDED.semester, public.student_details.semester),
        section        = COALESCE(EXCLUDED.section, public.student_details.section),
        admission_year = COALESCE(EXCLUDED.admission_year, public.student_details.admission_year);

  PERFORM private.log_activity('STUDENT_UPDATED', v_student.institution_id, 'profile', p_student_id,
    jsonb_build_object('department_id', p_department_id, 'semester', p_semester,
                       'section', p_section, 'is_active', p_is_active));
  RETURN jsonb_build_object('success', true, 'student_id', p_student_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_update_student(uuid, text, uuid, smallint, text, smallint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_student(uuid, text, uuid, smallint, text, smallint, boolean) TO authenticated;

-- ─── 9. Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.institutions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_details ENABLE ROW LEVEL SECURITY;

-- Replace whatever undeclared policies exist on profiles (names unknown; see
-- discovery step 5) with the definitive set below.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- institutions
DROP POLICY IF EXISTS institutions_select ON public.institutions;
CREATE POLICY institutions_select ON public.institutions FOR SELECT TO authenticated
  USING (id = (SELECT private.my_institution_id()) OR (SELECT private.is_super_admin()));
DROP POLICY IF EXISTS institutions_write_super ON public.institutions;
CREATE POLICY institutions_write_super ON public.institutions FOR ALL TO authenticated
  USING ((SELECT private.is_super_admin())) WITH CHECK ((SELECT private.is_super_admin()));

-- departments
DROP POLICY IF EXISTS departments_select ON public.departments;
CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_institution_id()) OR (SELECT private.is_super_admin()));
DROP POLICY IF EXISTS departments_write_admin ON public.departments;
CREATE POLICY departments_write_admin ON public.departments FOR ALL TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()))
  WITH CHECK (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));

-- profiles: read own row; admins read their institution; super admin reads all.
-- All writes go through SECURITY DEFINER RPCs / the Edge Function.
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_select_admin ON public.profiles FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));

-- student_details: own row + managing admins (read only; writes via RPC)
DROP POLICY IF EXISTS student_details_select ON public.student_details;
CREATE POLICY student_details_select ON public.student_details FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid())
         OR institution_id = (SELECT private.my_admin_institution_id())
         OR (SELECT private.is_super_admin()));

-- activity_logs: admins read their institution; super admin reads all; no direct writes.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'activity_logs' LOOP
    EXECUTE format('DROP POLICY %I ON public.activity_logs', r.policyname);
  END LOOP;
END $$;
CREATE POLICY activity_logs_select ON public.activity_logs FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));

-- ─── 10. Table privileges (defence in depth on top of RLS) ───────────────────
REVOKE ALL ON public.institutions, public.departments, public.profiles,
              public.student_details, public.activity_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles, public.student_details,
              public.activity_logs FROM authenticated;
GRANT SELECT ON public.institutions, public.departments, public.profiles,
               public.student_details, public.activity_logs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.institutions, public.departments TO authenticated;
