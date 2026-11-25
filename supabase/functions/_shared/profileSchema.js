/**
 * Shared, read-only helpers for the provisioning scripts and Edge Functions
 * (plain JavaScript, no imports: runs under Node and Deno).
 *
 * The live `public.profiles` table may predate migrations 003/004 (which add
 * `email` and `staff_id`). These helpers detect which columns actually exist
 * and make every lookup/write use only those columns. They never add columns,
 * apply migrations or write anything themselves.
 */

/** Columns every ExamSphere profile must have (baseline used by the app). */
export const REQUIRED_PROFILE_COLUMNS = ['id', 'role', 'full_name'];
/** Columns added by later migrations; used only when present. */
export const OPTIONAL_PROFILE_COLUMNS = ['email', 'staff_id', 'usn', 'institution_id'];

const errText = (error) => `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;

export function isMissingColumn(error) {
  return error?.code === '42703' || error?.code === 'PGRST204'
    || /column .* does not exist|Could not find the '.*' column/i.test(errText(error));
}

export function isMissingTable(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205'
    || /relation .* does not exist|Could not find the table|schema cache/i.test(errText(error));
}

/**
 * Probe each profiles column with a zero-row SELECT (read-only).
 * Throws if the table or a required column is missing, or on any other error.
 */
export async function detectProfileSchema(supabase, { required = [], optional = [] } = {}) {
  const mustHave = [...new Set([...REQUIRED_PROFILE_COLUMNS, ...required])];
  const present = new Set();
  for (const column of [...new Set([...mustHave, ...OPTIONAL_PROFILE_COLUMNS, ...optional])]) {
    const { error } = await supabase.from('profiles').select(column).limit(0);
    if (!error) { present.add(column); continue; }
    if (isMissingTable(error) && !isMissingColumn(error)) {
      throw new Error('Table public.profiles was not found. The ExamSphere baseline schema must exist before provisioning.');
    }
    if (!isMissingColumn(error)) throw new Error(`Could not inspect profiles.${column}: ${error.message}`);
  }
  const missingRequired = mustHave.filter((c) => !present.has(c));
  if (missingRequired.length) {
    throw new Error(`profiles is missing required column(s): ${missingRequired.join(', ')}. No changes were made; this script never alters the schema.`);
  }
  return {
    has: (column) => present.has(column),
    present: [...present],
    missing: OPTIONAL_PROFILE_COLUMNS.filter((c) => !present.has(c)),
  };
}

/** Keep only fields whose column exists. */
export function pickExistingColumns(schema, fields) {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => schema.has(key)));
}

/** Escape LIKE wildcards so a lookup value is matched literally (case-insensitive). */
const literalLike = (value) => String(value).replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Profiles whose `column` equals `value` (case-insensitive). Returns [] when the
 * column does not exist, so a missing column never blocks or weakens other checks.
 */
export async function findProfilesBy(supabase, schema, column, value) {
  if (!schema.has(column) || value == null || value === '') return [];
  // PostgREST also treats `*` as a LIKE wildcard; refuse rather than match loosely.
  if (String(value).includes('*')) throw new Error(`Refusing lookup with a wildcard character: ${column}`);
  const select = ['id', 'role', ...(schema.has('email') ? ['email'] : [])].join(',');
  const { data, error } = await supabase.from('profiles').select(select).ilike(column, literalLike(value));
  if (error) throw new Error(`Could not check profiles.${column} for ${value}: ${error.message}`);
  return data || [];
}

export async function getProfileById(supabase, schema, id) {
  if (!id) return null;
  const { data, error } = await supabase.from('profiles').select(schema.present.join(',')).eq('id', id).maybeSingle();
  if (error) throw new Error(`Could not read profile ${id}: ${error.message}`);
  return data || null;
}

/** Update the profile row of `userId` (only existing columns), inserting it if absent. */
export async function upsertProfileRow(supabase, schema, userId, fields, label) {
  const values = pickExistingColumns(schema, fields);
  const { data, error } = await supabase.from('profiles').update(values).eq('id', userId).select('id');
  if (error) throw new Error(`Profile update failed for ${label}: ${error.message}`);
  if (data?.length) return 'updated';
  const { error: insertError } = await supabase.from('profiles').insert({ id: userId, ...values });
  if (insertError) throw new Error(`Profile insert failed for ${label}: ${insertError.message}`);
  return 'inserted';
}

export async function findAuthUserByEmail(supabase, email) {
  const target = String(email).toLowerCase();
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  throw new Error('Too many auth users to scan safely; aborting without changes.');
}

/**
 * Dr. AIT institution id, or null when the institutions table (migration 005)
 * or profiles.institution_id does not exist. Throws if the table exists without
 * the Dr. AIT row.
 */
export async function drAitInstitutionId(supabase, schema) {
  if (!schema.has('institution_id')) return null;
  const { data, error } = await supabase.from('institutions').select('id').eq('code', '1DA').maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`Could not read institutions: ${error.message}`);
  }
  if (!data) throw new Error('Table public.institutions exists but has no Dr. AIT row (code 1DA). Seed it first.');
  return data.id;
}

/**
 * Pre-flight check for one demo account. Read-only. Returns
 * { existing, profile, conflicts[] } — any conflict means "touch nothing".
 *   - the auth email belongs to a non-demo user;
 *   - the login identifier (staff_id / usn) or email is used by another profile;
 *   - the demo user's own profile carries a different login identifier.
 */
export async function checkDemoAccount(supabase, schema, { email, identifierColumn, identifier }) {
  const conflicts = [];
  const existing = await findAuthUserByEmail(supabase, email);
  if (existing && existing.app_metadata?.examsphere_demo !== true) {
    conflicts.push(`${email} already exists in Auth and is NOT a demo account`);
  }
  const ownId = existing?.app_metadata?.examsphere_demo === true ? existing.id : null;
  for (const p of await findProfilesBy(supabase, schema, identifierColumn, identifier)) {
    if (p.id !== ownId) conflicts.push(`${identifierColumn} ${identifier} is already used by profile ${p.id} (role ${p.role})`);
  }
  for (const p of await findProfilesBy(supabase, schema, 'email', email)) {
    if (p.id !== ownId) conflicts.push(`email ${email} is already used by profile ${p.id} (role ${p.role})`);
  }
  const profile = ownId ? await getProfileById(supabase, schema, ownId) : null;
  if (profile && schema.has(identifierColumn) && profile[identifierColumn]
      && String(profile[identifierColumn]).toUpperCase() !== String(identifier).toUpperCase()) {
    conflicts.push(`demo profile ${ownId} already has ${identifierColumn} ${profile[identifierColumn]}`);
  }
  return { existing: ownId ? existing : existing || null, profile, conflicts };
}

export function describeSchema(schema) {
  const missing = schema.missing.length ? schema.missing.join(', ') : 'none';
  return `profiles columns found: ${schema.present.join(', ')} · optional columns missing: ${missing}`;
}
