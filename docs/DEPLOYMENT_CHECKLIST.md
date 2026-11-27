# ExamSphere live deployment checklist

This runbook is for the Dr. Ambedkar Institute of Technology (Dr. AIT) project only. It documents review findings and owner-operated steps; no migration or production change has been made. Migrations `003`–`013` and the catalogue seed have not been applied to the live project.

## Pre-deployment risks and gates

Review the output of `supabase/discovery/000_preflight_discovery.sql` before proceeding. Stop and reconcile the live schema/data with the owner if any of the following gates are not met.

| Risk | Evidence and impact | Required check/action |
|---|---|---|
| Existing profiles without `institution_id` | Migration `005_tenancy_and_access_control.sql` adds `profiles_scoped_role_chk` as `NOT VALID`: existing rows may remain null initially, but any subsequent update to those rows must satisfy the constraint. Admin and student access also depends on institution scope. | Use the discovery profile summary. Map every active Dr. AIT admin and student to the single `1DA` institution and the correct department before they use the migrated app. Do not set an institution blindly on super-admin rows. Reconcile rows before validating the check constraints (architecture §8). |
| Orphaned profile institution IDs | Migration 005 creates `profiles_institution_id_fkey` to `institutions(id)`. A non-null legacy ID without a matching row can make this FK addition fail. The seed inserts `1DA` but does not map arbitrary old institution IDs to it. | Inspect existing institutions and profile IDs in discovery. Before migration 005, agree on a safe mapping for every legacy ID, ensuring the target institution row exists. If this cannot be done within the reviewed migration sequence, stop and prepare a reviewed baseline/data reconciliation first. |
| Duplicate USNs, staff IDs, or emails | Migration 005 normalizes identifiers and creates unique indexes on `upper(usn)`, `upper(staff_id)`, and `lower(email)`. Case-only duplicates also conflict and will stop migration 005. Discovery reports these duplicates. | Resolve duplicate identities with the account owner before migration 005; do not delete or merge profiles as an automated deployment step. Re-run discovery and require zero duplicate groups. |
| PostgreSQL version | Migrations 013 and related views use PostgreSQL `security_invoker` views, and migration 009 uses column-list `ON DELETE SET NULL`; the documented minimum is PostgreSQL 15. | Inspect `SELECT version()` from discovery. Require PostgreSQL 15 or later; stop and confirm a supported project upgrade path if lower. |
| `pg_cron` extension | Migration 010 registers a once-per-minute attempt-expiry sweeper only when `pg_cron` is enabled. Without it, expired attempts are finalized lazily when a student/admin touches them or when `close_exam()` runs. The migration prints a notice and continues if the extension is absent. | Check the extension list in discovery. Decide whether lazy finalization is acceptable. If periodic auto-finalization is required, enable `pg_cron` in the Supabase Dashboard, then run the reviewed scheduler block in section 5 of migration 010 and verify the named job. |
| Existing undeclared baseline | Architecture §1 notes the live baseline is not fully represented by migrations 001/002. Migrations 003/004 assume existing `profiles`, `auth.users`, `user_role`, trigger/function and activity log structures. | Compare discovery output with the prerequisites in migrations 003/004 and architecture §1. Do not assume `001_baseline_reconstruction.sql` repairs a live project; it is described as a no-op against the existing baseline. Stop for schema reconciliation if objects or signatures differ. |

Additional constraints: the seed uses `ON CONFLICT ... DO NOTHING`, so it leaves existing rows unchanged; it is not a repair/update script. The seed contains keyed questions, and must remain an owner-operated SQL step. Migrations are forward-only; rollback requires restoring the pre-deployment backup. Do not deploy the frontend until schema, seed, account mapping, and role checks have passed.

## Go-live runbook

Run from the repository root in Bash with Supabase CLI, `psql`, `pg_dump`, Node.js, and the required project access configured. The owner supplies the database connection string in a hidden prompt; do not put it in a command, file, `VITE_` variable, or chat.

```bash
read -rsp 'Supabase database URL: ' SUPABASE_DB_URL; echo
export SUPABASE_DB_URL
```

### 1. Run read-only discovery

Run discovery first and save the output locally for review. It issues SELECTs only.

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/discovery/000_preflight_discovery.sql -o discovery.txt
```

Review all pre-deployment gates above, including PostgreSQL version, `pg_cron`, duplicate identifiers, profile institution mappings, table/column layout, existing constraints, RLS policies, functions and triggers. Do not proceed until the owner has approved a reconciliation plan for any discrepancy.

### 2. Back up after discovery

Create and verify a full custom-format backup before the first write. Store it in an access-restricted location with enough free space; the backup contains personal and examination data.

```bash
pg_dump --format=custom --no-owner --file="examsphere-pre-migrations-$(date +%Y%m%d-%H%M%S).dump" "$SUPABASE_DB_URL"
```

Confirm `pg_dump` exits successfully and the dump file exists and is non-empty. Record the protected backup path. Keep the backup until go-live has been accepted.

### 3. Apply reviewed migrations in order

Only the project owner should perform this step. Use one file per transaction, stop on the first error, and do not continue after a failure. `001` is included to match the repository sequence; review its documented live behavior first. Reconcile any live baseline differences before applying 003/004 or 005.

```bash
for f in \
  supabase/migrations/001_baseline_reconstruction.sql \
  supabase/migrations/003_add_email_staffid_to_profiles.sql \
  supabase/migrations/004_secure_identifier_resolution_and_provisioning.sql \
  supabase/migrations/005_tenancy_and_access_control.sql \
  supabase/migrations/006_question_bank.sql \
  supabase/migrations/007_exams_and_patterns.sql \
  supabase/migrations/008_assignments_and_attempts.sql \
  supabase/migrations/009_evaluation_and_results.sql \
  supabase/migrations/010_audit_reporting_and_jobs.sql \
  supabase/migrations/011_subject_admin_scoping.sql \
  supabase/migrations/012_temporary_password_gate.sql \
  supabase/migrations/013_examination_engine_integration.sql; do
  echo "Applying $f"
  psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -1 -f "$f" || exit 1
done
```

If discovery finds non-null profile institution IDs that do not have matching institution rows, stop before migration 005 and have the owner prepare a reviewed baseline reconciliation; do not bypass the FK or guess at an institution mapping. For null profile IDs (which the new FK permits), continue only after all other gates pass. After the seed creates the Dr. AIT institution and department in step 4, backfill existing Dr. AIT profile and department mappings according to the approved plan, then validate the profile check constraints before allowing affected users to sign in. Resolve duplicate identifiers before 005; do not bypass a failed constraint.

### 4. Load the Dr. AIT catalogue and re-run migration 013

The generated seed is idempotent for already-present catalogue rows; it does not update them. Review its effects and run it after migrations 005–013, as stated in the seed header.

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -1 -f supabase/seed/001_drait_catalogue.sql
```

Then re-run migration 013 once, as required by the integration deployment notes so pattern pins can use the seeded institution and subjects. Migration 013 declares itself idempotent. Complete the approved profile/department backfill described in step 3 before allowing affected users to sign in.

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -1 -f supabase/migrations/013_examination_engine_integration.sql
```

If periodic expiry processing is required and `pg_cron` was absent during migration 010, enable the extension through Supabase Dashboard → Database → Extensions. Then run only the reviewed scheduler block in section 5 of `010_audit_reporting_and_jobs.sql` and verify the job `examsphere-finalize-expired`; do not enable extensions without the owner's decision.

### 5. Run demo provisioning dry runs

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the operator's protected environment without printing or saving the key. The scripts' `--dry-run` mode performs live read-only schema/account checks and creates or changes no accounts.

```bash
node scripts/provision-demo-admins.mjs --dry-run
node scripts/provision-demo-students.mjs --dry-run
```

Review both reports and stop if they show schema, identity, subject, or institution mismatches. Do not run provisioning without a separate owner decision. Never pass the service-role key on the command line.

### 6. Smoke-test each role

Use owner-approved test accounts and the deployed app. Confirm each action and its scope; do not use production student accounts for destructive tests.

1. **Super Admin:** sign in; verify the Dr. AIT overview and platform settings load. Confirm a platform setting can be saved and is reflected after refresh. Verify institution and subject admin management displays the expected Dr. AIT scope.
2. **Institution Admin:** sign in; verify Question Bank, exam management, candidates, and results load for Dr. AIT. Select 25 approved questions, generate and verify all 10 patterns, publish a test exam, and confirm results remain hidden/released according to the configured release mode.
3. **Subject Admin:** sign in with a scoped account; verify its assigned subject is available and a different subject is inaccessible for both read and write actions.
4. **Student:** sign in; verify only that student's assigned exam is visible. Start the approved test exam, answer and refresh to confirm the attempt resumes, submit, and verify the student cannot see answer keys or another student's data. Confirm result visibility follows the release mode.

Capture outcomes and timestamps without recording credentials, answer keys, or student response content in the deployment log.

### 7. Rollback

The migrations are forward-only. If deployment must be rolled back, stop app traffic, preserve logs, and have the owner restore the complete pre-migration custom-format backup into the project using the approved Supabase recovery procedure. A full restore replaces database state from the backup; coordinate a maintenance window and understand that writes since the backup will be lost. Verify the restored schema and app before reopening traffic.

The backup command is:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$SUPABASE_DB_URL" /protected/path/to/examsphere-pre-migrations.dump
```

This restore is destructive and is shown for the owner-operated recovery procedure only. Confirm the target project and selected backup before running it. Do not attempt ad-hoc reverse SQL or drop individual objects as a rollback.

## CI reference

For commit `7476f40501f57bed68a7ccf4a39fc54a155c749e`, GitHub Actions run [45686689752](https://github.com/themaheshrm/ExamSphere/actions/runs/45686689752) completed successfully. Both **Tests, lint and build** and **Database migrations and security tests** passed. No CI-driven code correction was needed.

