import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getRouteForRole } from '../../services/authService';
import { platformService } from '../../services/platformService';
import { announcements } from '../../data/studentMockData';
import { INSTITUTION, USER_ROLES } from '../../utils/constants';

const COPYRIGHT_YEAR = new Date().getFullYear();

const primaryBtn = 'inline-flex h-12 items-center justify-center gap-2 rounded-sm bg-[#1E3A5F] px-7 text-sm font-semibold text-white transition-colors hover:bg-[#152A45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A5F]';
const secondaryBtn = 'inline-flex h-12 items-center justify-center gap-2 rounded-sm border border-[#1E3A5F] bg-white px-7 text-sm font-semibold text-[#1E3A5F] transition-colors hover:bg-[#F0F4F8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A5F]';

/** Public landing page of the ExamSphere CBT portal. */
export default function HomePage() {
  const { isAuthenticated, role, user } = useAuth();
  const settings = platformService.getSettings();

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <div className="h-1 bg-[#1E3A5F]" aria-hidden="true" />

      {/* Institutional header */}
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3.5" aria-label={`${INSTITUTION.name} — ExamSphere home`}>
            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-sm bg-[#1E3A5F] text-white">
              <span className="font-serif text-[11px] font-bold tracking-wide">Dr. AIT</span>
              <span className="text-[8px] text-slate-300">1980</span>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight text-[#1E3A5F] sm:text-base">{INSTITUTION.name}</span>
              <span className="block truncate text-[11px] text-slate-500 sm:text-xs">{INSTITUTION.office}</span>
            </span>
          </Link>
          <div className="hidden shrink-0 text-right text-xs leading-relaxed text-slate-500 md:block">
            <p>Examination Helpline</p>
            <p className="font-medium text-slate-800">{settings.helplinePhone}</p>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {settings.maintenanceNotice && (
          <div role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-center text-xs text-amber-900">
            {settings.maintenanceNotice}
          </div>
        )}

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-20 sm:px-8 sm:pt-28 lg:pb-28 lg:pt-32" aria-labelledby="hero-title">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Official Computer-Based Examination Portal
          </p>
          <h1 id="hero-title" className="mt-5 text-5xl font-semibold tracking-tight text-[#1E3A5F] sm:text-7xl lg:text-8xl">
            ExamSphere
          </h1>
          <div className="mt-6 h-px w-16 bg-[#1E3A5F]" aria-hidden="true" />
          <p className="mt-6 max-w-xl text-lg text-slate-600 sm:text-2xl sm:leading-snug">
            Your Examination. One Secure Portal.
          </p>

          <div className="mt-12 flex flex-col gap-3 sm:flex-row">
            {isAuthenticated && role ? (
              <Link to={getRouteForRole(role)} className={primaryBtn}>
                Continue as {user?.name?.split(' ')[0] || 'user'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link to={`/login?role=${USER_ROLES.STUDENT}`} className={primaryBtn}>
                  Student Login
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link to={`/login?role=${USER_ROLES.ADMIN}`} className={secondaryBtn}>
                  Staff Login
                </Link>
              </>
            )}
          </div>
          <p className="mt-6 text-xs text-slate-500">
            Academic Year {INSTITUTION.academicYear} · An Autonomous Institution affiliated to VTU, Belagavi
          </p>
        </section>

        {/* Announcements */}
        <section className="border-t border-slate-200 bg-[#FAFBFC]" aria-labelledby="announcements-title">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="announcements-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]">
                Examination Announcements
              </h2>
              <span className="hidden text-xs text-slate-500 sm:inline">Office of the Controller of Examinations</span>
            </div>
            <ul className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
              {announcements.map((a) => (
                <li key={a.id} className="grid gap-1 py-5 sm:grid-cols-[9rem_1fr] sm:gap-8">
                  <div className="flex items-center gap-2 text-xs text-slate-500 sm:block">
                    <time className="tabular-nums">{a.date}</time>
                    {a.priority === 'Urgent' && (
                      <span className="rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-rose-700 sm:mt-1.5 sm:block sm:w-fit">
                        Urgent
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{a.content}</p>
                    <p className="mt-1.5 text-xs text-slate-400">{a.issuer}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 text-xs leading-relaxed text-slate-500 sm:grid-cols-2 sm:px-8">
          <div>
            <p className="font-semibold text-slate-800">{INSTITUTION.name}</p>
            <p>BDA Outer Ring Road, Near Jnana Bharathi Campus,</p>
            <p>Mallathahalli, Bengaluru, Karnataka – 560056</p>
          </div>
          <div className="sm:text-right">
            <p className="font-semibold text-slate-800">{INSTITUTION.office}</p>
            <p>Control Room: {settings.helplinePhone}</p>
            <p><a href={`mailto:${settings.supportEmail}`} className="text-[#1E3A5F] hover:underline">{settings.supportEmail}</a></p>
          </div>
        </div>
        <div className="border-t border-slate-100">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4 text-[11px] text-slate-400 sm:flex-row sm:justify-between sm:px-8">
            <p>© {COPYRIGHT_YEAR} {INSTITUTION.name}. All rights reserved.</p>
            <p>Authorised access only.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
