import React from 'react';

/**
 * Enterprise Data Table Component Suite
 * Follows university examination ERP tabular design:
 * Clean borders, subtle column headers, structured row alignment, and zero visual clutter.
 */
export function Table({ children, className = '' }) {
  return (
    <div className={`w-full overflow-x-auto rounded border border-slate-200 bg-white ${className}`}>
      <table className="w-full border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, className = '' }) {
  return (
    <thead className={`border-b border-slate-200 bg-slate-50/80 ${className}`}>
      {children}
    </thead>
  );
}

export function TableHead({ children, className = '', align = 'left', ...props }) {
  const alignmentClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <th
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${alignmentClass} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableBody({ children, className = '' }) {
  return (
    <tbody className={`divide-y divide-slate-100 ${className}`}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className = '', isSelected = false, ...props }) {
  return (
    <tr
      className={`transition-colors hover:bg-slate-50/80 ${
        isSelected ? 'bg-slate-50 font-medium' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, className = '', align = 'left', ...props }) {
  const alignmentClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <td
      className={`px-4 py-3 text-xs text-slate-700 align-middle ${alignmentClass} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, message = 'No records found' }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-8 text-center text-xs text-slate-400 font-medium"
      >
        {message}
      </td>
    </tr>
  );
}
