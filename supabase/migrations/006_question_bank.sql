-- =============================================================================
-- ExamSphere Migration 006: Subjects, Question Bank, Answer Keys, Imports
--
-- Mirrors the existing frontend model (questionBankService.js):
--   subject, topic, statement, options[4], correctOption (0-3),
--   difficulty (Easy|Medium|Hard), marks, negativeMarks
-- Key design decision: the correct option lives in a SEPARATE table
-- (question_answer_keys) that no student policy can ever reach.
-- =============================================================================

-- ─── 1. Subjects (courses) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subjects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE RESTRICT,
  department_id  uuid,
  code           text NOT NULL,                     -- '22CS601'
  title          text NOT NULL,                     -- 'Software Engineering & Cloud Architecture'
  semester       smallint CHECK (semester BETWEEN 1 AND 12),
  scheme         text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subjects_code_format CHECK (code ~ '^[A-Z0-9]{3,16}$'),
  CONSTRAINT subjects_title_len   CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  CONSTRAINT subjects_institution_code_key UNIQUE (institution_id, code),
  CONSTRAINT subjects_id_institution_key   UNIQUE (id, institution_id),
  CONSTRAINT subjects_department_fkey FOREIGN KEY (department_id, institution_id)
    REFERENCES public.departments (id, institution_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_institution_title_key ON public.subjects (institution_id, lower(title));
DROP TRIGGER IF EXISTS subjects_updated_at ON public.subjects;
CREATE TRIGGER subjects_updated_at BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ─── 2. Option validator (immutable → usable inside CHECK) ───────────────────
CREATE OR REPLACE FUNCTION private.valid_mcq_options(p_options text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_options IS NOT NULL
     AND array_ndims(p_options) = 1
     AND cardinality(p_options) = 4
     AND NOT EXISTS (SELECT 1 FROM unnest(p_options) o WHERE o IS NULL OR length(btrim(o)) = 0 OR length(o) > 1000)
     AND (SELECT count(DISTINCT lower(btrim(o))) FROM unnest(p_options) o) = 4
$$;
GRANT EXECUTE ON FUNCTION private.valid_mcq_options(text[]) TO authenticated;

-- ─── 3. Import batches ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.question_import_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE RESTRICT,
  uploaded_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  file_name      text NOT NULL CHECK (length(file_name) <= 255),
  total_rows     integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  imported_rows  integer NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  rejected_rows  integer NOT NULL DEFAULT 0 CHECK (rejected_rows >= 0),
  rejections     jsonb   NOT NULL DEFAULT '[]'::jsonb,   -- [{rowNumber, errors[]}]
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_counts_chk CHECK (imported_rows + rejected_rows = total_rows)
);
CREATE INDEX IF NOT EXISTS question_import_batches_institution_idx
  ON public.question_import_batches (institution_id, created_at DESC);

-- ─── 4. Questions (NO correct answer stored here) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.questions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_no          bigint GENERATED ALWAYS AS IDENTITY,      -- human "ID #" in the UI
  institution_id       uuid NOT NULL,
  subject_id           uuid NOT NULL,
  topic                text NOT NULL CHECK (length(btrim(topic)) BETWEEN 1 AND 200),
  statement            text NOT NULL CHECK (length(btrim(statement)) BETWEEN 1 AND 5000),
  options              text[] NOT NULL CHECK (private.valid_mcq_options(options)),
  difficulty           public.question_difficulty NOT NULL DEFAULT 'medium',
  marks                numeric(5,2) NOT NULL DEFAULT 2 CHECK (marks > 0 AND marks <= 100),
  negative_marks       numeric(5,2) NOT NULL DEFAULT 0 CHECK (negative_marks >= 0 AND negative_marks <= marks),
  normalized_statement text GENERATED ALWAYS AS (lower(regexp_replace(btrim(statement), '\s+', ' ', 'g'))) STORED,
  is_archived          boolean NOT NULL DEFAULT false,
  import_batch_id      uuid REFERENCES public.question_import_batches (id) ON DELETE SET NULL,
  created_by           uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questions_question_no_key     UNIQUE (question_no),
  CONSTRAINT questions_id_institution_key  UNIQUE (id, institution_id),
  CONSTRAINT questions_subject_fkey FOREIGN KEY (subject_id, institution_id)
    REFERENCES public.subjects (id, institution_id) ON DELETE RESTRICT
);
-- Duplicate rule from the frontend (normalizeQuestionText), now enforced in the DB.
CREATE UNIQUE INDEX IF NOT EXISTS questions_unique_statement
  ON public.questions (institution_id, md5(normalized_statement)) WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS questions_filter_idx
  ON public.questions (institution_id, subject_id, topic, difficulty) WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS questions_recent_idx ON public.questions (institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS questions_import_batch_idx ON public.questions (import_batch_id) WHERE import_batch_id IS NOT NULL;
-- Full-text search for the Question Bank search box
CREATE INDEX IF NOT EXISTS questions_search_idx ON public.questions
  USING gin (to_tsvector('simple', statement || ' ' || topic));

DROP TRIGGER IF EXISTS questions_updated_at ON public.questions;
CREATE TRIGGER questions_updated_at BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ─── 5. Answer keys (admin-only, never readable by students) ─────────────────
CREATE TABLE IF NOT EXISTS public.question_answer_keys (
  question_id    uuid PRIMARY KEY,
  institution_id uuid NOT NULL,
  correct_option smallint NOT NULL CHECK (correct_option BETWEEN 0 AND 3),
  updated_by     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_answer_keys_question_fkey FOREIGN KEY (question_id, institution_id)
    REFERENCES public.questions (id, institution_id) ON DELETE CASCADE
);
DROP TRIGGER IF EXISTS question_answer_keys_updated_at ON public.question_answer_keys;
CREATE TRIGGER question_answer_keys_updated_at BEFORE UPDATE ON public.question_answer_keys
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ─── 6. Validation shared by save & import ───────────────────────────────────
-- Accepts the frontend payload shape; returns {errors:[], value:{...}}.
CREATE OR REPLACE FUNCTION private.validate_question_payload(p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_errors     text[] := '{}';
  v_options    text[];
  v_statement  text := btrim(COALESCE(p->>'statement', p->>'text', ''));
  v_topic      text := btrim(COALESCE(p->>'topic', ''));
  v_difficulty text := lower(btrim(COALESCE(p->>'difficulty', '')));
  v_correct    text := btrim(COALESCE(p->>'correctOption', p->>'correct_option', ''));
  v_marks      numeric;
  v_negative   numeric;
BEGIN
  IF jsonb_typeof(p->'options') = 'array' THEN
    SELECT array_agg(btrim(o) ORDER BY ord) INTO v_options
    FROM jsonb_array_elements_text(p->'options') WITH ORDINALITY AS t(o, ord);
  END IF;

  IF v_topic = '' THEN v_errors := array_append(v_errors, 'Topic is required.'); END IF;
  IF v_statement = '' THEN v_errors := array_append(v_errors, 'Question statement is required.'); END IF;
  IF NOT COALESCE(private.valid_mcq_options(v_options), false) THEN
    v_errors := array_append(v_errors, 'Exactly four non-empty, different options are required.');
  END IF;
  IF v_correct !~ '^[0-3]$' THEN v_errors := array_append(v_errors, 'Select exactly one correct answer.'); END IF;
  IF v_difficulty NOT IN ('easy', 'medium', 'hard') THEN
    v_errors := array_append(v_errors, 'Difficulty must be Easy, Medium, or Hard.');
  END IF;

  BEGIN v_marks := (p->>'marks')::numeric; EXCEPTION WHEN others THEN v_marks := NULL; END;
  BEGIN v_negative := COALESCE(NULLIF(p->>'negativeMarks', ''), NULLIF(p->>'negative_marks', ''), '0')::numeric;
  EXCEPTION WHEN others THEN v_negative := NULL; END;
  IF v_marks IS NULL OR v_marks <= 0 OR v_marks > 100 THEN v_errors := array_append(v_errors, 'Marks must be greater than zero.'); END IF;
  IF v_negative IS NULL OR v_negative < 0 THEN v_errors := array_append(v_errors, 'Negative marks must be zero or greater.');
  ELSIF v_marks IS NOT NULL AND v_negative > v_marks THEN v_errors := array_append(v_errors, 'Negative marks cannot exceed marks.');
  END IF;

  RETURN jsonb_build_object(
    'errors', to_jsonb(v_errors),
    'value', jsonb_build_object(
      'topic', v_topic, 'statement', v_statement, 'options', to_jsonb(v_options),
      'correct_option', CASE WHEN v_correct ~ '^[0-3]$' THEN v_correct::int END,
      'difficulty', v_difficulty, 'marks', v_marks, 'negative_marks', v_negative));
END $$;

-- Resolve a subject by id, code or title within an institution.
CREATE OR REPLACE FUNCTION private.resolve_subject(p_institution_id uuid, p_ref text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id FROM public.subjects s
  WHERE s.institution_id = p_institution_id AND s.is_active
    AND (s.id::text = btrim(p_ref) OR s.code = upper(btrim(p_ref)) OR lower(s.title) = lower(btrim(p_ref)))
  ORDER BY (s.id::text = btrim(p_ref)) DESC, (s.code = upper(btrim(p_ref))) DESC
  LIMIT 1
$$;

-- ─── 7. Question RPCs ────────────────────────────────────────────────────────
-- Create (p_question_id NULL) or update a question and its key atomically.
-- payload: {subjectId|subject, topic, statement, options[4], correctOption,
--           difficulty, marks, negativeMarks}
CREATE OR REPLACE FUNCTION public.save_question(p_question_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_check       jsonb := private.validate_question_payload(p_payload);
  v_value       jsonb := v_check->'value';
  v_institution uuid;
  v_subject     uuid;
  v_existing    public.questions;
  v_id          uuid;
BEGIN
  IF jsonb_array_length(v_check->'errors') > 0 THEN
    RAISE EXCEPTION '%', (SELECT string_agg(e, ' ') FROM jsonb_array_elements_text(v_check->'errors') e)
      USING ERRCODE = '22023';
  END IF;

  IF p_question_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.questions WHERE id = p_question_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Question not found.' USING ERRCODE = 'P0002'; END IF;
    v_institution := v_existing.institution_id;
  ELSE
    v_institution := COALESCE(NULLIF(p_payload->>'institutionId', '')::uuid, private.my_admin_institution_id());
  END IF;
  PERFORM private.assert_can_manage(v_institution);

  v_subject := private.resolve_subject(v_institution, COALESCE(p_payload->>'subjectId', p_payload->>'subject'));
  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'Subject not found in this institution. Create the subject first.' USING ERRCODE = '22023';
  END IF;

  IF p_question_id IS NULL THEN
    INSERT INTO public.questions (institution_id, subject_id, topic, statement, options, difficulty,
                                  marks, negative_marks, created_by, updated_by)
    VALUES (v_institution, v_subject, v_value->>'topic', v_value->>'statement',
            ARRAY(SELECT jsonb_array_elements_text(v_value->'options')),
            (v_value->>'difficulty')::public.question_difficulty,
            (v_value->>'marks')::numeric, (v_value->>'negative_marks')::numeric, auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.question_answer_keys (question_id, institution_id, correct_option, updated_by)
    VALUES (v_id, v_institution, (v_value->>'correct_option')::smallint, auth.uid());
  ELSE
    v_id := p_question_id;
    UPDATE public.questions
    SET subject_id = v_subject, topic = v_value->>'topic', statement = v_value->>'statement',
        options = ARRAY(SELECT jsonb_array_elements_text(v_value->'options')),
        difficulty = (v_value->>'difficulty')::public.question_difficulty,
        marks = (v_value->>'marks')::numeric, negative_marks = (v_value->>'negative_marks')::numeric,
        updated_by = auth.uid()
    WHERE id = v_id;
    INSERT INTO public.question_answer_keys (question_id, institution_id, correct_option, updated_by)
    VALUES (v_id, v_institution, (v_value->>'correct_option')::smallint, auth.uid())
    ON CONFLICT (question_id) DO UPDATE
      SET correct_option = EXCLUDED.correct_option, updated_by = EXCLUDED.updated_by
      WHERE public.question_answer_keys.correct_option IS DISTINCT FROM EXCLUDED.correct_option;
  END IF;

  RETURN (SELECT to_jsonb(b) FROM public.admin_question_bank b WHERE b.id = v_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'This question already exists in the question bank.' USING ERRCODE = '23505';
END $$;

-- Hard-delete unused questions; archive questions already used in an exam.
CREATE OR REPLACE FUNCTION public.delete_question(p_question_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_q public.questions;
BEGIN
  SELECT * INTO v_q FROM public.questions WHERE id = p_question_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_manage(v_q.institution_id);

  IF EXISTS (SELECT 1 FROM public.exam_questions eq WHERE eq.question_id = p_question_id)
     OR EXISTS (SELECT 1 FROM public.exam_pattern_questions pq WHERE pq.question_id = p_question_id) THEN
    UPDATE public.questions SET is_archived = true, updated_by = auth.uid() WHERE id = p_question_id;
    RETURN 'archived';
  END IF;
  DELETE FROM public.questions WHERE id = p_question_id;
  RETURN 'deleted';
END $$;

-- Bulk import of rows already parsed client-side (SheetJS) — the server
-- re-validates every row; nothing from the client is trusted.
-- p_rows: [{rowNumber, subject, topic, statement, options[4], correctOption,
--           difficulty, marks, negativeMarks}]  (max 2000 rows)
CREATE OR REPLACE FUNCTION public.import_questions(p_file_name text, p_rows jsonb, p_institution_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_institution uuid := COALESCE(p_institution_id, private.my_admin_institution_id());
  v_batch       uuid;
  v_row         jsonb;
  v_check       jsonb;
  v_value       jsonb;
  v_subject     uuid;
  v_errors      text[];
  v_rejections  jsonb := '[]'::jsonb;
  v_seen        text[] := '{}';
  v_norm        text;
  v_imported    int := 0;
  v_total       int;
  v_qid         uuid;
BEGIN
  PERFORM private.assert_can_manage(v_institution);
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Rows must be a JSON array.' USING ERRCODE = '22023'; END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total = 0 OR v_total > 2000 THEN
    RAISE EXCEPTION 'Import between 1 and 2000 rows at a time.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.question_import_batches (institution_id, uploaded_by, file_name, total_rows, rejected_rows)
  VALUES (v_institution, auth.uid(), left(COALESCE(p_file_name, 'import'), 255), v_total, v_total)
  RETURNING id INTO v_batch;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_check  := private.validate_question_payload(v_row);
    v_value  := v_check->'value';
    v_errors := ARRAY(SELECT jsonb_array_elements_text(v_check->'errors'));
    v_subject := private.resolve_subject(v_institution, v_row->>'subject');
    IF v_subject IS NULL THEN v_errors := array_append(v_errors, 'Unknown subject (use an existing subject code or title).'); END IF;

    v_norm := lower(regexp_replace(btrim(COALESCE(v_value->>'statement', '')), '\s+', ' ', 'g'));
    IF cardinality(v_errors) = 0 AND (v_norm = ANY (v_seen) OR EXISTS (
         SELECT 1 FROM public.questions q WHERE q.institution_id = v_institution AND NOT q.is_archived
           AND md5(q.normalized_statement) = md5(v_norm))) THEN
      v_errors := array_append(v_errors, 'Duplicate question.');
    END IF;

    IF cardinality(v_errors) > 0 THEN
      v_rejections := v_rejections || jsonb_build_object('rowNumber', v_row->'rowNumber', 'errors', to_jsonb(v_errors));
      CONTINUE;
    END IF;

    v_seen := array_append(v_seen, v_norm);
    INSERT INTO public.questions (institution_id, subject_id, topic, statement, options, difficulty,
                                  marks, negative_marks, import_batch_id, created_by, updated_by)
    VALUES (v_institution, v_subject, v_value->>'topic', v_value->>'statement',
            ARRAY(SELECT jsonb_array_elements_text(v_value->'options')),
            (v_value->>'difficulty')::public.question_difficulty,
            (v_value->>'marks')::numeric, (v_value->>'negative_marks')::numeric, v_batch, auth.uid(), auth.uid())
    RETURNING id INTO v_qid;
    INSERT INTO public.question_answer_keys (question_id, institution_id, correct_option, updated_by)
    VALUES (v_qid, v_institution, (v_value->>'correct_option')::smallint, auth.uid());
    v_imported := v_imported + 1;
  END LOOP;

  UPDATE public.question_import_batches
  SET imported_rows = v_imported, rejected_rows = v_total - v_imported, rejections = v_rejections
  WHERE id = v_batch;

  PERFORM private.log_activity('QUESTIONS_IMPORTED', v_institution, 'question_import_batch', v_batch,
    jsonb_build_object('file_name', p_file_name, 'imported', v_imported, 'rejected', v_total - v_imported));

  RETURN jsonb_build_object('batchId', v_batch, 'imported', v_imported,
                            'rejected', v_total - v_imported, 'rejections', v_rejections);
END $$;

-- ─── 8. Admin read model (security_invoker → caller's RLS applies) ───────────
CREATE OR REPLACE VIEW public.admin_question_bank WITH (security_invoker = true) AS
SELECT q.id, q.question_no, q.institution_id, q.subject_id,
       s.code AS subject_code, s.title AS subject, q.topic, q.statement, q.options,
       k.correct_option, initcap(q.difficulty::text) AS difficulty,
       q.marks, q.negative_marks, q.is_archived, q.import_batch_id,
       q.created_by, q.created_at, q.updated_at
FROM public.questions q
JOIN public.subjects s ON s.id = q.subject_id
LEFT JOIN public.question_answer_keys k ON k.question_id = q.id;

-- ─── 9. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.subjects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_answer_keys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_import_batches ENABLE ROW LEVEL SECURITY;

-- Subjects: any member of the institution may read (course names on dashboards);
-- admins of the institution may write.
DROP POLICY IF EXISTS subjects_select ON public.subjects;
CREATE POLICY subjects_select ON public.subjects FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_institution_id()) OR (SELECT private.is_super_admin()));
DROP POLICY IF EXISTS subjects_write_admin ON public.subjects;
CREATE POLICY subjects_write_admin ON public.subjects FOR ALL TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()))
  WITH CHECK (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));

-- Questions / keys / batches: admins of the institution only. Students have
-- NO policy → zero rows, even if they guess IDs.
DROP POLICY IF EXISTS questions_select_admin ON public.questions;
CREATE POLICY questions_select_admin ON public.questions FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));
DROP POLICY IF EXISTS answer_keys_select_admin ON public.question_answer_keys;
CREATE POLICY answer_keys_select_admin ON public.question_answer_keys FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));
DROP POLICY IF EXISTS import_batches_select_admin ON public.question_import_batches;
CREATE POLICY import_batches_select_admin ON public.question_import_batches FOR SELECT TO authenticated
  USING (institution_id = (SELECT private.my_admin_institution_id()) OR (SELECT private.is_super_admin()));

-- ─── 10. Privileges ──────────────────────────────────────────────────────────
REVOKE ALL ON public.subjects, public.questions, public.question_answer_keys,
              public.question_import_batches, public.admin_question_bank FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.questions, public.question_answer_keys,
              public.question_import_batches FROM authenticated;
GRANT SELECT ON public.subjects, public.questions, public.question_answer_keys,
               public.question_import_batches, public.admin_question_bank TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subjects TO authenticated;

REVOKE ALL ON FUNCTION public.save_question(uuid, jsonb)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_question(uuid)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_questions(text, jsonb, uuid)     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_question(uuid, jsonb)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_question(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_questions(text, jsonb, uuid)  TO authenticated;
REVOKE ALL ON FUNCTION private.validate_question_payload(jsonb), private.resolve_subject(uuid, text) FROM PUBLIC;
