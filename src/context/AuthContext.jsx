import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authService.getUser());
  const [token, setToken] = useState(() => authService.getToken());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync token state on startup
  useEffect(() => {
    const savedToken = authService.getToken();
    const savedUser = authService.getUser();
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(savedUser);
    }
  }, []);

  /**
   * Primary login handler
   */
  const login = async ({ identifier, password, role, remember = false }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.login({ identifier, password, role });

      // When backend returns { token, user }:
      if (response && response.token && response.user) {
        authService.setToken(response.token, remember);
        authService.setUser(response.user, remember);
        setToken(response.token);
        setUser(response.user);
        return { success: true, user: response.user };
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
   * Logout handler
   */
  const logout = () => {
    authService.clearSession();
    setToken(null);
    setUser(null);
    setError(null);
  };

  const clearError = () => {
    setError(null);
  };

  /**
   * Developer / QA verification helper (for offline UI testing only)
   */
  const setDevSession = (devUser, devToken = 'dev-jwt-placeholder-token') => {
    authService.setToken(devToken);
    authService.setUser(devUser);
    setToken(devToken);
    setUser(devUser);
  };

  const value = {
    user,
    token,
    role: user?.role || null,
    isAuthenticated: Boolean(token && user),
    isLoading,
    error,
    login,
    logout,
    clearError,
    setDevSession,
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
