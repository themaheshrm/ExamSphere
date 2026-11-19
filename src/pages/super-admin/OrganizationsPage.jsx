import React from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Plus, Search, Building } from 'lucide-react';

export default function OrganizationsPage() {
  const tenants = [
    { name: 'Apex University System', domain: 'apex.examsphere.io', plan: 'Enterprise', created: 'Oct 14, 2025' },
    { name: 'Imperial Engineering College', domain: 'iec.examsphere.io', plan: 'Pro', created: 'Nov 02, 2025' },
    { name: 'National Medical Council', domain: 'nmc-gov.examsphere.io', plan: 'Enterprise Dedicated', created: 'Jan 10, 2026' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Institutions & Organizations</h1>
          <p className="text-sm text-slate-500">Manage tenant accounts, quotas, and licensing.</p>
        </div>
        <Button variant="primary" icon={Plus}>New Organization</Button>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Filter by organization name or domain..."
              className="w-full text-xs border border-slate-200 rounded-lg pl-9 pr-3 py-2 bg-slate-50 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tenants.map((t, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-sm transition">
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-lg bg-purple-100 text-purple-700">
                  <Building className="w-5 h-5" />
                </div>
                <Badge variant="purple">{t.plan}</Badge>
              </div>
              <h4 className="mt-3 font-semibold text-slate-800 text-sm">{t.name}</h4>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{t.domain}</p>
              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-400">
                <span>Created {t.created}</span>
                <span className="text-blue-600 font-medium cursor-pointer hover:underline">Manage &rarr;</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
