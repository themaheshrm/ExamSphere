# Student accounts: creation, credentials and first sign-in

Admins create student sign-in accounts from **Admin → Candidates → Add student**. The account is created **server-side** by a Supabase Edge Function. The service-role key stays in Supabase's server environment and is never in the browser bundle.

## How it works

```
Admin (browser, signed in)
  └─ Add student form ── POST /functions/v1/create-student (admin's own session token)
        Edge Function (service role, server-side)
          1. verify the caller's token with Supabase Auth (auth.getUser)
          2. caller must be an active institution admin or super admin
             (students, subject admins ADMIN001–005 and subject_admins rows → 403)
          3. validate fields; generate institutional email if blank
          4. refuse duplicates: Student ID/USN (profiles.usn), email (Auth + profiles.email) → 409
          5. generate a 16-character temporary password (CSPRNG)
          6. auth.admin.createUser (email confirmed, role student,
             app_metadata.must_change_password = true)
          7. write the profile (role student, usn, name; email, institution,
             department, student_details only where those columns/tables exist)
          8. on any failure after step 6: delete the new Auth user (no half accounts)
        ◄─ { student, credentials } once, Cache-Control: no-store
  └─ one-time credentials dialog (Copy credentials) → cleared on Done
```

**The student signs in on Student Login** with the Student ID and the temporary password:
- **Email lookup.** The Student ID is turned into the email by `resolve_login_identifier` when migration 004 is applied. Otherwise the app uses the existing convention, `<usn>@drait.edu.in`.
- **Forced password change.** Because the signed token carries `must_change_password`, every protected page redirects to **/change-password** until the student sets a new password.
- **`change-temporary-password`.** It verifies the temporary password, enforces the password policy (12+ characters, upper- and lower-case letters, a digit, a symbol, not the Student ID), sets the new password and clears the flag. Only the service role can do this.
- **After the change.** The app refreshes the session and opens the dashboard with the assigned examination.

### Where the data goes

| Data | Stored in |
|---|---|
| Password | Supabase Auth only (hashed). Never in profiles, metadata, logs, browser storage or the student list. |
| Role, Student ID, name, must-change flag, department/semester/section/mobile | Auth `app_metadata` (writable only with the service role) |
| Profile | `profiles` (`role = student`, `usn`, `full_name`; `email`, `institution_id`, `department_id` if the columns exist) |
| Semester, section, phone | `student_details` if migration 005 is applied |
| Exam eligibility | `exam_assignments`: a new student is assigned to the examination being managed on the Candidates page |

## Deploying (one-time; needs your approval and the Supabase CLI)

No database migration is required for account creation. Deploy the two functions from the repository root:

```bash
supabase link --project-ref wythsbmlgsvmuwsvrglw
```

```bash
supabase functions deploy create-student
```

```bash
supabase functions deploy change-temporary-password
```

Settings to check:
- **Function secrets.** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are provided automatically to Edge Functions; you don't set them yourself. Optionally restrict CORS to your site:
  ```bash
  supabase secrets set ALLOWED_ORIGINS=https://your-examsphere-domain
  ```
- **Auth → Sign In / Providers.** Turn off **Allow new users to sign up**. Accounts are created only by the function or the scripts.
- **Auth → URL Configuration.** Add `https://<your-site>/reset-password` to the redirect URLs. Password-reset emails link there; the page sets the new password through `change-temporary-password` (`mode: recovery`). It accepts only a session created from a recovery link in the last hour, and it also clears any temporary-password flag.
- **Auth → Password security.** A minimum length of at least 12 matches the app's policy.

### Optional: database-side gate (migration 012, not applied)

`supabase/migrations/012_temporary_password_gate.sql` makes `start_exam_attempt` refuse students whose token still carries `must_change_password`. It needs the exam migrations 005–011, so review and apply it together with them. Until then the gate is enforced by the web app's route guard and by the server-side password-change function.

## Limitations of the current schema (no migrations applied)

- **Email address field.** The live `profiles` table has no `email` column, so Student ID sign-in works only with the institutional convention. If the admin leaves the email blank, it is generated (`cs006@drait.edu.in`). A different address is refused with an explanation until migrations 003/004 add `profiles.email` and `resolve_login_identifier`.
- **Department, semester, section and mobile.** These are kept in server-only Auth metadata (and in `student_details` once 005 is applied).
- **Lost temporary password.** It cannot be shown again. Reset it in Supabase Auth, or delete the user and create it again.

## Tests

- **`tests/studentAccounts.test.js`** runs the real function code against a mock Supabase API. It covers:
  - authorisation (anonymous, forged token, student, subject admin, inactive admin, super admin);
  - field validation, ignored client-sent `role`, duplicate USN/email/second account;
  - rollback on failure;
  - password strength and uniqueness;
  - no password in profiles, metadata or logs;
  - the Admin API used only with the service key;
  - the first-login change (wrong, weak or same password refused; flag cleared; old password stops working).
- **Browser end to end:** admin creates CS006 → credentials shown and copied → nothing in storage or console → duplicate refused → subject admin has no Add student → CS006 signs in → dashboard and exam blocked until the password is changed → new password works and the temporary one no longer does → dashboard shows paper 22CS601-F.
- **`supabase/tests/130_temporary_password_gate_test.sql`** covers migration 012 (local PostgreSQL only).
