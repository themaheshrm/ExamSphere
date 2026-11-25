import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { notificationService } from '../services/notificationService';
import { useAsync } from './useAsync';
import { useDataVersion } from './useDataVersion';

/** Notifications for the signed-in user (refreshes on data changes and every minute). */
export function useNotifications() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const version = useDataVersion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  const { data, loading, error } = useAsync(() => notificationService.load(user, settings), [user?.id, user?.role, version, settings.maintenanceNotice, tick]);
  const items = data || [];
  return { items, unread: items.filter((n) => !n.read), loading, error, markRead: (ids) => notificationService.markRead(user, ids) };
}
