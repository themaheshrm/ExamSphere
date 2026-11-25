/**
 * Runs the local Supabase stand-in (tests/helpers/localSupabase.mjs) as a
 * long-lived server for manual or browser testing of the real app:
 *
 *   PGHOST=127.0.0.1 PGUSER=postgres node tests/helpers/serveLocalSupabase.mjs
 *   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=local-test-anon-key npx vite
 *
 * Creates throwaway accounts (password from LOCAL_TEST_PASSWORD, default below)
 * in a DISPOSABLE local database. Never point it at a real project.
 */
import { startLocalSupabase } from './localSupabase.mjs';

const password = process.env.LOCAL_TEST_PASSWORD || 'Local-Test-Passw0rd!';
const env = await startLocalSupabase({ port: Number(process.env.PORT || 54321), database: 'examsphere_local' });
await env.createSuperAdmin({ email: 'root@examsphere.io', name: 'Platform Administrator', password });
await env.createAdmin({ staffId: 'ADM-8942', name: 'Dr. Ramesh B.', password, email: 'admin@drait.edu.in' });
for (const [staffId, code] of [['ADMIN001', '22CS302'], ['ADMIN002', '22CS402'], ['ADMIN003', '22CS403'], ['ADMIN004', '22CS502'], ['ADMIN005', '22CS304']]) {
  await env.createAdmin({ staffId, name: `Admin ${staffId.slice(-2)}`, password, subjectCode: code });
}
for (const usn of ['CS001', 'CS002', 'CS003', 'CS004', 'CS005', 'CS006', '1DA22CS001', '1DA22CS002']) {
  await env.createStudent({ usn, name: usn.startsWith('CS') ? `CS Demo ${usn.slice(-2)}` : `Student ${usn.slice(-3)}`, password });
}
console.log(`Local Supabase ready at ${env.url}`);
const stop = async () => { await env.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
