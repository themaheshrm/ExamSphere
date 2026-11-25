import { supabase } from './supabase';

/**
 * Browser side of server-side student provisioning. Calls the Edge Functions
 * with the signed-in user's session (supabase-js attaches it); the functions
 * hold the service-role key and do the authorisation. Nothing here can create
 * an account, assign a role or read another user's password on its own.
 */
async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data;
  let payload = null;
  try { payload = await error.context?.json?.(); } catch { /* not JSON */ }
  const failure = new Error(payload?.error || (error.name === 'FunctionsFetchError'
    ? 'The account service is not reachable. Check that the create-student function is deployed.'
    : 'The account service could not complete the request.'));
  failure.status = error.context?.status ?? null;
  failure.fieldErrors = payload?.fieldErrors || null;
  throw failure;
}

export const studentAccountService = {
  /** Returns { student, credentials: { studentId, email, temporaryPassword } }. Show once; never store. */
  createStudent(form) {
    const { name, usn, email, mobile, department, semester, section } = form;
    return invoke('create-student', { name, usn, email, mobile, department, semester: Number(semester), section });
  },

  /** First sign-in: replace the temporary password. Caller then refreshes the session. */
  changeTemporaryPassword({ currentPassword, newPassword }) {
    return invoke('change-temporary-password', { currentPassword, newPassword });
  },
};
