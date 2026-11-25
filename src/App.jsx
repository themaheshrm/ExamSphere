import React from 'react';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import { ToastProvider } from './components/common/Toast';
import { SettingsProvider } from './context/SettingsContext';

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
