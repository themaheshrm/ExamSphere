import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(`gap-${p}`);
    out.push(p);
  });
  return out;
}

/** Table footer: range summary, optional page-size picker, compact page list. */
export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  className = '',
}) {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  const btn = 'h-8 min-w-8 rounded-sm border px-2 text-xs font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav aria-label="Pagination" className={`flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex items-center gap-3">
        <span>
          Showing <strong className="font-semibold text-slate-800">{startItem}–{endItem}</strong> of{' '}
          <strong className="font-semibold text-slate-800">{totalItems}</strong>
        </span>
        {pageSizeOptions && onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span className="sr-only sm:not-sr-only">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-sm border border-slate-300 bg-white px-2 text-xs focus:border-[#1E3A5F] focus:outline-none"
            >
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button type="button" className={`${btn} border-slate-300 bg-white hover:bg-slate-50`} disabled={currentPage <= 1} onClick={() => onPageChange?.(currentPage - 1)} aria-label="Previous page">
          <ChevronLeft className="mx-auto h-3.5 w-3.5" />
        </button>
        {pageWindow(currentPage, Math.max(totalPages, 1)).map((p) => (typeof p === 'string' ? (
          <span key={p} className="px-1 text-slate-400">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange?.(p)}
            aria-current={p === currentPage ? 'page' : undefined}
            className={`${btn} ${p === currentPage ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {p}
          </button>
        )))}
        <button type="button" className={`${btn} border-slate-300 bg-white hover:bg-slate-50`} disabled={currentPage >= totalPages} onClick={() => onPageChange?.(currentPage + 1)} aria-label="Next page">
          <ChevronRight className="mx-auto h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
}
