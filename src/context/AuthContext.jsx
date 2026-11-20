import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import {
  authService,
  fetchVerifiedProfile,
  buildUserObject,
  getRouteForRole,
} from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Session state — starts null; populated ONLY after Supabase verification.
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Rehydrates user state from a live Supabase session + verified profile.
   * If the profile is missing or invalid, the session is forcibly signed out.
   */
  const hydrateFromSession = useCallback(async (session) => {
    if (!session?.user) {
      setUser(null);
      return;
    }

    try {
      const { profile, role } = await fetchVerifiedProfile(session.user.id);
      setUser(buildUserObject(session.user, profile, role));
    } catch {
      // Profile missing or role invalid — destroy the orphaned Supabase session.
      await supabase.auth.signOut().catch(() => {});
      setUser(null);
    }
  }, []);

  // ── Mount: verify existing Supabase session ──────────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn('Session check error:', sessionError.message);
        }

        if (isMounted) {
          await hydrateFromSession(session);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initSession();

    // ── Live auth state listener ────────────────────────────────────────────
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await hydrateFromSession(session);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [hydrateFromSession]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async ({ identifier, password, role }) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authService.login({ identifier, password, role });

      // onAuthStateChange will hydrate the user; set here for immediate redirect.
      setUser(result.user);
      return { success: true, user: result.user, redirectTo: result.redirectTo };
    } catch (err) {
      const message = err.message || 'An error occurred during authentication.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out warning:', e.message);
    } finally {
      // Always clear client state regardless of server response.
      setUser(null);
      setError(null);
      setIsLoading(false);
    }
  }, []);

  // ── Clear error ───────────────────────────────────────────────────────────
  const clearError = useCallback(() => setError(null), []);

  // ── Context value ─────────────────────────────────────────────────────────
  const value = {
    user,
    role: user?.role ?? null,
    isAuthenticated: Boolean(user),
    isLoading,
    error,
    login,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
