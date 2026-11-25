import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import PageHeader from '../../components/common/PageHeader';
import { InstitutionMark } from '../../components/public/PublicChrome';
import { platformService } from '../../services/platformService';
import { studentRosterService } from '../../services/studentRosterService';
import { useDataVersion } from '../../utils/useDataVersion';

/**
 * Dr. AIT institution profile. ExamSphere serves this institution only, so
 * the record is fixed; examination-office contact details are edited in
 * Platform Settings.
 */
export default function InstitutionProfilePage() {
  useDataVersion();
  const institution = platformService.getInstitution();
  const settings = platformService.getSettings();
  const admins = platformService.listUsers().filter((u) => u.role === 'admin');
  const roster = studentRosterService.list();
  const departments = [...new Set(roster.map((s) => s.department))];

  const rows = [
    ['Institution', institution.name],
    ['Short name', institution.shortName],
    ['VTU college code', institution.code],
    ['Status', institution.status],
    ['Established', institution.established],
    ['Email domain', `@${institution.emailDomain}`],
    ['Address', institution.addressLines.join(' ')],
    ['Examination centre', institution.examCentre],
    ['Academic year', institution.academicYear],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform Administration"
        title="Institution Profile"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Institution details" subtitle="Fixed for this deployment">
          <div className="mb-5 flex items-center gap-4">
            <InstitutionMark />
            <div>
              <p className="text-base font-semibold text-[#1E3A5F]">{institution.name}</p>
              <p className="text-xs text-slate-500">{institution.status}</p>
            </div>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-3">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-slate-900 sm:col-span-2">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="space-y-6">
          <Card title={institution.office}>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-[11px] text-slate-500">Helpline</dt><dd className="font-medium text-slate-900">{settings.helplinePhone}</dd></div>
              <div><dt className="text-[11px] text-slate-500">Email</dt><dd className="font-medium text-slate-900">{settings.supportEmail}</dd></div>
            </dl>
            <Link to="/super-admin/settings" className="mt-4 inline-block text-xs font-semibold text-[#1E3A5F] hover:underline">Edit in Platform Settings</Link>
          </Card>

          <Card title="At a glance">
            <dl className="divide-y divide-slate-100 text-xs">
              {[
                ['Examination office administrators', admins.length],
                ['Candidates on roster', roster.length],
                ['Departments with candidates', departments.length],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
            <Link to="/super-admin/users" className="mt-3 inline-block text-xs font-semibold text-[#1E3A5F] hover:underline">Manage staff accounts</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
