/**
 * ExamSphere Authentication Service
 * Secure integration with Supabase Auth — profiles are the sole source of role truth.
 *
 * Security invariants:
 *   - Role is NEVER accepted from client input or fallback defaults.
 *   - A missing or unreadable profile row rejects the login.
 *   - USN and Admin ID resolution queries the profiles table, not a hardcoded map.
 *   - Supabase session is the only token — no parallel localStorage copies.
 *   - No demo credentials or 1-click bypass exist in this module.
 */

import { supabase } from './supabase';
import { USER_ROLES } from '../utils/constants';

// ─── Allowed DB role values → frontend enum ────────────────────────────────
const DB_ROLE_MAP = {
  super_admin: USER_ROLES.SUPER_ADMIN,
  admin: USER_ROLES.ADMIN,
  student: USER_ROLES.STUDENT,
};

/**
 * Strictly maps a database enum to its frontend constant.
 * Returns null for any unknown or missing value — the caller MUST reject null.
 */
export function normalizeRole(dbRole) {
  return DB_ROLE_MAP[dbRole] ?? null;
}

// ─── Role → dashboard path mapping ─────────────────────────────────────────
const ROLE_ROUTES = {
  [USER_ROLES.SUPER_ADMIN]: '/super-admin',
  [USER_ROLES.ADMIN]: '/admin',
  [USER_ROLES.STUDENT]: '/student',
};

export function getRouteForRole(role) {
  return ROLE_ROUTES[role] || '/login';
}

// ─── Profile fetcher (reused by login + session rehydration) ────────────────
/**
 * Fetches and validates the profiles row for the given auth user id.
 * Throws on any failure — callers must catch and reject the session.
 */
export async function fetchVerifiedProfile(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, usn, staff_id, institution_id')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw new Error(
      'Your account does not have a valid profile. Contact your institution administrator.'
    );
  }

  const role = normalizeRole(profile.role);
  if (!role) {
    throw new Error(
      `Unrecognized account role "${profile.role}". Contact your platform administrator.`
    );
  }

  return { profile, role };
}

/**
 * Builds the user object exposed to the UI from a verified profile + auth email.
 * This is the ONLY place the user shape is defined.
 */
export function buildUserObject(authUser, profile, role) {
  return {
    id: authUser.id,
    name: profile.full_name || authUser.email?.split('@')[0] || 'User',
    email: authUser.email,
    identifier: profile.usn || profile.staff_id || authUser.email,
    usn: profile.usn || null,
    staffId: profile.staff_id || null,
    role,
    institution_id: profile.institution_id || null,
  };
}

// ─── Identifier resolution ──────────────────────────────────────────────────

/**
 * Resolves a student USN to the auth email by querying the profile_email_lookup view.
 * Falls back to treating the identifier as a direct email if it already contains '@'.
 *
 * The view is accessible to anon (pre-auth) and exposes only usn/staff_id/email.
 * If the view does not exist yet (migration not run), the student must use their email.
 */
async function resolveStudentIdentifier(identifier) {
  const trimmed = identifier.trim();

  // Already an email — use it directly.
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  // Query the lookup view for a matching USN
  const { data, error } = await supabase
    .from('profile_email_lookup')
    .select('email')
    .ilike('usn', trimmed)
    .single();

  if (error || !data?.email) {
    throw new Error(
      `No account found for USN "${trimmed.toUpperCase()}". Verify your USN or use your registered email to sign in.`
    );
  }

  return data.email.toLowerCase();
}

/**
 * Resolves an admin identifier (staff ID or email) to the auth email.
 * If the identifier contains '@', it is treated as an email directly.
 * Otherwise queries the profile_email_lookup view for a matching staff_id.
 */
async function resolveAdminIdentifier(identifier) {
  const trimmed = identifier.trim();

  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  // Query the lookup view for a matching staff_id
  const { data, error } = await supabase
    .from('profile_email_lookup')
    .select('email')
    .ilike('staff_id', trimmed)
    .single();

  if (error || !data?.email) {
    throw new Error(
      `No staff account found for ID "${trimmed}". Verify your Staff ID or use your official email to sign in.`
    );
  }

  return data.email.toLowerCase();
}

/**
 * Resolves a super-admin identifier to an email.
 * Super admins must always use their email — no alternative ID scheme.
 */
function resolveSuperAdminIdentifier(identifier) {
  const trimmed = identifier.trim();
  if (!trimmed.includes('@')) {
    throw new Error('Super Admin login requires a valid email address.');
  }
  return trimmed.toLowerCase();
}

// ─── Public auth service ────────────────────────────────────────────────────
export const authService = {
  /**
   * Resolves any identifier to an auth email based on the login-form role context.
   * The role param is used ONLY for identifier resolution — never for authorization.
   */
  async resolveEmail(identifier, role) {
    switch (role) {
      case USER_ROLES.STUDENT:
        return resolveStudentIdentifier(identifier);
      case USER_ROLES.ADMIN:
        return resolveAdminIdentifier(identifier);
      case USER_ROLES.SUPER_ADMIN:
        return resolveSuperAdminIdentifier(identifier);
      default:
        throw new Error('Invalid login context.');
    }
  },

  /**
   * Authenticates against Supabase Auth, then fetches and validates the
   * database profile. Rejects immediately if the profile is missing or
   * the role is invalid.
   *
   * Returns { user, redirectTo } on success.
   * Throws on any failure.
   */
  async login({ identifier, password, role }) {
    // 1. Resolve the identifier to an email (may query DB for USN/staff_id)
    const email = await this.resolveEmail(identifier, role);

    // 2. Authenticate with Supabase Auth
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      throw new Error(authError.message || 'Invalid login credentials.');
    }

    if (!authData.session?.access_token) {
      throw new Error('Authentication succeeded but no session was created.');
    }

    // 3. Fetch and validate the database profile (role comes ONLY from here)
    const { profile, role: verifiedRole } = await fetchVerifiedProfile(
      authData.user.id
    );

    // 4. Build the canonical user object
    const user = buildUserObject(authData.user, profile, verifiedRole);

    return {
      user,
      redirectTo: getRouteForRole(verifiedRole),
    };
  },

  /**
   * Request password reset via Supabase Auth.
   */
  async requestPasswordReset({ identifier, role }) {
    const email = await this.resolveEmail(identifier, role);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      success: true,
      message: `Password reset instructions have been sent to ${email}.`,
    };
  },
};
