import React, { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import Navbar from '../components/navigation/Navbar';
import Sidebar from '../components/navigation/Sidebar';
import { useSettings } from '../context/SettingsContext';
import { Spinner } from '../components/common/LoadingStates';

/**
 * Portal shell: fixed sidebar (drawer below lg), sticky top bar, optional
 * platform-wide notice set by the super administrator.
 */
export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const notice = useSettings().settings.maintenanceNotice;

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-slate-900">
      <a href="#main-content" className="sr-only z-[80] rounded-sm bg-white px-3 py-2 text-sm font-semibold text-[#1E3A5F] focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex min-h-screen flex-col lg:pl-64">
        <Navbar sidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)} />
        {notice && (
          <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}
        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center" role="status"><Spinner size="lg" /><span className="sr-only">Loading page…</span></div>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
