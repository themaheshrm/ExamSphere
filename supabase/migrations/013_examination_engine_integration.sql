-- 013_examination_engine_integration.sql
-- Closes the gaps between the server-side examination engine (005–012) and
-- the web app, so the app can run entirely on Supabase:
--   1. platform_settings     – super-admin settings (were browser storage)
--   2. pattern_pins          – fixed pattern per candidate (demo CS001→A … CS006→F);
--                              allocate_patterns() honours them
--   3. record_activity()     – portal actions written to activity_logs
--   4. read models (views, security_invoker → caller's RLS applies):
--        admin_candidates, admin_exam_overview, admin_exam_candidates,
--        admin_attempt_breakdown
--   5. save_platform_settings() – validated update + result-display policy
--
-- REVIEW BEFORE APPLYING. Requires 005–012. Not applied to any project;
-- verified against a disposable local PostgreSQL (supabase/tests/140_*).
-- Idempotent: safe to re-run.

-- ─── 1. Platform settings (one row) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id                         boolean PRIMARY KEY DEFAULT true CHECK (id),
  support_email              text NOT NULL DEFAULT 'coe@drait.edu.in'
                               CHECK (support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  helpline_phone             text NOT NULL DEFAULT '080-23211505' CHECK (length(helpline_phone) <= 40),
  result_display             text NOT NULL DEFAULT 'immediate' CHECK (result_display IN ('immediate', 'withheld')),
  timer_warning_minutes      smallint NOT NULL DEFAULT 5 CHECK (timer_warning_minutes BETWEEN 1 AND 30),
  show_pattern_to_candidates boolean NOT NULL DEFAULT true,
  maintenance_notice         text NOT NULL DEFAULT '' CHECK (length(maintenance_notice) <= 240),
  updated_by                 uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Non-sensitive (help desk, banner, display options): readable on public pages.
DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
CREATE POLICY platform_settings_read ON public.platform_settings FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.platform_settings FROM anon, authenticated;
GRANT SELECT ON public.platform_settings TO anon, authenticated;

-- Writes only through this RPC (super admin). The result-display policy also
-- becomes the release mode of every exam whose results are not yet released.
CREATE OR REPLACE FUNCTION public.save_platform_settings(p_settings jsonb)
RETURNS public.platform_settings LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.platform_settings;
BEGIN
  IF NOT private.is_super_admin() THEN
    RAISE EXCEPTION 'Only the super administrator can change platform settings.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.platform_settings SET
    support_email              = COALESCE(btrim(p_settings->>'supportEmail'), support_email),
    helpline_phone             = COALESCE(btrim(p_settings->>'helplinePhone'), helpline_phone),
    result_display             = COALESCE(p_settings->>'resultDisplay', result_display),
    timer_warning_minutes      = COALESCE((p_settings->>'timerWarningMinutes')::smallint, timer_warning_minutes),
    show_pattern_to_candidates = COALESCE((p_settings->>'showPatternToCandidates')::boolean, show_pattern_to_candidates),
    maintenance_notice         = COALESCE(p_settings->>'maintenanceNotice', maintenance_notice),
    updated_by = auth.uid(), updated_at = now()
  WHERE id RETURNING * INTO v_row;

  UPDATE public.exams
  SET results_release_mode = CASE WHEN v_row.result_display = 'withheld' THEN 'manual' ELSE 'immediate' END::public.results_release_mode
  WHERE results_released_at IS NULL AND status IN ('draft', 'published');

  PERFORM private.log_activity('PLATFORM_SETTINGS_UPDATED', NULL, 'platform_settings', NULL,
    jsonb_build_object('result_display', v_row.result_display, 'timer_warning_minutes', v_row.timer_warning_minutes));
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.save_platform_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_platform_settings(jsonb) TO authenticated;

-- ─── 2. Pattern pins ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pattern_pins (
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  usn            text NOT NULL CHECK (usn = upper(usn)),
  pattern_label  text NOT NULL CHECK (pattern_label ~ '^[A-J]$'),
  note           text,
  PRIMARY KEY (institution_id, usn)
);
ALTER TABLE public.pattern_pins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pattern_pins_read ON public.pattern_pins;
CREATE POLICY pattern_pins_read ON public.pattern_pins FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));
DROP POLICY IF EXISTS pattern_pins_manage ON public.pattern_pins;
CREATE POLICY pattern_pins_manage ON public.pattern_pins FOR ALL TO authenticated
  USING ((SELECT private.is_super_admin())) WITH CHECK ((SELECT private.is_super_admin()));
REVOKE ALL ON public.pattern_pins FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pattern_pins TO authenticated;

-- Demo randomisation accounts (src/data/demoAccounts.js).
INSERT INTO public.pattern_pins (institution_id, usn, pattern_label, note)
SELECT i.id, v.usn, v.label, 'Demo account'
FROM public.institutions i
CROSS JOIN (VALUES ('CS001', 'A'), ('CS002', 'B'), ('CS003', 'C'), ('CS004', 'D'), ('CS005', 'E'), ('CS006', 'F')) AS v(usn, label)
WHERE i.code = '1DA'
ON CONFLICT (institution_id, usn) DO NOTHING;

-- Balanced allocation (007) + pins: pinned candidates are placed first on
-- their pattern; the others then get the least-used pattern in USN order.
CREATE OR REPLACE FUNCTION private.allocate_patterns(p_exam_id uuid, p_assignment_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r     record;
  v_pid uuid;
  v_n   int := 0;
BEGIN
  FOR r IN
    SELECT a.id, a.institution_id, upper(p.usn) AS usn FROM public.exam_assignments a JOIN public.profiles p ON p.id = a.student_id
    LEFT JOIN public.pattern_pins pin ON pin.institution_id = a.institution_id AND pin.usn = upper(p.usn)
    WHERE a.exam_id = p_exam_id AND a.status = 'assigned' AND a.pattern_id IS NULL
      AND (p_assignment_id IS NULL OR a.id = p_assignment_id)
    ORDER BY (pin.usn IS NULL), upper(p.usn), a.id   -- pinned first, so balancing accounts for them
    FOR UPDATE OF a
  LOOP
    v_pid := NULL;
    SELECT ep.id INTO v_pid
    FROM public.pattern_pins pin
    JOIN public.exam_patterns ep ON ep.exam_id = p_exam_id AND ep.pattern_label = pin.pattern_label
    WHERE pin.institution_id = r.institution_id AND pin.usn = r.usn;
    IF v_pid IS NULL THEN
      SELECT ep.id INTO v_pid
      FROM public.exam_patterns ep
      LEFT JOIN public.exam_assignments x ON x.pattern_id = ep.id AND x.status = 'assigned'
      WHERE ep.exam_id = p_exam_id
      GROUP BY ep.id, ep.pattern_label
      ORDER BY count(x.id), ep.pattern_label
      LIMIT 1;
    END IF;
    IF v_pid IS NULL THEN RAISE EXCEPTION 'Exam has no generated patterns.'; END IF;
    UPDATE public.exam_assignments SET pattern_id = v_pid WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

-- ─── 3. Portal activity ──────────────────────────────────────────────────────
-- Server RPCs already log their own actions; this records the remaining
-- portal actions (e.g. "Created student account") for staff. Students cannot
-- write activity, and every field is bounded.
CREATE OR REPLACE FUNCTION public.record_activity(p_action text, p_category text DEFAULT 'portal',
                                                  p_target text DEFAULT '', p_details text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role public.user_role := private.my_role();
BEGIN
  IF v_role IS NULL OR v_role = 'student' THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_action, ''))) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'Invalid action.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.activity_logs (user_id, action, institution_id, entity_type, details)
  VALUES (auth.uid(), btrim(p_action), private.my_institution_id(), 'portal',
          jsonb_build_object('category', left(COALESCE(p_category, 'portal'), 40),
                             'target', left(COALESCE(p_target, ''), 200),
                             'details', left(COALESCE(p_details, ''), 500)));
END $$;
REVOKE ALL ON FUNCTION public.record_activity(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_activity(text, text, text, text) TO authenticated;

-- Staff need the actor's name next to each entry.
CREATE OR REPLACE VIEW public.portal_activity WITH (security_invoker = true) AS
SELECT l.id, l.created_at, l.action, l.entity_type, l.details, l.institution_id, l.user_id,
       p.full_name AS actor_name, p.role AS actor_role, COALESCE(p.staff_id, p.usn) AS actor_identifier
FROM public.activity_logs l
LEFT JOIN public.profiles p ON p.id = l.user_id;

-- ─── 4. Read models for the admin portal ─────────────────────────────────────
CREATE OR REPLACE VIEW public.admin_candidates WITH (security_invoker = true) AS
SELECT p.id, p.usn, p.full_name, p.email, p.is_active, p.institution_id, p.department_id,
       d.name AS department, sd.semester, sd.section, sd.phone,
       EXISTS (SELECT 1 FROM public.pattern_pins pin WHERE pin.institution_id = p.institution_id AND pin.usn = upper(p.usn)) AS pinned
FROM public.profiles p
LEFT JOIN public.departments d ON d.id = p.department_id
LEFT JOIN public.student_details sd ON sd.profile_id = p.id
WHERE p.role = 'student';

CREATE OR REPLACE VIEW public.admin_exam_overview WITH (security_invoker = true) AS
SELECT e.id, e.exam_code, e.title, e.status, e.institution_id, e.subject_id, s.code AS course_code, s.title AS course_title,
       e.semester_label, e.instructions, e.duration_minutes, e.total_marks, e.pass_percentage,
       e.window_start, e.window_end, e.results_release_mode, e.results_released_at,
       e.patterns_stale, e.patterns_generated_at, e.published_at, e.created_at, e.updated_at,
       (SELECT count(*) FROM public.exam_questions q WHERE q.exam_id = e.id) AS question_count,
       (SELECT count(*) FROM public.exam_patterns ep WHERE ep.exam_id = e.id) AS pattern_count,
       (SELECT count(*) FROM public.exam_assignments a WHERE a.exam_id = e.id AND a.status = 'assigned') AS assigned_count,
       (SELECT count(*) FROM public.exam_attempts t WHERE t.exam_id = e.id AND t.status = 'active') AS active_attempts,
       (SELECT count(*) FROM public.exam_attempts t WHERE t.exam_id = e.id AND t.status IN ('submitted', 'auto_submitted')) AS submitted_attempts
FROM public.exams e
JOIN public.subjects s ON s.id = e.subject_id;

-- One row per candidate × exam: assignment, pattern, latest attempt and result.
CREATE OR REPLACE VIEW public.admin_exam_candidates WITH (security_invoker = true) AS
SELECT a.exam_id, a.id AS assignment_id, a.student_id, p.usn, p.full_name, a.status AS assignment_status,
       a.revoke_reason, a.max_attempts, ep.pattern_label, ep.paper_code,
       la.id AS attempt_id, la.status AS attempt_status, la.started_at, la.submitted_at, la.submission_source,
       r.score, r.max_score, r.percentage, r.passed, r.correct_count, r.incorrect_count, r.unattempted_count
FROM public.exam_assignments a
JOIN public.profiles p ON p.id = a.student_id
LEFT JOIN public.exam_patterns ep ON ep.id = a.pattern_id
LEFT JOIN LATERAL (SELECT * FROM public.exam_attempts x WHERE x.assignment_id = a.id ORDER BY x.attempt_no DESC LIMIT 1) la ON true
LEFT JOIN public.exam_results r ON r.attempt_id = la.id;

-- Per-question evaluation of an attempt, including the pattern's correct
-- option. Admin-only by construction: students have no SELECT policy on
-- result_question_scores / exam_pattern_questions, so they get no rows.
CREATE OR REPLACE VIEW public.admin_attempt_breakdown WITH (security_invoker = true) AS
SELECT s.attempt_id, s.display_number, s.question_id, pq.statement, pq.options, s.selected_option,
       s.correct_option, s.is_attempted, s.is_correct, s.marks_awarded
FROM public.result_question_scores s
JOIN public.exam_attempts a ON a.id = s.attempt_id
JOIN public.exam_pattern_questions pq ON pq.pattern_id = a.pattern_id AND pq.display_number = s.display_number;

REVOKE ALL ON public.portal_activity, public.admin_candidates, public.admin_exam_overview,
              public.admin_exam_candidates, public.admin_attempt_breakdown FROM anon;
GRANT SELECT ON public.portal_activity, public.admin_candidates, public.admin_exam_overview,
               public.admin_exam_candidates, public.admin_attempt_breakdown TO authenticated;
