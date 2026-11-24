import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';

const TONES = {
  info: { wrap: 'border-[#D1DEEB] bg-[#F0F4F8] text-[#1E3A5F]', icon: Info },
  success: { wrap: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
  warning: { wrap: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle },
  danger: { wrap: 'border-rose-200 bg-rose-50 text-rose-900', icon: XCircle },
};

/** Inline, persistent message (validation summaries, page-level notices). */
export default function Alert({ tone = 'info', title, children, onDismiss, action, className = '' }) {
  const t = TONES[tone] || TONES.info;
  const Icon = t.icon;
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-sm border px-4 py-3 text-xs ${t.wrap} ${className}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded-sm p-0.5 opacity-70 hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
