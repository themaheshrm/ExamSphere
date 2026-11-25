/**
 * Subject-scoped demo administrators (Examination Office, Dr. AIT).
 *
 * Each account is a normal `admin` profile signing in through the existing
 * Administrator login (staff ID → resolve_login_identifier → Supabase Auth).
 * The only difference from an institution-wide admin is its subject scope.
 * No credentials live here; see scripts/provision-demo-admins.mjs.
 */
export const DEMO_ADMINS = [
  { staffId: 'ADMIN001', name: 'Admin 01', subjectCode: '22CS302' },
  { staffId: 'ADMIN002', name: 'Admin 02', subjectCode: '22CS402' },
  { staffId: 'ADMIN003', name: 'Admin 03', subjectCode: '22CS403' },
  { staffId: 'ADMIN004', name: 'Admin 04', subjectCode: '22CS502' },
  { staffId: 'ADMIN005', name: 'Admin 05', subjectCode: '22CS304' },
].map((a) => ({ ...a, email: `${a.staffId.toLowerCase()}@drait.edu.in` }));

const BY_STAFF_ID = new Map(DEMO_ADMINS.map((a) => [a.staffId, a]));

export function demoAdmin(staffId) {
  return BY_STAFF_ID.get(String(staffId ?? '').trim().toUpperCase()) || null;
}
