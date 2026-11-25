// Edge Function: super-admin management of administrator accounts
// (list, create, assign subject, reset password, activate/deactivate).
// The service-role key comes from the function's server environment (set by
// Supabase) and never reaches the browser. Logic: ../_shared/adminAccounts.js
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleManageAdmins } from '../_shared/adminAccounts.js';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
// Logs carry ids and actions only — never passwords.
const log = (message: string, fields: Record<string, unknown>) => console.info(message, JSON.stringify(fields));

Deno.serve((request) => handleManageAdmins(request, { admin, allowedOrigins, log }));
