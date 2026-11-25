import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { platformApi, DEFAULT_SETTINGS } from '../services/api/platformApi';

const SettingsContext = createContext({ settings: DEFAULT_SETTINGS, loaded: false, reload: () => {} });

/** Platform settings from Supabase (readable on public pages); defaults until loaded. */
export function SettingsProvider({ children }) {
  const [state, setState] = useState({ settings: DEFAULT_SETTINGS, loaded: false });
  const load = useCallback(() => platformApi.settings()
    .then((settings) => setState({ settings, loaded: true }))
    .catch(() => setState((s) => ({ ...s, loaded: true }))), []);
  useEffect(() => {
    let alive = true;
    platformApi.settings()
      .then((settings) => { if (alive) setState({ settings, loaded: true }); })
      .catch(() => { if (alive) setState((s) => ({ ...s, loaded: true })); });
    return () => { alive = false; };
  }, []);
  return <SettingsContext.Provider value={{ ...state, reload: load }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
