import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { supabase } from '../services/supabase';
import { sessionEventAction } from './authEvents';
import {
  authService,
  fetchVerifiedProfile,
  buildUserObject,
} from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Session state — starts null; populated ONLY after Supabase profile verification.
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Synchronization refs to prevent race conditions and duplicate hydrations
  const activeUserIdRef = useRef(null);
  const hydrationSequenceRef = useRef(0);
  const isInitializingRef = useRef(true);

  /**
   * Rehydrates user state from a live Supabase session + verified database profile.
   * Employs sequence tokening and active-user caching to eliminate race conditions.
   */
  const hydrateFromSession = useCallback(async (session, options = {}) => {
    const { force = false, keepOnError = false } = options;
    const currentSeq = ++hydrationSequenceRef.current;

    if (!session?.user) {
      activeUserIdRef.current = null;
      setUser(null);
      return;
    }

    const userId = session.user.id;

    // Deduplication: If already verified and hydrated for this user ID, avoid redundant DB trips
    if (!force && activeUserIdRef.current === userId) {
      return;
    }

    try {
      const { profile, role } = await fetchVerifiedProfile(userId);

      // Discard stale out-of-order resolution if a newer hydration started
      if (currentSeq !== hydrationSequenceRef.current) {
        return;
      }

      activeUserIdRef.current = userId;
      setUser(buildUserObject(session.user, profile, role, session.access_token));
    } catch (err) {
      // Discard stale resolution
      if (currentSeq !== hydrationSequenceRef.current) {
        return;
      }

      // Same user, token refresh: a transient read failure keeps the current
      // (already verified) user rather than signing out mid-examination.
      if (keepOnError && activeUserIdRef.current === userId) return;

      // CRITICAL: Profile missing, invalid, or query failed. Terminate orphaned session immediately.
      activeUserIdRef.current = null;
      await supabase.auth.signOut().catch(() => {});
      setUser(null);
      setError(err.message || 'Session verification failed.');
    }
  }, []);

  // ── Unified Session Mount & Auth Listener ────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    // 1. Initial session check on mount
    async function initSession() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn('Session check notice:', sessionError.message);
        }

        if (isMounted) {
          await hydrateFromSession(session);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (isMounted) {
          activeUserIdRef.current = null;
          setUser(null);
        }
      } finally {
        if (isMounted) {
          isInitializingRef.current = false;
          setIsLoading(false);
        }
      }
    }

    initSession();

    // 2. Auth State Change Listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      // SIGNED_IN hydrates once per login; PASSWORD_RECOVERY / TOKEN_REFRESHED /
      // USER_UPDATED rebuild the user from the new signed token (subject scope,
      // must-change flag, role) so server-side changes apply without a reload.
      const action = sessionEventAction(event);
      if (action.hydrate) {
        await hydrateFromSession(session, { force: action.force, keepOnError: action.keepOnError });
      } else if (action.signOut) {
        activeUserIdRef.current = null;
        setUser(null);
        setError(null);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [hydrateFromSession]);

  // ── Login Handler ─────────────────────────────────────────────────────────
  const login = useCallback(async ({ identifier, password, role }) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authService.login({ identifier, password, role });

      // Pre-set activeUserIdRef so the incoming onAuthStateChange(SIGNED_IN)
      // will not trigger an expensive and redundant duplicate profile fetch
      activeUserIdRef.current = result.user.id;
      setUser(result.user);

      return { success: true, user: result.user, redirectTo: result.redirectTo };
    } catch (err) {
      activeUserIdRef.current = null;
      setUser(null);
      const message = err.message || 'An error occurred during authentication.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Logout Handler ────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    setIsLoading(true);
    activeUserIdRef.current = null;

    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out notice:', e.message);
    } finally {
      // Synchronously wipe state regardless of network response
      setUser(null);
      setError(null);
      setIsLoading(false);
    }
  }, []);

  // ── Refresh after a server-side account change (e.g. temporary password changed) ──
  const refreshUser = useCallback(async () => {
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !data?.session) throw new Error('Could not refresh your session. Sign in again.');
    await hydrateFromSession(data.session, { force: true });
  }, [hydrateFromSession]);

  // ── Clear error ───────────────────────────────────────────────────────────
  const clearError = useCallback(() => setError(null), []);

  // ── Context Value ─────────────────────────────────────────────────────────
  const value = {
    user,
    role: user?.role ?? null,
    isAuthenticated: Boolean(user),
    isLoading,
    error,
    login,
    logout,
    clearError,
    refreshUser,
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
