-- =============================================================================
-- ExamSphere Migration 007: Examinations, master question sets, 10 patterns
--
-- Server-side replacement for utils/randomizationEngine.js +
-- examRandomizerService.js (generate10ExamPatterns, verifyPatternsIntegrity,
-- publishExam / unpublishExam / regeneratePatterns).
--
-- Pattern rows are full snapshots (statement, options in display order, marks)
-- so later question-bank edits can never change a paper that was sat.
-- Pattern answer keys live in their own admin-only table.
-- =============================================================================

-- ─── 1. Exams ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exams (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        uuid NOT NULL REFERENCES public.institutions (id) ON DELETE RESTRICT,
  department_id         uuid,
  subject_id            uuid NOT NULL,
  exam_code             text NOT NULL,                  -- 'CBT-2026-CS601' (examMeta.id)
  title                 text NOT NULL,
  semester_label        text,                           -- '6th Semester B.E. (Autonomous)'
  academic_year         text CHECK (academic_year ~ '^[0-9]{4}-[0-9]{2}$'),
  instructions          text[] NOT NULL DEFAULT '{}',
  venue                 text,
  duration_minutes      integer  NOT NULL CHECK (duration_minutes BETWEEN 5 AND 600),
  question_count        smallint NOT NULL DEFAULT 25 CHECK (question_count = 25),
  pattern_count         smallint NOT NULL DEFAULT 10 CHECK (pattern_count = 10),
  total_marks           numeric(7,2),                   -- fixed at publish
  pass_percentage       numeric(5,2) NOT NULL DEFAULT 40 CHECK (pass_percentage BETWEEN 0 AND 100),
  clamp_negative_total  boolean NOT NULL DEFAULT true,  -- total score never below 0
  window_start          timestamptz NOT NULL,
  window_end            timestamptz NOT NULL,
  late_entry_minutes    integer CHECK (late_entry_minutes >= 0),   -- NULL = may start any time in window
  results_release_mode  public.results_release_mode NOT NULL DEFAULT 'immediate',
  results_released_at   timestamptz,
  allow_response_review boolean NOT NULL DEFAULT false,  -- per-question right/wrong after close (never the key)
  status                public.exam_status NOT NULL DEFAULT 'draft',
  patterns_stale        boolean NOT NULL DEFAULT true,
  patterns_generated_at timestamptz,
  published_at          timestamptz,
  published_by          uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  closed_at             timestamptz,
  created_by            uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exams_window_chk   CHECK (window_end > window_start),
  CONSTRAINT exams_code_format  CHECK (exam_code ~ '^[A-Z0-9-]{3,40}$'),
  CONSTRAINT exams_title_len    CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT exams_published_chk CHECK (status = 'draft' OR (published_at IS NOT NULL AND total_marks IS NOT NULL)),
  CONSTRAINT exams_institution_code_key UNIQUE (institution_id, exam_code),
  CONSTRAINT exams_id_institution_key   UNIQUE (id, institution_id),
  CONSTRAINT exams_subject_fkey FOREIGN KEY (subject_id, institution_id)
    REFERENCES public.subjects (id, institution_id) ON DELETE RESTRICT,
  CONSTRAINT exams_department_fkey FOREIGN KEY (department_id, institution_id)
    REFERENCES public.departments (id, institution_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS exams_institution_status_idx ON public.exams (institution_id, status, window_start);
CREATE INDEX IF NOT EXISTS exams_live_window_idx ON public.exams (window_end) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS exams_subject_idx ON public.exams (subject_id);
DROP TRIGGER IF EXISTS exams_updated_at ON public.exams;
CREATE TRIGGER exams_updated_at BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ─── 2. Master question set (exactly 25 per exam, enforced at generation) ────
CREATE TABLE IF NOT EXISTS public.exam_questions (
  exam_id        uuid NOT NULL,
  question_id    uuid NOT NULL,
  institution_id uuid NOT NULL,
  position       smallint NOT NULL CHECK (position BETWEEN 1 AND 25),
  PRIMARY KEY (exam_id, question_id),
  CONSTRAINT exam_questions_position_key UNIQUE (exam_id, position),
  CONSTRAINT exam_questions_exam_fkey FOREIGN KEY (exam_id, institution_id)
    REFERENCES public.exams (id, institution_id) ON DELETE CASCADE,
  CONSTRAINT exam_questions_question_fkey FOREIGN KEY (question_id, institution_id)
    REFERENCES public.questions (id, institution_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS exam_questions_question_idx ON public.exam_questions (question_id);

-- ─── 3. Patterns A–J and their snapshots ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_patterns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id            uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  institution_id     uuid NOT NULL REFERENCES public.institutions (id) ON DELETE RESTRICT,
  pattern_label      text NOT NULL CHECK (pattern_label ~ '^[A-J]$'),
  paper_code         text NOT NULL,                  -- '22CS601-A'
  sequence_signature text NOT NULL,                  -- master positions in display order
  generated_by       uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_patterns_label_key     UNIQUE (exam_id, pattern_label),
  CONSTRAINT exam_patterns_sequence_key  UNIQUE (exam_id, sequence_signature),  -- 10 distinct orders
  CONSTRAINT exam_patterns_id_exam_key   UNIQUE (id, exam_id)
);

CREATE TABLE IF NOT EXISTS public.exam_pattern_questions (
  pattern_id     uuid NOT NULL REFERENCES public.exam_patterns (id) ON DELETE CASCADE,
  display_number smallint NOT NULL CHECK (display_number BETWEEN 1 AND 25),
  question_id    uuid NOT NULL REFERENCES public.questions (id) ON DELETE RESTRICT,
  statement      text NOT NULL,
  options        text[] NOT NULL CHECK (cardinality(options) = 4),   -- display order
  option_order   smallint[] NOT NULL CHECK (cardinality(option_order) = 4), -- display idx → original idx
  marks          numeric(5,2) NOT NULL CHECK (marks > 0),
  negative_marks numeric(5,2) NOT NULL CHECK (negative_marks >= 0),
  PRIMARY KEY (pattern_id, display_number),
  CONSTRAINT exam_pattern_questions_question_key UNIQUE (pattern_id, question_id)
);
CREATE INDEX IF NOT EXISTS exam_pattern_questions_question_idx ON public.exam_pattern_questions (question_id);

CREATE TABLE IF NOT EXISTS public.exam_pattern_answer_keys (
  pattern_id     uuid NOT NULL,
  display_number smallint NOT NULL,
  correct_option smallint NOT NULL CHECK (correct_option BETWEEN 0 AND 3),
  PRIMARY KEY (pattern_id, display_number),
  CONSTRAINT exam_pattern_answer_keys_fkey FOREIGN KEY (pattern_id, display_number)
    REFERENCES public.exam_pattern_questions (pattern_id, display_number) ON DELETE CASCADE
);

-- ─── 4. Immutability & staleness triggers ────────────────────────────────────
-- Pattern rows: never UPDATEd; INSERT/DELETE only while the exam is a draft.
CREATE OR REPLACE FUNCTION private.guard_pattern_rows()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row    jsonb := to_jsonb(COALESCE(NEW, OLD));
  v_status public.exam_status;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Generated paper patterns are immutable.' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'exam_patterns' THEN
    SELECT e.status INTO v_status FROM public.exams e WHERE e.id = (v_row->>'exam_id')::uuid;
  ELSE
    SELECT e.status INTO v_status FROM public.exam_patterns p JOIN public.exams e ON e.id = p.exam_id
    WHERE p.id = (v_row->>'pattern_id')::uuid;
  END IF;
  -- v_status IS NULL → parent exam/pattern is being deleted (cascade from a draft delete)
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'Patterns of a % exam cannot be changed.', v_status USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS exam_patterns_guard ON public.exam_patterns;
CREATE TRIGGER exam_patterns_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_patterns
  FOR EACH ROW EXECUTE FUNCTION private.guard_pattern_rows();
DROP TRIGGER IF EXISTS exam_pattern_questions_guard ON public.exam_pattern_questions;
CREATE TRIGGER exam_pattern_questions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_pattern_questions
  FOR EACH ROW EXECUTE FUNCTION private.guard_pattern_rows();
DROP TRIGGER IF EXISTS exam_pattern_answer_keys_guard ON public.exam_pattern_answer_keys;
CREATE TRIGGER exam_pattern_answer_keys_guard BEFORE INSERT OR UPDATE OR DELETE ON public.exam_pattern_answer_keys
  FOR EACH ROW EXECUTE FUNCTION private.guard_pattern_rows();

-- Question / key edits: blocked while used by a non-draft exam; mark draft
-- exams' patterns stale so they must be regenerated before publishing.
CREATE OR REPLACE FUNCTION private.on_question_content_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(NEW) END;
  v_qid uuid;
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN
    v_qid := (v_old->>'id')::uuid;
    -- archiving / bookkeeping-only updates are always allowed
    IF TG_OP = 'UPDATE' AND
       (v_new - ARRAY['is_archived','updated_at','updated_by']) = (v_old - ARRAY['is_archived','updated_at','updated_by']) THEN
      RETURN NEW;
    END IF;
  ELSE
    v_qid := (v_old->>'question_id')::uuid;
    IF TG_OP = 'UPDATE' AND v_new->'correct_option' = v_old->'correct_option' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.exam_questions eq JOIN public.exams e ON e.id = eq.exam_id
             WHERE eq.question_id = v_qid AND e.status <> 'draft') THEN
    RAISE EXCEPTION 'This question belongs to a published exam. Archive it and create a new version instead.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.exams e SET patterns_stale = true
  FROM public.exam_questions eq
  WHERE eq.exam_id = e.id AND eq.question_id = v_qid AND e.status = 'draft' AND NOT e.patterns_stale;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS questions_content_guard ON public.questions;
CREATE TRIGGER questions_content_guard BEFORE UPDATE OR DELETE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION private.on_question_content_change();
DROP TRIGGER IF EXISTS answer_keys_content_guard ON public.question_answer_keys;
CREATE TRIGGER answer_keys_content_guard BEFORE UPDATE OR DELETE ON public.question_answer_keys
  FOR EACH ROW EXECUTE FUNCTION private.on_question_content_change();

-- Exams: lifecycle columns can only be changed by the RPCs below (column grants);
-- this trigger additionally freezes the content of non-draft exams.
CREATE OR REPLACE FUNCTION private.guard_exam_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
       NEW.subject_id, NEW.department_id, NEW.exam_code, NEW.duration_minutes, NEW.pass_percentage,
       NEW.clamp_negative_total, NEW.institution_id)
       IS DISTINCT FROM (
       OLD.subject_id, OLD.department_id, OLD.exam_code, OLD.duration_minutes, OLD.pass_percentage,
       OLD.clamp_negative_total, OLD.institution_id) THEN
    RAISE EXCEPTION 'Only drafts can be edited. Unpublish the exam first (allowed until an attempt starts).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS exams_guard_update ON public.exams;
CREATE TRIGGER exams_guard_update BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION private.guard_exam_update();

-- ─── 5. Randomisation helpers ────────────────────────────────────────────────
-- Uniform shuffle of [p_from .. p_from+p_n-1] ordered by gen_random_uuid()
-- (CSPRNG-backed). VOLATILE → re-evaluated for every row it is called on.
CREATE OR REPLACE FUNCTION private.shuffled_range(p_from int, p_n int)
RETURNS smallint[] LANGUAGE sql VOLATILE SET search_path = '' AS $$
  SELECT array_agg(i::smallint ORDER BY gen_random_uuid())
  FROM generate_series(p_from, p_from + p_n - 1) AS g(i)
$$;

CREATE OR REPLACE FUNCTION private.permute(p_items text[], p_order smallint[])
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT array_agg(p_items[o + 1] ORDER BY ord)
  FROM unnest(p_order) WITH ORDINALITY AS u(o, ord)
$$;

-- ─── 6. Exam composition & generation RPCs ───────────────────────────────────
-- Replace the exam's 25 master questions (order = master positions 1..25).
CREATE OR REPLACE FUNCTION public.set_exam_questions(p_exam_id uuid, p_question_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_exam  public.exams;
  v_valid int;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_exam.institution_id);
  IF v_exam.status <> 'draft' THEN
    RAISE EXCEPTION 'Questions can only be changed while the exam is a draft.' USING ERRCODE = '42501';
  END IF;
  IF cardinality(p_question_ids) <> 25 OR (SELECT count(DISTINCT x) FROM unnest(p_question_ids) x) <> 25 THEN
    RAISE EXCEPTION 'Examination requires exactly 25 distinct questions.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_valid
  FROM public.questions q
  JOIN public.question_answer_keys k ON k.question_id = q.id
  WHERE q.id = ANY (p_question_ids) AND q.institution_id = v_exam.institution_id AND NOT q.is_archived;
  IF v_valid <> 25 THEN
    RAISE EXCEPTION 'All 25 questions must be active, keyed and belong to this institution (% valid).', v_valid
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.exam_patterns WHERE exam_id = p_exam_id;   -- stale papers removed
  DELETE FROM public.exam_questions WHERE exam_id = p_exam_id;
  INSERT INTO public.exam_questions (exam_id, question_id, institution_id, position)
  SELECT p_exam_id, x.qid, v_exam.institution_id, x.pos
  FROM unnest(p_question_ids) WITH ORDINALITY AS x(qid, pos);

  UPDATE public.exams SET patterns_stale = true, patterns_generated_at = NULL, updated_by = auth.uid()
  WHERE id = p_exam_id;

  PERFORM private.log_activity('EXAM_QUESTIONS_SET', v_exam.institution_id, 'exam', p_exam_id,
    jsonb_build_object('question_ids', to_jsonb(p_question_ids)));
  RETURN jsonb_build_object('examId', p_exam_id, 'questionCount', 25, 'patternsStale', true);
END $$;

-- Server port of verifyPatternsIntegrity(); admin-readable report.
CREATE OR REPLACE FUNCTION private.verify_exam_patterns(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_checks jsonb;
  v_details jsonb;
BEGIN
  WITH p AS (SELECT * FROM public.exam_patterns WHERE exam_id = p_exam_id),
  per_pattern AS (
    SELECT p.id, p.pattern_label,
           count(pq.*) AS n,
           count(DISTINCT pq.question_id) AS distinct_q,
           bool_and(eq.question_id IS NOT NULL) AS all_in_master,
           bool_and(cardinality(pq.options) = 4) AS four_opts,
           -- key snapshot must point at the same option TEXT as the master key
           bool_and(k.correct_option IS NOT NULL
                    AND pq.options[k.correct_option + 1] = q.options[mk.correct_option + 1]
                    AND pq.option_order[k.correct_option + 1] = mk.correct_option) AS keys_ok,
           -- option set must be a permutation of the master options
           bool_and((SELECT array_agg(o ORDER BY o) FROM unnest(pq.options) o)
                    = (SELECT array_agg(o ORDER BY o) FROM unnest(q.options) o)) AS same_options
    FROM p
    LEFT JOIN public.exam_pattern_questions pq ON pq.pattern_id = p.id
    LEFT JOIN public.exam_questions eq ON eq.exam_id = p_exam_id AND eq.question_id = pq.question_id
    LEFT JOIN public.questions q ON q.id = pq.question_id
    LEFT JOIN public.question_answer_keys mk ON mk.question_id = pq.question_id
    LEFT JOIN public.exam_pattern_answer_keys k ON k.pattern_id = pq.pattern_id AND k.display_number = pq.display_number
    GROUP BY p.id, p.pattern_label
  )
  SELECT jsonb_build_object(
           'exact10Patterns',            (SELECT count(*) = 10 FROM p),
           'allPatternsHave25Questions', COALESCE(bool_and(n = 25), false),
           'allQuestionIdsPreserved',    COALESCE(bool_and(distinct_q = 25 AND all_in_master), false),
           'uniqueQuestionSequences',    (SELECT count(DISTINCT sequence_signature) = count(*) FROM p),
           'allQuestionsHave4Options',   COALESCE(bool_and(four_opts AND same_options), false),
           'answerKeysValid',            COALESCE(bool_and(keys_ok), false)),
         COALESCE(jsonb_agg(jsonb_build_object('pattern', 'Pattern ' || pattern_label, 'questions', n)
                            ORDER BY pattern_label), '[]'::jsonb)
  INTO v_checks, v_details
  FROM per_pattern;

  RETURN jsonb_build_object(
    'isValid', NOT EXISTS (SELECT 1 FROM jsonb_each(v_checks) WHERE value <> 'true'::jsonb),
    'checks', v_checks, 'details', v_details, 'timestamp', now());
END $$;

CREATE OR REPLACE FUNCTION public.get_exam_verification_report(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.assert_can_manage((SELECT institution_id FROM public.exams WHERE id = p_exam_id));
  RETURN private.verify_exam_patterns(p_exam_id);
END $$;

-- Server port of generate10ExamPatterns(): 10 distinct question orders,
-- independent option shuffles, key snapshot per pattern.
CREATE OR REPLACE FUNCTION public.generate_exam_patterns(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_exam     public.exams;
  v_code     text;
  v_labels   text[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  v_order    smallint[];
  v_sig      text;
  v_seen     text[] := '{}';
  v_pid      uuid;
  v_tries    int;
  v_report   jsonb;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_exam.institution_id);
  IF v_exam.status <> 'draft' THEN
    RAISE EXCEPTION 'Patterns can only be regenerated while the exam is a draft.' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM public.exam_questions WHERE exam_id = p_exam_id) <> 25 THEN
    RAISE EXCEPTION 'Exactly 25 questions are required to generate patterns.' USING ERRCODE = '22023';
  END IF;

  SELECT s.code INTO v_code FROM public.subjects s WHERE s.id = v_exam.subject_id;
  DELETE FROM public.exam_patterns WHERE exam_id = p_exam_id;

  FOR i IN 1..10 LOOP
    v_tries := 0;
    LOOP
      v_order := private.shuffled_range(1, 25);
      v_sig := array_to_string(v_order, ',');
      EXIT WHEN NOT (v_sig = ANY (v_seen));
      v_tries := v_tries + 1;
      IF v_tries > 20 THEN RAISE EXCEPTION 'Could not generate distinct patterns.'; END IF;
    END LOOP;
    v_seen := array_append(v_seen, v_sig);

    INSERT INTO public.exam_patterns (exam_id, institution_id, pattern_label, paper_code, sequence_signature, generated_by)
    VALUES (p_exam_id, v_exam.institution_id, v_labels[i], v_code || '-' || v_labels[i], v_sig, auth.uid())
    RETURNING id INTO v_pid;

    WITH src AS MATERIALIZED (
      SELECT o.display_number::smallint AS display_number, q.id AS question_id, q.statement,
             q.options, q.marks, q.negative_marks,
             private.shuffled_range(0, 4) AS option_order
      FROM unnest(v_order) WITH ORDINALITY AS o(master_pos, display_number)
      JOIN public.exam_questions eq ON eq.exam_id = p_exam_id AND eq.position = o.master_pos
      JOIN public.questions q ON q.id = eq.question_id
    )
    INSERT INTO public.exam_pattern_questions
      (pattern_id, display_number, question_id, statement, options, option_order, marks, negative_marks)
    SELECT v_pid, display_number, question_id, statement, private.permute(options, option_order),
           option_order, marks, negative_marks
    FROM src;

    INSERT INTO public.exam_pattern_answer_keys (pattern_id, display_number, correct_option)
    SELECT pq.pattern_id, pq.display_number, (array_position(pq.option_order, k.correct_option) - 1)::smallint
    FROM public.exam_pattern_questions pq
    JOIN public.question_answer_keys k ON k.question_id = pq.question_id
    WHERE pq.pattern_id = v_pid;
  END LOOP;

  v_report := private.verify_exam_patterns(p_exam_id);
  IF NOT (v_report->>'isValid')::boolean THEN
    RAISE EXCEPTION 'Pattern verification failed: %', v_report->'checks';
  END IF;

  UPDATE public.exams SET patterns_stale = false, patterns_generated_at = now(), updated_by = auth.uid()
  WHERE id = p_exam_id;
  PERFORM private.log_activity('EXAM_PATTERNS_GENERATED', v_exam.institution_id, 'exam', p_exam_id, v_report->'checks');
  RETURN v_report;
END $$;

-- ─── 7. Lifecycle RPCs ───────────────────────────────────────────────────────
-- Balanced pattern allocation: candidates ordered by USN get the least-used
-- pattern (→ A,B,C…J,A… so neighbouring seat numbers never share a paper).
-- Defined here; exam_assignments is created in 008 (plpgsql binds at runtime).
CREATE OR REPLACE FUNCTION private.allocate_patterns(p_exam_id uuid, p_assignment_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r     record;
  v_pid uuid;
  v_n   int := 0;
BEGIN
  FOR r IN
    SELECT a.id FROM public.exam_assignments a JOIN public.profiles p ON p.id = a.student_id
    WHERE a.exam_id = p_exam_id AND a.status = 'assigned' AND a.pattern_id IS NULL
      AND (p_assignment_id IS NULL OR a.id = p_assignment_id)
    ORDER BY upper(p.usn), a.id
    FOR UPDATE OF a
  LOOP
    SELECT ep.id INTO v_pid
    FROM public.exam_patterns ep
    LEFT JOIN public.exam_assignments x ON x.pattern_id = ep.id AND x.status = 'assigned'
    WHERE ep.exam_id = p_exam_id
    GROUP BY ep.id, ep.pattern_label
    ORDER BY count(x.id), ep.pattern_label
    LIMIT 1;
    IF v_pid IS NULL THEN RAISE EXCEPTION 'Exam has no generated patterns.'; END IF;
    UPDATE public.exam_assignments SET pattern_id = v_pid WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.publish_exam(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_exam   public.exams;
  v_report jsonb;
  v_total  numeric;
  v_alloc  int;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_exam.institution_id);
  IF v_exam.status <> 'draft' THEN RAISE EXCEPTION 'Only draft exams can be published.'; END IF;
  IF v_exam.patterns_stale THEN
    RAISE EXCEPTION 'Questions changed since the last generation. Regenerate the 10 patterns first.';
  END IF;
  IF v_exam.window_end <= now() THEN RAISE EXCEPTION 'The examination window has already ended.'; END IF;

  v_report := private.verify_exam_patterns(p_exam_id);
  IF NOT (v_report->>'isValid')::boolean THEN
    RAISE EXCEPTION 'Pattern verification failed: %', v_report->'checks';
  END IF;

  SELECT sum(q.marks) INTO v_total
  FROM public.exam_questions eq JOIN public.questions q ON q.id = eq.question_id
  WHERE eq.exam_id = p_exam_id;

  UPDATE public.exams
  SET status = 'published', total_marks = v_total, published_at = now(), published_by = auth.uid(),
      updated_by = auth.uid()
  WHERE id = p_exam_id;

  v_alloc := private.allocate_patterns(p_exam_id);
  PERFORM private.log_activity('EXAM_PUBLISHED', v_exam.institution_id, 'exam', p_exam_id,
    jsonb_build_object('total_marks', v_total, 'patterns_allocated', v_alloc));
  RETURN jsonb_build_object('examId', p_exam_id, 'status', 'published', 'totalMarks', v_total,
                            'patternsAllocated', v_alloc, 'verification', v_report);
END $$;

CREATE OR REPLACE FUNCTION public.unpublish_exam(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exam public.exams;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_exam.institution_id);
  IF v_exam.status <> 'published' THEN RAISE EXCEPTION 'Only published exams can be unpublished.'; END IF;
  IF EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_id = p_exam_id) THEN
    RAISE EXCEPTION 'Attempts have already started; close the exam instead of unpublishing it.'
      USING ERRCODE = '42501';
  END IF;
  UPDATE public.exams SET status = 'draft', total_marks = NULL, published_at = NULL, published_by = NULL,
                          updated_by = auth.uid()
  WHERE id = p_exam_id;
  PERFORM private.log_activity('EXAM_UNPUBLISHED', v_exam.institution_id, 'exam', p_exam_id, '{}');
  RETURN jsonb_build_object('examId', p_exam_id, 'status', 'draft');
END $$;

-- Move / extend the window of a published exam (shortening is only allowed
-- before anybody starts).
CREATE OR REPLACE FUNCTION public.reschedule_exam(p_exam_id uuid, p_window_start timestamptz, p_window_end timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exam public.exams;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_exam.institution_id);
  IF v_exam.status NOT IN ('draft', 'published') THEN RAISE EXCEPTION 'Closed exams cannot be rescheduled.'; END IF;
  IF p_window_end <= p_window_start OR p_window_end <= now() THEN RAISE EXCEPTION 'Invalid examination window.'; END IF;
  IF EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_id = p_exam_id)
     AND (p_window_start <> v_exam.window_start OR p_window_end < v_exam.window_end) THEN
    RAISE EXCEPTION 'Attempts exist: the window can only be extended.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.exams SET window_start = p_window_start, window_end = p_window_end, updated_by = auth.uid()
  WHERE id = p_exam_id;
  PERFORM private.log_activity('EXAM_RESCHEDULED', v_exam.institution_id, 'exam', p_exam_id,
    jsonb_build_object('from', jsonb_build_array(v_exam.window_start, v_exam.window_end),
                       'to', jsonb_build_array(p_window_start, p_window_end)));
  RETURN jsonb_build_object('examId', p_exam_id, 'windowStart', p_window_start, 'windowEnd', p_window_end);
END $$;

-- ─── 8. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.exams                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_patterns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_pattern_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_pattern_answer_keys ENABLE ROW LEVEL SECURITY;

-- Exams: admins manage their institution (drafts editable, deletable);
-- the student read policy is added in 008 once exam_assignments exists.
DROP POLICY IF EXISTS exams_select_admin ON public.exams;
CREATE POLICY exams_select_admin ON public.exams FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));
DROP POLICY IF EXISTS exams_insert_admin ON public.exams;
CREATE POLICY exams_insert_admin ON public.exams FOR INSERT TO authenticated
  WITH CHECK ((institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()))
              AND status = 'draft');
DROP POLICY IF EXISTS exams_update_admin ON public.exams;
CREATE POLICY exams_update_admin ON public.exams FOR UPDATE TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()))
  WITH CHECK (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));
DROP POLICY IF EXISTS exams_delete_draft ON public.exams;
CREATE POLICY exams_delete_draft ON public.exams FOR DELETE TO authenticated
  USING ((institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()))
         AND status = 'draft');

-- Master sets, patterns and keys: admins only. No student policy exists.
DROP POLICY IF EXISTS exam_questions_select_admin ON public.exam_questions;
CREATE POLICY exam_questions_select_admin ON public.exam_questions FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));
DROP POLICY IF EXISTS exam_patterns_select_admin ON public.exam_patterns;
CREATE POLICY exam_patterns_select_admin ON public.exam_patterns FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));
DROP POLICY IF EXISTS exam_pattern_questions_select_admin ON public.exam_pattern_questions;
CREATE POLICY exam_pattern_questions_select_admin ON public.exam_pattern_questions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exam_patterns p WHERE p.id = pattern_id));  -- inherits exam_patterns RLS
DROP POLICY IF EXISTS exam_pattern_answer_keys_select_admin ON public.exam_pattern_answer_keys;
CREATE POLICY exam_pattern_answer_keys_select_admin ON public.exam_pattern_answer_keys FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exam_patterns p WHERE p.id = pattern_id));

-- ─── 9. Privileges ───────────────────────────────────────────────────────────
REVOKE ALL ON public.exams, public.exam_questions, public.exam_patterns,
              public.exam_pattern_questions, public.exam_pattern_answer_keys FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.exams, public.exam_questions, public.exam_patterns,
              public.exam_pattern_questions, public.exam_pattern_answer_keys FROM authenticated;
GRANT SELECT ON public.exams, public.exam_questions, public.exam_patterns,
               public.exam_pattern_questions, public.exam_pattern_answer_keys TO authenticated;
-- Editable exam fields only; lifecycle columns (status, total_marks, published_*,
-- patterns_*, results_released_at, closed_at) are writable solely by RPCs.
GRANT INSERT (institution_id, department_id, subject_id, exam_code, title, semester_label, academic_year,
              instructions, venue, duration_minutes, pass_percentage, clamp_negative_total, window_start,
              window_end, late_entry_minutes, results_release_mode, allow_response_review, created_by)
  ON public.exams TO authenticated;
GRANT UPDATE (department_id, subject_id, exam_code, title, semester_label, academic_year, instructions,
              venue, duration_minutes, pass_percentage, clamp_negative_total, late_entry_minutes,
              results_release_mode, allow_response_review, updated_by)
  ON public.exams TO authenticated;
GRANT DELETE ON public.exams TO authenticated;

REVOKE ALL ON FUNCTION public.set_exam_questions(uuid, uuid[]),
                       public.get_exam_verification_report(uuid),
                       public.generate_exam_patterns(uuid),
                       public.publish_exam(uuid),
                       public.unpublish_exam(uuid),
                       public.reschedule_exam(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_exam_questions(uuid, uuid[]),
                          public.get_exam_verification_report(uuid),
                          public.generate_exam_patterns(uuid),
                          public.publish_exam(uuid),
                          public.unpublish_exam(uuid),
                          public.reschedule_exam(uuid, timestamptz, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION private.shuffled_range(int, int), private.permute(text[], smallint[]),
                       private.verify_exam_patterns(uuid), private.allocate_patterns(uuid, uuid) FROM PUBLIC;
