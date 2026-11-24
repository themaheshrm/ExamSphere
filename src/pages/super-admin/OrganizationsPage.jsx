import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Edit3, Plus, Search } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { useToast } from '../../components/common/Toast';
import { platformService } from '../../services/platformService';
import { activityLogService } from '../../services/activityLogService';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../utils/format';

const EMPTY = { code: '', name: '', city: '', domain: '', contactEmail: '', status: 'Active' };

export default function OrganizationsPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [institutions, setInstitutions] = useState(() => platformService.listInstitutions());
  const users = platformService.listUsers();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(() => (searchParams.get('new') ? EMPTY : null));
  const [errors, setErrors] = useState({});
  const [statusTarget, setStatusTarget] = useState(null);

  const term = search.trim().toLowerCase();
  const shown = institutions.filter((i) => !term || `${i.name} ${i.code} ${i.city} ${i.domain}`.toLowerCase().includes(term));

  const close = () => {
    setEditing(null);
    setErrors({});
    if (searchParams.get('new')) setSearchParams({});
  };

  const save = (event) => {
    event.preventDefault();
    try {
      const saved = platformService.saveInstitution(editing);
      activityLogService.log({ action: editing.id ? 'Updated institution' : 'Registered institution', category: 'institution', actor: user, target: saved.code, details: saved.name });
      notify(editing.id ? `${saved.name} updated.` : `${saved.name} registered.`);
      setInstitutions(platformService.listInstitutions());
      close();
    } catch (error) {
      setErrors(error.fieldErrors || {});
    }
  };

  const toggleStatus = () => {
    const next = statusTarget.status === 'Active' ? 'Suspended' : 'Active';
    platformService.saveInstitution({ ...statusTarget, status: next });
    activityLogService.log({ action: next === 'Suspended' ? 'Suspended institution' : 'Reactivated institution', category: 'institution', actor: user, target: statusTarget.code, severity: next === 'Suspended' ? 'warning' : 'info' });
    notify(`${statusTarget.name} ${next === 'Suspended' ? 'suspended' : 'reactivated'}.`, next === 'Suspended' ? 'warning' : 'success');
    setInstitutions(platformService.listInstitutions());
    setStatusTarget(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform Administration"
        title="Institutions"
        description="Register institutions, maintain their contact details and control access."
        actions={<Button icon={Plus} onClick={() => setEditing(EMPTY)}>Add institution</Button>}
      />

      <Card bodyClassName="p-0">
        <div className="border-b border-slate-200 p-4">
          <InputField aria-label="Search institutions" placeholder="Search by name, code, city or domain" prefixIcon={Search} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
        </div>
        {shown.length === 0 ? (
          <EmptyState icon={Building2} title="No institutions found" description="Try another search, or register a new institution." />
        ) : (
          <Table className="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>Institution</TableHead>
                <TableHead className="hidden sm:table-cell">Code</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead align="center" className="hidden sm:table-cell">Admins</TableHead>
                <TableHead className="hidden lg:table-cell">Registered</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((i) => (
                <TableRow key={i.id}>
                  <TableCell><p className="font-medium text-slate-900">{i.name}</p><p className="text-[11px] text-slate-500">{i.city}</p><p className="mt-1 flex items-center gap-2 sm:hidden"><span className="font-mono text-[11px] font-semibold text-[#1E3A5F]">{i.code}</span><StatusBadge status={i.status} size="sm" /></p></TableCell>
                  <TableCell className="hidden font-mono font-semibold text-[#1E3A5F] sm:table-cell">{i.code}</TableCell>
                  <TableCell className="hidden md:table-cell">{i.contactEmail || '—'}<span className="block text-[11px] text-slate-500">{i.domain}</span></TableCell>
                  <TableCell align="center" className="hidden tabular-nums sm:table-cell">{users.filter((u) => u.institutionId === i.id).length}</TableCell>
                  <TableCell className="hidden lg:table-cell">{formatDate(i.createdAt)}</TableCell>
                  <TableCell className="hidden sm:table-cell"><StatusBadge status={i.status} size="sm" /></TableCell>
                  <TableCell align="right">
                    <div className="flex justify-end gap-1">
                      <button type="button" aria-label={`Edit ${i.name}`} onClick={() => setEditing({ ...i })} className="rounded-sm p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1E3A5F]"><Edit3 className="h-4 w-4" /></button>
                      <Button size="sm" variant="ghost" onClick={() => setStatusTarget(i)}>{i.status === 'Active' ? 'Suspend' : 'Reactivate'}</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        isOpen={Boolean(editing)}
        onClose={close}
        title={editing?.id ? `Edit ${editing.name}` : 'Register institution'}
        maxWidth="max-w-2xl"
        footer={(
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button type="submit" form="institution-form">{editing?.id ? 'Save changes' : 'Register institution'}</Button>
          </>
        )}
      >
        {editing && (
          <form id="institution-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
            <InputField className="sm:col-span-2" label="Institution name" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} error={errors.name} />
            <InputField label="Institution code" required value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} error={errors.code} helperText="e.g. 1DA (VTU college code)" inputClassName="font-mono uppercase" />
            <InputField label="City" value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
            <InputField label="Email domain" value={editing.domain} onChange={(e) => setEditing({ ...editing, domain: e.target.value })} error={errors.domain} placeholder="college.edu.in" />
            <InputField label="Examination office email" type="email" value={editing.contactEmail} onChange={(e) => setEditing({ ...editing, contactEmail: e.target.value })} error={errors.contactEmail} />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={toggleStatus}
        tone={statusTarget?.status === 'Active' ? 'danger' : 'primary'}
        title={statusTarget?.status === 'Active' ? `Suspend ${statusTarget?.name}?` : `Reactivate ${statusTarget?.name}?`}
        confirmLabel={statusTarget?.status === 'Active' ? 'Suspend institution' : 'Reactivate'}
        description={statusTarget?.status === 'Active'
          ? 'Administrators of this institution will lose access until it is reactivated. Examination records are kept.'
          : 'Administrators of this institution regain access immediately.'}
      />
    </div>
  );
}
