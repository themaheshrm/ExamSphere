# Demo CS student accounts

Six ordinary student accounts:
- **CS001–CS005:** show, live, that every candidate gets the **same 25 questions** in a **different order** with **independently shuffled options**.
- **CS006:** the dedicated account for walking through how one student takes an examination end to end (see §5).

| Name | Student ID (login) | Branch | Sign-in email | Assigned pattern | Paper code |
|---|---|---|---|---|---|
| CS Demo 01 | `CS001` | CSE | cs001@drait.edu.in | A | 22CS601-A |
| CS Demo 02 | `CS002` | CSE | cs002@drait.edu.in | B | 22CS601-B |
| CS Demo 03 | `CS003` | CSE | cs003@drait.edu.in | C | 22CS601-C |
| CS Demo 04 | `CS004` | CSE | cs004@drait.edu.in | D | 22CS601-D |
| CS Demo 05 | `CS005` | CSE | cs005@drait.edu.in | E | 22CS601-E |
| CS Demo 06 | `CS006` | CSE | cs006@drait.edu.in | F | 22CS601-F (exam walkthrough) |

The source of truth for this table is `src/data/demoAccounts.js`.

## How they work (no special login path)

- **Sign-in** goes through the normal ExamSphere login: Student tab → Student ID → `resolve_login_identifier` → Supabase `signInWithPassword` → verified `profiles` row (`role = student`, `usn = CS00x`). Nothing is bypassed.
- **Exam and grading** run in Supabase: the server generates the ten patterns, keeps the answer keys and grades each submission (`docs/EXAM_ENGINE_SUPABASE.md`). CS001–CS006 are pinned to patterns A–F by `pattern_pins` (migration 013).
- **The only addition is an explicit pattern assignment.** `src/utils/patternAssignment.js` gives CS001…CS005 patterns A…E. Every other student keeps the existing USN-hash assignment. Because the assignment is fixed per account, a refresh, sign-out/sign-in or new browser tab always gives the same pattern. In the Supabase exam design this is `exam_assignments.pattern_id`.
- **Admin view.** On **Admin → Candidates**, the six accounts carry a **Demo** badge and can be filtered with *All eligibility → Demo accounts*. **Reset demo attempts** clears attempts for these demo accounts only, so the demo can be rehearsed and run again. It refuses any non-demo ID.

## 1. Provision the accounts in Supabase (one-time, operator machine)

**Prerequisites.**
- **Required columns.** The baseline `profiles` table with `id`, `role`, `full_name` and `usn`. `email`, `staff_id` and `institution_id` are written only if they exist.
- **No migrations needed.** Migrations 003/004 are not needed and are not applied on the live project. Login uses the `cs00x@drait.edu.in` fallback.
- **Institution link.** If `005`+ are applied later, the script links the accounts to the Dr. AIT `institutions` row (`code = '1DA'`), which must exist.
- **Read-only first.** `--dry-run` performs the real read-only schema and duplicate checks and writes nothing.
- **Repair.** If an earlier run created a demo user but failed on its profile, re-running repairs it without creating a duplicate.

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
- **Protects real accounts.** It refuses to modify **anything** if one of the emails or IDs it is processing already belongs to a non-demo account. It checks every account in the run before any write.
- **Is safe to re-run.** Re-running rotates the password of the existing demo accounts and creates no duplicates.

### Temporary credentials: secure handling

- **One password, shown once.** The script generates a strong temporary password (or uses `DEMO_TEMP_PASSWORD` if you set it, minimum 12 characters). It prints it **once** in the operator's terminal and shares it across the accounts processed in that run. **A full run rotates the password of every demo account it processes**, so use `--only` to add CS006 without touching CS001–CS005 (§5).
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

**Cross-device:** attempts, answers and results are stored in Supabase, so a student can resume on any browser or device. This needs migrations 003–013 and the catalogue seed applied (`docs/EXAM_ENGINE_SUPABASE.md` §3).

**Security:** answer keys never reach the browser. Papers carry no key, option permutation or question ids, and grading happens in the database.

## 4. Cleanup

```bash
node scripts/provision-demo-students.mjs --delete
```

This deletes only users tagged `examsphere_demo = true`. If your `profiles.id` foreign key cascades (as in the reconstructed baseline `001`), their profiles go too. Otherwise, delete the five `profiles` rows with `usn` in CS001–CS005. To remove the demo candidates from the local roster, use **Admin → Candidates → remove**; they are not re-added.

## 5. CS006: dedicated exam-walkthrough account

| Field | Value |
|---|---|
| Name | CS Demo 06 |
| Login ID | `CS006` (Student Login; any case) |
| Sign-in email | cs006@drait.edu.in |
| Branch / role | CSE · student |
| Institution | Dr. Ambedkar Institute of Technology |
| Examination | 22CS601 Software Engineering & Cloud Architecture (the existing demo examination) |
| Pattern | **F**: paper `22CS601-F`. CS001–CS005 keep A–E. On a published subject examination CS006 also gets pattern F. |

- **Ordinary account.** CS006 is an ordinary student account with an explicit pattern assignment (`src/data/demoAccounts.js`). There is no special login path, and grading is the normal pattern-F answer key.
- **Roster.** Browsers that already hold CS001–CS005 gain CS006 on the next load; existing entries are unchanged.

### Provision only CS006 (operator machine)

Use `--only CS006` so that CS001–CS005 are **not** checked, changed or given a new password:

```bash
node scripts/provision-demo-students.mjs --only CS006 --dry-run
```

```bash
node scripts/provision-demo-students.mjs --only CS006
```

```bash
unset SUPABASE_SERVICE_ROLE_KEY
```

- **Dry run.** It shows the detected `profiles` columns and `Scope: CS006 only`, then *would create* (or the conflicts, ending with *Nothing was changed*).
- **Real run.** It creates the user tagged `examsphere_demo`, sets the profile (`role = student`, `usn = CS006`, name; `email`/`institution_id` only if those columns exist) and prints **CS006's own temporary password once**.
- **Re-running** rotates only CS006's password and never creates a duplicate.
- **Cleanup:** `node scripts/provision-demo-students.mjs --only CS006 --delete`.

### Walkthrough script

1. **Student Login** → `CS006` + temporary password. The dashboard shows *CS Demo 06 · CS006* and **Paper 22CS601-F**.
2. **My Examinations:** 22CS601 is *Open now*. **Instructions & venue** shows the instructions and venue.
3. **Start examination.** The instructions screen appears first; *Start* is disabled until you tick the acknowledgement.
4. **The paper** opens as *Pattern F*, with its own question order and option order.
5. **Navigate:**
   - *Save & next* and *Previous*;
   - the **Questions** palette (jump to any question);
   - keyboard: `A`–`D` select an option, `N`/`P` move, `M` marks.
6. **Answers:** select an option, then click another to change it. *Clear response* removes the answer.
7. **Review:** *Mark for review & next* marks a question; *Unmark* (or `M`) undoes it. Answered-and-marked questions are still evaluated.
8. **Status:** the palette shows *Answered*, *Not answered*, *Not visited*, *Marked* and *Answered & marked* counts. A refresh, or sign-out and sign-in, keeps the same pattern and answers.
9. **Submit examination** shows a summary (answered, not answered, not visited, marked). **Submit answer sheet** shows *Answer sheet submitted successfully* with paper `22CS601-F` and a reference number.
10. **Results** follow the super admin's *Result display* setting (Super Admin → Settings):
    - **Immediate:** the provisional score appears on the confirmation and in *Results & History*.
    - **Withheld:** the student sees only that the answer sheet was recorded.
11. **Admin view:** *Results & Reports* lists CS006 on `22CS601-F` with the same score. A second attempt is blocked.
12. **To run the walkthrough again:** Admin → Candidates → **Reset demo attempts**. This clears demo accounts only; patterns are unchanged.

**Students never see an answer key or correct answers.** Keys stay in admin-only tables protected by row-level security.
