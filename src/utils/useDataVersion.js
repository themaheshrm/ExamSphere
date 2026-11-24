import { useEffect, useState } from 'react';

/**
 * Re-render when shared client data changes (same tab via 'examsphere:data',
 * other tabs via 'storage'). Returns a counter to use as a memo dependency.
 */
export function useDataVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener('examsphere:data', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('examsphere:data', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);
  return version;
}
