import React, { useState } from 'react';
import { UserCheck, Lock, Eye, EyeOff, Building, AlertCircle } from 'lucide-react';
import InputField from '../../components/common/InputField';
import Button from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { USER_ROLES } from '../../utils/constants';

export default function AdminLoginForm({ onForgotPassword }) {
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
      errors.identifier = 'Institution Admin ID or Email is required';
    } else if (val.length < 3) {
      errors.identifier = 'Enter a valid staff ID (e.g., ADM-8902) or official email';
    }

    if (!formData.password) {
      errors.password = 'Portal password is required';
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

    await login({
      identifier: formData.identifier,
      password: formData.password,
      role: USER_ROLES.ADMIN,
      remember: formData.remember,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1">
            <p className="font-semibold">Staff Authentication Error</p>
            <p className="mt-0.5 text-[11px] leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Admin ID / Email */}
      <InputField
        label="Admin Staff ID or Official Email"
        type="text"
        placeholder="e.g. ADM-8942 or controller@university.edu"
        value={formData.identifier}
        onChange={(e) => {
          setFormData({ ...formData, identifier: e.target.value });
          if (formErrors.identifier) setFormErrors({ ...formErrors, identifier: null });
        }}
        prefixIcon={UserCheck}
        error={formErrors.identifier}
        helperText="Allocated by your university examination board"
        disabled={isLoading}
        required
      />

      {/* Password with Show/Hide Toggle */}
      <InputField
        label="Staff Password"
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
          <span>Remember staff workstation</span>
        </label>

        <button
          type="button"
          onClick={() => onForgotPassword?.(USER_ROLES.ADMIN)}
          className="text-xs font-semibold text-[#1E3A5F] hover:underline"
        >
          Reset credentials
        </button>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full mt-2"
        isLoading={isLoading}
        icon={Building}
      >
        Sign In to Examination Center
      </Button>

      {/* Institutional advisory */}
      <p className="text-[11px] text-slate-400 text-center pt-2">
        Restricted to authorized Controller of Examinations (COE) and invigilation staff.
      </p>
    </form>
  );
}
