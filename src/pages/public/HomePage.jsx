import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getRouteForRole } from '../../services/authService';
import { announcements } from '../../data/studentMockData';
import { INSTITUTION, USER_ROLES } from '../../utils/constants';
import { PublicHeader, PublicFooter } from '../../components/public/PublicChrome';

const primaryBtn = 'inline-flex h-12 items-center justify-center gap-2 rounded-sm bg-[#1E3A5F] px-7 text-sm font-semibold text-white transition-colors hover:bg-[#152A45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A5F]';
const secondaryBtn = 'inline-flex h-12 items-center justify-center gap-2 rounded-sm border border-[#1E3A5F] bg-white px-7 text-sm font-semibold text-[#1E3A5F] transition-colors hover:bg-[#F0F4F8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A5F]';

/** Public landing page of the ExamSphere CBT portal. */
export default function HomePage() {
  const { isAuthenticated, role, user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <PublicHeader />

      <main className="flex-1">

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
            Academic Year {INSTITUTION.academicYear} · {INSTITUTION.status}
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

      <PublicFooter />
    </div>
  );
}
