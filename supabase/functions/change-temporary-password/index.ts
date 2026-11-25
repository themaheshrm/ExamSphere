// Edge Function: first-login password change for accounts created with a
// temporary password. Verifies the current (temporary) password, sets the new
// one and clears app_metadata.must_change_password (server-only metadata).
// Logic and safeguards: ../_shared/studentAccounts.js
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleChangeTemporaryPassword } from '../_shared/studentAccounts.js';

const url = Deno.env.get('SUPABASE_URL')!;
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, clientOptions);
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
const log = (message: string, fields: Record<string, unknown>) => console.info(message, JSON.stringify(fields));

// Re-authenticates with the current password on a throwaway client (no session kept).
async function verifyPassword(email: string, password: string) {
  const { error } = await createClient(url, anonKey, clientOptions).auth.signInWithPassword({ email, password });
  return !error;
}

Deno.serve((request) => handleChangeTemporaryPassword(request, { admin, verifyPassword, allowedOrigins, log }));
