import React from 'react';

/**
 * Enterprise Stat Metric Card
 * Follows clean ERP dashboard metrics: restrained elevation, crisp borders, and legible typography.
 */
export default function StatCard({
  title,
  value,
  change,
  isPositive = true,
  icon: Icon,
  iconColor = 'text-[#1E3A5F] bg-[#EBF2FA]',
}) {
  return (
    <div className="bg-white rounded border border-slate-200 p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {title}
          </p>
          <h4 className="text-xl font-bold text-slate-900 mt-1">{value}</h4>
        </div>
        {Icon && (
          <div className={`p-2.5 rounded ${iconColor}`}>
            <Icon className="w-5 h-5 shrink-0" />
          </div>
        )}
      </div>
      {change && (
        <div className="mt-2.5 flex items-center text-xs">
          <span
            className={`font-semibold ${
              isPositive ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {isPositive ? '↑' : '↓'} {change}
          </span>
          <span className="text-slate-400 ml-1.5 text-[11px]">trend</span>
        </div>
      )}
    </div>
  );
}
