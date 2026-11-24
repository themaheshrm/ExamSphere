# Demo CS student accounts: question-paper randomisation

Five ordinary student accounts used to show, live, that every candidate gets the **same 25 questions** in a **different order** with **independently shuffled options**.

| Name | Student ID (login) | Branch | Sign-in email | Assigned pattern | Paper code |
|---|---|---|---|---|---|
| CS Demo 01 | `CS001` | CSE | cs001@drait.edu.in | A | 22CS601-A |
| CS Demo 02 | `CS002` | CSE | cs002@drait.edu.in | B | 22CS601-B |
| CS Demo 03 | `CS003` | CSE | cs003@drait.edu.in | C | 22CS601-C |
| CS Demo 04 | `CS004` | CSE | cs004@drait.edu.in | D | 22CS601-D |
| CS Demo 05 | `CS005` | CSE | cs005@drait.edu.in | E | 22CS601-E |

The source of truth for this table is `src/data/demoAccounts.js`.

## How they work (no special login path)

- **Sign-in** goes through the normal ExamSphere login: Student tab → Student ID → `resolve_login_identifier` → Supabase `signInWithPassword` → verified `profiles` row (`role = student`, `usn = CS00x`). Nothing is bypassed.
- **Exam and grading** use the existing ten patterns, the existing attempt snapshot and the existing grading code (`examRandomizerService`). Nothing is duplicated.
- **The only addition is an explicit pattern assignment.** `src/utils/patternAssignment.js` gives CS001…CS005 patterns A…E. Every other student keeps the existing USN-hash assignment. Because the assignment is fixed per account, a refresh, sign-out/sign-in or new browser tab always gives the same pattern. In the Supabase exam design this is `exam_assignments.pattern_id`.
- **Admin view.** On **Admin → Candidates**, the five accounts carry a **Demo** badge and can be filtered with *All eligibility → Demo accounts*. **Reset demo attempts** clears attempts for these five accounts only, so the demo can be rehearsed and run again. It refuses any non-demo ID.

## 1. Provision the accounts in Supabase (one-time, operator machine)

**Prerequisites.** The live project has the baseline `profiles` table and migrations `003` and `004` (already required by the current login). No new migration is needed. The script also works if `005`+ are applied later: it then links the accounts to the Dr. AIT `institutions` row (`code = '1DA'`), which must exist.

Run from the repository root, on a trusted machine:

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
```

```bash
export SUPABASE_SERVICE_ROLE_KEY="<service-role key from Dashboard → Project Settings → API>"
```

```bash
node scripts/provision-demo-students.mjs --dry-run
```

```bash
node scripts/provision-demo-students.mjs
```

What the script does:
- **Creates the users.** It uses the supported Admin API (`auth.admin.createUser`) with `email_confirm: true`, so no email is sent, and tags each user `app_metadata.examsphere_demo = true`.
- **Sets the profile.** Each profile gets `role = student`, `usn = CS00x`, the name and the email.
- **Protects real accounts.** It refuses to modify **anything** if one of the five emails or IDs already belongs to a non-demo account. It checks all five before any write.
- **Is safe to re-run.** Re-running rotates the password of the existing demo accounts and creates no duplicates.

### Temporary credentials: secure handling

- **One password, shown once.** The script generates a strong temporary password (or uses `DEMO_TEMP_PASSWORD` if you set it, minimum 12 characters). It prints it **once** in the operator's terminal and shares it across the five demo accounts.
- **Never stored.** The password is **not** in the repository, the app bundle, any student-facing page or any log. Do not commit it, paste it into chat or tickets, or put it in a `VITE_*` variable.
- **Distribution.** Give it only to the demo presenter, in person or through the institution's password manager or another encrypted channel.
- **Rotation.** Re-run the script before each demo to rotate it, and run `--delete` afterwards (see step 4).
- **Service-role key.** It bypasses row-level security. Use it only in this terminal session, then `unset SUPABASE_SERVICE_ROLE_KEY`.

### Without the script (Dashboard alternative)

1. Dashboard → Authentication → Add user. Create the five emails above with *Auto Confirm User* on.
2. In the SQL editor, run this. It touches only these five users:

```sql
update public.profiles p
set full_name = v.name, usn = v.usn, role = 'student', email = v.email
from (values
  ('cs001@drait.edu.in','CS001','CS Demo 01'), ('cs002@drait.edu.in','CS002','CS Demo 02'),
  ('cs003@drait.edu.in','CS003','CS Demo 03'), ('cs004@drait.edu.in','CS004','CS Demo 04'),
  ('cs005@drait.edu.in','CS005','CS Demo 05')
) as v(email, usn, name)
join auth.users u on lower(u.email) = v.email
where p.id = u.id;
```

## 2. Signing in during the demo

1. Open ExamSphere → **Student Login**.
2. Student ID: `CS001` (any case). Password: the temporary password.
3. The dashboard shows **Paper 22CS601-A**. Start the examination, tick the acknowledgement, and the paper opens as *Pattern A*.
4. Sign out (profile menu → Sign out) and repeat with `CS002` … `CS005`.

## 3. Suggested live demo script

1. **Admin → Examinations → Pattern preview.** Click A–E. It's the same 25 questions with a different order and different option order. *Verification* shows all integrity checks passing.
2. **Sign in as CS001.** The paper opens as Pattern A; note question 1 and its options. **Refresh:** same question, same options, same answers kept. Sign out and back in: still Pattern A.
3. **Sign in as CS002 … CS005.** Patterns B–E each start with a different question.
4. **Submit one paper with a few correct answers.** **Admin → Results & Reports → View** shows it was graded against that pattern's own key. Students never see the key.
5. **After the demo,** use **Admin → Candidates → Reset demo attempts** to run it again.

**Important for the current build:** the examination, attempts and results run in the browser's storage until the Supabase exam migrations (005–010) are wired in. **Run all five sign-ins in the same browser profile on the same computer.** A different browser has its own copy of the exam. Question order per pattern is identical everywhere, but option order and attempts are not shared.

**Security note for the current build:** students never see correct answers in the UI. But while the exam engine is browser-local, the answer key sits in the browser's storage, where a technical user could read it with developer tools. Server-side keys and row-level security (`supabase/migrations/005–010`, already tested with `supabase/tests`) remove this, and should be applied before any real examination.

## 4. Cleanup

```bash
node scripts/provision-demo-students.mjs --delete
```

This deletes only users tagged `examsphere_demo = true`. If your `profiles.id` foreign key cascades (as in the reconstructed baseline `001`), their profiles go too. Otherwise, delete the five `profiles` rows with `usn` in CS001–CS005. To remove the demo candidates from the local roster, use **Admin → Candidates → remove**; they are not re-added.
