import React, { useState } from 'react';
import { Edit3, Search, UserCog, UserPlus } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PageHeader from '../../components/common/PageHeader';
import Pagination from '../../components/common/Pagination';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import Badge from '../../components/common/Badge';
import Alert from '../../components/common/Alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { useToast } from '../../components/common/Toast';
import { platformService } from '../../services/platformService';
import { activityLogService } from '../../services/activityLogService';
import { usePagination } from '../../utils/usePagination';
import { useAuth } from '../../context/AuthContext';
import { INSTITUTION } from '../../utils/constants';
import { formatDate } from '../../utils/format';

const EMPTY = { name: '', email: '', role: 'admin', staffId: '', status: 'Active' };
const selectCls = 'es-select h-9 w-full rounded-sm border border-slate-300 bg-white pl-3 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]';

export default function UsersPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [users, setUsers] = useState(() => platformService.listUsers());
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [statusTarget, setStatusTarget] = useState(null);

  const term = search.trim().toLowerCase();
  const shown = users.filter((u) => (!term || `${u.name} ${u.email} ${u.staffId || ''}`.toLowerCase().includes(term)) && (!roleFilter || u.role === roleFilter));
  const { pageItems, paginationProps, resetPage } = usePagination(shown, 10);

  const save = (event) => {
    event.preventDefault();
    try {
      const saved = platformService.saveUser(editing);
      activityLogService.log({ action: editing.id ? 'Updated user account' : 'Created user account', category: 'user', actor: user, target: saved.email, details: saved.role });
      notify(editing.id ? `${saved.name} updated.` : `${saved.name} added to the directory.`);
      setUsers(platformService.listUsers());
      setEditing(null);
      setErrors({});
    } catch (error) {
      setErrors(error.fieldErrors || {});
    }
  };

  const toggleStatus = () => {
    const next = statusTarget.status === 'Active' ? 'Disabled' : 'Active';
    platformService.saveUser({ ...statusTarget, status: next });
    activityLogService.log({ action: next === 'Disabled' ? 'Disabled user account' : 'Enabled user account', category: 'user', actor: user, target: statusTarget.email, severity: next === 'Disabled' ? 'warning' : 'info' });
    notify(`${statusTarget.name} ${next === 'Disabled' ? 'disabled' : 'enabled'}.`, next === 'Disabled' ? 'warning' : 'success');
    setUsers(platformService.listUsers());
    setStatusTarget(null);
  };

  const isSelf = (u) => u.email === user?.email;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform Administration"
        title="Staff Accounts"
        description={`Examination office administrators and platform operators for ${INSTITUTION.name}. Candidate accounts are managed on the Candidates page.`}
        actions={<Button icon={UserPlus} onClick={() => { setEditing(EMPTY); setErrors({}); }}>Add user</Button>}
      />

      <Alert tone="info">
        This directory records each staff member's role and status. Sign-in credentials are issued separately through Dr. AIT's authentication provider.
      </Alert>

      <Card bodyClassName="p-0">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[2fr_1fr]">
          <InputField aria-label="Search users" placeholder="Search by name, email or staff ID" prefixIcon={Search} value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          <select aria-label="Filter by role" className={selectCls} value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); resetPage(); }}>
            <option value="">All roles</option>
            <option value="admin">Examination office administrators</option>
            <option value="super-admin">Super administrators</option>
          </select>
        </div>
        {shown.length === 0 ? (
          <EmptyState icon={UserCog} title="No users found" description="Try another search or role filter." />
        ) : (
          <>
            <Table className="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden sm:table-cell">Role</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead align="right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{u.name}{isSelf(u) && <span className="ml-1 text-[11px] text-slate-500">(you)</span>}</p>
                      <p className="text-[11px] text-slate-500">{u.email}{u.staffId ? ` · ${u.staffId}` : ''}</p>
                      <p className="mt-1 flex items-center gap-2 sm:hidden"><Badge size="sm" variant={u.role === 'super-admin' ? 'primary' : 'neutral'}>{u.role === 'super-admin' ? 'Super admin' : 'Exam office admin'}</Badge><StatusBadge status={u.status} size="sm" /></p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell"><Badge size="sm" variant={u.role === 'super-admin' ? 'primary' : 'neutral'}>{u.role === 'super-admin' ? 'Super admin' : 'Exam office admin'}</Badge></TableCell>
                    <TableCell className="hidden lg:table-cell">{formatDate(u.createdAt)}</TableCell>
                    <TableCell className="hidden sm:table-cell"><StatusBadge status={u.status} size="sm" /></TableCell>
                    <TableCell align="right">
                      <div className="flex justify-end gap-1">
                        <button type="button" aria-label={`Edit ${u.name}`} onClick={() => { setEditing({ ...u, staffId: u.staffId || '' }); setErrors({}); }} className="rounded-sm p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1E3A5F]"><Edit3 className="h-4 w-4" /></button>
                        {!isSelf(u) && <Button size="sm" variant="ghost" onClick={() => setStatusTarget(u)}>{u.status === 'Active' ? 'Disable' : 'Enable'}</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination {...paginationProps} pageSizeOptions={[10, 25]} />
          </>
        )}
      </Card>

      <Modal
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'Add user'}
        maxWidth="max-w-xl"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="user-form">{editing?.id ? 'Save changes' : 'Add user'}</Button>
          </>
        )}
      >
        {editing && (
          <form id="user-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
            <InputField className="sm:col-span-2" label="Full name" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} error={errors.name} />
            <InputField className="sm:col-span-2" label="Email" type="email" required value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} error={errors.email} />
            <div>
              <label htmlFor="user-role" className="mb-1 block text-xs font-medium text-slate-800">Role <span className="text-red-600">*</span></label>
              <select id="user-role" className={selectCls} value={editing.role} disabled={isSelf(editing)} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                <option value="admin">Examination office administrator</option>
                <option value="super-admin">Super administrator</option>
              </select>
            </div>
            <InputField label="Staff ID" value={editing.staffId} disabled={editing.role !== 'admin'} onChange={(e) => setEditing({ ...editing, staffId: e.target.value.toUpperCase() })} inputClassName="font-mono" />
            {editing.role === 'super-admin' && (
              <Alert tone="warning" className="sm:col-span-2">Super administrators can manage staff accounts and all platform settings.</Alert>
            )}
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={toggleStatus}
        tone={statusTarget?.status === 'Active' ? 'danger' : 'primary'}
        title={statusTarget?.status === 'Active' ? `Disable ${statusTarget?.name}?` : `Enable ${statusTarget?.name}?`}
        confirmLabel={statusTarget?.status === 'Active' ? 'Disable account' : 'Enable account'}
        description={statusTarget?.status === 'Active' ? 'The user will not be able to sign in until the account is enabled again.' : 'The user can sign in again immediately.'}
      />
    </div>
  );
}
