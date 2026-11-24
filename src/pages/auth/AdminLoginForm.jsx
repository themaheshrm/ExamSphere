import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import InputField from '../../components/common/InputField';
import { useAuth } from '../../context/AuthContext';
import { USER_ROLES } from '../../utils/constants';

export default function AdminLoginForm({ onForgotPassword }) {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuth();

  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
    remember: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const validate = () => {
    const errors = {};
    const val = formData.identifier.trim();

    if (!val) {
      errors.identifier = 'Staff ID or Official Email is required';
    } else if (val.length < 3) {
      errors.identifier = 'Enter a valid staff ID or email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 5) {
      errors.password = 'Password must be at least 5 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (!validate()) return;

    const result = await login({
      identifier: formData.identifier,
      password: formData.password,
      role: USER_ROLES.ADMIN,
    });

    if (result.success) {
      navigate(result.redirectTo || '/admin');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Formal Error Alert */}
      {error && (
        <div className="p-3 border border-red-300 bg-red-50 text-red-800 text-xs rounded-xs">
          <p className="font-semibold">Authentication Error:</p>
          <p className="mt-0.5 text-[11px] leading-relaxed">{error}</p>
        </div>
      )}

      {/* Staff ID / Email Input */}
      <InputField
        label="Staff ID or Official University Email"
        type="text"
        placeholder="e.g. admin@drait.edu.in"
        value={formData.identifier}
        onChange={(e) => {
          setFormData({ ...formData, identifier: e.target.value });
          if (formErrors.identifier) setFormErrors({ ...formErrors, identifier: null });
        }}
        error={formErrors.identifier}
        helperText="Allocated by university examination board"
        disabled={isLoading}
        required
      />

      {/* Password with Clean Show/Hide Control */}
      <InputField
        label="Staff Portal Password"
        type={showPassword ? 'text' : 'password'}
        placeholder="Enter password"
        value={formData.password}
        onChange={(e) => {
          setFormData({ ...formData, password: e.target.value });
          if (formErrors.password) setFormErrors({ ...formErrors, password: null });
        }}
        suffixButton={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-[11px] text-slate-500 hover:text-slate-900 font-medium px-1.5 py-0.5 focus:outline-none cursor-pointer"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        }
        error={formErrors.password}
        disabled={isLoading}
        required
      />

      {/* Utility Row: Remember & Reset Credentials */}
      <div className="flex items-center justify-between text-xs pt-1">
        <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 select-none">
          <input
            type="checkbox"
            checked={formData.remember}
            onChange={(e) => setFormData({ ...formData, remember: e.target.checked })}
            className="rounded-xs border-slate-300 text-[#1E3A5F] focus:ring-0 h-3.5 w-3.5"
            disabled={isLoading}
          />
          <span>Remember workstation</span>
        </label>

        <button
          type="button"
          onClick={() => onForgotPassword?.(USER_ROLES.ADMIN)}
          className="text-xs text-[#1E3A5F] hover:underline cursor-pointer"
        >
          Reset Password
        </button>
      </div>

      {/* Simple Rectangular Navy Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#1E3A5F] hover:bg-[#152A45] active:bg-[#0F1D30] text-white text-xs sm:text-sm font-semibold py-2 px-4 rounded-xs transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
        >
          {isLoading ? 'Authenticating Staff...' : 'Sign In as Administrator'}
        </button>
      </div>

      <p className="text-[11px] text-slate-500 text-center pt-1">
        Restricted to Controller of Examinations (COE) & authorized invigilation staff
      </p>
    </form>
  );
}
