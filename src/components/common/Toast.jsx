import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

const TONES = {
  success: { cls: 'border-emerald-300 bg-white text-slate-800', bar: 'bg-emerald-600', icon: CheckCircle2, iconCls: 'text-emerald-600' },
  error: { cls: 'border-rose-300 bg-white text-slate-800', bar: 'bg-rose-600', icon: XCircle, iconCls: 'text-rose-600' },
  warning: { cls: 'border-amber-300 bg-white text-slate-800', bar: 'bg-amber-500', icon: AlertTriangle, iconCls: 'text-amber-600' },
  info: { cls: 'border-slate-300 bg-white text-slate-800', bar: 'bg-[#1E3A5F]', icon: Info, iconCls: 'text-[#1E3A5F]' },
};

/** App-wide notification stack (top-right desktop, top on mobile). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const notify = useCallback((message, tone = 'success', options = {}) => {
    const id = ++seq.current;
    setToasts((list) => [...list.slice(-3), { id, message, tone, title: options.title }]);
    const duration = options.duration ?? (tone === 'error' ? 7000 : 4000);
    if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:top-4">
        {toasts.map((t) => {
          const tone = TONES[t.tone] || TONES.info;
          const Icon = tone.icon;
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={`es-fade-in pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-sm border py-3 pl-4 pr-3 text-xs shadow-lg ${tone.cls}`}
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} aria-hidden="true" />
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.iconCls}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 leading-relaxed">
                {t.title && <p className="font-semibold text-slate-900">{t.title}</p>}
                <p>{t.message}</p>
              </div>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded-sm p-0.5 text-slate-400 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
