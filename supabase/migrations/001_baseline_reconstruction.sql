-- =============================================================================
-- ExamSphere Migration 001/002 (RECONSTRUCTED BASELINE)
--
-- The repository's 003 and 004 depend on objects that no committed migration
-- creates: enum public.user_role, table public.profiles (id, full_name, role,
-- institution_id, usn, updated_at), table public.activity_logs (user_id,
-- action, details), function public.handle_new_auth_user() and its trigger on
-- auth.users, plus an existing SELECT policy on profiles.
--
-- PREFERRED: capture the real definitions from the live project
--   (`supabase db pull` or `pg_dump --schema-only --schema=public`)
--   and commit them as 001/002 instead of this file.
-- FALLBACK: this file is fully idempotent. On the live project it is a no-op
--   for anything that already exists; on a fresh project it creates the minimum
--   baseline so 003 → 004 → 005+ replay cleanly.
-- =============================================================================

DO $$
BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'student');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id             uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name      text,
  role           public.user_role NOT NULL DEFAULT 'student',
  institution_id uuid,
  usn            text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action     text NOT NULL,
  details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Minimal signup trigger (003 replaces the body; 005 hardens it further).
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, split_part(NEW.email, '@', 1), 'student')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
  END IF;
END $$;

-- Baseline self-read policy (005 drops and replaces all profiles policies).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY profiles_select_own ON public.profiles
      FOR SELECT TO authenticated USING (id = auth.uid());
  END IF;
END $$;
