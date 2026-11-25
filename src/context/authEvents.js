/**
 * What the auth provider does for each Supabase auth event (pure, unit-tested).
 *   hydrate     – rebuild the user from the session (re-verifies the profile)
 *   force       – even if this user is already hydrated
 *   keepOnError – a failed re-read keeps the current, already verified user
 *                 (token refresh mid-examination must not sign the user out)
 *   signOut     – clear the user
 */
export function sessionEventAction(event) {
  switch (event) {
    case 'SIGNED_IN': return { hydrate: true, force: false, keepOnError: false };
    case 'PASSWORD_RECOVERY': return { hydrate: true, force: true, keepOnError: false };
    case 'TOKEN_REFRESHED': return { hydrate: true, force: true, keepOnError: true };
    case 'USER_UPDATED': return { hydrate: true, force: true, keepOnError: false };
    case 'SIGNED_OUT': return { signOut: true };
    default: return {};
  }
}
