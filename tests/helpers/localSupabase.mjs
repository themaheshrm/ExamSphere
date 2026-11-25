/**
 * A complete local stand-in for the ExamSphere Supabase project, for tests:
 *   - a fresh PostgreSQL database with migrations 001–013 + seed/001 applied
 *   - Auth (mockSupabase.mjs) whose users are mirrored into auth.users
 *   - PostgREST semantics over that database (pgRest.mjs; real RLS/RPCs)
 *   - the three Edge Functions running their real code
 * Requires a DISPOSABLE PostgreSQL reachable with the PG* environment
 * variables (superuser, e.g. PGHOST=127.0.0.1 PGUSER=postgres). Never point
 * it at a real project.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startMockSupabase } from './mockSupabase.mjs';
import { createPgRest } from './pgRest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { createClient } = require('@supabase/supabase-js');
const pg = require('pg');

export const SERVICE_KEY = 'local-test-service-key';
export const ANON_KEY = 'local-test-anon-key';
export const DRAIT_CODE = '1DA';

function psql(database, file) {
  const r = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-d', database, '-f', file], { encoding: 'utf8', env: { PGUSER: 'postgres', ...process.env } });
  if (r.status !== 0) throw new Error(`psql ${path.basename(file)} failed: ${r.stderr || r.stdout}`);
}

/** The test shim with role creation made idempotent (roles are cluster-wide). */
function shimFile() {
  const shim = readFileSync(path.join(ROOT, 'supabase/tests/000_supabase_shim.sql'), 'utf8')
    .replace(/^CREATE ROLE ([a-z_]+)(.*);$/gm, (_m, role, rest) => `DO $$ BEGIN CREATE ROLE ${role}${rest}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  const dir = mkdtempSync(path.join(tmpdir(), 'examsphere-shim-'));
  const file = path.join(dir, 'shim.sql');
  writeFileSync(file, shim);
  return file;
}

export async function buildDatabase(database) {
  const admin = new pg.Client({ database: 'postgres', user: process.env.PGUSER || 'postgres' });
  await admin.connect();
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [database]);
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.query(`CREATE DATABASE ${database}`);
  await admin.end();
  psql(database, shimFile());
  const migrations = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of migrations) psql(database, path.join(ROOT, 'supabase/migrations', f));
  psql(database, path.join(ROOT, 'supabase/seed/001_drait_catalogue.sql'));
  // Re-run 013 now that the institution exists (creates the demo pattern pins).
  psql(database, path.join(ROOT, 'supabase/migrations/013_examination_engine_integration.sql'));
}

export async function startLocalSupabase({ port = 0, database = 'examsphere_e2e', log = () => {} } = {}) {
  const { handleCreateStudent, handleChangeTemporaryPassword } = await import('../../supabase/functions/_shared/studentAccounts.js');
  const { handleManageAdmins } = await import('../../supabase/functions/_shared/adminAccounts.js');
  await buildDatabase(database);
  const pool = new pg.Pool({ database, user: process.env.PGUSER || 'postgres', max: 8 });
  const sql = (text, params) => pool.query(text, params).then((r) => r.rows);
  const functions = {};
  const mock = await startMockSupabase({
    port,
    serviceKey: SERVICE_KEY,
    functions,
    rest: createPgRest(pool),
    hooks: {
      created: (u) => sql('INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES ($1, $2, $3, $4)', [u.id, u.email, u.app_metadata || {}, u.user_metadata || {}]),
      updated: (u) => sql('UPDATE auth.users SET raw_app_meta_data = $2 WHERE id = $1', [u.id, u.app_metadata || {}]),
      deleted: (u) => sql('DELETE FROM auth.users WHERE id = $1', [u.id]),
    },
  });
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(mock.url, SERVICE_KEY, opts);
  const verifyPassword = async (email, password) => !(await createClient(mock.url, ANON_KEY, opts).auth.signInWithPassword({ email, password })).error;
  functions['create-student'] = (req) => handleCreateStudent(req, { admin, log });
  functions['change-temporary-password'] = (req) => handleChangeTemporaryPassword(req, { admin, verifyPassword, log });
  functions['manage-admins'] = (req) => handleManageAdmins(req, { admin, log });

  const [{ id: institutionId }] = await sql('SELECT id FROM public.institutions WHERE code = $1', [DRAIT_CODE]);
  const [{ id: departmentId }] = await sql("SELECT id FROM public.departments WHERE institution_id = $1 AND code = 'CS'", [institutionId]);

  /** Create an Auth user (mirrored into auth.users → profile via the signup trigger). */
  async function createUser({ email, password, appMetadata = {}, name }) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name }, app_metadata: { full_name: name, institution_id: institutionId, ...appMetadata } });
    if (error) throw error;
    return data.user;
  }
  async function createStudent({ usn, name, password, semester = 6, section = 'D' }) {
    const user = await createUser({ email: `${usn.toLowerCase()}@drait.edu.in`, password, name, appMetadata: { role: 'student', usn, department_id: departmentId } });
    await sql('INSERT INTO public.student_details (profile_id, institution_id, semester, section) VALUES ($1, $2, $3, $4)', [user.id, institutionId, semester, section]);
    return user;
  }
  async function createAdmin({ staffId, name, password, subjectCode = null, email }) {
    const user = await createUser({ email: email || `${staffId.toLowerCase()}@drait.edu.in`, password, name, appMetadata: { role: 'admin', staff_id: staffId, ...(subjectCode ? { subject_code: subjectCode, admin_type: 'subject' } : {}) } });
    if (subjectCode) {
      await sql(`INSERT INTO public.subject_admins (admin_id, subject_id, institution_id)
                 SELECT $1, id, institution_id FROM public.subjects WHERE institution_id = $2 AND code = $3`, [user.id, institutionId, subjectCode]);
    }
    return user;
  }
  async function createSuperAdmin({ email, name, password }) {
    const user = await createUser({ email, password, name, appMetadata: { role: 'admin' } });
    await sql("UPDATE public.profiles SET role = 'super_admin', institution_id = NULL, staff_id = NULL WHERE id = $1", [user.id]);
    return user;
  }

  return {
    url: mock.url, mock, pool, sql, admin, institutionId, departmentId,
    createUser, createStudent, createAdmin, createSuperAdmin,
    close: async () => {
      await mock.close();
      await pool.end();
      // Drop the throwaway database so cluster-wide test roles can be reset later.
      const admin = new pg.Client({ database: 'postgres', user: process.env.PGUSER || 'postgres' });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`).catch(() => {});
      await admin.end();
    },
  };
}
