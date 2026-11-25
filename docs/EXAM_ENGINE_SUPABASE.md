# Examination engine on Supabase

The question bank, examinations, patterns A–J, candidate assignments, attempts, answers, grading, results, notifications and platform settings now live in Supabase. The browser keeps no exam business data.

> **Status:** the code is ready, but **nothing has been applied to the live project.** The new frontend needs migrations **003–013** and the catalogue seed. Until they are applied, the exam pages show "Could not load…" errors. **Apply the database first (§3), then deploy the frontend.**

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

2. **Migrations 003–013 and the seed.** Apply them in order, stopping at the first error.

   ```bash
   for f in supabase/migrations/0{03,04,05,06,07,08,09,10,11,12,13}_*.sql supabase/seed/001_drait_catalogue.sql; do echo "== $f"; psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -1 -f "$f" || break; done
   ```

   Then re-run 013 once. This creates the demo pattern pins, which need the institution row that the seed adds:

   ```bash
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/013_examination_engine_integration.sql
   ```

3. **Backfill existing accounts** if discovery shows profiles without an institution. Do this before 005 if it reports orphan `institution_id`s; see §8 step 4. Then check the demo accounts against the new schema with the read-only dry runs. Run the real provisioning only as described in `docs/DEMO_ADMINS.md` and `docs/DEMO_ACCOUNTS.md`.

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
