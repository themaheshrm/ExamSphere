import React from 'react';
import { Inbox } from 'lucide-react';

/** Consistent empty state for tables, lists and panels. */
export default function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'px-4 py-6' : 'px-6 py-12'} ${className}`}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-slate-50 text-slate-400">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
