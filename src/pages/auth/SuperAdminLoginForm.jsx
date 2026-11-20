import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';
import InputField from '../../components/common/InputField';
import Button from '../../components/common/Button';
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
      errors.password = 'Security password is required';
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
      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1">
            <p className="font-semibold">Authentication Error</p>
            <p className="mt-0.5 text-[11px] leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Email Input */}
      <InputField
        label="Root Administrator Email"
        type="email"
        placeholder="admin@institution.edu.in"
        value={formData.email}
        onChange={(e) => {
          setFormData({ ...formData, email: e.target.value });
          if (formErrors.email) setFormErrors({ ...formErrors, email: null });
        }}
        prefixIcon={Mail}
        error={formErrors.email}
        helperText="Super Admin master console access"
        disabled={isLoading}
        required
      />

      {/* Password Input with Show/Hide Toggle */}
      <InputField
        label="Platform Security Key / Password"
        type={showPassword ? 'text' : 'password'}
        placeholder="••••••••••••"
        value={formData.password}
        onChange={(e) => {
          setFormData({ ...formData, password: e.target.value });
          if (formErrors.password) setFormErrors({ ...formErrors, password: null });
        }}
        prefixIcon={Lock}
        suffixButton={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
        error={formErrors.password}
        disabled={isLoading}
        required
      />

      {/* Helper Row: Remember & Forgot Password */}
      <div className="flex items-center justify-between text-xs pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600">
          <input
            type="checkbox"
            checked={formData.remember}
            onChange={(e) => setFormData({ ...formData, remember: e.target.checked })}
            className="rounded border-slate-300 text-[#1E3A5F] focus:ring-[#1E3A5F] h-3.5 w-3.5"
            disabled={isLoading}
          />
          <span>Remember session</span>
        </label>

        <button
          type="button"
          onClick={() => onForgotPassword?.(USER_ROLES.SUPER_ADMIN)}
          className="text-xs font-semibold text-[#1E3A5F] hover:underline"
        >
          Forgot key?
        </button>
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isLoading}
          icon={ShieldCheck}
        >
          Sign In to Super Admin Console
        </Button>
      </div>

      <p className="text-[11px] text-slate-400 text-center pt-1">
        Protected by hardware-bound audit logs & rate-limiting policies.
      </p>
    </form>
  );
}
