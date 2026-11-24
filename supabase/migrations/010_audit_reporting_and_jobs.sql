-- =============================================================================
-- ExamSphere Migration 010: Audit history, dashboards/reports, announcements,
-- scheduled jobs.
-- =============================================================================

-- ─── 1. Row-level audit history (who changed what, before/after) ─────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  actor_id       uuid,                                   -- auth.uid(); NULL = system/cron
  institution_id uuid,
  table_name     text NOT NULL,
  record_id      text NOT NULL,
  operation      text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields text[],
  old_data       jsonb,
  new_data       jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_institution_time_idx ON public.audit_log (institution_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_record_idx ON public.audit_log (table_name, record_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log (actor_id, occurred_at DESC);

DROP TRIGGER IF EXISTS audit_log_append_only ON public.audit_log;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION private.block_mutation();

CREATE OR REPLACE FUNCTION private.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_row jsonb := COALESCE(v_new, v_old);
  v_changed text[];
  v_pk text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k) INTO v_changed FROM jsonb_object_keys(v_new) k
    WHERE v_new->k IS DISTINCT FROM v_old->k AND k NOT IN ('updated_at', 'last_activity_at', 'last_client_seq');
    IF v_changed IS NULL THEN RETURN NULL; END IF;     -- bookkeeping-only update
  END IF;
  v_pk := COALESCE(v_row->>'id', v_row->>'question_id', v_row->>'profile_id', v_row->>'attempt_id');
  INSERT INTO public.audit_log (actor_id, institution_id, table_name, record_id, operation, changed_fields, old_data, new_data)
  VALUES (auth.uid(),
          COALESCE((v_row->>'institution_id')::uuid, CASE WHEN TG_TABLE_NAME = 'institutions' THEN (v_row->>'id')::uuid END),
          TG_TABLE_NAME, v_pk, TG_OP, v_changed,
          -- the sensitive DOB/phone columns are not copied into the audit trail
          v_old - ARRAY['date_of_birth', 'phone'], v_new - ARRAY['date_of_birth', 'phone']);
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['institutions', 'departments', 'profiles', 'student_details', 'subjects', 'questions',
                           'question_answer_keys', 'exams', 'exam_assignments', 'exam_attempts', 'exam_results']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION private.audit_row_change()', t || '_audit', t);
  END LOOP;
END $$;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));

-- ─── 2. Announcements (replaces studentMockData announcements/notifications) ─
CREATE TABLE IF NOT EXISTS public.announcements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  department_id  uuid,
  exam_id        uuid REFERENCES public.exams (id) ON DELETE CASCADE,
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  body           text NOT NULL CHECK (length(body) <= 5000),
  priority       text NOT NULL DEFAULT 'Notice' CHECK (priority IN ('Urgent', 'Official', 'Notice')),
  issuer         text,
  audience       public.user_role[] NOT NULL DEFAULT ARRAY['student']::public.user_role[],
  published_at   timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz,
  created_by     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_department_fkey FOREIGN KEY (department_id, institution_id)
    REFERENCES public.departments (id, institution_id) ON DELETE CASCADE,
  CONSTRAINT announcements_expiry_chk CHECK (expires_at IS NULL OR expires_at > published_at)
);
CREATE INDEX IF NOT EXISTS announcements_feed_idx ON public.announcements (institution_id, published_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcements_select_member ON public.announcements;
CREATE POLICY announcements_select_member ON public.announcements FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_institution_id())
         AND (SELECT private.my_role()) = ANY (audience)
         AND published_at <= now() AND (expires_at IS NULL OR expires_at > now())
         AND (department_id IS NULL OR department_id = (SELECT p.department_id FROM public.profiles p
                                                        WHERE p.id = (SELECT auth.uid()))));
DROP POLICY IF EXISTS announcements_manage_admin ON public.announcements;
CREATE POLICY announcements_manage_admin ON public.announcements FOR ALL TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()))
  WITH CHECK (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));

-- ─── 3. Dashboards & reports (all institution-scoped inside the function) ────
CREATE OR REPLACE FUNCTION public.get_admin_dashboard(p_institution_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_inst uuid := COALESCE(p_institution_id, private.my_admin_institution_id());
BEGIN
  PERFORM private.assert_can_manage(v_inst);
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

CREATE OR REPLACE FUNCTION public.get_exam_report(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exam public.exams;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_exam.institution_id);
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

-- Classical item analysis per master question: difficulty index (p) and
-- discrimination index (upper 27% vs lower 27%).
CREATE OR REPLACE FUNCTION public.get_exam_item_analysis(p_exam_id uuid)
RETURNS TABLE (master_position smallint, question_id uuid, question_no bigint, topic text,
               attempted bigint, correct bigint, difficulty_index numeric, discrimination_index numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.assert_can_manage((SELECT institution_id FROM public.exams WHERE id = p_exam_id));
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

-- Tabular export for CSV/XLSX download.
CREATE OR REPLACE FUNCTION public.get_exam_results_export(p_exam_id uuid)
RETURNS TABLE (usn text, full_name text, department text, semester smallint, section text,
               pattern_label text, attempt_status public.attempt_status, submission_source text,
               started_at timestamptz, submitted_at timestamptz, score numeric, max_score numeric,
               percentage numeric, passed boolean, correct_count smallint, incorrect_count smallint,
               unattempted_count smallint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.assert_can_manage((SELECT institution_id FROM public.exams WHERE id = p_exam_id));
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
      WHERE r.student_id = v_student AND (NOT v_self OR private.results_visible(e.id))), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.get_platform_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_super_admin() THEN RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'institutions', (SELECT count(*) FROM public.institutions WHERE is_active),
    'admins', (SELECT count(*) FROM public.profiles WHERE role = 'admin' AND is_active),
    'students', (SELECT count(*) FROM public.profiles WHERE role = 'student' AND is_active),
    'publishedExams', (SELECT count(*) FROM public.exams WHERE status = 'published'),
    'activeAttempts', (SELECT count(*) FROM public.exam_attempts WHERE status = 'active'),
    'evaluatedSubmissions', (SELECT count(*) FROM public.exam_results),
    'byInstitution', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'name', i.name,
        'students', (SELECT count(*) FROM public.profiles p WHERE p.institution_id = i.id AND p.role = 'student'),
        'exams', (SELECT count(*) FROM public.exams e WHERE e.institution_id = i.id)) ORDER BY i.name)
      FROM public.institutions i), '[]'::jsonb));
END $$;

-- ─── 4. Privileges ───────────────────────────────────────────────────────────
REVOKE ALL ON public.audit_log, public.announcements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_dashboard(uuid), public.get_exam_report(uuid),
                       public.get_exam_item_analysis(uuid), public.get_exam_results_export(uuid),
                       public.get_student_performance(uuid), public.get_platform_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard(uuid), public.get_exam_report(uuid),
                          public.get_exam_item_analysis(uuid), public.get_exam_results_export(uuid),
                          public.get_student_performance(uuid), public.get_platform_overview() TO authenticated;
REVOKE ALL ON FUNCTION private.audit_row_change() FROM PUBLIC;

-- ─── 5. Scheduled sweeper (requires the pg_cron extension) ───────────────────
-- Enable once in Dashboard → Database → Extensions → pg_cron, then this block
-- registers a once-a-minute job. Without pg_cron, attempts are still finalized
-- lazily whenever the student/admin touches them, and on close_exam().
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'examsphere-finalize-expired';
    PERFORM cron.schedule('examsphere-finalize-expired', '* * * * *',
                          'SELECT private.finalize_expired_attempts()');
  ELSE
    RAISE NOTICE 'pg_cron not enabled: enable it and re-run section 5 of migration 010.';
  END IF;
END $$;
