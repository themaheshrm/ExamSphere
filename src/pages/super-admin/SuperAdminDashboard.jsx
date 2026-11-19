import React from 'react';
import { Building2, Users, Server, ShieldCheck, Activity, ArrowUpRight } from 'lucide-react';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';

export default function SuperAdminDashboard() {
  const stats = [
    { title: 'Total Institutions', value: '48', change: '12%', icon: Building2, iconColor: 'text-purple-600 bg-purple-50' },
    { title: 'Active Students', value: '184,200', change: '18.4%', icon: Users, iconColor: 'text-blue-600 bg-blue-50' },
    { title: 'System Nodes', value: '12 / 12', change: '100% online', icon: Server, iconColor: 'text-emerald-600 bg-emerald-50' },
    { title: 'Exams Concluded', value: '1,492', change: '34 today', icon: ShieldCheck, iconColor: 'text-amber-600 bg-amber-50' },
  ];

  const organizations = [
    { id: 1, name: 'National Institute of Technology', code: 'NIT-HQ', students: '32,400', examsActive: 5, status: 'Active' },
    { id: 2, name: 'Apex Medical Sciences Academy', code: 'AMSA-01', students: '14,210', examsActive: 2, status: 'Active' },
    { id: 3, name: 'State Polytechnic Examination Board', code: 'SPEB-WB', students: '68,900', examsActive: 8, status: 'Active' },
    { id: 4, name: 'Metropolitan Business School', code: 'MBS-MUM', students: '9,800', examsActive: 1, status: 'Active' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Super Admin Control Center
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Global system telemetry, multi-tenant institutions, and platform health.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="purple" size="lg" className="gap-1.5">
            <Activity className="w-3.5 h-3.5 animate-pulse text-purple-600" />
            Cluster Status: Healthy
          </Badge>
          <Button variant="primary" size="md">
            Add Institution
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <StatCard key={idx} {...stat} />
        ))}
      </div>

      {/* Main Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Managed Institutions Table */}
        <div className="lg:col-span-2">
          <Card
            title="Registered Institutions & Boards"
            subtitle="Centralized tenant tracking across organizations"
            action={
              <Button variant="ghost" size="sm" icon={ArrowUpRight}>
                View All
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3">Institution Name</th>
                    <th className="pb-3">Code</th>
                    <th className="pb-3">Enrolled</th>
                    <th className="pb-3">Live Exams</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {organizations.map((org) => (
                    <tr key={org.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 font-medium text-slate-800">{org.name}</td>
                      <td className="py-3.5 text-slate-500 font-mono text-[11px]">{org.code}</td>
                      <td className="py-3.5 text-slate-600">{org.students}</td>
                      <td className="py-3.5">
                        <span className="font-semibold text-blue-600">{org.examsActive}</span>
                      </td>
                      <td className="py-3.5">
                        <Badge variant="success" size="sm">{org.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Server Health & Security Audit Card */}
        <div className="space-y-6">
          <Card title="Cloud Infrastructure" subtitle="Real-time test server load">
            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600">CPU Compute Load</span>
                  <span className="font-semibold text-slate-800">38%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full w-[38%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600">Active WebSocket Sockets</span>
                  <span className="font-semibold text-slate-800">4,210 concurrent</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full w-[54%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600">Database Read Replica Latency</span>
                  <span className="font-semibold text-slate-800">12ms</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-purple-500 h-2 rounded-full w-[15%]" />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
