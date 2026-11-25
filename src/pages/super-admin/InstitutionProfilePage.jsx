import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import PageHeader from '../../components/common/PageHeader';
import { InstitutionMark } from '../../components/public/PublicChrome';
import { INSTITUTION } from '../../utils/constants';
import { useSettings } from '../../context/SettingsContext';
import { platformApi } from '../../services/api/platformApi';
import { rosterApi } from '../../services/api/rosterApi';
import { useAsync } from '../../utils/useAsync';

/**
 * Dr. AIT institution profile. ExamSphere serves this institution only, so
 * the record is fixed; examination-office contact details are edited in
 * Platform Settings.
 */
export default function InstitutionProfilePage() {
  const { settings } = useSettings();
  // Database record (institutions row) merged over the fixed deployment constants.
  const { data } = useAsync(async () => {
    const [row, staff, students] = await Promise.all([platformApi.institution(), platformApi.staffCounts(), rosterApi.list()]);
    return { row, staff, students };
  });
  const institution = {
    ...INSTITUTION,
    ...(data?.row ? { name: data.row.name, shortName: data.row.short_name || INSTITUTION.shortName, code: data.row.code, emailDomain: data.row.email_domain || INSTITUTION.emailDomain } : {}),
    status: data?.row && !data.row.is_active ? 'Inactive' : INSTITUTION.status,
  };
  const students = data?.students || [];
  const departments = [...new Set(students.map((s) => s.department).filter(Boolean))];

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
                ['Staff accounts (admins)', data ? data.staff.total : '—'],
                ['Student accounts', data ? students.length : '—'],
                ['Departments with candidates', departments.length],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
            <Link to="/super-admin/admins" className="mt-3 inline-block text-xs font-semibold text-[#1E3A5F] hover:underline">Admin Management</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
