# ExamSphere: Supabase Database Architecture (proposal for approval)

**Status:** migrations 003–013 are committed to the repo but **not yet applied** to the live Supabase project. Follow §8 (starting with the read-only discovery step) before running them. The frontend now uses them for the whole examination engine (§12 and `docs/EXAM_ENGINE_SUPABASE.md`). No service-role key was used.
**Validated:** the whole chain (`001 → 003 → 004 → 005 … 011`) replays cleanly on a local PostgreSQL 16 with a Supabase-like `auth` schema and roles. A second run of 005–011 is idempotent. The end-to-end workflow and adversarial tests pass **141/141** assertions as anon, two students, a foreign admin, two subject-scoped admins, the institution admin and the super admin (`supabase/tests/`, run with `supabase/tests/run_local.sh`).

```
docs/database/ARCHITECTURE.md                  ← this document
supabase/
├── discovery/000_preflight_discovery.sql        read-only; run on live first
├── migrations/
│   ├── 001_baseline_reconstruction.sql          replaces the missing 001/002 (idempotent)
│   ├── 003_… / 004_…                            in the repo, NOT applied on live (see §0)
│   ├── 005_tenancy_and_access_control.sql
│   ├── 006_question_bank.sql
│   ├── 007_exams_and_patterns.sql
│   ├── 008_assignments_and_attempts.sql
│   ├── 009_evaluation_and_results.sql
│   ├── 010_audit_reporting_and_jobs.sql
│   └── 011_subject_admin_scoping.sql            subject-scoped admins (§11)
└── tests/                                       local-only shim + e2e security tests
    └── run_local.sh                             replay + test against a DISPOSABLE Postgres
```

---

## 0. Deployment scope: Dr. AIT only

ExamSphere is deployed **exclusively for Dr. Ambedkar Institute of Technology (college code `1DA`)**. The application UI has no institution selection, registration or switching; Super Admin sees a read-only Dr. AIT *Institution Profile*.

The schema below still carries `institution_id` and the tenancy design. **Migrations were deliberately left unchanged** because `institution_id` is a dependency of:
- migrations 003 and 004 (`admin_provision_user(p_institution_id …)`). **Correction:** these were assumed to be applied on live, but provisioning showed `profiles.staff_id` does not exist there, so 003/004 are **not** applied. The provisioning scripts detect the live columns read-only and use only existing ones; apply 003/004 only after review;
- `authService.buildUserObject` (`profiles.institution_id`);
- the composite foreign keys and row-level security in 005–010.

Operating it as single-institution therefore needs only data, not schema changes:
- seed exactly one `institutions` row (Dr. AIT, `1DA`);
- give every admin and student profile that `institution_id`;
- never create a second institution.

The `Other Engineering College` rows in `supabase/tests/100_e2e_security_test.sql` are a **local test fixture only**. They prove cross-tenant isolation in the RLS code, and they are never shipped or seeded.

## 1. What the repository already depends on (findings)

| Object | Where it's used | Defined in repo? |
|---|---|---|
| `public.user_role` enum (`super_admin`, `admin`, `student`) | 004 RPCs, `authService.normalizeRole` | ❌ missing 001/002 |
| `public.profiles` (`id`, `full_name`, `role`, `institution_id`, `usn`, `updated_at`) | `authService.fetchVerifiedProfile` (`select('*')`), 003, 004 | ❌ (003 only adds `email`, `staff_id`) |
| `public.activity_logs` (`user_id`, `action`, `details`) | 004 `admin_provision_user` | ❌ |
| `handle_new_auth_user()` and its trigger on `auth.users` | 003 replaces the function body | ❌ trigger never declared |
| an existing `SELECT` policy on profiles | comment in 003 | ❌ name unknown |
| `institutions` table | `profiles.institution_id`, `buildUserObject` | ❌ (no FK anywhere) |
| `resolve_login_identifier`, `admin_provision_user` | `authService.js:104`, 004 | ✅ 004 |

Git history confirms that 001/002 were never committed. A fresh Supabase project **cannot be rebuilt from this repo** today.

**Reuse decisions:** I kept the names `profiles`, `user_role`, `activity_logs`, `handle_new_auth_user`, `resolve_login_identifier` and `admin_provision_user`. The last two keep **identical signatures**, so `authService.js` doesn't change. New entities mirror frontend vocabulary: `subject/topic/statement/options/correctOption/difficulty/marks/negativeMarks`, `exam_code` (= `examMeta.id`), `pattern_label A–J`, `paper_code` (= `22CS601-A`), `attemptId`, attempt status `active/submitted`, and result fields `score/maxScore/percentage/passed/correctCount/…`.

**Problems in existing SQL that 005 fixes:**
1. **Indexes that are never used.** 003 indexes `usn`/`staff_id` as plain btrees, but 004 queries `UPPER(usn)`, so the indexes are never used. These become unique expression indexes, which also closes the duplicate-USN ambiguity behind 004's `LIMIT 1`.
2. **Unchecked signup role and institution.** The signup trigger reads `full_name` from `raw_user_meta_data`, which the user controls, and gives every signup the `student` role with no institution. The new trigger reads only `raw_app_meta_data`, which only the service role can set, and never grants `super_admin`. A self-signup with no provisioning metadata is now **rejected** (tested).
3. **`admin_provision_user` lacks basic checks.** It allows self-demotion, doesn't validate the institution, and gives `staff_id` to students.
4. **USN → email lookup is anonymous.** `resolve_login_identifier` lets anyone holding the anon key turn a USN into an email. I kept it for compatibility; see §9 for the recommended Edge Function replacement.

---

## 2. Architecture overview

```
 Browser (React SPA, anon key only)
   │  supabase-js: auth • from(table) [read paths]  • rpc(fn) [every write / every exam action]
   ▼
 PostgREST ── exposes ONLY schema "public"
   │   RLS on every table  +  column-level GRANTs  +  SECURITY DEFINER RPCs with explicit checks
   ▼
 PostgreSQL
   public   : 19 tables, 1 security_invoker view, ~35 RPCs
   private  : helper/engine functions (NOT exposed): role lookups, shuffling, evaluation, sweeper
   auth     : Supabase Auth (users) → trigger → public.profiles
   cron     : pg_cron job, once a minute → private.finalize_expired_attempts()
 Edge Function "provision-users" (service-role key lives ONLY here, as a Supabase secret)
```

**Security model, in layers:**
1. **Identity.** `auth.uid()` from the verified JWT. A client-supplied role is never trusted: every role and institution check re-reads `profiles` through `private.*` helpers, so role changes apply immediately with no stale JWT claims.
2. **Tenancy.** Every tenant table carries `institution_id`. **Composite foreign keys** such as `(subject_id, institution_id) → subjects(id, institution_id)` make it impossible, at the schema level, to attach a question, exam, student or assignment from another institution.
3. **RLS** on every table, written with `(SELECT private.fn())` so the helper runs once per statement rather than once per row.
4. **Privileges.** `anon` loses all table access. `authenticated` gets `SELECT` only (plus column-limited `INSERT`/`UPDATE` on `exams` and full CRUD on `subjects`, `departments` and `announcements`). **Students hold no write privilege on any table.**
5. **RPCs.** All state transitions (generate, publish, start, autosave, submit, evaluate, release) are `SECURITY DEFINER` with `search_path = ''`, an explicit role/institution assertion and row locks.
6. **Immutability triggers.** Patterns can't change once an exam leaves draft. Attempt identity and deadline can only be extended. Responses lock at submit. Attempts, responses, results and logs can't be deleted from an API session.

---

## 3. ER diagram

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : "1:1 (trigger)"
    INSTITUTIONS ||--o{ DEPARTMENTS : has
    INSTITUTIONS ||--o{ PROFILES : employs_enrols
    DEPARTMENTS |o--o{ PROFILES : belongs_to
    PROFILES ||--o| STUDENT_DETAILS : "1:0..1"
    INSTITUTIONS ||--o{ SUBJECTS : offers
    DEPARTMENTS |o--o{ SUBJECTS : owns
    SUBJECTS ||--o{ QUESTIONS : categorises
    QUESTIONS ||--|| QUESTION_ANSWER_KEYS : "1:1 (admin-only)"
    QUESTION_IMPORT_BATCHES |o--o{ QUESTIONS : imported
    SUBJECTS ||--o{ EXAMS : examined_in
    EXAMS ||--|{ EXAM_QUESTIONS : "exactly 25"
    QUESTIONS ||--o{ EXAM_QUESTIONS : used_in
    EXAMS ||--|{ EXAM_PATTERNS : "exactly 10 (A-J)"
    EXAM_PATTERNS ||--|{ EXAM_PATTERN_QUESTIONS : "25 snapshots"
    EXAM_PATTERN_QUESTIONS ||--|| EXAM_PATTERN_ANSWER_KEYS : "1:1 (admin-only)"
    EXAMS ||--o{ EXAM_ASSIGNMENTS : assigns
    PROFILES ||--o{ EXAM_ASSIGNMENTS : "student"
    EXAM_PATTERNS |o--o{ EXAM_ASSIGNMENTS : allocated
    EXAM_ASSIGNMENTS ||--o{ EXAM_ATTEMPTS : "<= max_attempts (default 1)"
    EXAM_PATTERNS ||--o{ EXAM_ATTEMPTS : sat_on
    EXAM_ATTEMPTS ||--|{ ATTEMPT_RESPONSES : "25 rows"
    EXAM_ATTEMPTS ||--o{ ATTEMPT_EVENTS : timeline
    EXAM_ATTEMPTS ||--o| EXAM_RESULTS : "graded once"
    EXAM_RESULTS ||--|{ RESULT_QUESTION_SCORES : "25 rows (admin-only)"
    INSTITUTIONS ||--o{ ANNOUNCEMENTS : publishes
    INSTITUTIONS ||--o{ ACTIVITY_LOGS : business_events
    INSTITUTIONS ||--o{ AUDIT_LOG : row_changes

    PROFILES { uuid id PK "auth.users.id" user_role role text usn UK "upper()" text staff_id UK text email UK uuid institution_id FK uuid department_id FK bool is_active }
    QUESTIONS { uuid id PK bigint question_no UK uuid institution_id FK uuid subject_id FK text topic text statement "text[4] options" question_difficulty difficulty numeric marks numeric negative_marks bool is_archived }
    QUESTION_ANSWER_KEYS { uuid question_id PK smallint correct_option "0-3" }
    EXAMS { uuid id PK text exam_code UK uuid subject_id FK int duration_minutes smallint question_count "=25" smallint pattern_count "=10" timestamptz window_start timestamptz window_end exam_status status results_release_mode release_mode bool patterns_stale }
    EXAM_PATTERNS { uuid id PK uuid exam_id FK text pattern_label "A-J" text paper_code text sequence_signature UK }
    EXAM_PATTERN_QUESTIONS { uuid pattern_id PK smallint display_number PK uuid question_id text statement "text[4] options" "smallint[4] option_order" numeric marks numeric negative_marks }
    EXAM_ASSIGNMENTS { uuid id PK uuid exam_id FK uuid student_id FK uuid pattern_id FK smallint max_attempts smallint extra_time_minutes text seat_number }
    EXAM_ATTEMPTS { uuid id PK uuid assignment_id FK smallint attempt_no attempt_status status timestamptz started_at timestamptz deadline_at timestamptz submitted_at text submission_source }
    ATTEMPT_RESPONSES { uuid attempt_id PK smallint display_number PK smallint selected_option bool is_marked_for_review bool is_visited }
    EXAM_RESULTS { uuid id PK uuid attempt_id UK numeric score numeric max_score numeric percentage bool passed smallint correct_count smallint incorrect_count smallint unattempted_count }
```

---

## 4. Table catalogue (full DDL in `migrations/`)

| # | Table | Migration | Purpose / key rules |
|---|---|---|---|
| 1 | `institutions` | 005 | Tenants. `code` unique (`1DA`), `email_domain`, `settings jsonb` (SystemSettingsPage). |
| 2 | `departments` | 005 | `UNIQUE(institution_id, code)`; `UNIQUE(id, institution_id)` is the target for composite FKs. |
| 3 | `profiles` *(existing, extended)* | 005 | + `department_id`, `is_active`, `created_at`. Case-insensitive unique `usn`/`staff_id`/`email`. Students must have a USN; admins and students must have an institution (`NOT VALID` → only new or changed rows are checked). |
| 4 | `student_details` | 005 | Semester, section, admission year, scheme, **phone and DOB (PII kept out of `profiles`; stripped from the audit trail)**. |
| 5 | `activity_logs` *(existing, extended)* | 005 | + `institution_id`, `entity_type`, `entity_id`. Append-only. |
| 6 | `subjects` | 006 | Course `22CS601`; `UNIQUE(institution_id, code)` and `(institution_id, lower(title))`. |
| 7 | `questions` | 006 | **No answer column.** `options text[4]`, checked to be non-empty and case-insensitively distinct. Duplicate rule = frontend `normalizeQuestionText`, enforced by a unique index on `md5(normalized_statement)`. Soft delete through `is_archived`. |
| 8 | `question_answer_keys` | 006 | 1:1 with question, `correct_option 0–3`, **admins only**. |
| 9 | `question_import_batches` | 006 | One row per CSV/XLSX upload with per-row rejections. |
| 10 | `exams` | 007 | Schedule window, duration, `question_count = 25`, `pattern_count = 10`, pass %, negative-total clamp, late-entry limit, release mode, response-review flag, lifecycle `draft → published → closed → archived`. |
| 11 | `exam_questions` | 007 | The master 25, with position 1–25. |
| 12 | `exam_patterns` | 007 | A–J; `UNIQUE(exam_id, sequence_signature)` **guarantees 10 distinct orders**. |
| 13 | `exam_pattern_questions` | 007 | **Immutable paper snapshot**: statement, options in display order, `option_order`, marks. |
| 14 | `exam_pattern_answer_keys` | 007 | Key per pattern and display number, **admins only**. |
| 15 | `exam_assignments` | 008 | Student ↔ exam (`UNIQUE`), allocated pattern, `max_attempts` (default 1), `extra_time_minutes` (accommodations), venue and seat (frontend "Terminal #CCC-24"). |
| 16 | `exam_attempts` | 008 | **Server `deadline_at`**; one active attempt per assignment (partial unique index); `UNIQUE(assignment_id, attempt_no)`; state machine enforced by trigger; never deleted. |
| 17 | `attempt_responses` | 008 | 25 rows created at start; `selected_option`, `is_marked_for_review`, `is_visited` (the palette states); `fillfactor = 80` for HOT autosave updates. |
| 18 | `attempt_events` | 008 | Started / resumed / submitted / extended / voided plus proctoring signals (tab hidden, fullscreen exit, copy/paste…). |
| 19 | `exam_results` | 009 | One per attempt: raw and clamped score, max, percentage, passed, counts, `evaluation_version`. |
| 20 | `result_question_scores` | 009 | Per-question grading, including the correct option, **admins only**. |
| 21 | `audit_log` | 010 | Row-level before/after diffs from triggers on 11 tables; append-only. |
| 22 | `announcements` | 010 | Replaces `studentMockData.announcements`; audience by role and department. |
| – | `admin_question_bank` (view) | 006 | `security_invoker`, so the caller's RLS applies. Joins subject and key in the shape `QuestionBankPage` expects. |

---

## 5. RLS & privilege matrix

`S` = student, `A` = institution admin (own institution only), `SA` = super admin, `anon` = no table access at all.

| Table | Student | Admin (own institution) | Super admin | Writes |
|---|---|---|---|---|
| institutions | own institution (read) | own (read) | all (CRUD) | SA only |
| departments | own institution (read) | CRUD | CRUD | RLS |
| profiles | **own row** | institution rows | all | RPC / Edge Function only |
| student_details | own row | institution | all | `admin_update_student` RPC |
| subjects | institution (read) | CRUD | CRUD | RLS |
| questions | ❌ none | read | read | `save_question` / `import_questions` / `delete_question` |
| question_answer_keys | ❌ **none** | read | read | same RPCs |
| question_import_batches | ❌ | read | read | RPC |
| exams | **only if assigned AND published/closed** | read; insert/update **drafts** (column-limited); delete drafts | all | lifecycle columns RPC-only |
| exam_questions / exam_patterns / exam_pattern_questions | ❌ | read | read | RPC (drafts only) |
| exam_pattern_answer_keys | ❌ **none** | read | read | RPC (drafts only) |
| exam_assignments | own | institution | all | RPC |
| exam_attempts | own (read) | institution | all | RPC only (no grants) |
| attempt_responses | own attempt (read) | institution | all | `save_attempt_responses` only |
| attempt_events | ❌ | institution | all | RPC |
| exam_results | own **and released** | institution | all | evaluation engine only |
| result_question_scores | ❌ (contains key) | institution | all | evaluation engine only |
| activity_logs / audit_log | ❌ | institution | all | triggers / definer code only, append-only |
| announcements | institution, by audience and department, published & unexpired | CRUD | CRUD | RLS |

How each critical requirement is met:

| Requirement | Mechanism | Test |
|---|---|---|
| Students never access correct answers | Keys live in 3 tables with no student policy. The paper payload carries no keys or question IDs. Results expose only aggregates. The optional review shows only right/wrong, never the correct option, and only after close and release. | ✅ 7 assertions |
| Only assigned exams | `exams` student policy requires an assignment; `start_exam_attempt` checks the assignment under a row lock | ✅ |
| Admins limited to their institution | `my_admin_institution_id()` in every policy, `assert_can_manage()` in every RPC, composite FKs | ✅ 6 assertions |
| No timer, marks or submission manipulation | No write grants; `deadline_at` set by the server; saves rejected after deadline + 5 s; cron sweeper; grading reads only server rows | ✅ |
| No unauthorized retakes | `max_attempts` checked under `FOR UPDATE`, `UNIQUE(assignment_id, attempt_no)`, a partial unique index on the active attempt; retakes only via the audited `grant_exam_retake` | ✅ |
| Immutable attempts and paper snapshots | Pattern guard trigger; attempt state machine; response lock; no-delete triggers; question edits blocked once used in a published exam | ✅ |
| Never trust client roles or grading | Roles re-read from `profiles` on every call; signup role only from server-set `app_metadata`; evaluation entirely in SQL | ✅ |
| Protect sensitive student information | Students see only their own row; DOB and phone in `student_details`, excluded from audit; anon has no table access | ✅ |

---

## 6. Functions, RPCs and triggers

**`private` schema (not reachable through the API):**
- **RLS helpers:** `my_role`, `my_institution_id`, `my_admin_institution_id`, `is_super_admin`, `can_manage_institution`, `assert_can_manage`, `require_active_student`.
- **Engine:** `shuffled_range` (CSPRNG via `gen_random_uuid`), `permute`, `verify_exam_patterns`, `allocate_patterns`, `attempt_payload`, `finalize_attempt`, `evaluate_attempt`, `student_result_payload`, `results_visible`, `finalize_expired_attempts`, `log_activity`.
- **Triggers:** `set_updated_at`, `block_mutation`, `guard_pattern_rows`, `on_question_content_change`, `guard_exam_update`, `guard_attempt_update`, `guard_response_update`, `audit_row_change`.

**Public RPCs, by role:**

| Role | RPCs |
|---|---|
| anon | `resolve_login_identifier` *(existing)* |
| Super admin | `admin_provision_user` *(existing, hardened)*, `get_platform_overview` |
| Admin: people | `admin_update_student`, `assign_students_to_exam`, `assign_cohort_to_exam`, `revoke_exam_assignment`, `grant_exam_retake` |
| Admin: bank | `save_question`, `delete_question`, `import_questions` |
| Admin: exam | `set_exam_questions`, `generate_exam_patterns`, `get_exam_verification_report`, `publish_exam`, `unpublish_exam` (only before any attempt), `reschedule_exam`, `close_exam`, `release_exam_results`, `reevaluate_exam` |
| Admin: invigilation | `admin_extend_attempt`, `admin_force_submit_attempt`, `void_exam_attempt` |
| Admin: reports | `get_admin_dashboard`, `get_exam_report` (absent/started/submitted, mean, median, pass rate, by-pattern, distribution), `get_exam_item_analysis` (difficulty and discrimination index), `get_exam_results_export`, `get_student_performance` |
| Student | `get_my_exams`, `start_exam_attempt`, `get_attempt_paper`, `save_attempt_responses`, `log_attempt_event`, `submit_exam_attempt`, `get_my_result`, `get_student_performance` |

### Exam workflow (server-side)

```mermaid
sequenceDiagram
    autonumber
    participant Ad as Admin UI
    participant St as Student UI
    participant DB as Postgres (RPCs)
    participant Cr as pg_cron
    Ad->>DB: save_question / import_questions (bank + keys)
    Ad->>DB: insert exams (draft) → set_exam_questions(25 ids)
    Ad->>DB: generate_exam_patterns → 10 orders × option shuffles + key snapshots + verification
    Ad->>DB: assign_cohort_to_exam → publish_exam (verify, total_marks, balanced A–J allocation)
    St->>DB: get_my_exams (status: upcoming/live/in_progress/completed)
    St->>DB: start_exam_attempt (row-locked; window/late-entry/max_attempts; deadline = min(now+duration+extra, window_end))
    DB-->>St: paper (25 q, display-order options, NO key) + deadlineAt + serverNow
    loop every answer change (debounced)
        St->>DB: save_attempt_responses(seq) → rejected after deadline+5s (auto-submits)
    end
    St->>DB: submit_exam_attempt → finalize + evaluate (negative marks, clamp) → result if released
    Cr->>DB: finalize_expired_attempts (abandoned tabs) + auto-close ended exams
    Ad->>DB: close_exam → release_exam_results → get_exam_report / item analysis / export
```

**Pattern allocation.** Candidates sorted by USN are each given the least-used pattern, which yields A, B, C … J, A …. Adjacent seat numbers therefore never share a paper, and late additions keep the distribution balanced. The allocation is stored, so it is no longer recomputed in the browser like `assignPatternToStudent`.

**Two deliberate changes from the current frontend:**
- **Pattern A is no longer the natural Q1…Q25 order**, because that leaks the master order.
- **Correct answers are no longer shown after submission**, because the requirement says students must never see them.

---

## 7. Indexing & performance

- **Covered access paths:** login (`upper(usn)` and `upper(staff_id)` unique indexes); bank filters `(institution_id, subject_id, topic, difficulty) WHERE NOT is_archived`; bank search (GIN `to_tsvector`); dashboards `(institution_id, status, window_start)`; student feed `exam_assignments(student_id, status)`; sweeper partial index `exam_attempts(deadline_at) WHERE status = 'active'`; reports `exam_results(exam_id, score DESC)`; audit `(institution_id, occurred_at DESC)`.
- **RLS cost.** Policies call helpers through `(SELECT …)`, so they run once per statement (an initPlan), not once per row. The parent-scoped policies on pattern questions, responses and events use `EXISTS` on indexed primary keys.
- **Autosave load.** At peak, 4,000 students × 25 responses = 100k rows per exam.
  - `fillfactor = 80` on `attempt_responses` lets updates stay HOT.
  - The client should debounce saves to about 3–5 s and on navigation, sending only changed rows.
  - `last_client_seq` drops out-of-order saves.
- **Exam start.** Each start writes about 27 rows plus a row lock on one assignment, so a burst of 4,000 starts at 10:00 is acceptable. Pattern generation (250 rows) runs once per exam.
- **At larger scale:**
  - Partition `attempt_responses`, `attempt_events` and `audit_log` by month.
  - Move report RPCs to a read replica.
  - Precompute `get_exam_item_analysis` into a materialized view after `close_exam`.
- **Operational:** use Supavisor in transaction mode, and run `ANALYZE` after bulk imports.

---

## 8. Migration execution order

| Step | What | Notes |
|---|---|---|
| 0 | `supabase/discovery/000_preflight_discovery.sql` | **Read-only.** Send me the output: it reveals the real 001/002, policy names, duplicate USNs/emails, orphan `institution_id`s and whether pg_cron is on. |
| 1 | Back up | `supabase db dump` (schema + data) or a PITR checkpoint. |
| 2 | 001/002 | Preferably `supabase db pull` → commit the real baseline. Otherwise `supabase/migrations/001_baseline_reconstruction.sql` (a no-op on live, builds fresh projects). |
| 3 | 003, 004 | **Not applied on live** (no `profiles.staff_id`). Review and apply before 005. Until then, login uses the `<id>@drait.edu.in` fallback and admin Login IDs live in Auth `app_metadata`. |
| 4 | Seed | Insert the Dr. AIT `institutions` row (`1DA`) and departments, then backfill `profiles.institution_id` and `department_id`. **This must happen before 005 if any profile has an `institution_id` that doesn't exist**, or the new FK will fail. Step 0 shows this. |
| 5 | 005 → 011 | In order, each in its own transaction (Supabase CLI does this). All idempotent. 011 is only needed for subject-scoped admins (§11). |
| 6 | pg_cron | Enable it in Dashboard → Extensions, then re-run section 5 of 010. |
| 7 | Verify | `VALIDATE CONSTRAINT profiles_scoped_role_chk / profiles_student_usn_chk / profiles_identifier_format_chk` after cleanup. Turn off "Allow new users to sign up" in Auth settings. |

Each migration depends on the one before it: 005 provides tenancy and helpers for 006 (the bank); 007 (exams and patterns) relies on 006; 008 (assignments and attempts) on 007; 009 (evaluation and results) on 008; 010 (audit and reports) on 009; 011 (subject-scoped admins) on 006–010.

**Requirements:** PostgreSQL ≥ 15, for `security_invoker` views and `ON DELETE SET NULL (col)`. Supabase is on 15 or 17; check the step 0 output.

**Rollback.** These are forward-only migrations. Rolling back means restoring the step 1 backup. Before go-live there is no exam data, so this risk is low.

---

## 9. Frontend-to-database integration map

| Current frontend (file) | Replace with | Notes |
|---|---|---|
| `authService.fetchVerifiedProfile` | unchanged `from('profiles').select('*')` | Optionally embed `institutions(name)` and `departments(name)`. |
| `authService.resolveIdentifierToEmail` | unchanged RPC; **delete the hard-coded `@drait.edu.in` fallback** | Better: an Edge Function `login` that resolves and signs in server-side, so the email is never returned to anon. |
| *(none)* creating students and admins | **Edge Function `provision-users`** (service role as a Supabase secret) | Verifies the caller JWT, then `profiles.role`. Calls `auth.admin.createUser({ email, password, app_metadata: { role, institution_id, department_id, usn \| staff_id, full_name } })`. Supports bulk student CSV. |
| `questionBankService.getQuestions` | `from('admin_question_bank').select().eq('is_archived', false)` | `correct_option → correctOption`, `negative_marks → negativeMarks`; IDs are UUIDs, so show `question_no` as "ID #". |
| `saveQuestion` / `deleteQuestion` | `rpc('save_question', { p_question_id, p_payload })` / `rpc('delete_question')` | Payload is the same shape as the current form, plus `subjectId`. Subjects come from a dropdown of the `subjects` table. |
| `importQuestions` (+ `readQuestionImportFile`) | Keep client parsing, then `rpc('import_questions', { p_file_name, p_rows })` | The server re-validates every row and returns `rejections[{rowNumber, errors}]`. |
| `QuestionBankPage.sendQuestionsToGenerator` | `rpc('set_exam_questions', { p_exam_id, p_question_ids })` | Needs an exam picker. |
| `examRandomizerService.getExamState` | `from('exams')`, `exam_patterns`, `exam_pattern_questions`, `exam_pattern_answer_keys` + `rpc('get_exam_verification_report')` | Admin preview, matrix and answer-key tabs. |
| `regeneratePatterns` / `publishExam` / `unpublishExam` | `generate_exam_patterns` / `publish_exam` / `unpublish_exam` | `resetToDefaults` → seed script for demos only. |
| `ExamManagementPage` roster tab (hard-coded USNs) | `from('exam_assignments').select('*, profiles(usn, full_name), exam_patterns(pattern_label)')` + `assign_cohort_to_exam` | |
| `getStudentExam` (StudentDashboard / ExamInterface) | `rpc('start_exam_attempt', { p_exam_id })`; on reload `rpc('get_attempt_paper')` | The payload keeps `makeStudentPaper`'s field names. Use `displayNumber` instead of `question.id` (`ExamInterface.jsx:627`). |
| sessionStorage draft + local `timeLeft` | `rpc('save_attempt_responses', { p_attempt_id, p_responses, p_client_seq })` | Countdown = `deadlineAt − (serverNow + clientOffset)`. Drop sessionStorage as the source of truth. |
| `evaluateSubmission` | `rpc('submit_exam_attempt', { p_attempt_id })` | Returns `result` only when released. Show "Submitted, results pending" otherwise. |
| `getStudentAttempt` (never used) | `rpc('get_my_result', { p_exam_id })` | |
| `studentMockData` (upcoming, results, announcements) | `get_my_exams`, `get_student_performance`, `from('announcements')`, `profiles` + `student_details` | |
| `AdminDashboard` mock stats | `rpc('get_admin_dashboard')` | |
| `SuperAdminDashboard`, `InstitutionProfilePage`, `SystemSettingsPage` | `get_platform_overview`, read the single Dr. AIT `institutions` row, `institutions.settings` | No institution create/suspend in the UI (single-institution deployment). |
| Proctoring (not implemented) | `rpc('log_attempt_event', …)` on `visibilitychange`, `fullscreenchange`, copy/paste | |

---

## 10. Decisions for you to confirm

1. **Result visibility default.** The draft uses `results_release_mode = 'immediate'`, the current UX where the score is shown on submit. The alternative is `'manual'`, where the COE releases results after moderation.
2. **Negative total.** The draft clamps the total at 0 (`clamp_negative_total = true`). The current frontend allows negative totals.
3. **Late entry.** The draft default is `NULL`, meaning a student can start any time inside the window and gets less time near the end. Should Dr. AIT set something like 15 minutes?
4. **Self-signup.** The draft blocks it at the database level. Confirm that accounts are provisioned only by admins.
5. **Uniqueness scope.** The draft makes USN and Staff ID unique across all institutions, which matches VTU USNs and the global login lookup. Confirm this.
6. **Question-bank sharing.** Questions are private to each institution. A shared or global bank would need a `visibility` column; it's not in this draft.

On approval, I will:
- move the migrations into `supabase/migrations/` (and capture 001/002 from your discovery output if available);
- add a `seed.sql` for the Dr. AIT demo data;
- add the `provision-users` Edge Function;
- then integrate the frontend page by page.

---

## 11. Subject-scoped administrators (migration 011)

Added for the five demo administrators `ADMIN001`–`ADMIN005` (one subject each; see `docs/DEMO_ADMINS.md`). **Not applied to any project**; review it with the rest of the chain.

**Model.** A row in `public.subject_admins (admin_id, subject_id, institution_id)` makes an `admin` profile *subject-scoped*. It keeps every institution-admin capability for its own subjects and loses access to everything else. Admins with no rows (today's institution admins) and super admins behave exactly as before, so the Super Admin → Institution Admin hierarchy does not change. Only institution admins and super admins can write `subject_admins`; a trigger accepts only active admins of the subject's own institution.

**Enforcement (server-side, independent of the client):**

| Layer | What it does |
|---|---|
| RESTRICTIVE RLS (`*_subject_scope`) | AND-ed with the existing permissive policies (which are left unchanged). For a scoped admin, `SELECT` only returns rows of their subjects: `subjects`, `questions`, `question_answer_keys`, `exams`, `exam_questions`, `exam_patterns*`, `exam_assignments`, `exam_attempts`, `attempt_responses`, `attempt_events`, `exam_results`, `result_question_scores`, exam-specific `announcements`, and only their own `question_import_batches`, `activity_logs` and `audit_log` rows. |
| Row triggers (`private.guard_subject_scope`) | `BEFORE INSERT/UPDATE/DELETE` on the same tables. They also fire inside the `SECURITY DEFINER` RPCs (`save_question`, `delete_question`, `import_questions`, `set_exam_questions`, `generate_exam_patterns`, `publish_exam`, `assign_*`, `close_exam`, …), so tampering with IDs in API calls cannot reach another subject. They also stop a scoped admin from composing an exam from another subject's questions, and from changing `profiles` (other than their own row), `student_details`, `departments` or `subject_admins`. |
| Report RPCs | `get_exam_report`, `get_exam_item_analysis`, `get_exam_results_export` and `get_exam_verification_report` call `private.assert_can_manage_exam`. `get_student_performance` lists only in-scope subjects. `get_admin_dashboard` (institution totals) is refused to scoped admins. Bodies are otherwise identical to 007/010. |

Students are unaffected: for any non-scoped caller, every check is a no-op.

**Tests.** `supabase/tests/120_subject_admin_scope_test.sql` (57 assertions) covers:
- **Own-subject work:** each scoped admin reads, creates, imports, composes, generates (10 patterns), publishes and reports on its own subject.
- **Cross-subject denial:** every cross-subject read, write and report is denied, using a draft DBMS exam so that denials come from the scope guard and not from status rules.
- **Escalation:** self-escalation is blocked (`subject_admins`, `profiles.role`).
- **Hierarchy:** the institution admin and super admin keep full access.

---

## 12. Frontend integration (migration 013)

The §9 map is now implemented in `src/services/api/*`. The local engine and its localStorage data are removed. Migration 013 adds only what the integration needed:

- `platform_settings`, plus `save_platform_settings` (super admin only).
- `pattern_pins`, with demo CS001–CS006 → A–F honoured by `private.allocate_patterns`.
- `record_activity` for portal actions by staff.
- security-invoker read models over existing RLS: `portal_activity`, `admin_candidates`, `admin_exam_overview`, `admin_exam_candidates` and `admin_attempt_breakdown` (admins only).

`supabase/seed/001_drait_catalogue.sql` (generated by `scripts/generate-seed-sql.mjs`) adds the Dr. AIT institution, the CS department, six subjects and 150 keyed questions, idempotently. The deployment steps are in `docs/EXAM_ENGINE_SUPABASE.md` §3.

