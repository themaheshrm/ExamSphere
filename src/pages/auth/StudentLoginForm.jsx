import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Lock, Eye, EyeOff, BookOpen, AlertCircle, Info, Zap } from 'lucide-react';
import InputField from '../../components/common/InputField';
import Button from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { USER_ROLES } from '../../utils/constants';

export default function StudentLoginForm({ onForgotPassword }) {
  const navigate = useNavigate();
  const { login, demoLogin, demoCredentials, isLoading, error, clearError } = useAuth();

  const studentDemo = demoCredentials[USER_ROLES.STUDENT];

  const [formData, setFormData] = useState({
    usn: '',
    password: '',
    remember: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const handleQuickFill = () => {
    setFormData({
      usn: studentDemo.identifier,
      password: studentDemo.password,
      remember: true,
    });
    setFormErrors({});
    clearError();
  };

  const handleDirectDemoLogin = async () => {
    clearError();
    const result = await demoLogin(USER_ROLES.STUDENT);
    if (result.success) {
      navigate('/student');
    }
  };

  const validate = () => {
    const errors = {};
    const usnTrimmed = formData.usn.trim();

    if (!usnTrimmed) {
      errors.usn = 'University Seat Number (USN) is required';
    } else if (usnTrimmed.length < 5) {
      errors.usn = 'USN must be at least 5 alphanumeric characters (e.g., 1DA22CS001)';
    }

    if (!formData.password) {
      errors.password = 'Candidate exam password or Hall Ticket PIN is required';
    } else if (formData.password.length < 4) {
      errors.password = 'Password must be at least 4 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (!validate()) return;

    const result = await login({
      identifier: formData.usn.toUpperCase(),
      password: formData.password,
      role: USER_ROLES.STUDENT,
      remember: formData.remember,
    });

    if (result.success) {
      navigate(result.redirectTo || '/student');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Demo Credentials Helper Pill */}
      <div className="p-3 rounded border border-emerald-200 bg-emerald-50/70 text-xs">
        <div className="flex items-center justify-between pb-1.5 border-b border-emerald-200/60 mb-2">
          <span className="font-semibold text-emerald-900 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-600" />
            Candidate / Student Demo Credentials
          </span>
          <button
            type="button"
            onClick={handleQuickFill}
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
          >
            Auto Fill Form
          </button>
        </div>
        <div className="font-mono text-[11px] text-emerald-900 space-y-0.5">
          <p>USN: <span className="font-bold">{studentDemo.identifier}</span></p>
          <p>Password: <span className="font-bold">{studentDemo.password}</span></p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1">
            <p className="font-semibold">Candidate Login Failed</p>
            <p className="mt-0.5 text-[11px] leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* USN Input */}
      <InputField
        label="University Seat Number (USN)"
        type="text"
        placeholder="e.g. 1DA22CS001"
        value={formData.usn}
        onChange={(e) => {
          setFormData({ ...formData, usn: e.target.value.toUpperCase() });
          if (formErrors.usn) setFormErrors({ ...formErrors, usn: null });
        }}
        prefixIcon={GraduationCap}
        error={formErrors.usn}
        helperText="Enter your official hall ticket USN"
        disabled={isLoading}
        required
      />

      {/* Password with Show/Hide Toggle */}
      <InputField
        label="Candidate Password / Exam PIN"
        type={showPassword ? 'text' : 'password'}
        placeholder="••••••••"
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
          <span>Remember USN</span>
        </label>

        <button
          type="button"
          onClick={() => onForgotPassword?.(USER_ROLES.STUDENT)}
          className="text-xs font-semibold text-[#1E3A5F] hover:underline"
        >
          Trouble signing in?
        </button>
      </div>

      {/* Buttons */}
      <div className="space-y-2 pt-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isLoading}
          icon={BookOpen}
        >
          Access Student CBT Console
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="md"
          className="w-full text-emerald-700 hover:bg-emerald-50 border-emerald-200"
          onClick={handleDirectDemoLogin}
          isLoading={isLoading}
          icon={Zap}
        >
          1-Click Demo Login as Student
        </Button>
      </div>

      <p className="text-[11px] text-slate-400 text-center pt-1">
        Proctored session. Disconnecting from active tests will be logged in the audit ledger.
      </p>
    </form>
  );
}
