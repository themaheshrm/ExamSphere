// Edge Function: create a student account (Supabase Auth user + profile).
// The service-role key is read from the function's server environment
// (set automatically by Supabase); it is never sent to the browser.
// Logic and safeguards: ../_shared/studentAccounts.js
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCreateStudent } from '../_shared/studentAccounts.js';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
// Logs carry the Student ID and caller id only — never passwords.
const log = (message: string, fields: Record<string, unknown>) => console.info(message, JSON.stringify(fields));

Deno.serve((request) => handleCreateStudent(request, { admin, allowedOrigins, log }));
