/**
 * ExamSphere Authentication Service
 * Live integration with Supabase Auth and PostgreSQL Profiles.
 */

import { supabase } from './supabase';
import { USER_ROLES } from '../utils/constants';

const TOKEN_KEY = 'examsphere_auth_token';
const USER_KEY = 'examsphere_auth_user';

// Normalizes PostgreSQL enum 'super_admin' to frontend 'super-admin'
export const normalizeRole = (dbRole) => {
  if (dbRole === 'super_admin') return USER_ROLES.SUPER_ADMIN;
  if (dbRole === 'admin') return USER_ROLES.ADMIN;
  return USER_ROLES.STUDENT;
};

// Verified Dr. AIT live Supabase accounts
export const DEMO_CREDENTIALS = {
  [USER_ROLES.SUPER_ADMIN]: {
    identifier: 'superadmin@drait.edu.in',
    password: 'superadmin@drait.edu.in',
    label: 'Super Admin',
    email: 'superadmin@drait.edu.in',
    redirectTo: '/super-admin',
  },
  [USER_ROLES.ADMIN]: {
    identifier: 'admin@drait.edu.in',
    password: 'admin@drait.edu.in',
    label: 'Institution Admin (COE)',
    email: 'admin@drait.edu.in',
    redirectTo: '/admin',
  },
  [USER_ROLES.STUDENT]: {
    identifier: '1DA22CS001',
    password: 'student@drait.edu.in',
    label: 'Candidate / Examinee',
    email: 'student@drait.edu.in',
    redirectTo: '/student',
  },
};

export const authService = {
  /**
   * Resolves login identifier (USN or Email) to an authentication email
   */
  resolveEmail(identifier, role) {
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) {
      return trimmed.toLowerCase();
    }

    // If student enters USN e.g. 1DA22CS001
    const studentDemo = DEMO_CREDENTIALS[USER_ROLES.STUDENT];
    if (trimmed.toUpperCase() === studentDemo.identifier.toUpperCase()) {
      return studentDemo.email;
    }

    // Default institutional format if candidate enters their roll number
    return `${trimmed.toLowerCase()}@drait.edu.in`;
  },

  /**
   * Submit credentials to Supabase Auth and fetch verified database profile
   */
  async login({ identifier, password, role, remember = false }) {
    const email = this.resolveEmail(identifier, role);

    // 1. Authenticate against Supabase Auth service
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError) {
      throw new Error(authError.message || 'Invalid login credentials.');
    }

    const authUser = authData.user;
    const session = authData.session;

    // 2. Query user profile from PostgreSQL profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (profileError || !profile) {
      // Fallback if profile row is not yet queryable
      console.warn('Profile read warning:', profileError);
    }

    const userRole = normalizeRole(profile?.role || role);

    const userObj = {
      id: authUser.id,
      name: profile?.full_name || authUser.user_metadata?.full_name || email.split('@')[0],
      email: authUser.email,
      identifier: profile?.usn || email,
      usn: profile?.usn || null,
      role: userRole,
      institution_id: profile?.institution_id || null,
      institution: profile?.institution_id ? 'Apex Engineering University (Dr. AIT)' : 'ExamSphere Global Cloud',
    };

    const token = session?.access_token || `jwt-supabase-${Date.now()}`;
    this.setToken(token, remember);
    this.setUser(userObj, remember);

    const targetRoute =
      userRole === USER_ROLES.SUPER_ADMIN
        ? '/super-admin'
        : userRole === USER_ROLES.ADMIN
        ? '/admin'
        : '/student';

    return {
      token,
      user: userObj,
      redirectTo: targetRoute,
    };
  },

  /**
   * 1-Click live login using verified accounts
   */
  async demoLogin(role) {
    const creds = DEMO_CREDENTIALS[role];
    if (!creds) throw new Error(`Role profile '${role}' not found.`);

    return this.login({
      identifier: creds.email,
      password: creds.password,
      role,
      remember: false,
    });
  },

  /**
   * Request password reset via Supabase Auth
   */
  async requestPasswordReset({ identifier, role }) {
    const email = this.resolveEmail(identifier, role);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      success: true,
      message: `Password reset instructions have been dispatched to ${email}.`,
    };
  },

  /**
   * Token and user session management
   */
  getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  },

  setToken(token, remember = false) {
    if (remember) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
    }
  },

  getUser() {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setUser(user, remember = false) {
    const serialized = JSON.stringify(user);
    if (remember) {
      localStorage.setItem(USER_KEY, serialized);
    } else {
      sessionStorage.setItem(USER_KEY, serialized);
    }
  },

  clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
