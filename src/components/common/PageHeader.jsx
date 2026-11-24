import React from 'react';
import Breadcrumbs from './Breadcrumbs';

/**
 * Standard page heading used by every portal screen.
 * One title style, one description style, actions aligned right (stacked on mobile).
 */
export default function PageHeader({ title, description, eyebrow, breadcrumbs, actions, meta, className = '' }) {
  return (
    <header className={`flex flex-col gap-4 border-b border-slate-200 pb-5 ${className}`}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{eyebrow}</p>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
      </div>
    </header>
  );
}
