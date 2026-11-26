-- LOCAL TEST ONLY. Replica of the LIVE ExamSphere database as reported by the
-- read-only discovery on 2026-11-26 (PostgreSQL 17): legacy exam schema with
-- empty exam tables, 1 institution (APEX-01), 3 accounts. Used to rehearse
-- migrations 002–013 + seed before they are applied to the real project.
-- Run after 000_supabase_shim.sql. Never run against a real project.

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'student');
CREATE TYPE public.exam_status AS ENUM ('draft', 'published', 'active', 'completed', 'archived');
CREATE TYPE public.question_type AS ENUM ('single_choice', 'multiple_choice', 'true_false', 'numerical');
CREATE TYPE public.attempt_status AS ENUM ('in_progress', 'submitted', 'auto_submitted', 'flagged', 'cancelled');

CREATE TABLE public.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code citext NOT NULL UNIQUE,
  domain text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  institution_id uuid REFERENCES public.institutions (id) ON DELETE RESTRICT,
  role public.user_role NOT NULL DEFAULT 'student',
  full_name text NOT NULL,
  email citext NOT NULL UNIQUE,
  usn citext,
  department text,
  phone text,
  is_suspended boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_profiles_institution ON public.profiles (institution_id);
CREATE UNIQUE INDEX idx_unique_student_usn ON public.profiles (institution_id, lower(usn::text))
  WHERE role = 'student' AND usn IS NOT NULL;

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES public.institutions (id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_activity_logs_user ON public.activity_logs (user_id, created_at DESC);

CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  title text NOT NULL,
  exam_code citext NOT NULL,
  description text,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  total_marks numeric NOT NULL DEFAULT 100.00 CHECK (total_marks > 0),
  pass_percentage numeric NOT NULL DEFAULT 40.00 CHECK (pass_percentage >= 0 AND pass_percentage <= 100),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status public.exam_status NOT NULL DEFAULT 'draft',
  randomize_questions boolean NOT NULL DEFAULT true,
  randomize_options boolean NOT NULL DEFAULT true,
  negative_marking_rate numeric NOT NULL DEFAULT 0.00 CHECK (negative_marking_rate >= 0),
  fullscreen_enforced boolean NOT NULL DEFAULT true,
  max_blur_warnings integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT chk_exam_window CHECK (end_time > start_time),
  UNIQUE (institution_id, exam_code)
);
CREATE INDEX idx_exams_institution_status ON public.exams (institution_id, status);

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type public.question_type NOT NULL DEFAULT 'single_choice',
  options jsonb NOT NULL,
  marks numeric NOT NULL DEFAULT 1.00 CHECK (marks > 0),
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_questions_exam ON public.questions (exam_id);

CREATE TABLE public.question_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL UNIQUE REFERENCES public.questions (id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  correct_answers jsonb NOT NULL,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_question_keys_question ON public.question_keys (question_id);

CREATE TABLE public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  status public.attempt_status NOT NULL DEFAULT 'in_progress',
  random_seed bigint NOT NULL DEFAULT ((floor(random() * 9000000000::double precision) + 1000000000::double precision))::bigint,
  question_sequence uuid[] NOT NULL DEFAULT '{}'::uuid[],
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  submitted_at timestamptz,
  client_ip inet,
  user_agent text,
  blur_count integer NOT NULL DEFAULT 0,
  last_heartbeat timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (exam_id, student_id, attempt_number)
);
CREATE INDEX idx_attempts_exam ON public.exam_attempts (exam_id, status);
CREATE INDEX idx_attempts_student ON public.exam_attempts (student_id, status);

CREATE TABLE public.answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  selected_options jsonb,
  is_marked_for_review boolean NOT NULL DEFAULT false,
  is_evaluated boolean NOT NULL DEFAULT false,
  awarded_marks numeric DEFAULT NULL::numeric,
  time_spent_seconds integer NOT NULL DEFAULT 0,
  last_saved_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX idx_answers_attempt ON public.answers (attempt_id);

CREATE TABLE public.results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.exam_attempts (id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  score_obtained numeric NOT NULL DEFAULT 0.00,
  total_marks numeric NOT NULL,
  percentage numeric NOT NULL,
  is_passed boolean NOT NULL,
  correct_count integer NOT NULL DEFAULT 0,
  incorrect_count integer NOT NULL DEFAULT 0,
  unattempted_count integer NOT NULL DEFAULT 0,
  proctor_flagged boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  evaluated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_results_student ON public.results (student_id);

-- ── functions ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public."current_role"() RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION public.current_institution_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT institution_id FROM public.profiles WHERE id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION public.handle_new_auth_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inst_id uuid;
BEGIN
  BEGIN
    inst_id := (NEW.raw_user_meta_data->>'institution_id')::uuid;
  EXCEPTION WHEN OTHERS THEN inst_id := NULL;
  END;
  INSERT INTO public.profiles (id, email, full_name, role, institution_id, usn)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
          'student', inst_id, NEW.raw_user_meta_data->>'usn')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.prevent_role_tampering() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NOT NULL AND public.current_role() <> 'super_admin' THEN
      RAISE EXCEPTION 'Access Denied: You cannot modify user role credentials.';
    END IF;
  END IF;
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.generate_attempt_paper() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE q_ids uuid[];
BEGIN
  SELECT array_agg(id ORDER BY random()) INTO q_ids FROM public.questions WHERE exam_id = NEW.exam_id;
  NEW.question_sequence = COALESCE(q_ids, '{}');
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE cmd record; tbl name;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
             WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
               AND object_type IN ('table', 'partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END;
$$;

-- ── triggers ─────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_protect_profile_roles BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_tampering();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
CREATE TRIGGER trg_generate_attempt_paper BEFORE INSERT ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.generate_attempt_paper();
DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable();

-- ── RLS and policies (as on live) ────────────────────────────────────────────
ALTER TABLE public.institutions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results       ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_manage_institution_results ON public.results FOR ALL TO authenticated USING (public."current_role"() = 'admin' AND institution_id = public.current_institution_id());
CREATE POLICY students_read_published_results ON public.results FOR SELECT TO authenticated USING (student_id = auth.uid() AND is_published = true);
CREATE POLICY super_admin_manage_all_results ON public.results FOR ALL TO authenticated USING (public."current_role"() = 'super_admin');
CREATE POLICY admin_read_institution_logs ON public.activity_logs FOR SELECT TO authenticated USING (public."current_role"() = 'admin' AND institution_id = public.current_institution_id());
CREATE POLICY super_admin_read_all_logs ON public.activity_logs FOR SELECT TO authenticated USING (public."current_role"() = 'super_admin');
CREATE POLICY users_append_activity_logs ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY super_admin_manage_institutions ON public.institutions FOR ALL TO authenticated USING (public."current_role"() = 'super_admin');
CREATE POLICY users_read_own_institution ON public.institutions FOR SELECT TO authenticated USING (id = public.current_institution_id());
CREATE POLICY admin_manage_institution_profiles ON public.profiles FOR ALL TO authenticated USING (public."current_role"() = 'admin' AND institution_id = public.current_institution_id());
CREATE POLICY super_admin_manage_all_profiles ON public.profiles FOR ALL TO authenticated USING (public."current_role"() = 'super_admin');
CREATE POLICY users_read_own_profile ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY users_update_own_profile ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY admin_manage_institution_exams ON public.exams FOR ALL TO authenticated USING (public."current_role"() = 'admin' AND institution_id = public.current_institution_id());
CREATE POLICY students_read_accessible_exams ON public.exams FOR SELECT TO authenticated USING (public."current_role"() = 'student' AND institution_id = public.current_institution_id() AND status = ANY (ARRAY['published'::public.exam_status, 'active'::public.exam_status, 'completed'::public.exam_status]));
CREATE POLICY super_admin_manage_all_exams ON public.exams FOR ALL TO authenticated USING (public."current_role"() = 'super_admin');
CREATE POLICY admin_manage_institution_questions ON public.questions FOR ALL TO authenticated USING (public."current_role"() = 'admin' AND institution_id = public.current_institution_id());
CREATE POLICY students_read_active_attempt_questions ON public.questions FOR SELECT TO authenticated USING (public."current_role"() = 'student' AND institution_id = public.current_institution_id() AND EXISTS (SELECT 1 FROM public.exam_attempts ea WHERE ea.exam_id = questions.exam_id AND ea.student_id = auth.uid() AND ea.status = 'in_progress'::public.attempt_status));
CREATE POLICY super_admin_manage_all_questions ON public.questions FOR ALL TO authenticated USING (public."current_role"() = 'super_admin');
CREATE POLICY admin_manage_institution_keys ON public.question_keys FOR ALL TO authenticated USING (public."current_role"() = 'admin' AND institution_id = public.current_institution_id());
CREATE POLICY super_admin_manage_all_keys ON public.question_keys FOR ALL TO authenticated USING (public."current_role"() = 'super_admin');
CREATE POLICY admin_manage_institution_attempts ON public.exam_attempts FOR ALL TO authenticated USING (public."current_role"() = 'admin' AND institution_id = public.current_institution_id());
CREATE POLICY students_create_active_attempt ON public.exam_attempts FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid() AND public."current_role"() = 'student' AND institution_id = public.current_institution_id() AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_attempts.exam_id AND e.status = 'active'::public.exam_status AND timezone('utc', now()) >= e.start_time AND timezone('utc', now()) <= e.end_time));
CREATE POLICY students_read_own_attempts ON public.exam_attempts FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY students_update_in_progress_attempt ON public.exam_attempts FOR UPDATE TO authenticated USING (student_id = auth.uid() AND status = 'in_progress'::public.attempt_status) WITH CHECK (student_id = auth.uid());
CREATE POLICY super_admin_manage_all_attempts ON public.exam_attempts FOR ALL TO authenticated USING (public."current_role"() = 'super_admin');
CREATE POLICY admin_manage_institution_answers ON public.answers FOR ALL TO authenticated USING (public."current_role"() = 'admin' AND EXISTS (SELECT 1 FROM public.exam_attempts ea WHERE ea.id = answers.attempt_id AND ea.institution_id = public.current_institution_id()));
CREATE POLICY students_autosave_answers ON public.answers FOR ALL TO authenticated USING (student_id = auth.uid() AND EXISTS (SELECT 1 FROM public.exam_attempts ea WHERE ea.id = answers.attempt_id AND ea.student_id = auth.uid() AND ea.status = 'in_progress'::public.attempt_status)) WITH CHECK (student_id = auth.uid() AND EXISTS (SELECT 1 FROM public.exam_attempts ea WHERE ea.id = answers.attempt_id AND ea.student_id = auth.uid() AND ea.status = 'in_progress'::public.attempt_status));
CREATE POLICY super_admin_manage_all_answers ON public.answers FOR ALL TO authenticated USING (public."current_role"() = 'super_admin');

-- ── data shape as on live (values are placeholders) ──────────────────────────
INSERT INTO public.institutions (id, name, code, domain)
VALUES ('aaaa0000-0000-0000-0000-00000000a9e0', 'Apex Engineering University', 'APEX-01', 'apex.edu');
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaa0000-0000-0000-0000-0000000000f1', 'root@example.test', '{"full_name":"Live Root"}'),
  ('aaaa0000-0000-0000-0000-0000000000f2', 'staff@example.test', '{"full_name":"Live Admin","institution_id":"aaaa0000-0000-0000-0000-00000000a9e0"}'),
  ('aaaa0000-0000-0000-0000-0000000000f3', 'learner@example.test', '{"full_name":"Live Student","institution_id":"aaaa0000-0000-0000-0000-00000000a9e0","usn":"1AP22CS001"}');
UPDATE public.profiles SET role = 'super_admin' WHERE id = 'aaaa0000-0000-0000-0000-0000000000f1';
UPDATE public.profiles SET role = 'admin'       WHERE id = 'aaaa0000-0000-0000-0000-0000000000f2';
