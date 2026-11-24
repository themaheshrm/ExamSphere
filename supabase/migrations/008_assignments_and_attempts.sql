-- =============================================================================
-- ExamSphere Migration 008: Student assignments, attempts, autosaved responses
--
-- Server-side replacement for examRandomizerService.getStudentExam() and the
-- sessionStorage draft/timer in ExamInterface.jsx.
--   * deadline_at is computed by the server at start and is the only clock
--   * students have NO write privilege on any table; every write is an RPC
--   * one attempt per assignment (max_attempts, row-locked) → no retakes
--   * attempts / responses are never deleted
-- =============================================================================

-- ─── 1. Assignments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id            uuid NOT NULL,
  student_id         uuid NOT NULL,
  institution_id     uuid NOT NULL,
  pattern_id         uuid,
  status             public.assignment_status NOT NULL DEFAULT 'assigned',
  max_attempts       smallint NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 5),
  extra_time_minutes smallint NOT NULL DEFAULT 0 CHECK (extra_time_minutes BETWEEN 0 AND 240), -- accommodations
  venue              text,                         -- 'CCC Lab 2'
  seat_number        text,                         -- 'Terminal #CCC-24'
  assigned_by        uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  assigned_at        timestamptz NOT NULL DEFAULT now(),
  revoked_by         uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  revoked_at         timestamptz,
  revoke_reason      text,
  CONSTRAINT exam_assignments_exam_student_key UNIQUE (exam_id, student_id),
  CONSTRAINT exam_assignments_id_student_key   UNIQUE (id, student_id),
  CONSTRAINT exam_assignments_exam_fkey FOREIGN KEY (exam_id, institution_id)
    REFERENCES public.exams (id, institution_id) ON DELETE CASCADE,
  CONSTRAINT exam_assignments_student_fkey FOREIGN KEY (student_id, institution_id)
    REFERENCES public.profiles (id, institution_id) ON DELETE RESTRICT,
  CONSTRAINT exam_assignments_pattern_fkey FOREIGN KEY (pattern_id, exam_id)
    REFERENCES public.exam_patterns (id, exam_id) ON DELETE SET NULL (pattern_id),
  CONSTRAINT exam_assignments_revoked_chk CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS exam_assignments_student_idx ON public.exam_assignments (student_id, status);
CREATE INDEX IF NOT EXISTS exam_assignments_pattern_idx ON public.exam_assignments (pattern_id) WHERE pattern_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS exam_assignments_institution_idx ON public.exam_assignments (institution_id, exam_id);

-- ─── 2. Attempts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     uuid NOT NULL,
  exam_id           uuid NOT NULL,
  student_id        uuid NOT NULL,
  institution_id    uuid NOT NULL,
  pattern_id        uuid NOT NULL,
  attempt_no        smallint NOT NULL DEFAULT 1 CHECK (attempt_no BETWEEN 1 AND 5),
  status            public.attempt_status NOT NULL DEFAULT 'active',
  started_at        timestamptz NOT NULL DEFAULT now(),
  deadline_at       timestamptz NOT NULL,
  submitted_at      timestamptz,
  submission_source text CHECK (submission_source IN ('student', 'timer', 'admin', 'system')),
  last_activity_at  timestamptz NOT NULL DEFAULT now(),
  last_client_seq   bigint NOT NULL DEFAULT 0,       -- orders concurrent autosaves
  client_info       jsonb NOT NULL DEFAULT '{}'::jsonb,
  voided_by         uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  voided_reason     text,
  CONSTRAINT exam_attempts_assignment_no_key UNIQUE (assignment_id, attempt_no),
  CONSTRAINT exam_attempts_assignment_fkey FOREIGN KEY (assignment_id, student_id)
    REFERENCES public.exam_assignments (id, student_id) ON DELETE RESTRICT,
  CONSTRAINT exam_attempts_pattern_fkey FOREIGN KEY (pattern_id, exam_id)
    REFERENCES public.exam_patterns (id, exam_id) ON DELETE RESTRICT,
  CONSTRAINT exam_attempts_exam_fkey FOREIGN KEY (exam_id, institution_id)
    REFERENCES public.exams (id, institution_id) ON DELETE RESTRICT,
  CONSTRAINT exam_attempts_deadline_chk CHECK (deadline_at > started_at),
  CONSTRAINT exam_attempts_submitted_chk CHECK (
    (status = 'active' AND submitted_at IS NULL) OR
    (status IN ('submitted', 'auto_submitted') AND submitted_at IS NOT NULL AND submission_source IS NOT NULL) OR
    (status = 'voided'))
);
CREATE UNIQUE INDEX IF NOT EXISTS exam_attempts_one_active ON public.exam_attempts (assignment_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS exam_attempts_exam_status_idx ON public.exam_attempts (exam_id, status);
CREATE INDEX IF NOT EXISTS exam_attempts_student_idx ON public.exam_attempts (student_id, started_at DESC);
CREATE INDEX IF NOT EXISTS exam_attempts_expiry_idx ON public.exam_attempts (deadline_at) WHERE status = 'active';

-- ─── 3. Responses (one row per displayed question, pre-created at start) ─────
CREATE TABLE IF NOT EXISTS public.attempt_responses (
  attempt_id           uuid NOT NULL REFERENCES public.exam_attempts (id) ON DELETE RESTRICT,
  display_number       smallint NOT NULL CHECK (display_number BETWEEN 1 AND 25),
  selected_option      smallint CHECK (selected_option BETWEEN 0 AND 3),     -- display index, NULL = unanswered
  is_marked_for_review boolean NOT NULL DEFAULT false,
  is_visited           boolean NOT NULL DEFAULT false,
  revision             integer NOT NULL DEFAULT 0,
  answered_at          timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, display_number)
) WITH (fillfactor = 80);   -- leave room for HOT updates from frequent autosaves

-- ─── 4. Proctoring / timeline events ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attempt_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id  uuid NOT NULL REFERENCES public.exam_attempts (id) ON DELETE RESTRICT,
  event_type  text NOT NULL CHECK (event_type IN (
                'started', 'resumed', 'submitted', 'auto_submitted', 'time_extended', 'voided',
                'force_submitted', 'tab_hidden', 'tab_visible', 'fullscreen_exit', 'fullscreen_enter',
                'copy_attempt', 'paste_attempt', 'context_menu', 'network_offline', 'network_online')),
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attempt_events_attempt_idx ON public.attempt_events (attempt_id, occurred_at);

-- ─── 5. Integrity triggers ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.guard_attempt_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (NEW.assignment_id, NEW.exam_id, NEW.student_id, NEW.institution_id, NEW.pattern_id,
      NEW.attempt_no, NEW.started_at)
     IS DISTINCT FROM
     (OLD.assignment_id, OLD.exam_id, OLD.student_id, OLD.institution_id, OLD.pattern_id,
      OLD.attempt_no, OLD.started_at) THEN
    RAISE EXCEPTION 'Attempt identity fields are immutable.' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
       (OLD.status = 'active' AND NEW.status IN ('submitted', 'auto_submitted', 'voided')) OR
       (OLD.status IN ('submitted', 'auto_submitted') AND NEW.status = 'voided')) THEN
    RAISE EXCEPTION 'Illegal attempt transition % → %.', OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'active' AND (NEW.deadline_at, NEW.submitted_at, NEW.submission_source)
       IS DISTINCT FROM (OLD.deadline_at, OLD.submitted_at, OLD.submission_source) THEN
    RAISE EXCEPTION 'A finished attempt cannot be modified.' USING ERRCODE = '42501';
  END IF;
  IF NEW.deadline_at < OLD.deadline_at THEN
    RAISE EXCEPTION 'An attempt deadline can only be extended.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS exam_attempts_guard_update ON public.exam_attempts;
CREATE TRIGGER exam_attempts_guard_update BEFORE UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION private.guard_attempt_update();
DROP TRIGGER IF EXISTS exam_attempts_no_delete ON public.exam_attempts;
CREATE TRIGGER exam_attempts_no_delete BEFORE DELETE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION private.block_mutation();

CREATE OR REPLACE FUNCTION private.guard_response_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exam_attempts a WHERE a.id = NEW.attempt_id AND a.status = 'active') THEN
    RAISE EXCEPTION 'Responses are locked once the attempt is submitted.' USING ERRCODE = '42501';
  END IF;
  IF (NEW.attempt_id, NEW.display_number) IS DISTINCT FROM (OLD.attempt_id, OLD.display_number) THEN
    RAISE EXCEPTION 'Response identity is immutable.' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS attempt_responses_guard_update ON public.attempt_responses;
CREATE TRIGGER attempt_responses_guard_update BEFORE UPDATE ON public.attempt_responses
  FOR EACH ROW EXECUTE FUNCTION private.guard_response_update();
DROP TRIGGER IF EXISTS attempt_responses_no_delete ON public.attempt_responses;
CREATE TRIGGER attempt_responses_no_delete BEFORE DELETE ON public.attempt_responses
  FOR EACH ROW EXECUTE FUNCTION private.block_mutation();
DROP TRIGGER IF EXISTS attempt_events_append_only ON public.attempt_events;
CREATE TRIGGER attempt_events_append_only BEFORE UPDATE OR DELETE ON public.attempt_events
  FOR EACH ROW EXECUTE FUNCTION private.block_mutation();

-- ─── 6. Admin assignment RPCs ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_students_to_exam(
  p_exam_id uuid, p_student_ids uuid[], p_venue text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_exam     public.exams;
  v_inserted int;
  v_invalid  int;
  v_alloc    int := 0;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_exam.institution_id);
  IF v_exam.status NOT IN ('draft', 'published') THEN RAISE EXCEPTION 'This exam is closed.'; END IF;
  IF cardinality(p_student_ids) > 5000 THEN RAISE EXCEPTION 'Assign at most 5000 students per call.'; END IF;

  SELECT count(*) INTO v_invalid FROM unnest(p_student_ids) s(id)
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.id AND p.role = 'student'
                    AND p.is_active AND p.institution_id = v_exam.institution_id);
  IF v_invalid > 0 THEN
    RAISE EXCEPTION '% selected account(s) are not active students of this institution.', v_invalid
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.exam_assignments (exam_id, student_id, institution_id, venue, assigned_by)
  SELECT p_exam_id, s.id, v_exam.institution_id, p_venue, auth.uid()
  FROM (SELECT DISTINCT unnest(p_student_ids) AS id) s
  ON CONFLICT (exam_id, student_id) DO UPDATE
    SET status = 'assigned', revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL,
        venue = COALESCE(EXCLUDED.venue, public.exam_assignments.venue)
    WHERE public.exam_assignments.status = 'revoked';
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_exam.status = 'published' THEN
    v_alloc := private.allocate_patterns(p_exam_id);
  END IF;
  PERFORM private.log_activity('STUDENTS_ASSIGNED', v_exam.institution_id, 'exam', p_exam_id,
    jsonb_build_object('count', v_inserted));
  RETURN jsonb_build_object('assigned', v_inserted, 'patternsAllocated', v_alloc);
END $$;

-- Assign a whole cohort (department / semester / section) in one call.
CREATE OR REPLACE FUNCTION public.assign_cohort_to_exam(
  p_exam_id uuid, p_department_id uuid DEFAULT NULL, p_semester smallint DEFAULT NULL,
  p_section text DEFAULT NULL, p_venue text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_inst uuid := (SELECT institution_id FROM public.exams WHERE id = p_exam_id);
  v_ids  uuid[];
BEGIN
  PERFORM private.assert_can_manage(v_inst);
  SELECT COALESCE(array_agg(p.id), '{}') INTO v_ids
  FROM public.profiles p
  LEFT JOIN public.student_details d ON d.profile_id = p.id
  WHERE p.institution_id = v_inst AND p.role = 'student' AND p.is_active
    AND (p_department_id IS NULL OR p.department_id = p_department_id)
    AND (p_semester IS NULL OR d.semester = p_semester)
    AND (p_section IS NULL OR d.section = upper(p_section));
  IF cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'No active students match this cohort.'; END IF;
  RETURN public.assign_students_to_exam(p_exam_id, v_ids, p_venue);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_exam_assignment(p_assignment_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_a public.exam_assignments;
BEGIN
  SELECT * INTO v_a FROM public.exam_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_a.institution_id);
  IF EXISTS (SELECT 1 FROM public.exam_attempts WHERE assignment_id = p_assignment_id) THEN
    RAISE EXCEPTION 'The student has already attempted this exam; void the attempt instead.' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  UPDATE public.exam_assignments
  SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason, pattern_id = NULL
  WHERE id = p_assignment_id;
  PERFORM private.log_activity('ASSIGNMENT_REVOKED', v_a.institution_id, 'exam_assignment', p_assignment_id,
    jsonb_build_object('reason', p_reason, 'student_id', v_a.student_id));
  RETURN jsonb_build_object('assignmentId', p_assignment_id, 'status', 'revoked');
END $$;

-- The ONLY way to allow a retake: explicit, audited, bounded by max_attempts ≤ 5.
CREATE OR REPLACE FUNCTION public.grant_exam_retake(p_assignment_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_a public.exam_assignments;
BEGIN
  SELECT * INTO v_a FROM public.exam_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_a.institution_id);
  IF length(btrim(COALESCE(p_reason, ''))) < 10 THEN RAISE EXCEPTION 'A detailed reason is required.'; END IF;
  UPDATE public.exam_assignments SET max_attempts = max_attempts + 1 WHERE id = p_assignment_id;
  PERFORM private.log_activity('RETAKE_GRANTED', v_a.institution_id, 'exam_assignment', p_assignment_id,
    jsonb_build_object('reason', p_reason, 'student_id', v_a.student_id, 'new_max_attempts', v_a.max_attempts + 1));
  RETURN jsonb_build_object('assignmentId', p_assignment_id, 'maxAttempts', v_a.max_attempts + 1);
END $$;

-- ─── 7. Student paper payload (student-safe: never includes keys or question ids)
CREATE OR REPLACE FUNCTION private.attempt_payload(p_attempt_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'attemptId', a.id, 'examId', e.id, 'examCode', e.exam_code, 'title', e.title,
    'courseCode', s.code, 'courseTitle', s.title, 'institution', i.name,
    'semester', e.semester_label, 'durationMinutes', e.duration_minutes,
    'totalMarks', e.total_marks, 'totalQuestions', e.question_count,
    'marksPerQuestion', (SELECT CASE WHEN count(DISTINCT pq.marks) = 1 THEN min(pq.marks) END
                         FROM public.exam_pattern_questions pq WHERE pq.pattern_id = a.pattern_id),
    'negativeMarking', EXISTS (SELECT 1 FROM public.exam_pattern_questions pq
                               WHERE pq.pattern_id = a.pattern_id AND pq.negative_marks > 0),
    'instructions', to_jsonb(e.instructions),
    'patternId', p.pattern_label, 'patternLabel', 'Pattern ' || p.pattern_label, 'paperCode', p.paper_code,
    'status', a.status, 'startedAt', a.started_at, 'deadlineAt', a.deadline_at, 'serverNow', now(),
    'remainingSeconds', GREATEST(0, floor(extract(epoch FROM a.deadline_at - now())))::int,
    'questions', CASE WHEN a.status = 'active' THEN (
        SELECT jsonb_agg(jsonb_build_object(
                 'index', pq.display_number - 1, 'displayNumber', pq.display_number,
                 'text', pq.statement, 'options', to_jsonb(pq.options),
                 'marks', pq.marks, 'negativeMarks', pq.negative_marks)
               ORDER BY pq.display_number)
        FROM public.exam_pattern_questions pq WHERE pq.pattern_id = a.pattern_id)
      ELSE '[]'::jsonb END,
    'responses', (
        SELECT jsonb_agg(jsonb_build_object(
                 'displayNumber', r.display_number, 'selectedOption', r.selected_option,
                 'markedForReview', r.is_marked_for_review, 'visited', r.is_visited)
               ORDER BY r.display_number)
        FROM public.attempt_responses r WHERE r.attempt_id = a.id))
  FROM public.exam_attempts a
  JOIN public.exams e ON e.id = a.exam_id
  JOIN public.subjects s ON s.id = e.subject_id
  JOIN public.institutions i ON i.id = e.institution_id
  JOIN public.exam_patterns p ON p.id = a.pattern_id
  WHERE a.id = p_attempt_id
$$;

-- ─── 8. Student RPCs ─────────────────────────────────────────────────────────
-- Start (or resume) the caller's attempt. Replaces getStudentExam().
CREATE OR REPLACE FUNCTION public.start_exam_attempt(p_exam_id uuid, p_client_info jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student public.profiles := private.require_active_student();
  v_asg     public.exam_assignments;
  v_exam    public.exams;
  v_att     public.exam_attempts;
  v_used    int;
  v_id      uuid;
BEGIN
  SELECT * INTO v_asg FROM public.exam_assignments
  WHERE exam_id = p_exam_id AND student_id = v_student.id
  FOR UPDATE;                                   -- serialises double-clicks / two tabs
  IF NOT FOUND OR v_asg.status <> 'assigned' THEN
    RAISE EXCEPTION 'You are not assigned to this examination.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
  IF v_exam.status <> 'published' THEN
    RAISE EXCEPTION 'This examination is not available.' USING ERRCODE = '42501';
  END IF;

  -- Resume an in-flight attempt (refresh / new tab / other device)
  SELECT * INTO v_att FROM public.exam_attempts WHERE assignment_id = v_asg.id AND status = 'active';
  IF FOUND THEN
    IF v_att.deadline_at > now() THEN
      INSERT INTO public.attempt_events (attempt_id, event_type, details)
      VALUES (v_att.id, 'resumed', COALESCE(p_client_info, '{}'::jsonb));
      RETURN private.attempt_payload(v_att.id);
    END IF;
    PERFORM private.finalize_attempt(v_att.id, 'timer');   -- defined in 009
    IF (SELECT count(*) FROM public.exam_attempts WHERE assignment_id = v_asg.id) >= v_asg.max_attempts THEN
      RETURN private.attempt_payload(v_att.id);             -- commit the auto-submission, no new attempt
    END IF;
  END IF;

  IF now() < v_exam.window_start THEN
    RAISE EXCEPTION 'The examination window opens at %.', v_exam.window_start USING ERRCODE = '42501';
  END IF;
  IF now() >= v_exam.window_end
     OR (v_exam.late_entry_minutes IS NOT NULL
         AND now() > v_exam.window_start + make_interval(mins => v_exam.late_entry_minutes)) THEN
    RAISE EXCEPTION 'The entry window for this examination has closed.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_used FROM public.exam_attempts WHERE assignment_id = v_asg.id;
  IF v_used >= v_asg.max_attempts THEN
    RAISE EXCEPTION 'You have already attempted this examination.' USING ERRCODE = '42501';
  END IF;

  IF v_asg.pattern_id IS NULL THEN
    PERFORM private.allocate_patterns(p_exam_id, v_asg.id);
    SELECT * INTO v_asg FROM public.exam_assignments WHERE id = v_asg.id;
  END IF;

  INSERT INTO public.exam_attempts (assignment_id, exam_id, student_id, institution_id, pattern_id,
                                    attempt_no, deadline_at, client_info)
  VALUES (v_asg.id, p_exam_id, v_student.id, v_exam.institution_id, v_asg.pattern_id, v_used + 1,
          LEAST(now() + make_interval(mins => v_exam.duration_minutes + v_asg.extra_time_minutes), v_exam.window_end),
          COALESCE(p_client_info, '{}'::jsonb))
  RETURNING id INTO v_id;

  INSERT INTO public.attempt_responses (attempt_id, display_number, is_visited)
  SELECT v_id, n, n = 1 FROM generate_series(1, 25) n;
  INSERT INTO public.attempt_events (attempt_id, event_type, details)
  VALUES (v_id, 'started', COALESCE(p_client_info, '{}'::jsonb));

  RETURN private.attempt_payload(v_id);
END $$;

-- Re-fetch the paper + saved responses + authoritative clock.
CREATE OR REPLACE FUNCTION public.get_attempt_paper(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_att public.exam_attempts;
BEGIN
  SELECT * INTO v_att FROM public.exam_attempts WHERE id = p_attempt_id AND student_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_att.status = 'active' AND v_att.deadline_at <= now() THEN
    PERFORM private.finalize_attempt(v_att.id, 'timer');
  END IF;
  RETURN private.attempt_payload(p_attempt_id);
END $$;

-- Autosave. p_responses: [{displayNumber, selectedOption|null, markedForReview, visited}]
-- p_client_seq: monotonically increasing per tab; stale saves are ignored.
CREATE OR REPLACE FUNCTION public.save_attempt_responses(p_attempt_id uuid, p_responses jsonb, p_client_seq bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_att   public.exam_attempts;
  v_grace constant interval := interval '5 seconds';   -- network latency allowance only
  v_bad   int;
BEGIN
  SELECT * INTO v_att FROM public.exam_attempts WHERE id = p_attempt_id AND student_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_att.status <> 'active' THEN
    RAISE EXCEPTION 'This attempt has already been submitted.' USING ERRCODE = '42501';
  END IF;
  IF now() > v_att.deadline_at + v_grace THEN
    PERFORM private.finalize_attempt(v_att.id, 'timer');
    RETURN jsonb_build_object('status', 'auto_submitted', 'serverNow', now(), 'deadlineAt', v_att.deadline_at);
  END IF;
  IF p_client_seq IS NOT NULL AND p_client_seq <= v_att.last_client_seq THEN
    RETURN jsonb_build_object('status', 'stale_ignored', 'serverNow', now(), 'deadlineAt', v_att.deadline_at);
  END IF;
  IF jsonb_typeof(p_responses) <> 'array' OR jsonb_array_length(p_responses) > 25 THEN
    RAISE EXCEPTION 'Send between 0 and 25 responses.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad FROM jsonb_array_elements(p_responses) x
  WHERE NOT (x->>'displayNumber' ~ '^([1-9]|1[0-9]|2[0-5])$')
     OR (x ? 'selectedOption' AND jsonb_typeof(x->'selectedOption') <> 'null'
         AND NOT (x->>'selectedOption' ~ '^[0-3]$'));
  IF v_bad > 0 THEN RAISE EXCEPTION 'Invalid response payload.' USING ERRCODE = '22023'; END IF;

  UPDATE public.attempt_responses r
  SET selected_option      = CASE WHEN x ? 'selectedOption' THEN (x->>'selectedOption')::smallint ELSE r.selected_option END,
      is_marked_for_review = COALESCE((x->>'markedForReview')::boolean, r.is_marked_for_review),
      is_visited           = r.is_visited OR COALESCE((x->>'visited')::boolean, false)
                             OR (x ? 'selectedOption' AND jsonb_typeof(x->'selectedOption') <> 'null'),
      answered_at          = CASE WHEN x ? 'selectedOption' THEN now() ELSE r.answered_at END,
      revision             = r.revision + 1
  FROM jsonb_array_elements(p_responses) x
  WHERE r.attempt_id = p_attempt_id AND r.display_number = (x->>'displayNumber')::smallint;

  UPDATE public.exam_attempts
  SET last_activity_at = now(), last_client_seq = COALESCE(p_client_seq, last_client_seq)
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object('status', 'saved', 'serverNow', now(), 'deadlineAt', v_att.deadline_at,
    'remainingSeconds', GREATEST(0, floor(extract(epoch FROM v_att.deadline_at - now())))::int);
END $$;

CREATE OR REPLACE FUNCTION public.log_attempt_event(p_attempt_id uuid, p_event_type text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_event_type NOT IN ('tab_hidden', 'tab_visible', 'fullscreen_exit', 'fullscreen_enter', 'copy_attempt',
                          'paste_attempt', 'context_menu', 'network_offline', 'network_online') THEN
    RAISE EXCEPTION 'Unsupported event type.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exam_attempts
                 WHERE id = p_attempt_id AND student_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'Attempt not found.' USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT count(*) FROM public.attempt_events WHERE attempt_id = p_attempt_id) >= 1000 THEN
    RETURN;   -- simple flood guard
  END IF;
  INSERT INTO public.attempt_events (attempt_id, event_type, details)
  VALUES (p_attempt_id, p_event_type,
          CASE WHEN length(COALESCE(p_details, '{}'::jsonb)::text) <= 2000 THEN COALESCE(p_details, '{}'::jsonb)
               ELSE '{"truncated": true}'::jsonb END);
END $$;

-- ─── 9. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.exam_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_events    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_assignments_select ON public.exam_assignments;
CREATE POLICY exam_assignments_select ON public.exam_assignments FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR institution_id = (SELECT private.my_admin_institution_id())
         OR (SELECT private.is_super_admin()));

-- Students see only exams they are assigned to, and only once published.
DROP POLICY IF EXISTS exams_select_assigned_student ON public.exams;
CREATE POLICY exams_select_assigned_student ON public.exams FOR SELECT TO authenticated
  USING (status IN ('published', 'closed')
         AND EXISTS (SELECT 1 FROM public.exam_assignments a
                     WHERE a.exam_id = exams.id AND a.student_id = (SELECT auth.uid())
                       AND a.status = 'assigned'));

DROP POLICY IF EXISTS exam_attempts_select ON public.exam_attempts;
CREATE POLICY exam_attempts_select ON public.exam_attempts FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR institution_id = (SELECT private.my_admin_institution_id())
         OR (SELECT private.is_super_admin()));

DROP POLICY IF EXISTS attempt_responses_select ON public.attempt_responses;
CREATE POLICY attempt_responses_select ON public.attempt_responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exam_attempts a WHERE a.id = attempt_id));  -- inherits attempt RLS

DROP POLICY IF EXISTS attempt_events_select_admin ON public.attempt_events;
CREATE POLICY attempt_events_select_admin ON public.attempt_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exam_attempts a WHERE a.id = attempt_id
                 AND (a.institution_id = (SELECT private.my_admin_institution_id())
                      OR (SELECT private.is_super_admin()))));

-- ─── 10. Privileges ──────────────────────────────────────────────────────────
REVOKE ALL ON public.exam_assignments, public.exam_attempts, public.attempt_responses, public.attempt_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.exam_assignments, public.exam_attempts,
              public.attempt_responses, public.attempt_events FROM authenticated;
GRANT SELECT ON public.exam_assignments, public.exam_attempts, public.attempt_responses, public.attempt_events TO authenticated;

REVOKE ALL ON FUNCTION public.assign_students_to_exam(uuid, uuid[], text),
                       public.assign_cohort_to_exam(uuid, uuid, smallint, text, text),
                       public.revoke_exam_assignment(uuid, text),
                       public.grant_exam_retake(uuid, text),
                       public.start_exam_attempt(uuid, jsonb),
                       public.get_attempt_paper(uuid),
                       public.save_attempt_responses(uuid, jsonb, bigint),
                       public.log_attempt_event(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_students_to_exam(uuid, uuid[], text),
                          public.assign_cohort_to_exam(uuid, uuid, smallint, text, text),
                          public.revoke_exam_assignment(uuid, text),
                          public.grant_exam_retake(uuid, text),
                          public.start_exam_attempt(uuid, jsonb),
                          public.get_attempt_paper(uuid),
                          public.save_attempt_responses(uuid, jsonb, bigint),
                          public.log_attempt_event(uuid, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION private.attempt_payload(uuid) FROM PUBLIC;
