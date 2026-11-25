# Demo subject administrators (ADMIN001–ADMIN005)

These are five ordinary `admin` accounts, each limited to **one subject**. They let you show, live, that every subject has its own question bank, examination, 10 patterns and results, and that one administrator cannot reach another's subject.

| Admin | Login ID | Subject code | Subject | Sign-in email |
|---|---|---|---|---|
| Admin 01 | `ADMIN001` | 22CS302 | Data Structures and Algorithms | admin001@drait.edu.in |
| Admin 02 | `ADMIN002` | 22CS402 | Database Management Systems | admin002@drait.edu.in |
| Admin 03 | `ADMIN003` | 22CS403 | Operating Systems | admin003@drait.edu.in |
| Admin 04 | `ADMIN004` | 22CS502 | Computer Networks | admin004@drait.edu.in |
| Admin 05 | `ADMIN005` | 22CS304 | Java Programming | admin005@drait.edu.in |

Sources of truth: `src/data/demoAdmins.js` (accounts), `src/data/subjectCatalog.js` (subjects) and `src/data/subjectQuestionBanks.js` (25 distinct MCQs per subject). Sample import files are in `public/demo-imports/<code>-import-sample.csv` (5 new questions each).

## What each admin can do

- **Question bank:** view, add, edit and delete questions of their own subject. The *Subject* field is fixed to their subject.
- **Import:** import CSV/XLSX files. Rows for any other subject are marked *Invalid — Subject is outside your assigned subject* and are never imported.
- **Examinations:** create their subject's examination (`CBT-2026-<code>`) from 25 subject questions, generate patterns `<code>-A` … `<code>-J`, verify them, and publish or unpublish.
- **Candidates:** view the candidates and attempts for their examination. The roster itself (add, edit, withhold) stays with the institution administrator. They can also reset the demo students' attempts on their own exam.
- **Results & Reports:** see the register, analysis and CSV export for their examination only.

The **institution administrator** (e.g. `ADM-8942`) and the **super administrator** are unchanged. The institution administrator keeps the original 22CS601 examination and gets an *Examination* selector to open any subject's exam. The super administrator's *Users* directory lists the five accounts with a **Demo** badge and their subject.

## How it is enforced

- **Identity.** Sign-in uses the normal Staff login. The Login ID is resolved by `resolve_login_identifier`, or by the built-in `<id>@drait.edu.in` fallback when 003/004 are not applied. Then Supabase `signInWithPassword` runs and the `profiles` row is verified (`role = admin`).
- **Subject.** The admin's subject is resolved from **any** of these:
  - `profiles.staff_id`, when that column exists. It does **not** exist on the live project yet.
  - `app_metadata.staff_id` in the signed access token. It is set only by the service role; the same token authorises the profile read, so a forged token is rejected.
  - The verified sign-in email `admin00x@drait.edu.in`.
- **Closed by default.** Every signal can only narrow access. A demo admin is never treated as institution-wide, and conflicting identities get no access. The subject never comes from the URL, browser storage or form input.
- **Web app.** Every admin page resolves its exam through `getScopedExamService` and `scopedQuestionBank` (`src/services/`):
  - Changing `?exam=` to another subject shows **Access restricted**.
  - Service calls with another subject's question ID throw.
  - An answer sheet can only be graded by the exam that issued it.
- **Database.** Migration `supabase/migrations/011_subject_admin_scoping.sql` uses `subject_admins`, restrictive RLS, write-guard triggers and guarded report RPCs; see `docs/database/ARCHITECTURE.md` §11. It is **not applied**. Review it, then apply it after 005–010.

**Limitation of the current build:** until 005–011 are applied and the frontend reads exams from Supabase, the question bank, exams and results live in the browser's storage. The web-app checks above apply to everything the UI and its services do, but a technical user could still edit browser storage with developer tools. Only the database layer (011) closes that. Run the whole demo in **one browser profile on one computer**.

## 1. Provision the accounts (one-time, operator machine)

Requirements:
- **Required columns.** `profiles` must have `id`, `role` and `full_name`. `email`, `staff_id`, `usn` and `institution_id` are used only if they exist.
- **No schema changes.** The script never adds columns or applies migrations.
- **Institution row.** If 005+ are applied, the Dr. AIT `institutions` row (`1DA`) must exist.

**Always run `--dry-run` first.** It performs the real read-only checks and writes nothing:
- the `profiles` columns that exist;
- Auth users with the five emails;
- profiles already using those emails or Login IDs;
- the Dr. AIT institution;
- whether `subject_admins` (migration 011) exists.

It prints a schema report and, per admin, what it *would* do (`create`, `rotate password + refresh profile`, or `repair missing profile`). Any conflict is listed, and the run ends with *Nothing was changed*.

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
```

```bash
export SUPABASE_SERVICE_ROLE_KEY="<service-role key from Dashboard → Project Settings → API>"
```

```bash
node scripts/provision-demo-admins.mjs --dry-run
```

```bash
node scripts/provision-demo-admins.mjs
```

What the script does:
- **Creates the users.** It calls `auth.admin.createUser` (`email_confirm: true`, so no email is sent) with `app_metadata` set to `{ role: 'admin', staff_id, subject_code, examsphere_demo: true }`.
- **Sets the profiles.** Each profile gets `role = admin` and the name. If those columns exist, it also gets `staff_id = ADMIN00x`, the email and the Dr. AIT institution. On the live schema, only `role` and `full_name` (and `usn = null`) are written.
- **Adds the database scope when 011 is applied.** It writes one `subject_admins` row per admin, and creates the subject catalogue row only if it is missing. It never applies migrations; it only detects whether the table exists.
- **Protects real accounts.** If any of the five emails or Login IDs belongs to a non-demo account, it refuses before writing anything.
- **Is safe to re-run.** Re-running rotates the passwords and creates no duplicates.

### Temporary credentials: secure handling

- **One password per admin, shown once.** The script generates a different strong password for each admin. Set `DEMO_ADMIN_TEMP_PASSWORD` (12+ characters) only if you want one shared value. The passwords are printed **once** in the operator's terminal.
- **Never stored.** Passwords are not in the repository, the app bundle, any page or any log. Do not commit them, paste them into chat or tickets, or put them in `VITE_*` variables.
- **Distribution.** Give each password only to the presenter of that account, over an encrypted channel or the institution's password manager.
- **Rotation and cleanup.** Re-run the script before each demo to rotate the passwords. Afterwards, run `--delete` and then `unset SUPABASE_SERVICE_ROLE_KEY`.

## 2. Suggested live demo

1. **Sign in as ADMIN001** (Staff Login). The sidebar shows *Subject: 22CS302 · Data Structures and Algorithms*, and the dashboard asks you to create the exam.
2. **Question Bank.** Only the 25 DSA questions are listed. Import `22CS402-import-sample.csv`: every row is rejected as outside the subject. Import `22CS302-import-sample.csv`: 5 rows are imported.
3. **Examinations → Create examination.** Patterns `22CS302-A` … `J` are generated and verified. Publish.
4. **Tamper with the URL**, for example `/admin/results?exam=22CS402` or `?exam=22CS601`. You get **Access restricted**.
5. **Sign out** and repeat with ADMIN002 … ADMIN005. Each admin sees a different bank and gets its own 10 patterns.
6. **Sign in as CS001** (student). *Subject examinations* lists the published exams. DSA opens as **22CS302-A**; CS002 … CS005 get B … E. Submit one paper.
7. **Sign in as ADMIN001 → Results.** CS001's submission is shown. ADMIN002's results do not include it.

## 3. Cleanup

```bash
node scripts/provision-demo-admins.mjs --delete
```

This deletes only users tagged `examsphere_demo = true`. Their profiles and `subject_admins` rows cascade, and subject catalogue rows are kept.
