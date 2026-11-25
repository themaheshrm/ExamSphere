/**
 * Pure helpers that shape the signed-in user for the UI (no Supabase client
 * import, so they can be unit-tested under Node).
 */

/**
 * Builds the user object exposed to the UI from a verified profile + auth email.
 * This is the ONLY place the user shape is defined.
 */
export function buildUserObject(authUser, profile, role, accessToken = null) {
  // Claims of the signed access token. The same token authorised the profile
  // read in fetchVerifiedProfile, so a forged token never gets this far —
  // unlike `authUser`, which on reload comes from browser storage.
  const claims = decodeJwtClaims(accessToken);
  const signedStaffId = claims?.app_metadata?.staff_id || null;
  const staffId = profile.staff_id || signedStaffId || null;
  return {
    id: authUser.id,
    name: profile.full_name || authUser.email?.split('@')[0] || 'User',
    email: authUser.email,
    identifier: profile.usn || staffId || authUser.email,
    usn: profile.usn || null,
    staffId,
    role,
    institution_id: profile.institution_id || null,
    // Set by the server (create-student) for accounts with a temporary
    // password; cleared only by change-temporary-password. Read from the
    // signed token so it cannot be removed by editing browser storage.
    mustChangePassword: claims?.app_metadata?.must_change_password === true,
    // Every identity signal used to resolve a subject-admin scope. More
    // signals can only narrow access (see adminScope.getAdminScope).
    scopeSignals: {
      staffIds: [profile.staff_id, signedStaffId].filter(Boolean),
      emails: [claims?.email, authUser.email].filter(Boolean),
      // Server-managed assignment (manage-admins), from the signed token only.
      adminType: claims?.app_metadata?.admin_type || null,
      subjectCode: claims?.app_metadata?.subject_code || null,
    },
  };
}

/** Payload of a JWT (no signature check here; the server already verified it). */
export function decodeJwtClaims(token) {
  if (typeof token !== 'string') return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = decodeURIComponent(Array.from(atob(base64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    const claims = JSON.parse(json);
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}
