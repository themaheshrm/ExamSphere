-- ExamSphere: Add email and staff_id columns to profiles for secure identifier resolution
-- Run this in Supabase SQL Editor

-- 1. Add email column (synced from auth.users on signup via trigger)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Add staff_id column for admin identifier resolution
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_id TEXT;

-- 3. Backfill email from auth.users for existing profiles
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;

-- 4. Create indexes for fast lookup during login
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_staff_id ON public.profiles (staff_id);
CREATE INDEX IF NOT EXISTS idx_profiles_usn ON public.profiles (usn);

-- 5. Update the handle_new_auth_user() trigger to also capture email
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, institution_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    'student',
    NULL
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email
    WHERE public.profiles.email IS NULL;
  RETURN NEW;
END;
$$;

-- 6. Add RLS policy for profiles to allow reading own email (needed for USN resolution)
-- Students should be able to read their own profile row (already covered by existing SELECT policy)
-- The USN/email lookup queries need to work for unauthenticated users during login.
-- Since login calls signInWithPassword first, the lookup happens BEFORE auth,
-- so we need a narrow policy that allows reading ONLY email by USN/staff_id.

-- Create a minimal view that exposes only the lookup columns (no role, no institution)
CREATE OR REPLACE VIEW public.profile_email_lookup AS
SELECT usn, staff_id, email
FROM public.profiles
WHERE email IS NOT NULL;

-- Grant SELECT on the lookup view to anon and authenticated roles
GRANT SELECT ON public.profile_email_lookup TO anon, authenticated;
