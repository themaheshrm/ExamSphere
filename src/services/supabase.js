import { createClient } from '@supabase/supabase-js';

// Vite injects import.meta.env in the browser; Node-based integration tests
// (tests/engine.integration.test.js) provide the same names via process.env.
const env = import.meta.env || globalThis.process?.env || {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Captured before the client consumes it: a recovery link that failed or
// expired arrives as #error=…&error_description=… (read by ResetPasswordPage).
export const initialAuthHash = typeof window !== 'undefined' ? window.location.hash : '';

export const supabase = createClient(supabaseUrl, supabaseKey);
