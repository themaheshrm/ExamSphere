import React, { useRef } from 'react';

/**
 * Accessible underline tabs (WAI-ARIA tablist with arrow-key navigation).
 * tabs: [{ id, label, count?, icon? }]
 */
export default function Tabs({ tabs, value, onChange, label = 'Sections', className = '' }) {
  const refs = useRef({});

  const onKeyDown = (event, index) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div className={`-mb-px overflow-x-auto border-b border-slate-200 ${className}`}>
      <div role="tablist" aria-label={label} className="flex min-w-max gap-1">
        {tabs.map((tab, index) => {
          const active = tab.id === value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              ref={(el) => { refs.current[tab.id] = el; }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
                active ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-sm px-1.5 py-px text-[10px] tabular-nums ${active ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TabPanel({ id, children, className = '' }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className={className}>
      {children}
    </div>
  );
}
