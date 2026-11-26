# Examination engine on Supabase

The question bank, examinations, patterns A–J, candidate assignments, attempts, answers, grading, results, notifications and platform settings now live in Supabase. The browser keeps no exam business data.

> **Status:** the code is ready, but **nothing has been applied to the live project.** The new frontend needs migrations **002–013** and the catalogue seed. Until they are applied, the exam pages show "Could not load…" errors. **Apply the database first (§3), then deploy the frontend.**

## 1. What changed

| Module | Before (browser) | Now (Supabase) |
|---|---|---|
| Question bank | `questionBankService` + localStorage, with keys bundled in JS | `admin_question_bank` view, `save_question` / `delete_question` / `import_questions` RPCs. Keys live only in `question_answer_keys`. |
| Examinations | `examRegistry` / `examRandomizerService` | `exams` table, `admin_exam_overview` view, `set_exam_questions`, `publish_exam`, `unpublish_exam`, `close_exam`, `reschedule_exam` |
| Patterns A–J | generated in the browser | `generate_exam_patterns` (server). Mapping checked by `get_exam_verification_report`. Answer key per pattern in `exam_pattern_answer_keys` (admins only). |
| Roster and allocation | `studentRosterService` + `patternAssignment.js` | `admin_candidates`, `admin_exam_candidates`, `assign_students_to_exam`, `revoke_exam_assignment`, `grant_exam_retake`, `admin_update_student`. Demo pins CS001–CS006 → A–F are in `pattern_pins` (013). |
| Attempts | localStorage attempt plus a sessionStorage timer | `start_exam_attempt` (resumes on any device), server deadline, `save_attempt_responses` (ordered autosave), `log_attempt_event` |
| Submission and grading | graded in the browser | `submit_exam_attempt` (idempotent; graded in the database) |
| Results | browser | `get_my_result`, `get_my_exams`, `get_exam_report`, `get_exam_item_analysis`, `admin_attempt_breakdown` (admins only) |
| Settings | localStorage | `platform_settings` (013); only the super admin writes, via `save_platform_settings` |
| Activity / notifications | localStorage | `activity_logs` via `portal_activity` and `record_activity` (013). Notifications are derived from live data. Only "read" markers stay in localStorage, as a UI preference. |

**Removed:** `examRandomizerService`, `examRegistry`, `questionBankService`, `scopedQuestionBank`, `studentRosterService`, `patternAssignment`, `randomizationEngine`. The question banks with answer keys moved out of `src/` to `supabase/seed/source/`, so they are no longer bundled.

**Unchanged:** routes, layouts, branding, the login flows, the three Edge Functions, demo accounts and admin management.

## 2. Security model (enforced in the database)

| Role | Access |
|---|---|
| Super admin | Everything. Only role that can save platform settings and manage pattern pins. |
| Institution admin | Dr. AIT only (`private.my_admin_institution_id()`). |
| Subject admin | Their subject only. Restrictive RLS and write guards (011) on questions, exams, patterns, assignments, attempts, results and reports. |
| Student | Own assignments, attempts and results only. Papers contain no answer key, option permutation or question ids. Results are visible only when released. |

Duplicate submissions are idempotent. Answers cannot change after submission (the server refuses). Reordered or stale autosaves are ignored (`client_seq`). The deadline is enforced on the server, with auto-submit after it passes. Students cannot read other students' attempts.

## 3. Apply to the live project (manual, after your review)

Run these yourself. Set the connection string in your own shell: it is the database password from Dashboard → Project Settings → Database. **Never** paste it into chat or into a `VITE_` variable. No service-role key is needed.

1. **Read-only discovery and backup.** These are steps 0–1 of `docs/database/ARCHITECTURE.md` §8.

   ```bash
   psql "$SUPABASE_DB_URL" -f supabase/discovery/000_preflight_discovery.sql > discovery.txt
   ```

   ```bash
   supabase db dump --db-url "$SUPABASE_DB_URL" -f backup_schema.sql
   ```

   ```bash
   supabase db dump --db-url "$SUPABASE_DB_URL" --data-only -f backup_data.sql
   ```

2. **What discovery found (2026-11-26).** The live project runs PostgreSQL 17.12. It has an older, empty exam schema (`exams`, `questions`, `question_keys`, `exam_attempts`, `answers`, `results`, and the enums `exam_status` and `attempt_status` with different labels). It also has one placeholder institution, "Apex Engineering University" (`APEX-01`), and 3 accounts. Migration **002** reconciles this:
   - It **renames** the empty legacy tables and enums to `legacy_*`. Nothing is dropped.
   - It refuses to run if any of those tables has rows.
   - It adds the missing `institutions` columns and maps `is_suspended` to `is_active`.

   The whole sequence below is rehearsed on an exact replica of the live schema by `supabase/tests/run_live_upgrade.sh`, which CI runs too.

3. **Apply in this exact order**, one file at a time, checking for errors after each:

   | # | File | Notes |
   |---|---|---|
   | 1 | `supabase/migrations/002_reconcile_legacy_schema.sql` | Renames the empty legacy schema. |
   | 2–12 | `supabase/migrations/003_…` through `013_…` | In numeric order. |
   | 13 | `supabase/seed/000_adopt_live_institution_as_drait.sql` | **Optional, owner's decision.** Converts the APEX-01 row into Dr. AIT (`1DA`), so the existing admin and student belong to Dr. AIT. Skip it to keep Apex as a separate institution. |
   | 14 | `supabase/seed/001_drait_catalogue.sql` | Dr. AIT, CS department, 6 subjects, 150 questions. |
   | 15 | `supabase/migrations/013_examination_engine_integration.sql` | **Again**, to create the demo pattern pins. |

   **Supabase SQL Editor (no install):** open each file, copy all of it into a new query, and press Run. Continue only when it reports **Success**. If a file errors, stop and share the message. Nothing after the failing file has run, and the failed file itself rolled back.

   **psql** (PowerShell, from the repository root):

   ```powershell
   foreach ($f in @('supabase/migrations/002_reconcile_legacy_schema.sql') + (Get-ChildItem supabase/migrations/0*.sql | Where-Object Name -match '^(00[3-9]|01[0-3])_' | Sort-Object Name | ForEach-Object { $_.FullName })) { Write-Host "== $f"; psql $env:SUPABASE_DB_URL -X -v ON_ERROR_STOP=1 -1 -f $f; if ($LASTEXITCODE -ne 0) { break } }
   ```

   Then the optional adoption, the seed and 013 again. The seed files manage their own transaction, so they run without `-1`:

   ```powershell
   psql $env:SUPABASE_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/seed/000_adopt_live_institution_as_drait.sql
   ```

   ```powershell
   psql $env:SUPABASE_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/seed/001_drait_catalogue.sql
   ```

   ```powershell
   psql $env:SUPABASE_DB_URL -X -v ON_ERROR_STOP=1 -1 -f supabase/migrations/013_examination_engine_integration.sql
   ```

   Finally, make the REST API see the new objects. Run this in the SQL Editor (or use Dashboard → Settings → API → Reload schema):

   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

   Do **not** run `001_baseline_reconstruction.sql` on the live project. It is only for building fresh databases.

   Then check the demo accounts against the new schema with the read-only dry runs. Run the real provisioning only as described in `docs/DEMO_ADMINS.md` and `docs/DEMO_ACCOUNTS.md`.

   ```bash
   node scripts/provision-demo-admins.mjs --dry-run
   ```

   ```bash
   node scripts/provision-demo-students.mjs --dry-run
   ```

4. **Edge Functions.** These are unchanged by this task. Redeploy them only if they are not deployed yet:

   ```bash
   supabase functions deploy create-student change-temporary-password manage-admins
   ```

5. **Verify** as an institution admin in the app:
   1. Question Bank shows 150+ questions.
   2. Examinations → 22CS403 → Create examination → Verification is all green.
   3. Candidates → select → Mark eligible → Publish.
   4. Sign in as CS003. The dashboard shows Paper 22CS403-C.

**Rollback:** the migrations are forward-only. To roll back, restore the step 1 dump. Until the first real examination there is no exam data to lose.

## 4. Local verification (no project needed)

```bash
PGHOST=127.0.0.1 PGUSER=postgres bash supabase/tests/run_local.sh
```

```bash
PGHOST=127.0.0.1 PGUSER=postgres bash supabase/tests/run_live_upgrade.sh
```

```bash
PGHOST=127.0.0.1 PGUSER=postgres node --test
```

```bash
npm run lint && npm run build
```

To run the real app against a local stand-in for Supabase (disposable Postgres; throwaway accounts with password `Local-Test-Passw0rd!`), start the stand-in:

```bash
PGHOST=127.0.0.1 PGUSER=postgres node tests/helpers/serveLocalSupabase.mjs
```

Then, in a second terminal, start the app against it:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=local-test-anon-key npx vite
```

`tests/engine.integration.test.js` drives the real frontend API modules through all four roles. It covers patterns and answer mapping, autosave, resume on a second device, concurrent submit, cross-student refusal, subject-admin isolation, withhold and restore, demo retake and settings. CI runs it against the same migrations.

## 5. Behaviour notes

- **One current exam per subject.** Admin pages use `?exam=<course code>` and pick that subject's latest non-archived exam.
- **Exam date** becomes the exam window: the whole day in IST, or 30 days from creation when no date is set. After an attempt exists, the window can only be extended.
- **Results display** (System Settings) sets `results_release_mode`. "Withheld" makes new and unreleased exams `manual`, and the server hides scores until they are released.
- **Unpublish** is possible until the first attempt starts. After that the console offers **Close examination**.
- **Reset demo attempts** grants one more attempt (`grant_exam_retake`). Earlier answer sheets are kept for audit and the pattern does not change.
- **Withhold / Remove** revoke the assignment, which is refused once the student has attempted. **Mark eligible** re-assigns and re-allocates a pattern.
- **Deleting a question** that an exam already uses archives it instead, so papers and results stay intact.
- **Staff Directory** (`/super-admin/users`) is still a local contact list, as labelled. Sign-in accounts are managed in Admin Management.
