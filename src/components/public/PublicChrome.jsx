import React from 'react';
import { Link } from 'react-router-dom';
import { platformService } from '../../services/platformService';
import { INSTITUTION } from '../../utils/constants';

const COPYRIGHT_YEAR = new Date().getFullYear();

/** Dr. AIT monogram used on every public screen. */
export function InstitutionMark({ size = 'md', inverted = false }) {
  const box = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  const tone = inverted ? 'bg-white text-[#1E3A5F]' : 'bg-[#1E3A5F] text-white';
  return (
    <span className={`flex ${box} shrink-0 flex-col items-center justify-center rounded-sm ${tone}`} aria-hidden="true">
      <span className={`font-serif font-bold tracking-wide ${size === 'sm' ? 'text-[9px]' : 'text-[11px]'}`}>Dr. AIT</span>
      <span className={`text-[8px] ${inverted ? 'text-slate-500' : 'text-slate-300'}`}>1980</span>
    </span>
  );
}

/** Minimal institutional header shared by the home, login and recovery pages. */
export function PublicHeader({ right }) {
  const settings = platformService.getSettings();
  return (
    <>
      <div className="h-1 bg-[#1E3A5F]" aria-hidden="true" />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3.5" aria-label={`${INSTITUTION.name} — ExamSphere home`}>
            <InstitutionMark />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight text-[#1E3A5F] sm:text-base">{INSTITUTION.name}</span>
              <span className="block truncate text-[11px] text-slate-500 sm:text-xs">{INSTITUTION.office}</span>
            </span>
          </Link>
          {right ?? (
            <div className="hidden shrink-0 text-right text-xs leading-relaxed text-slate-500 md:block">
              <p>Examination Helpline</p>
              <p className="font-medium text-slate-800">{settings.helplinePhone}</p>
            </div>
          )}
        </div>
      </header>
      {settings.maintenanceNotice && (
        <div role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-center text-xs text-amber-900">
          {settings.maintenanceNotice}
        </div>
      )}
    </>
  );
}

/** Simple institutional footer: college address and COE contact. */
export function PublicFooter() {
  const settings = platformService.getSettings();
  return (
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
  );
}
