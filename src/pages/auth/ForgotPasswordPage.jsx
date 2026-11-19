import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mail, ShieldAlert, CheckCircle2, HelpCircle, Layers, GraduationCap } from 'lucide-react';
import InputField from '../../components/common/InputField';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import { authService } from '../../services/authService';
import { USER_ROLES } from '../../utils/constants';

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') || USER_ROLES.STUDENT;

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

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between p-4 sm:p-6">
      {/* Top Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between pb-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#1E3A5F] text-white shadow-xs">
            <Layers className="h-4.5 w-4.5" />
          </div>
          <span className="font-bold tracking-tight text-slate-900 text-base">
            Exam<span className="text-[#1E3A5F]">Sphere</span>
          </span>
        </Link>

        <Link
          to={`/login?role=${role}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign In</span>
        </Link>
      </header>

      {/* Main Container */}
      <div className="max-w-md w-full mx-auto my-auto">
        <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-xs">
          {/* Header Title */}
          <div className="text-center pb-5 border-b border-slate-100">
            <div className="w-10 h-10 rounded-full bg-[#EBF2FA] text-[#1E3A5F] flex items-center justify-center mx-auto mb-3 border border-[#BFDBFE]">
              <HelpCircle className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Credential Recovery Desk</h1>
            <p className="text-xs text-slate-500 mt-1">
              Follow institutional protocol to reset your assessment portal access.
            </p>
          </div>

          {/* Role Filter Tabs */}
          <div className="flex rounded border border-slate-200 bg-slate-50 p-1 my-5 text-xs">
            <button
              type="button"
              onClick={() => {
                setRole(USER_ROLES.STUDENT);
                setSuccessMessage(null);
                setError(null);
              }}
              className={`flex-1 py-1.5 font-medium rounded transition ${
                role === USER_ROLES.STUDENT
                  ? 'bg-white text-[#1E3A5F] shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Student (USN)
            </button>
            <button
              type="button"
              onClick={() => {
                setRole(USER_ROLES.ADMIN);
                setSuccessMessage(null);
                setError(null);
              }}
              className={`flex-1 py-1.5 font-medium rounded transition ${
                role === USER_ROLES.ADMIN
                  ? 'bg-white text-[#1E3A5F] shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Institution Admin
            </button>
            <button
              type="button"
              onClick={() => {
                setRole(USER_ROLES.SUPER_ADMIN);
                setSuccessMessage(null);
                setError(null);
              }}
              className={`flex-1 py-1.5 font-medium rounded transition ${
                role === USER_ROLES.SUPER_ADMIN
                  ? 'bg-white text-[#1E3A5F] shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Super Admin
            </button>
          </div>

          {/* Success Banner */}
          {successMessage ? (
            <div className="space-y-4 py-2">
              <div className="p-3.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Recovery Ticket Generated</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
                      {successMessage}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed text-center">
                Please check your official institutional inbox. For urgent ongoing exam sessions, present your Admit Card in person at the Computer Center Helpdesk.
              </p>

              <div className="pt-2 flex justify-center">
                <Link to={`/login?role=${role}`}>
                  <Button variant="primary" size="md">
                    Return to Login Screen
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">{error}</p>
                </div>
              )}

              {role === USER_ROLES.STUDENT ? (
                <>
                  <div className="p-3 rounded border border-blue-100 bg-blue-50/50 text-[11px] text-slate-700 leading-relaxed">
                    <strong>Notice for Students:</strong> To prevent examination tampering, candidate password resets are reviewed against the university registrar's enrolled student database.
                  </div>

                  <InputField
                    label="University Seat Number (USN)"
                    placeholder="e.g. 1MS22CS042"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
                    prefixIcon={GraduationCap}
                    helperText="Enter the USN printed on your official Admit Card"
                    required
                  />
                </>
              ) : (
                <>
                  <div className="p-3 rounded border border-slate-200 bg-slate-50 text-[11px] text-slate-700 leading-relaxed">
                    A secure, single-use authentication reset token will be dispatched to your authorized staff email.
                  </div>

                  <InputField
                    label="Official Administrator Email or Staff ID"
                    placeholder={
                      role === USER_ROLES.SUPER_ADMIN
                        ? 'root.admin@examsphere.io'
                        : 'controller@university.edu or ADM-8901'
                    }
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    prefixIcon={Mail}
                    helperText="Must match primary institutional directory"
                    required
                  />
                </>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full mt-2"
                isLoading={isSubmitting}
              >
                Submit Reset Request
              </Button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <Link
              to={`/login?role=${role}`}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Candidate / Staff Sign In</span>
            </Link>
          </div>
        </Card>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 py-4">
        ExamSphere CBT Secure Authentication Desk • University Examination System
      </footer>
    </div>
  );
}
