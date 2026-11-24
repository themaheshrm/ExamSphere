import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Layers, ArrowRight } from 'lucide-react';

const COPYRIGHT_YEAR = new Date().getFullYear();

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Public Top Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/30">
              <Layers className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Exam<span className="text-blue-600">Sphere</span>
            </span>
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              to="/student"
              className="text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 transition"
            >
              Candidate Area
            </Link>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm transition"
            >
              <span>Access Portals</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Outlet */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Public Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p>© {COPYRIGHT_YEAR} ExamSphere CBT Platform. Engineered for Scalable Assessments.</p>
        </div>
      </footer>
    </div>
  );
}
