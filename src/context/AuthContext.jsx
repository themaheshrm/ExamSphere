import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { authService, normalizeRole, DEMO_CREDENTIALS } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authService.getUser());
  const [token, setToken] = useState(() => authService.getToken());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync Supabase live session and profiles on mount
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.warn('Session check error:', sessionError);
        }

        if (session && session.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (isMounted) {
            const role = normalizeRole(profile?.role || 'student');
            const currentUser = {
              id: session.user.id,
              name: profile?.full_name || session.user.email?.split('@')[0],
              email: session.user.email,
              identifier: profile?.usn || session.user.email,
              usn: profile?.usn || null,
              role,
              institution_id: profile?.institution_id || null,
              institution: profile?.institution_id ? 'Apex Engineering University (Dr. AIT)' : 'ExamSphere Global Cloud',
            };

            setUser(currentUser);
            setToken(session.access_token);
            authService.setUser(currentUser);
            authService.setToken(session.access_token);
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initSession();

    // Subscribe to live Supabase auth state transitions
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        const role = normalizeRole(profile?.role || 'student');
        const currentUser = {
          id: session.user.id,
          name: profile?.full_name || session.user.email?.split('@')[0],
          email: session.user.email,
          identifier: profile?.usn || session.user.email,
          usn: profile?.usn || null,
          role,
          institution_id: profile?.institution_id || null,
          institution: profile?.institution_id ? 'Apex Engineering University (Dr. AIT)' : 'ExamSphere Global Cloud',
        };

        setUser(currentUser);
        setToken(session.access_token);
        authService.setUser(currentUser);
        authService.setToken(session.access_token);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setToken(null);
        authService.clearSession();
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  /**
   * Primary login handler (Live Supabase Auth)
   */
  const login = async ({ identifier, password, role, remember = false }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.login({ identifier, password, role, remember });

      if (response && response.token && response.user) {
        setToken(response.token);
        setUser(response.user);
        return { success: true, user: response.user, redirectTo: response.redirectTo };
      }

      return { success: false };
    } catch (err) {
      const message = err.message || 'An error occurred during authentication.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 1-Click Live Login handler
   */
  const demoLogin = async (role) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.demoLogin(role);

      if (response && response.token && response.user) {
        setToken(response.token);
        setUser(response.user);
        return { success: true, user: response.user, redirectTo: response.redirectTo };
      }

      return { success: false };
    } catch (err) {
      const message = err.message || 'Failed to initialize session.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Logout handler with live Supabase sign out
   */
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out warning:', e);
    }
    authService.clearSession();
    setToken(null);
    setUser(null);
    setError(null);
  };

  const clearError = () => {
    setError(null);
  };

  const value = {
    user,
    token,
    role: user?.role || null,
    isAuthenticated: Boolean(token && user),
    isLoading,
    error,
    login,
    demoLogin,
    logout,
    clearError,
    demoCredentials: DEMO_CREDENTIALS,
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
