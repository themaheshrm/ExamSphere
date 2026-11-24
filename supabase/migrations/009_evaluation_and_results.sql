-- =============================================================================
-- ExamSphere Migration 009: Submission, automatic evaluation, results
--
-- Server-side replacement for examRandomizerService.evaluateSubmission().
-- Grading reads ONLY the immutable pattern answer-key snapshot and the
-- server-stored responses — never anything sent by the client at submit time.
-- =============================================================================

-- ─── 1. Results ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_results (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id         uuid NOT NULL UNIQUE REFERENCES public.exam_attempts (id) ON DELETE RESTRICT,
  exam_id            uuid NOT NULL REFERENCES public.exams (id) ON DELETE RESTRICT,
  student_id         uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  institution_id     uuid NOT NULL REFERENCES public.institutions (id) ON DELETE RESTRICT,
  pattern_id         uuid NOT NULL REFERENCES public.exam_patterns (id) ON DELETE RESTRICT,
  raw_score          numeric(7,2) NOT NULL,                      -- may be negative
  score              numeric(7,2) NOT NULL,                      -- after clamp rule
  max_score          numeric(7,2) NOT NULL CHECK (max_score > 0),
  percentage         numeric(5,2) NOT NULL,
  passed             boolean NOT NULL,
  correct_count      smallint NOT NULL CHECK (correct_count >= 0),
  incorrect_count    smallint NOT NULL CHECK (incorrect_count >= 0),
  unattempted_count  smallint NOT NULL CHECK (unattempted_count >= 0),
  evaluation_version smallint NOT NULL DEFAULT 1,
  evaluated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_results_counts_chk CHECK (correct_count + incorrect_count + unattempted_count = 25)
);
CREATE INDEX IF NOT EXISTS exam_results_exam_score_idx ON public.exam_results (exam_id, score DESC);
CREATE INDEX IF NOT EXISTS exam_results_student_idx    ON public.exam_results (student_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS exam_results_institution_idx ON public.exam_results (institution_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS public.result_question_scores (
  attempt_id      uuid NOT NULL REFERENCES public.exam_results (attempt_id) ON DELETE RESTRICT,
  display_number  smallint NOT NULL CHECK (display_number BETWEEN 1 AND 25),
  question_id     uuid NOT NULL REFERENCES public.questions (id) ON DELETE RESTRICT,
  selected_option smallint CHECK (selected_option BETWEEN 0 AND 3),
  correct_option  smallint NOT NULL CHECK (correct_option BETWEEN 0 AND 3),   -- admin-only table
  is_attempted    boolean NOT NULL,
  is_correct      boolean NOT NULL,
  marks_awarded   numeric(5,2) NOT NULL,
  PRIMARY KEY (attempt_id, display_number)
);
CREATE INDEX IF NOT EXISTS result_question_scores_question_idx ON public.result_question_scores (question_id);

DROP TRIGGER IF EXISTS exam_results_no_delete ON public.exam_results;
CREATE TRIGGER exam_results_no_delete BEFORE DELETE ON public.exam_results
  FOR EACH ROW EXECUTE FUNCTION private.block_mutation();
DROP TRIGGER IF EXISTS result_question_scores_no_delete ON public.result_question_scores;
CREATE TRIGGER result_question_scores_no_delete BEFORE DELETE ON public.result_question_scores
  FOR EACH ROW EXECUTE FUNCTION private.block_mutation();

-- ─── 2. Evaluation engine ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.evaluate_attempt(p_attempt_id uuid)
RETURNS public.exam_results LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_att    public.exam_attempts;
  v_exam   public.exams;
  v_raw    numeric;
  v_max    numeric;
  v_c      int; v_i int; v_u int;
  v_score  numeric;
  v_pct    numeric;
  v_result public.exam_results;
BEGIN
  SELECT * INTO v_att FROM public.exam_attempts WHERE id = p_attempt_id;
  IF v_att.status NOT IN ('submitted', 'auto_submitted') THEN
    RAISE EXCEPTION 'Only submitted attempts can be evaluated.';
  END IF;
  SELECT * INTO v_exam FROM public.exams WHERE id = v_att.exam_id;

  SELECT sum(CASE WHEN r.selected_option IS NULL THEN 0
                  WHEN r.selected_option = k.correct_option THEN pq.marks
                  ELSE -pq.negative_marks END),
         sum(pq.marks),
         count(*) FILTER (WHERE r.selected_option = k.correct_option),
         count(*) FILTER (WHERE r.selected_option IS NOT NULL AND r.selected_option <> k.correct_option),
         count(*) FILTER (WHERE r.selected_option IS NULL)
  INTO v_raw, v_max, v_c, v_i, v_u
  FROM public.exam_pattern_questions pq
  JOIN public.exam_pattern_answer_keys k ON k.pattern_id = pq.pattern_id AND k.display_number = pq.display_number
  LEFT JOIN public.attempt_responses r ON r.attempt_id = v_att.id AND r.display_number = pq.display_number
  WHERE pq.pattern_id = v_att.pattern_id;

  v_score := CASE WHEN v_exam.clamp_negative_total THEN GREATEST(v_raw, 0) ELSE v_raw END;
  v_pct   := round(v_score / v_max * 100, 2);

  INSERT INTO public.exam_results AS er
    (attempt_id, exam_id, student_id, institution_id, pattern_id, raw_score, score, max_score, percentage,
     passed, correct_count, incorrect_count, unattempted_count)
  VALUES (v_att.id, v_att.exam_id, v_att.student_id, v_att.institution_id, v_att.pattern_id, v_raw, v_score,
          v_max, v_pct, v_pct >= v_exam.pass_percentage, v_c, v_i, v_u)
  ON CONFLICT (attempt_id) DO UPDATE
    SET raw_score = EXCLUDED.raw_score, score = EXCLUDED.score, max_score = EXCLUDED.max_score,
        percentage = EXCLUDED.percentage, passed = EXCLUDED.passed, correct_count = EXCLUDED.correct_count,
        incorrect_count = EXCLUDED.incorrect_count, unattempted_count = EXCLUDED.unattempted_count,
        evaluation_version = er.evaluation_version + 1, evaluated_at = now()
  RETURNING * INTO v_result;

  INSERT INTO public.result_question_scores AS s
    (attempt_id, display_number, question_id, selected_option, correct_option, is_attempted, is_correct, marks_awarded)
  SELECT v_att.id, pq.display_number, pq.question_id, r.selected_option, k.correct_option,
         r.selected_option IS NOT NULL,
         COALESCE(r.selected_option = k.correct_option, false),
         CASE WHEN r.selected_option IS NULL THEN 0
              WHEN r.selected_option = k.correct_option THEN pq.marks ELSE -pq.negative_marks END
  FROM public.exam_pattern_questions pq
  JOIN public.exam_pattern_answer_keys k ON k.pattern_id = pq.pattern_id AND k.display_number = pq.display_number
  LEFT JOIN public.attempt_responses r ON r.attempt_id = v_att.id AND r.display_number = pq.display_number
  WHERE pq.pattern_id = v_att.pattern_id
  ON CONFLICT (attempt_id, display_number) DO UPDATE
    SET correct_option = EXCLUDED.correct_option, is_correct = EXCLUDED.is_correct,
        marks_awarded = EXCLUDED.marks_awarded;

  RETURN v_result;
END $$;

-- Close an active attempt exactly once and grade it. Idempotent.
CREATE OR REPLACE FUNCTION private.finalize_attempt(p_attempt_id uuid, p_source text)
RETURNS public.exam_attempts LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_att public.exam_attempts;
BEGIN
  SELECT * INTO v_att FROM public.exam_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_att.status <> 'active' THEN
    RETURN v_att;
  END IF;

  UPDATE public.exam_attempts
  SET status            = CASE WHEN p_source = 'student' THEN 'submitted'::public.attempt_status
                               ELSE 'auto_submitted'::public.attempt_status END,
      submitted_at      = LEAST(now(), deadline_at),
      submission_source = p_source
  WHERE id = p_attempt_id
  RETURNING * INTO v_att;

  INSERT INTO public.attempt_events (attempt_id, event_type, details)
  VALUES (p_attempt_id, CASE WHEN p_source = 'student' THEN 'submitted'
                             WHEN p_source = 'admin' THEN 'force_submitted'
                             ELSE 'auto_submitted' END,
          jsonb_build_object('source', p_source));

  PERFORM private.evaluate_attempt(p_attempt_id);
  RETURN v_att;
END $$;

CREATE OR REPLACE FUNCTION private.results_visible(p_exam_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.exams e WHERE e.id = p_exam_id
                 AND (e.results_release_mode = 'immediate' OR e.results_released_at IS NOT NULL))
$$;
GRANT EXECUTE ON FUNCTION private.results_visible(uuid) TO authenticated;

-- Student-facing result: aggregates only. Per-question review (right/wrong,
-- never the correct option) only after close + release + allow_response_review.
CREATE OR REPLACE FUNCTION private.student_result_payload(p_attempt_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'attemptId', a.id, 'status', a.status, 'submittedAt', a.submitted_at,
    'courseCode', s.code, 'courseTitle', s.title,
    'patternLabel', 'Pattern ' || p.pattern_label, 'paperCode', p.paper_code,
    'released', private.results_visible(e.id),
    'result', CASE WHEN private.results_visible(e.id) THEN jsonb_build_object(
        'score', r.score, 'maxScore', r.max_score, 'percentage', r.percentage, 'passed', r.passed,
        'correctCount', r.correct_count, 'incorrectCount', r.incorrect_count,
        'unattemptedCount', r.unattempted_count, 'totalQuestions', 25) END,
    'review', CASE WHEN e.allow_response_review AND e.status IN ('closed', 'archived')
                        AND e.results_released_at IS NOT NULL THEN (
        SELECT jsonb_agg(jsonb_build_object(
                 'displayNumber', q.display_number, 'questionText', pq.statement,
                 'options', to_jsonb(pq.options), 'studentAnswerIndex', q.selected_option,
                 'isAttempted', q.is_attempted, 'isCorrect', q.is_correct,
                 'marksAwarded', q.marks_awarded) ORDER BY q.display_number)
        FROM public.result_question_scores q
        JOIN public.exam_pattern_questions pq ON pq.pattern_id = a.pattern_id AND pq.display_number = q.display_number
        WHERE q.attempt_id = a.id) END)
  FROM public.exam_attempts a
  JOIN public.exams e ON e.id = a.exam_id
  JOIN public.subjects s ON s.id = e.subject_id
  JOIN public.exam_patterns p ON p.id = a.pattern_id
  LEFT JOIN public.exam_results r ON r.attempt_id = a.id
  WHERE a.id = p_attempt_id
$$;

-- ─── 3. Student RPCs ─────────────────────────────────────────────────────────
-- Final submit. Optional p_final_responses flushes the last unsaved answers
-- (same rules as autosave: rejected after the deadline).
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_attempt_id uuid, p_final_responses jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_att public.exam_attempts;
BEGIN
  SELECT * INTO v_att FROM public.exam_attempts WHERE id = p_attempt_id AND student_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found.' USING ERRCODE = 'P0002'; END IF;

  IF v_att.status = 'active' THEN
    IF p_final_responses IS NOT NULL AND jsonb_array_length(p_final_responses) > 0 THEN
      PERFORM public.save_attempt_responses(p_attempt_id, p_final_responses, NULL);  -- may auto-submit
    END IF;
    PERFORM private.finalize_attempt(p_attempt_id,
      CASE WHEN now() > v_att.deadline_at THEN 'timer' ELSE 'student' END);
  END IF;
  -- Idempotent: a repeated submit (double click / retry) just returns the outcome.
  RETURN private.student_result_payload(p_attempt_id);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_result(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_attempt uuid;
BEGIN
  SELECT a.id INTO v_attempt FROM public.exam_attempts a
  WHERE a.exam_id = p_exam_id AND a.student_id = auth.uid() AND a.status IN ('submitted', 'auto_submitted')
  ORDER BY a.attempt_no DESC LIMIT 1;
  IF v_attempt IS NULL THEN RETURN NULL; END IF;
  RETURN private.student_result_payload(v_attempt);
END $$;

-- Student dashboard feed (replaces studentMockData upcomingExams/recentResults).
CREATE OR REPLACE FUNCTION public.get_my_exams()
RETURNS TABLE (
  exam_id uuid, exam_code text, title text, course_code text, course_title text,
  window_start timestamptz, window_end timestamptz, duration_minutes int, total_marks numeric,
  total_questions smallint, venue text, seat_number text, pattern_label text, exam_status public.exam_status,
  availability text, attempt_id uuid, attempt_status public.attempt_status, deadline_at timestamptz,
  score numeric, max_score numeric, percentage numeric, passed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id, e.exam_code, e.title, s.code, s.title, e.window_start, e.window_end, e.duration_minutes,
         e.total_marks, e.question_count, COALESCE(a.venue, e.venue), a.seat_number, p.pattern_label, e.status,
         CASE
           WHEN la.status = 'active' THEN 'in_progress'
           WHEN la.status IN ('submitted', 'auto_submitted', 'voided')
                AND (SELECT count(*) FROM public.exam_attempts x WHERE x.assignment_id = a.id) >= a.max_attempts
             THEN 'completed'
           WHEN now() < e.window_start THEN 'upcoming'
           WHEN now() >= e.window_end OR e.status <> 'published' THEN 'closed'
           WHEN e.late_entry_minutes IS NOT NULL
                AND now() > e.window_start + make_interval(mins => e.late_entry_minutes) THEN 'entry_closed'
           ELSE 'live'
         END,
         la.id, la.status, la.deadline_at,
         CASE WHEN private.results_visible(e.id) THEN r.score END,
         CASE WHEN private.results_visible(e.id) THEN r.max_score END,
         CASE WHEN private.results_visible(e.id) THEN r.percentage END,
         CASE WHEN private.results_visible(e.id) THEN r.passed END
  FROM public.exam_assignments a
  JOIN public.exams e ON e.id = a.exam_id AND e.status IN ('published', 'closed')
  JOIN public.subjects s ON s.id = e.subject_id
  LEFT JOIN public.exam_patterns p ON p.id = a.pattern_id
  LEFT JOIN LATERAL (SELECT * FROM public.exam_attempts x WHERE x.assignment_id = a.id
                     ORDER BY x.attempt_no DESC LIMIT 1) la ON true
  LEFT JOIN public.exam_results r ON r.attempt_id = la.id
  WHERE a.student_id = auth.uid() AND a.status = 'assigned'
  ORDER BY e.window_start
$$;

-- ─── 4. Admin RPCs ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_exam(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_exam public.exams;
  r      record;
  v_n    int := 0;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found.' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL THEN PERFORM private.assert_can_manage(v_exam.institution_id); END IF;
  IF v_exam.status <> 'published' THEN RAISE EXCEPTION 'Only published exams can be closed.'; END IF;
  FOR r IN SELECT id FROM public.exam_attempts WHERE exam_id = p_exam_id AND status = 'active' LOOP
    PERFORM private.finalize_attempt(r.id, CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'admin' END);
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.exams SET status = 'closed', closed_at = now() WHERE id = p_exam_id;
  PERFORM private.log_activity('EXAM_CLOSED', v_exam.institution_id, 'exam', p_exam_id,
    jsonb_build_object('force_submitted_attempts', v_n));
  RETURN jsonb_build_object('examId', p_exam_id, 'status', 'closed', 'forceSubmitted', v_n);
END $$;

CREATE OR REPLACE FUNCTION public.release_exam_results(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exam public.exams;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_exam.institution_id);
  IF v_exam.status NOT IN ('closed', 'archived') THEN
    RAISE EXCEPTION 'Close the examination before releasing results.';
  END IF;
  UPDATE public.exams SET results_released_at = COALESCE(results_released_at, now()) WHERE id = p_exam_id;
  PERFORM private.log_activity('RESULTS_RELEASED', v_exam.institution_id, 'exam', p_exam_id, '{}');
  RETURN jsonb_build_object('examId', p_exam_id, 'resultsReleasedAt', now());
END $$;

CREATE OR REPLACE FUNCTION public.admin_extend_attempt(p_attempt_id uuid, p_minutes int, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_att public.exam_attempts;
BEGIN
  SELECT * INTO v_att FROM public.exam_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_att.institution_id);
  IF v_att.status <> 'active' THEN RAISE EXCEPTION 'Only active attempts can be extended.'; END IF;
  IF p_minutes NOT BETWEEN 1 AND 120 OR length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Provide 1–120 minutes and a reason.';
  END IF;
  UPDATE public.exam_attempts SET deadline_at = deadline_at + make_interval(mins => p_minutes)
  WHERE id = p_attempt_id RETURNING * INTO v_att;
  INSERT INTO public.attempt_events (attempt_id, event_type, details)
  VALUES (p_attempt_id, 'time_extended', jsonb_build_object('minutes', p_minutes, 'reason', p_reason, 'by', auth.uid()));
  PERFORM private.log_activity('ATTEMPT_EXTENDED', v_att.institution_id, 'exam_attempt', p_attempt_id,
    jsonb_build_object('minutes', p_minutes, 'reason', p_reason));
  RETURN jsonb_build_object('attemptId', p_attempt_id, 'deadlineAt', v_att.deadline_at);
END $$;

CREATE OR REPLACE FUNCTION public.admin_force_submit_attempt(p_attempt_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_att public.exam_attempts;
BEGIN
  SELECT * INTO v_att FROM public.exam_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_att.institution_id);
  PERFORM private.finalize_attempt(p_attempt_id, 'admin');
  PERFORM private.log_activity('ATTEMPT_FORCE_SUBMITTED', v_att.institution_id, 'exam_attempt', p_attempt_id,
    jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('attemptId', p_attempt_id, 'status', 'auto_submitted');
END $$;

-- Malpractice: the attempt stays on record (and still consumes the attempt).
CREATE OR REPLACE FUNCTION public.void_exam_attempt(p_attempt_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_att public.exam_attempts;
BEGIN
  SELECT * INTO v_att FROM public.exam_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_att.institution_id);
  IF length(btrim(COALESCE(p_reason, ''))) < 10 THEN RAISE EXCEPTION 'A detailed reason is required.'; END IF;
  UPDATE public.exam_attempts SET status = 'voided', voided_by = auth.uid(), voided_reason = p_reason
  WHERE id = p_attempt_id;
  INSERT INTO public.attempt_events (attempt_id, event_type, details)
  VALUES (p_attempt_id, 'voided', jsonb_build_object('reason', p_reason, 'by', auth.uid()));
  PERFORM private.log_activity('ATTEMPT_VOIDED', v_att.institution_id, 'exam_attempt', p_attempt_id,
    jsonb_build_object('reason', p_reason, 'student_id', v_att.student_id));
  RETURN jsonb_build_object('attemptId', p_attempt_id, 'status', 'voided');
END $$;

-- Re-grade every submitted attempt (after a moderated key change).
CREATE OR REPLACE FUNCTION public.reevaluate_exam(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; v_n int := 0;
BEGIN
  PERFORM private.assert_can_manage((SELECT institution_id FROM public.exams WHERE id = p_exam_id));
  FOR r IN SELECT id FROM public.exam_attempts WHERE exam_id = p_exam_id AND status IN ('submitted', 'auto_submitted') LOOP
    PERFORM private.evaluate_attempt(r.id);
    v_n := v_n + 1;
  END LOOP;
  PERFORM private.log_activity('EXAM_REEVALUATED', (SELECT institution_id FROM public.exams WHERE id = p_exam_id),
    'exam', p_exam_id, jsonb_build_object('attempts', v_n));
  RETURN jsonb_build_object('examId', p_exam_id, 'reevaluated', v_n);
END $$;

-- ─── 5. Scheduled sweeper (pg_cron, runs as postgres — never exposed) ────────
CREATE OR REPLACE FUNCTION private.finalize_expired_attempts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; v_attempts int := 0; v_exams int := 0;
BEGIN
  FOR r IN SELECT id FROM public.exam_attempts
           WHERE status = 'active' AND deadline_at < now() - interval '5 seconds'
           ORDER BY deadline_at LIMIT 2000 LOOP
    PERFORM private.finalize_attempt(r.id, 'timer');
    v_attempts := v_attempts + 1;
  END LOOP;
  -- Auto-close exams whose window ended and that have no attempt still running.
  FOR r IN SELECT e.id FROM public.exams e
           WHERE e.status = 'published' AND e.window_end < now()
             AND NOT EXISTS (SELECT 1 FROM public.exam_attempts a WHERE a.exam_id = e.id AND a.status = 'active') LOOP
    PERFORM public.close_exam(r.id);
    v_exams := v_exams + 1;
  END LOOP;
  RETURN jsonb_build_object('finalizedAttempts', v_attempts, 'closedExams', v_exams);
END $$;

-- ─── 6. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.exam_results           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_question_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_results_select_student ON public.exam_results;
CREATE POLICY exam_results_select_student ON public.exam_results FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) AND private.results_visible(exam_id));
DROP POLICY IF EXISTS exam_results_select_admin ON public.exam_results;
CREATE POLICY exam_results_select_admin ON public.exam_results FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));

-- Contains correct options → admins only.
DROP POLICY IF EXISTS result_question_scores_select_admin ON public.result_question_scores;
CREATE POLICY result_question_scores_select_admin ON public.result_question_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exam_results r WHERE r.attempt_id = result_question_scores.attempt_id
                 AND (r.institution_id = (SELECT private.my_admin_institution_id())
                      OR (SELECT private.is_super_admin()))));

-- ─── 7. Privileges ───────────────────────────────────────────────────────────
REVOKE ALL ON public.exam_results, public.result_question_scores FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.exam_results, public.result_question_scores FROM authenticated;
GRANT SELECT ON public.exam_results, public.result_question_scores TO authenticated;

REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid, jsonb), public.get_my_result(uuid), public.get_my_exams(),
                       public.close_exam(uuid), public.release_exam_results(uuid),
                       public.admin_extend_attempt(uuid, int, text), public.admin_force_submit_attempt(uuid, text),
                       public.void_exam_attempt(uuid, text), public.reevaluate_exam(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb), public.get_my_result(uuid), public.get_my_exams(),
                          public.close_exam(uuid), public.release_exam_results(uuid),
                          public.admin_extend_attempt(uuid, int, text), public.admin_force_submit_attempt(uuid, text),
                          public.void_exam_attempt(uuid, text), public.reevaluate_exam(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.evaluate_attempt(uuid), private.finalize_attempt(uuid, text),
                       private.student_result_payload(uuid), private.finalize_expired_attempts() FROM PUBLIC;
