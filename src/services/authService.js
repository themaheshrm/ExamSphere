/**
 * ExamSphere Authentication Service
 * Prepares and manages JWT tokens, session persistence, and API payload structures
 * for future backend REST API integration.
 */

const TOKEN_KEY = 'examsphere_auth_token';
const USER_KEY = 'examsphere_auth_user';

export const authService = {
  /**
   * Submit credentials to login endpoint
   * @param {Object} payload { identifier, password, role }
   */
  async login({ identifier, password, role }) {
    // Structured payload ready for backend integration
    const requestPayload = {
      identifier: identifier.trim(),
      password,
      role,
      timestamp: new Date().toISOString(),
    };

    try {
      // Future integration point:
      // const response = await fetch('/api/auth/login', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(requestPayload)
      // });
      // const data = await response.json();
      // if (!response.ok) throw new Error(data.message || 'Login failed');
      // return data;

      // In current development state without backend:
      // Simulate realistic network roundtrip
      await new Promise((resolve) => setTimeout(resolve, 800));

      // As required: Do not implement fake successful authentication.
      // Inform the developer / user clearly that form passed validation and is ready for the JWT backend.
      throw new Error(
        `Backend authentication service (POST /api/auth/login) is pending backend integration. Form payload for '${role}' role validated successfully.`
      );
    } catch (err) {
      throw err;
    }
  },

  /**
   * Request password reset
   */
  async requestPasswordReset({ identifier, role, reason }) {
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Ready for backend POST /api/auth/forgot-password
    return {
      success: true,
      message: `Password reset request for ${identifier} (${role}) has been submitted to the academic administration registrar.`,
    };
  },

  /**
   * Token and user session management (JWT ready)
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
