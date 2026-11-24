import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import InputField from '../../components/common/InputField';
import { useAuth } from '../../context/AuthContext';
import { USER_ROLES } from '../../utils/constants';

export default function SuperAdminLoginForm({ onForgotPassword }) {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    remember: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const validate = () => {
    const errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      errors.email = 'Root administrator email is required';
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Enter a valid administrator email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (!validate()) return;

    const result = await login({
      identifier: formData.email,
      password: formData.password,
      role: USER_ROLES.SUPER_ADMIN,
    });

    if (result.success) {
      navigate(result.redirectTo || '/super-admin');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Formal Error Alert */}
      {error && (
        <div className="p-3 border border-red-300 bg-red-50 text-red-800 text-xs rounded-xs">
          <p className="font-semibold">Security Check Failed:</p>
          <p className="mt-0.5 text-[11px] leading-relaxed">{error}</p>
        </div>
      )}

      {/* Root Admin Email */}
      <InputField
        label="Root Administrator Email"
        type="email"
        placeholder="root.admin@drait.edu.in"
        value={formData.email}
        onChange={(e) => {
          setFormData({ ...formData, email: e.target.value });
          if (formErrors.email) setFormErrors({ ...formErrors, email: null });
        }}
        error={formErrors.email}
        helperText="Master platform administration credentials"
        disabled={isLoading}
        required
      />

      {/* Password with Clean Show/Hide Control */}
      <InputField
        label="Platform Security Key / Password"
        type={showPassword ? 'text' : 'password'}
        placeholder="Enter security key"
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

      {/* Utility Row: Remember & Reset Key */}
      <div className="flex items-center justify-between text-xs pt-1">
        <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 select-none">
          <input
            type="checkbox"
            checked={formData.remember}
            onChange={(e) => setFormData({ ...formData, remember: e.target.checked })}
            className="rounded-xs border-slate-300 text-[#1E3A5F] focus:ring-0 h-3.5 w-3.5"
            disabled={isLoading}
          />
          <span>Remember session</span>
        </label>

        <button
          type="button"
          onClick={() => onForgotPassword?.(USER_ROLES.SUPER_ADMIN)}
          className="text-xs text-[#1E3A5F] hover:underline cursor-pointer"
        >
          Forgot key?
        </button>
      </div>

      {/* Simple Rectangular Navy Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#1E3A5F] hover:bg-[#152A45] active:bg-[#0F1D30] text-white text-xs sm:text-sm font-semibold py-2 px-4 rounded-xs transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
        >
          {isLoading ? 'Verifying Key...' : 'Sign In as Super Admin'}
        </button>
      </div>

      <p className="text-[11px] text-slate-500 text-center pt-1">
        Master console access &bull; All administrative activities are cryptographically recorded
      </p>
    </form>
  );
}
