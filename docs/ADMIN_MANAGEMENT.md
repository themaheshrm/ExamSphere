# Admin Management (Super Admin)

**Super Admin → Admin Management** lists every administrator account and lets the super admin:
- create administrators;
- assign or change subjects;
- reset passwords;
- activate or deactivate accounts.

All privileged work runs in the Edge Function `manage-admins` (`supabase/functions/manage-admins`, logic in `supabase/functions/_shared/adminAccounts.js`). The service-role key exists only in Supabase's function environment.

## Data model (works on the live schema; no migration required)

| What | Where |
|---|---|
| Administrator | `profiles` row with `role = 'admin'` + its Supabase Auth user |
| Admin ID, role type (always `subject`), subject code, must-change flag | Auth `app_metadata` (`staff_id`, `admin_type`, `subject_code`, `must_change_password`). Only the service role can write it, and it is part of the signed session token. |
| Staff ID, email, institution, active flag on the profile | `profiles.staff_id/email/institution_id/is_active`, **only if those columns exist** (migrations 003–005) |
| Database-enforced subject scope | `subject_admins` (migration 011), kept in sync **if the table exists** |
| Subjects offered | `public.subjects` (migration 006) if present, else the built-in catalogue (22CS302, 22CS402, 22CS403, 22CS502, 22CS304) |
| Inactive | Auth user banned (`ban_duration`), so no sign-in and no token refresh. Also `profiles.is_active = false` where the column exists. |

**Roles.** There are three: **Super Admin** (`profiles.role = 'super_admin'`, platform-wide, and the only role that creates students and manages the roster), **Subject Admin** (`profiles.role = 'admin'` with `app_metadata.admin_type = 'subject'` and a valid `subject_code`) and **Student**. Institution Admin no longer exists: creating one, or converting an admin to one, is refused (422).

**How an admin's subject is decided.** The web app (`src/services/adminScope.js`) and the server use the same order:
1. A signed `subject_code` → the admin is restricted to that subject.
2. Otherwise the existing demo registry (ADMIN001–005).
3. Any other administrator, including an older admin created as institution-wide, is shown as **No subject assigned** and gets **no access** in the app until the super admin assigns a subject. The account itself is kept unchanged.

## Rules enforced by the function

- **Who can call it.** The caller must be an **active super admin** (verified profile). Subject admins (with or without a subject), students, anonymous and forged sessions get 401/403.
- **Roles never change.** Targets must be existing role-`admin` accounts. Super admins and students cannot be listed or modified, and no action can grant `super_admin`.
- **Unique IDs and emails.** Admin ID and email must be unique across Auth metadata and profiles. On the live schema the email must be `<adminid>@drait.edu.in` (left blank, it is generated), because Staff Login resolves the ID by that convention until migrations 003/004 are applied.
- **One active subject admin per subject.** A subject held by another active admin is unavailable. Reactivating an admin whose subject is now taken is refused.
- **Passwords:**
  - **Temporary passwords:** 16 characters from a cryptographic random generator. Each is returned once with `Cache-Control: no-store` and never stored, logged or shown again; Supabase Auth keeps only the hash.
  - **First sign-in:** every created or reset account gets `must_change_password = true`, so the admin is sent to **/change-password** at the next Staff Login, which uses the existing `change-temporary-password` function.
  - **Existing passwords** are never readable.
- **Logs** carry IDs and actions only.

## Deploying (needs your approval)

Deploy from the repository root with the Supabase CLI:

```bash
supabase link --project-ref wythsbmlgsvmuwsvrglw
```

```bash
supabase functions deploy manage-admins
```

```bash
supabase functions deploy change-temporary-password
```

`change-temporary-password` is shared with student accounts; deploy it once. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are provided to functions automatically. Optionally restrict CORS:

```bash
supabase secrets set ALLOWED_ORIGINS=https://your-examsphere-domain
```

**Manual Supabase settings:**
1. **A super admin must exist.** It needs a `profiles` row with `role = 'super_admin'` for the account that signs in on the Super Admin tab (e.g. root@examsphere.io). Set it once in the SQL editor:
   ```sql
   update public.profiles set role = 'super_admin' where id = (select id from auth.users where email = 'root@examsphere.io');
   ```
2. **The existing ADMIN001–005 accounts** (from `scripts/provision-demo-admins.mjs`) already carry `staff_id` and `subject_code` in `app_metadata` and appear in the table as-is.
3. **Auth settings:**
   - disable public sign-ups;
   - set a minimum password length of 12;
   - JWT expiry: the default of 1 hour is fine. A subject change takes effect at the admin's next sign-in or token refresh, within the JWT lifetime. A deactivated admin cannot refresh, so their current session ends at token expiry.
4. **Optional, after review:** migrations 005–012 add database-level enforcement (`subject_admins` RLS and write guards, the temporary-password gate). None are applied by this change.

## Tests

- **`tests/adminAccounts.test.js`** runs the real function code against a mock Supabase API, on both the live and the full schema. It covers:
  - listing actual records;
  - who may call the function;
  - validation and ignored role injection;
  - duplicate Admin ID and email (including IDs held only in `app_metadata`);
  - subject conflicts and reactivation conflicts;
  - `subject_admins` sync;
  - password reset and the forced change;
  - deactivated accounts unable to sign in;
  - super admin and students untargetable;
  - new subject admins unable to create students.
- **`tests/adminIdentity.test.js`** covers the signed-assignment precedence and its fail-closed cases.
- **Browser end to end:**
  - the super admin views the five subject admins, deactivates ADMIN005 and creates ADMIN006 on Java;
  - ADMIN006 signs in through Staff Login and is forced to change the password;
  - ADMIN006 is restricted to Java and denied other subjects by URL;
  - the deactivated ADMIN005 cannot sign in;
  - a password reset works and the old password fails;
  - reassignment to CN takes effect at the next sign-in;
  - an admin without a subject sees "No subject is assigned" until one is assigned;
  - admins and students cannot open Admin Management.

## Creating accounts on a migrated database (migration 014)

Supabase Auth's admin `createUser()` inserts the Auth user first and writes `app_metadata` (role, institution, staff ID…) in a second step. Migration 005's sign-up trigger ran at the first step, saw no role or institution, and inserted a student profile with no institution, which `profiles_scoped_role_chk` rejects. That was the error shown when creating admins and students. **Migration 014** creates the profile only once the signed metadata is present (via a second trigger on the metadata update), and the functions then write the full profile with the Dr. AIT institution. No constraint is weakened. Apply 014 like the others (SQL Editor, one file); it is not applied automatically.

Self-sign-ups (no server metadata) get no profile and therefore no access. Keep **Authentication → Sign In / Providers → Allow new users to sign up** turned **off**.

