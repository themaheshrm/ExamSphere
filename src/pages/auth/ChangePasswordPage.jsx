import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import InputField from '../../components/common/InputField';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import { PublicHeader, PublicFooter } from '../../components/public/PublicChrome';
import { useAuth } from '../../context/AuthContext';
import { getRouteForRole } from '../../services/authService';
import { studentAccountService } from '../../services/studentAccountService';
import { passwordProblems } from '../../utils/passwordPolicy';

/** Required first step for accounts created with a temporary password. */
export default function ChangePasswordPage() {
  const { user, role, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user?.mustChangePassword) return <Navigate to={getRouteForRole(role)} replace />;
  // Arrived from a reset email: no temporary password to type — use the reset screen.
  if (user.recoverySession) return <Navigate to="/reset-password" replace />;

  const problems = form.newPassword ? passwordProblems(form.newPassword, { usn: user.usn, current: form.currentPassword }) : [];
  const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setErrors({ ...errors, [key]: undefined }); };

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    const next = {};
    if (!form.currentPassword) next.currentPassword = 'Enter the temporary password you received.';
    if (problems.length || !form.newPassword) next.newPassword = `Needs ${(problems.length ? problems : ['a new password']).join(', ')}.`;
    if (form.confirm !== form.newPassword) next.confirm = 'The passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setIsSubmitting(true);
    try {
      await studentAccountService.changeTemporaryPassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      await refreshUser();
      navigate(getRouteForRole(role), { replace: true, state: { passwordChanged: true } });
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
  const signOut = (
    <button type="button" onClick={async () => { await logout(); navigate('/login'); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] hover:underline">
      <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <PublicHeader right={signOut} />
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-14 sm:py-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">First sign-in</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#1E3A5F]">Set your own password</h1>
        <p className="mt-2 text-sm text-slate-600">
          {user.name}{user.usn ? ` (${user.usn})` : ''}: your account was created with a temporary password. Choose a new one to continue.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <InputField label="Temporary password" type={show ? 'text' : 'password'} autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} prefixIcon={KeyRound} suffixButton={toggle} required />
          <InputField label="New password" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} error={errors.newPassword}
            helperText={form.newPassword && problems.length ? `Still needs ${problems.join(', ')}.` : 'At least 12 characters with upper- and lower-case letters, a digit and a symbol.'} required />
          <InputField label="Confirm new password" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} required />
          <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>Save new password</Button>
        </form>
      </main>
      <PublicFooter />
    </div>
  );
}
