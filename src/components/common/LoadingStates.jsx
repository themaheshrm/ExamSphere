import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Enterprise Loading Spinner
 */
export function Spinner({ size = 'md', variant = 'primary', className = '' }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-8 w-8',
  };

  const variants = {
    primary: 'text-[#1E3A5F]',
    slate: 'text-slate-500',
    white: 'text-white',
  };

  return (
    <Loader2
      className={`animate-spin ${sizes[size] || sizes.md} ${variants[variant] || variants.primary} ${className}`}
      aria-label="Loading..."
    />
  );
}

/**
 * Skeleton Placeholder Block
 */
export function SkeletonBlock({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200/80 ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton Text Lines
 */
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton Table Row Placeholder
 */
export function SkeletonTableRow({ columns = 4 }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3.5 bg-slate-200 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}
