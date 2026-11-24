import React from 'react';

/**
 * Dashboard metric. Shows a real value with an optional plain-language hint;
 * it deliberately has no decorative "trend" arrows.
 */
export default function StatCard({
  title,
  value,
  hint,
  change,
  icon: Icon,
  tone = 'primary',
  onClick,
}) {
  const tones = {
    primary: 'text-[#1E3A5F] bg-[#F0F4F8] border-[#D1DEEB]',
    success: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    warning: 'text-amber-700 bg-amber-50 border-amber-200',
    danger: 'text-rose-700 bg-rose-50 border-rose-200',
    neutral: 'text-slate-600 bg-slate-50 border-slate-200',
  };
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full rounded-sm border border-slate-200 bg-white p-4 text-left ${onClick ? 'transition-colors hover:border-slate-300 hover:bg-slate-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
        </div>
        {Icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border ${tones[tone] || tones.primary}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      {(hint || change) && <p className="mt-2 text-xs text-slate-500">{hint || change}</p>}
    </Wrapper>
  );
}
