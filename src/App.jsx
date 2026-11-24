import React from 'react';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import { ToastProvider } from './components/common/Toast';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
