import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mail, GraduationCap } from 'lucide-react';
import InputField from '../../components/common/InputField';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import { PublicHeader, PublicFooter } from '../../components/public/PublicChrome';
import { authService } from '../../services/authService';
import { USER_ROLES } from '../../utils/constants';

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const initialRole = Object.values(USER_ROLES).includes(roleParam) ? roleParam : USER_ROLES.STUDENT;

  const [role, setRole] = useState(initialRole);
  const [identifier, setIdentifier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim()) {
      setError(
        role === USER_ROLES.STUDENT
          ? 'Please enter your registered USN'
          : 'Please enter your official registered email or ID'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authService.requestPasswordReset({
        identifier: identifier.trim(),
        role,
        reason: 'Candidate credential recovery request',
      });
      setSuccessMessage(response.message);
    } catch (err) {
      setError(err.message || 'Failed to submit recovery request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectRole = (next) => {
    setRole(next);
    setSuccessMessage(null);
    setError(null);
  };

  const backLink = (
    <Link to={`/login?role=${role}`} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] hover:underline">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Back to sign in
    </Link>
  );

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <PublicHeader right={backLink} />

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-14 sm:py-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Account recovery</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#1E3A5F]">Reset your password</h1>
        <p className="mt-2 text-sm text-slate-600">A reset link is sent to the email address registered with the institution.</p>

        <div className="mt-8 flex border-b border-slate-200" role="group" aria-label="Account type">
          {[
            [USER_ROLES.STUDENT, 'Student'],
            [USER_ROLES.ADMIN, 'Institution Admin'],
            [USER_ROLES.SUPER_ADMIN, 'Super Admin'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => selectRole(key)}
              aria-pressed={role === key}
              className={`-mb-px flex-1 border-b-2 px-2 pb-3 text-xs font-semibold transition-colors ${
                role === key ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {successMessage ? (
            <div className="space-y-5">
              <Alert tone="success" title="Request received">{successMessage}</Alert>
              <p className="text-xs leading-relaxed text-slate-500">
                Check your institutional inbox. During an ongoing examination, present your admit card at the Computer Center help desk.
              </p>
              <Link to={`/login?role=${role}`} className="inline-flex h-10 items-center rounded-sm bg-[#1E3A5F] px-4 text-sm font-semibold text-white hover:bg-[#152A45]">
                Return to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {error && <Alert tone="danger">{error}</Alert>}
              {role === USER_ROLES.STUDENT ? (
                <InputField
                  label="University Seat Number (USN)"
                  placeholder="e.g. 1DA22CS001"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
                  prefixIcon={GraduationCap}
                  helperText="Candidate resets are verified against the registrar's enrolment records."
                  required
                />
              ) : (
                <InputField
                  label="Official email or staff ID"
                  placeholder={role === USER_ROLES.SUPER_ADMIN ? 'root.admin@examsphere.io' : 'controller@drait.edu.in or ADM-8901'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  prefixIcon={Mail}
                  helperText="Must match the institutional directory."
                  required
                />
              )}
              <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>Send reset link</Button>
            </form>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
