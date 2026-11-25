import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Load data with loading / error / reload states. Previous data stays visible
 * while reloading. `deps` change → reload; `reload()` forces one.
 */
export function useAsync(fn, deps = []) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const [nonce, setNonce] = useState(0);
  const key = `${JSON.stringify(deps)}#${nonce}`;
  const [state, setState] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => fnRef.current())
      .then(
        (data) => { if (alive) setState({ key, data, error: null }); },
        (error) => { if (alive) setState((prev) => ({ key, data: prev.data, error })); },
      );
    return () => { alive = false; };
  }, [key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: state.data, error: state.key === key ? state.error : null, loading: state.key !== key, reload };
}

/** Tell mounted pages that server data changed (they reload via useDataVersion). */
export function emitDataChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('examsphere:data'));
}

/**
 * Re-run `reload` when this tab changes server data (emitDataChanged), when the
 * window regains focus, and — when `intervalMs` is set — periodically while
 * the page is visible (live monitoring of other devices' activity).
 */
export function useAutoReload(reload, intervalMs = 0) {
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('examsphere:data', reload);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', onVisible);
    const timer = intervalMs ? window.setInterval(() => { if (document.visibilityState === 'visible') reload(); }, intervalMs) : null;
    return () => {
      window.removeEventListener('examsphere:data', reload);
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [reload, intervalMs]);
}
