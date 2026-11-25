import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Captured before the client consumes it: a recovery link that failed or
// expired arrives as #error=…&error_description=… (read by ResetPasswordPage).
export const initialAuthHash = typeof window !== 'undefined' ? window.location.hash : '';

export const supabase = createClient(supabaseUrl, supabaseKey);
