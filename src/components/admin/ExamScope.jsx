import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

/** Examination selector shown in admin page headers (only exams in scope). */
export function ExamSwitcher({ summaries, value, onChange }) {
  if (!summaries || summaries.length < 2) return null;
  return (
    <label className="flex w-full min-w-0 items-center gap-2 text-xs text-slate-600 sm:w-auto">
      <span className="hidden sm:inline">Examination</span>
      <select
        aria-label="Select examination"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="es-select h-9 w-full min-w-0 truncate rounded-sm sm:w-auto sm:max-w-xs border border-slate-300 bg-white pl-3 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
      >
        {summaries.map((s) => (
          <option key={s.code} value={s.code}>
            {s.code} · {s.title}{s.exists ? (s.isPublished ? '' : ' (draft)') : ' (not created)'}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Shown when an admin requests an examination outside their subject scope. */
export function ScopeDenied({ examCode, scope, homePath = '/admin' }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-sm border border-rose-200 bg-rose-50 text-rose-700">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">Access restricted</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Examination <span className="font-mono">{examCode || '—'}</span> is outside your assigned subject
          {scope?.label ? <> ({scope.label})</> : null}.
        </p>
        <Link to={homePath} className="mt-6 inline-flex h-9 items-center rounded-sm bg-[#1E3A5F] px-4 text-xs font-semibold text-white hover:bg-[#152A45]">
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}

/** Shown when the selected subject examination has not been created yet. */
export function ExamNotCreated({ eyebrow = 'Examinations', title, examCode, summaries, onSelect, scope }) {
  const subject = summaries?.find((s) => s.code === examCode);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{eyebrow}</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{title}</h1>
          {scope?.scoped && <p className="mt-1 text-xs text-slate-600">Assigned subject: {scope.label}</p>}
        </div>
        <ExamSwitcher summaries={summaries} value={examCode} onChange={onSelect} />
      </div>
      <div className="rounded-sm border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-sm font-semibold text-slate-900">
          <span className="font-mono">{examCode}</span>{subject ? ` · ${subject.title}` : ''} has no examination yet
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-600">
          Create it to generate patterns A–J.
        </p>
        <Link to={`/admin/exams?exam=${examCode}`} className="mt-5 inline-flex h-9 items-center rounded-sm bg-[#1E3A5F] px-4 text-xs font-semibold text-white hover:bg-[#152A45]">
          Create examination
        </Link>
      </div>
    </div>
  );
}
