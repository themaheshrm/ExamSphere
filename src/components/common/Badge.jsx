import React from 'react';

/**
 * Enterprise Status Badge Component
 * Used for exam status, student eligibility, server state, etc.
 */
export default function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
}) {
  const variants = {
    neutral: {
      wrap: 'bg-slate-100 text-slate-700 border-slate-200',
      dot: 'bg-slate-400',
    },
    primary: {
      wrap: 'bg-[#EBF2FA] text-[#1E3A5F] border-[#BFDBFE]',
      dot: 'bg-[#1E3A5F]',
    },
    success: {
      wrap: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dot: 'bg-emerald-500',
    },
    warning: {
      wrap: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
    },
    danger: {
      wrap: 'bg-rose-50 text-rose-800 border-rose-200',
      dot: 'bg-rose-500',
    },
    info: {
      wrap: 'bg-blue-50 text-blue-800 border-blue-200',
      dot: 'bg-blue-500',
    },
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 leading-tight font-medium',
    md: 'text-xs px-2.5 py-0.5 leading-tight font-medium',
    lg: 'text-xs px-3 py-1 leading-normal font-semibold',
  };

  const currentVariant = variants[variant] || variants.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border ${currentVariant.wrap} ${sizes[size] || sizes.md} ${className}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${currentVariant.dot}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
