import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

/**
 * Enterprise Breadcrumb Navigation
 * Conveys clear hierarchical context in multi-tier administrative workflows.
 */
export default function Breadcrumbs({ items = [], className = '' }) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center text-xs ${className}`}>
      <ol className="flex items-center space-x-1.5 text-slate-500">
        <li>
          <Link
            to="/"
            className="flex items-center text-slate-400 hover:text-slate-700 transition"
            title="Home"
          >
            <Home className="h-3.5 w-3.5" />
          </Link>
        </li>

        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.path || item.label} className="flex items-center space-x-1.5">
              <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
              {isLast || !item.path ? (
                <span className="font-semibold text-slate-800" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.path}
                  className="hover:text-slate-800 transition"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
