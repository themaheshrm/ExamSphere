-- ==============================================================================
-- ExamSphere Migration 004: Secure Identifier Resolution & Privileged Provisioning
-- Prevents directory enumeration, secures pre-auth USN/Staff ID lookups,
-- and enforces trusted role provisioning by Super Administrators.
-- ==============================================================================

-- 1. DROP the insecure public view from migration 003 to eliminate directory enumeration.
DROP VIEW IF EXISTS public.profile_email_lookup CASCADE;

-- 2. Ensure schema columns exist on profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS staff_id TEXT;

-- Index lookups for high performance and low query latency
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_staff_id ON public.profiles (staff_id);
CREATE INDEX IF NOT EXISTS idx_profiles_usn ON public.profiles (usn);

-- 3. Create SECURE server-side identifier resolver RPC
-- Eliminates anonymous SELECT access on tables/views.
-- Rejects wildcards, enforces strict length bounds, and returns exact email only.
CREATE OR REPLACE FUNCTION public.resolve_login_identifier(
  p_identifier TEXT,
  p_role TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT;
  v_clean_id TEXT;
  v_role_filter public.user_role;
BEGIN
  -- Strip whitespace and convert to uppercase for canonical matching
  v_clean_id := UPPER(TRIM(p_identifier));

  -- Input sanitization: enforce length bounds (3-60 chars)
  IF v_clean_id IS NULL OR LENGTH(v_clean_id) < 3 OR LENGTH(v_clean_id) > 60 THEN
    RETURN NULL;
  END IF;

  -- Disallow SQL wildcard operators to prevent pattern probing
  IF v_clean_id LIKE '%\%%' OR v_clean_id LIKE '%\_%' THEN
    RETURN NULL;
  END IF;

  -- Parse optional role filter
  IF p_role = 'student' THEN
    v_role_filter := 'student'::public.user_role;
  ELSIF p_role = 'admin' THEN
    v_role_filter := 'admin'::public.user_role;
  ELSIF p_role = 'super-admin' OR p_role = 'super_admin' THEN
    v_role_filter := 'super_admin'::public.user_role;
  ELSE
    v_role_filter := NULL;
  END IF;

  -- Candidate USN Resolution
  IF v_role_filter = 'student'::public.user_role OR v_role_filter IS NULL THEN
    SELECT email INTO v_email
    FROM public.profiles
    WHERE UPPER(usn) = v_clean_id
      AND (role = 'student'::public.user_role OR v_role_filter IS NULL)
      AND email IS NOT NULL
    LIMIT 1;

    IF v_email IS NOT NULL THEN
      RETURN v_email;
    END IF;
  END IF;

  -- Staff / Admin ID Resolution
  IF v_role_filter = 'admin'::public.user_role OR v_role_filter IS NULL THEN
    SELECT email INTO v_email
    FROM public.profiles
    WHERE UPPER(staff_id) = v_clean_id
      AND (role = 'admin'::public.user_role OR v_role_filter IS NULL)
      AND email IS NOT NULL
    LIMIT 1;

    IF v_email IS NOT NULL THEN
      RETURN v_email;
    END IF;
  END IF;

  -- Non-existent or unmatched identifier
  RETURN NULL;
END;
$$;

-- Restrict function execution: revoke public default, grant to anon and authenticated
REVOKE ALL ON FUNCTION public.resolve_login_identifier(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT, TEXT) TO anon, authenticated;

-- 4. Trusted Role Provisioning RPC
-- Only authenticated Super Administrators can elevate user roles.
-- Writes tamper-proof records to public.activity_logs.
CREATE OR REPLACE FUNCTION public.admin_provision_user(
  p_target_user_id UUID,
  p_new_role public.user_role,
  p_institution_id UUID DEFAULT NULL,
  p_staff_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role public.user_role;
BEGIN
  -- Enforce authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Verify caller has master super_admin authority
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role != 'super_admin'::public.user_role THEN
    RAISE EXCEPTION 'Access denied. Only Super Administrators can provision administrative roles.';
  END IF;

  -- Apply role and institutional assignment
  UPDATE public.profiles
  SET
    role = p_new_role,
    institution_id = p_institution_id,
    staff_id = p_staff_id,
    updated_at = NOW()
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user profile not found for ID %.', p_target_user_id;
  END IF;

  -- Immutable audit logging
  INSERT INTO public.activity_logs (user_id, action, details)
  VALUES (
    auth.uid(),
    'ROLE_PROVISIONED',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'assigned_role', p_new_role,
      'institution_id', p_institution_id,
      'staff_id', p_staff_id,
      'provisioned_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'role', p_new_role
  );
END;
$$;

-- Secure execution grants
REVOKE ALL ON FUNCTION public.admin_provision_user(UUID, public.user_role, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_provision_user(UUID, public.user_role, UUID, TEXT) TO authenticated;
