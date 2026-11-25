-- 011_subject_admin_scoping.sql
-- Subject-scoped examination administrators (e.g. demo accounts ADMIN001–005).
--
-- REVIEW BEFORE APPLYING. Not applied to any Supabase project by this change;
-- verified only against a disposable local PostgreSQL (supabase/tests).
--
-- Model: an `admin` profile with one or more rows in public.subject_admins is
-- *subject-scoped*: it keeps every institution-admin capability for its own
-- subjects and loses access to everything else. Admins with no rows (the
-- existing institution admins) and super admins are unaffected, so the
-- Super Admin → Institution Admin hierarchy is unchanged.
--
-- Enforcement is server-side and independent of the client:
--   • RESTRICTIVE RLS policies hide other subjects' rows (AND-ed with the
--     existing permissive policies from 005–010, which are left untouched);
--   • row triggers reject scoped writes outside the scope — they also fire
--     inside SECURITY DEFINER RPCs (save_question, import_questions,
--     set_exam_questions, generate_exam_patterns, publish_exam, …);
--   • exam report RPCs (which bypass RLS) gain a subject assertion.
-- Idempotent: safe to re-run.

-- ─── 1. Assignment table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subject_admins (
  admin_id       uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  subject_id     uuid NOT NULL,
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE RESTRICT,
  assigned_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_id, subject_id),
  CONSTRAINT subject_admins_subject_fkey FOREIGN KEY (subject_id, institution_id)
    REFERENCES public.subjects (id, institution_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS subject_admins_subject_idx ON public.subject_admins (subject_id);
ALTER TABLE public.subject_admins ENABLE ROW LEVEL SECURITY;

-- Only an active admin of the subject's own institution can be assigned.
CREATE OR REPLACE FUNCTION private.validate_subject_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = NEW.admin_id AND p.role = 'admin' AND p.institution_id = NEW.institution_id) THEN
    RAISE EXCEPTION 'Subject administrators must be admins of the subject''s institution.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS subject_admins_validate ON public.subject_admins;
CREATE TRIGGER subject_admins_validate BEFORE INSERT OR UPDATE ON public.subject_admins
  FOR EACH ROW EXECUTE FUNCTION private.validate_subject_admin();

-- ─── 2. Scope helpers ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.is_subject_scoped()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.subject_admins sa
                 JOIN public.profiles p ON p.id = sa.admin_id
                 WHERE sa.admin_id = auth.uid() AND p.role = 'admin')
$$;

CREATE OR REPLACE FUNCTION private.my_subject_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(array_agg(sa.subject_id), '{}') FROM public.subject_admins sa WHERE sa.admin_id = auth.uid()
$$;

-- TRUE for everyone who is not subject-scoped (no behaviour change for them).
CREATE OR REPLACE FUNCTION private.subject_in_scope(p_subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT private.is_subject_scoped() OR p_subject_id = ANY (private.my_subject_ids())
$$;

CREATE OR REPLACE FUNCTION private.exam_subject(p_exam_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.subject_id FROM public.exams e WHERE e.id = p_exam_id
$$;
CREATE OR REPLACE FUNCTION private.question_subject(p_question_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT q.subject_id FROM public.questions q WHERE q.id = p_question_id
$$;
CREATE OR REPLACE FUNCTION private.pattern_subject(p_pattern_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.subject_id FROM public.exam_patterns p JOIN public.exams e ON e.id = p.exam_id WHERE p.id = p_pattern_id
$$;
CREATE OR REPLACE FUNCTION private.attempt_subject(p_attempt_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.subject_id FROM public.exam_attempts a JOIN public.exams e ON e.id = a.exam_id WHERE a.id = p_attempt_id
$$;

CREATE OR REPLACE FUNCTION private.assert_can_manage_exam(p_exam_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.assert_can_manage((SELECT institution_id FROM public.exams WHERE id = p_exam_id));
  IF NOT private.subject_in_scope(private.exam_subject(p_exam_id)) THEN
    RAISE EXCEPTION 'Access denied: this examination is outside your assigned subject.' USING ERRCODE = '42501';
  END IF;
END $$;

-- ─── 3. Write guard (fires inside SECURITY DEFINER RPCs too) ─────────────────
-- TG_ARGV[0] says how a row maps to its subject.
CREATE OR REPLACE FUNCTION private.guard_subject_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_mode    text := TG_ARGV[0];
  v_rows    jsonb[] := '{}';
  v_row     jsonb;
  v_subject uuid;
BEGIN
  IF NOT private.is_subject_scoped() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF v_mode = 'institution_only' THEN
    RAISE EXCEPTION 'Access denied: % is managed by the institution administrator.', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_rows := v_rows || to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_rows := v_rows || to_jsonb(NEW); END IF;

  FOREACH v_row IN ARRAY v_rows LOOP
    IF v_mode = 'self' THEN
      IF (v_row->>'id')::uuid IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Access denied: % is managed by the institution administrator.', TG_TABLE_NAME USING ERRCODE = '42501';
      END IF;
      CONTINUE;
    END IF;
    IF v_mode = 'exam_optional' AND v_row->>'exam_id' IS NULL THEN
      RAISE EXCEPTION 'Access denied: institution-wide % are managed by the institution administrator.', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
    v_subject := CASE v_mode
      WHEN 'subject_pk'    THEN (v_row->>'id')::uuid
      WHEN 'subject'       THEN (v_row->>'subject_id')::uuid
      WHEN 'question'      THEN private.question_subject((v_row->>'question_id')::uuid)
      WHEN 'exam'          THEN private.exam_subject((v_row->>'exam_id')::uuid)
      WHEN 'exam_optional' THEN private.exam_subject((v_row->>'exam_id')::uuid)
      WHEN 'exam_question' THEN private.exam_subject((v_row->>'exam_id')::uuid)
      WHEN 'pattern'       THEN private.pattern_subject((v_row->>'pattern_id')::uuid)
      WHEN 'attempt'       THEN private.attempt_subject((v_row->>'attempt_id')::uuid)
    END;
    -- A parent already removed by an authorised cascade leaves nothing to check.
    IF v_subject IS NULL AND TG_OP = 'DELETE' THEN CONTINUE; END IF;
    IF v_subject IS NULL OR NOT v_subject = ANY (private.my_subject_ids()) THEN
      RAISE EXCEPTION 'Access denied: % row is outside your assigned subject.', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
    -- An exam may only be composed from questions of the admin's own subjects.
    IF v_mode = 'exam_question' AND NOT private.question_subject((v_row->>'question_id')::uuid) = ANY (private.my_subject_ids()) THEN
      RAISE EXCEPTION 'Access denied: question is outside your assigned subject.' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('subjects', 'subject_pk'), ('questions', 'subject'), ('question_answer_keys', 'question'),
    ('exams', 'subject'), ('exam_questions', 'exam_question'), ('exam_patterns', 'exam'),
    ('exam_pattern_questions', 'pattern'), ('exam_pattern_answer_keys', 'pattern'),
    ('exam_assignments', 'exam'), ('exam_attempts', 'exam'), ('attempt_responses', 'attempt'),
    ('attempt_events', 'attempt'), ('exam_results', 'exam'), ('result_question_scores', 'attempt'),
    ('announcements', 'exam_optional'),
    ('profiles', 'self'), ('student_details', 'institution_only'), ('departments', 'institution_only'),
    ('subject_admins', 'institution_only')) AS v(tbl, mode)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t.tbl || '_subject_scope', t.tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION private.guard_subject_scope(%L)', t.tbl || '_subject_scope', t.tbl, t.mode);
  END LOOP;
END $$;

-- ─── 4. Read isolation: RESTRICTIVE policies (AND-ed with existing ones) ─────
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('subjects',                 'id IN (SELECT unnest(private.my_subject_ids()))'),
    ('questions',                'subject_id IN (SELECT unnest(private.my_subject_ids()))'),
    ('question_answer_keys',     'private.question_subject(question_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('question_import_batches',  'uploaded_by = (SELECT auth.uid())'),
    ('exams',                    'subject_id IN (SELECT unnest(private.my_subject_ids()))'),
    ('exam_questions',           'private.exam_subject(exam_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('exam_patterns',            'private.exam_subject(exam_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('exam_pattern_questions',   'private.pattern_subject(pattern_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('exam_pattern_answer_keys', 'private.pattern_subject(pattern_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('exam_assignments',         'private.exam_subject(exam_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('exam_attempts',            'private.exam_subject(exam_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('attempt_responses',        'private.attempt_subject(attempt_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('attempt_events',           'private.attempt_subject(attempt_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('exam_results',             'private.exam_subject(exam_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('result_question_scores',   'private.attempt_subject(attempt_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('announcements',            'exam_id IS NULL OR private.exam_subject(exam_id) IN (SELECT unnest(private.my_subject_ids()))'),
    ('activity_logs',            'user_id = (SELECT auth.uid())'),
    ('audit_log',                'actor_id = (SELECT auth.uid())')) AS v(tbl, cond)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.tbl || '_subject_scope', t.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
                    USING (NOT (SELECT private.is_subject_scoped()) OR (%s))', t.tbl || '_subject_scope', t.tbl, t.cond);
  END LOOP;
END $$;

-- subject_admins: an admin sees their own assignments; institution admins and
-- super admins manage them (scoped admins are blocked by the write guard).
DROP POLICY IF EXISTS subject_admins_select ON public.subject_admins;
CREATE POLICY subject_admins_select ON public.subject_admins FOR SELECT TO authenticated
  USING (admin_id = (SELECT auth.uid()) OR private.can_manage_institution(institution_id));
DROP POLICY IF EXISTS subject_admins_manage ON public.subject_admins;
CREATE POLICY subject_admins_manage ON public.subject_admins FOR ALL TO authenticated
  USING (private.can_manage_institution(institution_id))
  WITH CHECK (private.can_manage_institution(institution_id));

-- ─── 5. Report RPCs (SECURITY DEFINER, bypass RLS) gain the subject check ────
-- Bodies are unchanged from 007/010 apart from the marked assertion.

CREATE OR REPLACE FUNCTION public.get_exam_verification_report(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- 011: subject scope
  PERFORM private.assert_can_manage_exam(p_exam_id);
  RETURN private.verify_exam_patterns(p_exam_id);
END $$;

CREATE OR REPLACE FUNCTION public.get_exam_item_analysis(p_exam_id uuid)
RETURNS TABLE (master_position smallint, question_id uuid, question_no bigint, topic text,
               attempted bigint, correct bigint, difficulty_index numeric, discrimination_index numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- 011: subject scope
  PERFORM private.assert_can_manage_exam(p_exam_id);
  RETURN QUERY
  WITH res AS (
    SELECT r.attempt_id, r.score, ntile(100) OVER (ORDER BY r.score) AS pct
    FROM public.exam_results r JOIN public.exam_attempts a ON a.id = r.attempt_id
    WHERE r.exam_id = p_exam_id AND a.status IN ('submitted', 'auto_submitted')),
  items AS (
    SELECT s.question_id, s.is_attempted, s.is_correct, res.pct
    FROM public.result_question_scores s JOIN res ON res.attempt_id = s.attempt_id)
  SELECT eq.position, eq.question_id, q.question_no, q.topic,
         count(*) FILTER (WHERE i.is_attempted),
         count(*) FILTER (WHERE i.is_correct),
         round(avg(i.is_correct::int), 3),
         round(avg(i.is_correct::int) FILTER (WHERE i.pct > 73)
               - avg(i.is_correct::int) FILTER (WHERE i.pct <= 27), 3)
  FROM public.exam_questions eq
  JOIN public.questions q ON q.id = eq.question_id
  LEFT JOIN items i ON i.question_id = eq.question_id
  WHERE eq.exam_id = p_exam_id
  GROUP BY eq.position, eq.question_id, q.question_no, q.topic
  ORDER BY eq.position;
END $$;

CREATE OR REPLACE FUNCTION public.get_exam_results_export(p_exam_id uuid)
RETURNS TABLE (usn text, full_name text, department text, semester smallint, section text,
               pattern_label text, attempt_status public.attempt_status, submission_source text,
               started_at timestamptz, submitted_at timestamptz, score numeric, max_score numeric,
               percentage numeric, passed boolean, correct_count smallint, incorrect_count smallint,
               unattempted_count smallint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- 011: subject scope
  PERFORM private.assert_can_manage_exam(p_exam_id);
  RETURN QUERY
  SELECT p.usn, p.full_name, d.name, sd.semester, sd.section, ep.pattern_label, la.status,
         la.submission_source, la.started_at, la.submitted_at, r.score, r.max_score, r.percentage, r.passed,
         r.correct_count, r.incorrect_count, r.unattempted_count
  FROM public.exam_assignments a
  JOIN public.profiles p ON p.id = a.student_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.student_details sd ON sd.profile_id = p.id
  LEFT JOIN public.exam_patterns ep ON ep.id = a.pattern_id
  LEFT JOIN LATERAL (SELECT * FROM public.exam_attempts x WHERE x.assignment_id = a.id
                     ORDER BY x.attempt_no DESC LIMIT 1) la ON true
  LEFT JOIN public.exam_results r ON r.attempt_id = la.id
  WHERE a.exam_id = p_exam_id AND a.status = 'assigned'
  ORDER BY p.usn;
END $$;

CREATE OR REPLACE FUNCTION public.get_exam_report(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exam public.exams;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found.' USING ERRCODE = 'P0002'; END IF;
  -- 011: subject scope
  PERFORM private.assert_can_manage_exam(p_exam_id);
  RETURN (
    WITH asg AS (SELECT * FROM public.exam_assignments WHERE exam_id = p_exam_id AND status = 'assigned'),
         att AS (SELECT * FROM public.exam_attempts WHERE exam_id = p_exam_id),
         res AS (SELECT r.* FROM public.exam_results r JOIN att ON att.id = r.attempt_id
                 WHERE att.status IN ('submitted', 'auto_submitted'))
    SELECT jsonb_build_object(
      'assigned', (SELECT count(*) FROM asg),
      'started', (SELECT count(DISTINCT assignment_id) FROM att),
      'inProgress', (SELECT count(*) FROM att WHERE status = 'active'),
      'submitted', (SELECT count(*) FROM att WHERE status = 'submitted'),
      'autoSubmitted', (SELECT count(*) FROM att WHERE status = 'auto_submitted'),
      'voided', (SELECT count(*) FROM att WHERE status = 'voided'),
      'absent', (SELECT count(*) FROM asg WHERE NOT EXISTS (SELECT 1 FROM att WHERE att.assignment_id = asg.id)),
      'average', (SELECT round(avg(score), 2) FROM res),
      'median', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY score) FROM res),
      'highest', (SELECT max(score) FROM res),
      'lowest', (SELECT min(score) FROM res),
      'passRate', (SELECT round(100.0 * count(*) FILTER (WHERE passed) / NULLIF(count(*), 0), 2) FROM res),
      'byPattern', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'pattern') FROM (
          SELECT jsonb_build_object('pattern', p.pattern_label, 'assigned',
                   (SELECT count(*) FROM asg WHERE asg.pattern_id = p.id),
                   'submitted', count(res.id), 'average', round(avg(res.score), 2)) AS x
          FROM public.exam_patterns p LEFT JOIN res ON res.pattern_id = p.id
          WHERE p.exam_id = p_exam_id GROUP BY p.id, p.pattern_label) s), '[]'::jsonb),
      'distribution', COALESCE((SELECT jsonb_agg(jsonb_build_object('bucket', b * 10 || '-' || (b * 10 + 10) || '%',
                                                                    'count', n) ORDER BY b)
          FROM (SELECT LEAST(floor(percentage / 10), 9)::int AS b, count(*) AS n FROM res GROUP BY 1) d), '[]'::jsonb))
  );
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard(p_institution_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_inst uuid := COALESCE(p_institution_id, private.my_admin_institution_id());
BEGIN
  PERFORM private.assert_can_manage(v_inst);
  -- 011: subject scope
  IF private.is_subject_scoped() THEN
    RAISE EXCEPTION 'The institution dashboard is not available to subject administrators; use get_exam_report for your examinations.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'scheduledExams', (SELECT count(*) FROM public.exams WHERE institution_id = v_inst
                       AND status = 'published' AND window_start > now()),
    'activeLiveTests', (SELECT count(*) FROM public.exams WHERE institution_id = v_inst
                        AND status = 'published' AND now() BETWEEN window_start AND window_end),
    'draftExams', (SELECT count(*) FROM public.exams WHERE institution_id = v_inst AND status = 'draft'),
    'enrolledCandidates', (SELECT count(*) FROM public.profiles WHERE institution_id = v_inst
                           AND role = 'student' AND is_active),
    'activeAttempts', (SELECT count(*) FROM public.exam_attempts WHERE institution_id = v_inst AND status = 'active'),
    'evaluatedSubmissions', (SELECT count(*) FROM public.exam_results WHERE institution_id = v_inst),
    'questionBankSize', (SELECT count(*) FROM public.questions WHERE institution_id = v_inst AND NOT is_archived),
    'upcomingExams', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'examCode', e.exam_code,
               'windowStart', e.window_start, 'durationMinutes', e.duration_minutes, 'status', e.status,
               'candidates', (SELECT count(*) FROM public.exam_assignments a
                              WHERE a.exam_id = e.id AND a.status = 'assigned')) ORDER BY e.window_start)
      FROM (SELECT * FROM public.exams WHERE institution_id = v_inst AND status IN ('draft', 'published')
            AND window_end > now() ORDER BY window_start LIMIT 10) e), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.get_student_performance(p_student_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid := COALESCE(p_student_id, auth.uid());
  v_self    boolean := v_student = auth.uid();
BEGIN
  IF NOT v_self THEN
    PERFORM private.assert_can_manage((SELECT institution_id FROM public.profiles WHERE id = v_student));
  END IF;
  RETURN jsonb_build_object(
    'studentId', v_student,
    'exams', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('examId', e.id, 'examCode', e.exam_code, 'courseCode', s.code,
               'courseTitle', s.title, 'date', a.submitted_at, 'score', r.score, 'maxScore', r.max_score,
               'percentage', r.percentage, 'passed', r.passed) ORDER BY a.submitted_at DESC)
      FROM public.exam_results r
      JOIN public.exam_attempts a ON a.id = r.attempt_id AND a.status IN ('submitted', 'auto_submitted')
      JOIN public.exams e ON e.id = r.exam_id
      JOIN public.subjects s ON s.id = e.subject_id
      WHERE r.student_id = v_student AND (NOT v_self OR private.results_visible(e.id))
        AND (v_self OR private.subject_in_scope(e.subject_id))  -- 011: subject scope
      ), '[]'::jsonb));
END $$;

-- ─── 6. Privileges ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION private.validate_subject_admin(), private.guard_subject_scope(),
  private.assert_can_manage_exam(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  private.is_subject_scoped(), private.my_subject_ids(), private.subject_in_scope(uuid),
  private.exam_subject(uuid), private.question_subject(uuid), private.pattern_subject(uuid),
  private.attempt_subject(uuid)
TO authenticated;
REVOKE ALL ON public.subject_admins FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_admins TO authenticated;
