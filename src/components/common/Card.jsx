import React from 'react';

/**
 * Enterprise Card Component
 * Structured container with crisp borders, subtle elevation, and clear section dividers.
 */
export default function Card({
  children,
  title,
  subtitle,
  action,
  footer,
  className = '',
  bodyClassName = '',
  headerClassName = '',
}) {
  return (
    <div
      className={`rounded-sm border border-slate-200 bg-white ${className}`}
    >
      {(title || subtitle || action) && (
        <div
          className={`flex items-start sm:items-center justify-between border-b border-slate-200 px-5 py-3.5 gap-3 ${headerClassName}`}
        >
          <div>
            {title && (
              <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className={`${/(^|\s)p[xy]?-/.test(bodyClassName) ? '' : 'p-5'} ${bodyClassName}`}>{children}</div>

      {footer && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-600 rounded-b-sm">
          {footer}
        </div>
      )}
    </div>
  );
}
