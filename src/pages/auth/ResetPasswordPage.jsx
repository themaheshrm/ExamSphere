import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import InputField from '../../components/common/InputField';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import { Spinner } from '../../components/common/LoadingStates';
import { PublicHeader, PublicFooter } from '../../components/public/PublicChrome';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import { getRouteForRole } from '../../services/authService';
import { supabase, initialAuthHash } from '../../services/supabase';
import { studentAccountService } from '../../services/studentAccountService';
import { passwordProblems } from '../../utils/passwordPolicy';

const linkError = new URLSearchParams(String(initialAuthHash || '').replace(/^#/, '')).get('error_description');

/**
 * Target of the password-reset email. Supabase signs the user in with a
 * recovery session (amr: recovery); the new password is set server-side by
 * change-temporary-password (policy + link check), which also clears any
 * temporary-password flag.
 */
export default function ResetPasswordPage() {
  const { user, role, isLoading, refreshUser } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const problems = form.newPassword ? passwordProblems(form.newPassword, { usn: user?.usn || user?.staffId }) : [];
  const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setErrors({ ...errors, [key]: undefined }); };

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    const next = {};
    if (problems.length || !form.newPassword) next.newPassword = `Needs ${(problems.length ? problems : ['a new password']).join(', ')}.`;
    if (form.confirm !== form.newPassword) next.confirm = 'The passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setIsSubmitting(true);
    try {
      try {
        await studentAccountService.setRecoveredPassword(form.newPassword);
      } catch (error) {
        // Before the function is deployed: accounts without a temporary-password
        // flag can still set the password directly on their recovery session.
        if (error.status || user.mustChangePassword) throw error;
        const { error: updateError } = await supabase.auth.updateUser({ password: form.newPassword });
        if (updateError) throw new Error('The password could not be updated. Request a new reset link.');
      }
      setForm({ newPassword: '', confirm: '' });
      await refreshUser();
      notify('Password updated.');
      navigate(getRouteForRole(role), { replace: true });
    } catch (error) {
      if (error.fieldErrors) setErrors(error.fieldErrors);
      setFormError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggle = (
    <button type="button" onClick={() => setShow((v) => !v)} className="p-1 text-slate-500 hover:text-slate-800" aria-label={show ? 'Hide passwords' : 'Show passwords'}>
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  let content;
  if (isLoading) {
    content = <div className="flex justify-center py-10" role="status"><Spinner size="lg" /><span className="sr-only">Checking reset link…</span></div>;
  } else if (linkError || !user) {
    content = (
      <div className="space-y-5">
        <Alert tone="danger" title="Reset link invalid or expired">Request a new password reset link.</Alert>
        <Link to="/forgot-password" className="inline-flex h-10 items-center rounded-sm bg-[#1E3A5F] px-4 text-sm font-semibold text-white hover:bg-[#152A45]">Request new link</Link>
      </div>
    );
  } else if (!user.recoverySession) {
    content = (
      <div className="space-y-5">
        <Alert tone="info">Open the password reset link from your email to set a new password.</Alert>
        <Link to={getRouteForRole(role)} className="inline-flex h-10 items-center rounded-sm border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">Back to my portal</Link>
      </div>
    );
  } else {
    content = (
      <form onSubmit={submit} className="space-y-5" noValidate>
        <p className="text-sm text-slate-600">{user.name}{user.usn || user.staffId ? ` (${user.usn || user.staffId})` : ''}</p>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <InputField label="New password" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} error={errors.newPassword}
          prefixIcon={KeyRound} suffixButton={toggle}
          helperText={form.newPassword && problems.length ? `Still needs ${problems.join(', ')}.` : 'At least 12 characters with upper- and lower-case letters, a digit and a symbol.'} required />
        <InputField label="Confirm new password" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} required />
        <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>Save new password</Button>
      </form>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <PublicHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-14 sm:py-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Account recovery</p>
        <h1 className="mt-3 mb-8 text-2xl font-semibold tracking-tight text-[#1E3A5F]">Set a new password</h1>
        {content}
      </main>
      <PublicFooter />
    </div>
  );
}
