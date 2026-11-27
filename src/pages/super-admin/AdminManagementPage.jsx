import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Power, RefreshCw, UserPlus, UserCog } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import Alert from '../../components/common/Alert';
import CredentialsDialog from '../../components/common/CredentialsDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { useToast } from '../../components/common/Toast';
import { useAuth } from '../../context/AuthContext';
import { adminManagementService } from '../../services/adminManagementService';
import { activityLogService } from '../../services/activityLogService';
import { examsApi } from '../../services/api/examsApi';
import { useAsync } from '../../utils/useAsync';
import { formatDateTime, formatRelative } from '../../utils/format';

const selectCls = 'es-select h-9 w-full rounded-sm border border-slate-300 bg-white pl-3 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] disabled:bg-slate-100';
const EMPTY = { name: '', adminId: '', email: '', subjectCode: '', status: 'Active' };
const TYPE_LABEL = { subject: 'Subject Admin' };

function Field({ id, label, required, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-800">{label}{required && <span className="text-red-600"> *</span>}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Subject options; a subject held by another active subject admin is disabled. */
function SubjectSelect({ id, subjects, value, onChange, selfAdminId }) {
  return (
    <select id={id} className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select subject</option>
      {subjects.map((s) => {
        const others = s.assignedTo.filter((a) => a !== selfAdminId);
        return <option key={s.code} value={s.code} disabled={others.length > 0}>{s.title}{others.length ? ` — ${others.join(', ')}` : ''}</option>;
      })}
    </select>
  );
}

function SubjectActivity({ admin }) {
  const subjectCode = admin.subjectCode || null;
  const { data } = useAsync(async () => {
    if (!subjectCode) return null;
    const [exams, log] = await Promise.all([examsApi.list(), activityLogService.list({ limit: 200 })]);
    return { exam: exams.find((e) => e.courseCode === subjectCode) || null, actions: log.filter((e) => e.userId === admin.id).slice(0, 5) };
  }, [subjectCode, admin.id]);
  if (!subjectCode) return null;
  const state = data?.exam;
  const actions = data?.actions || [];
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Examination activity · {admin.subjectCode}</h3>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200 text-center text-xs">
        {[['Examination', !data ? '…' : state ? (state.isPublished ? 'Published' : state.status === 'closed' ? 'Closed' : 'Draft') : 'Not created'],
          ['In progress', state ? state.activeAttempts : 0],
          ['Submitted', state ? state.submittedAttempts : 0]].map(([k, v]) => (
          <div key={k} className="bg-white p-2.5"><dt className="text-slate-500">{k}</dt><dd className="mt-0.5 font-semibold text-slate-900">{v}</dd></div>
        ))}
      </dl>
      {actions.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 text-xs">
          {actions.map((e) => <li key={e.id} className="flex justify-between gap-3 py-1.5"><span className="text-slate-800">{e.action}{e.target ? ` · ${e.target}` : ''}</span><span className="shrink-0 text-slate-500">{formatRelative(e.at)}</span></li>)}
        </ul>
      )}
    </section>
  );
}

export default function AdminManagementPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [data, setData] = useState({ admins: [], subjects: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [managing, setManaging] = useState(null); // admin record
  const [assign, setAssign] = useState({ subjectCode: '' });
  const [assignErrors, setAssignErrors] = useState({});
  const [confirm, setConfirm] = useState(null); // 'reset' | 'status'
  const [credentials, setCredentials] = useState(null); // { title, values } — memory only

  // Editing a field clears its stale error.
  const setField = (key, value) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => ({ ...e, [key]: undefined, form: undefined })); };
  const log = (action, target, details) => activityLogService.log({ action, category: 'account', actor: user, target, details });

  const fetchList = useCallback(async () => {
    try {
      const result = await adminManagementService.list();
      setData({ admins: result?.admins || [], subjects: result?.subjects || [] });
      setLoadError('');
      return result;
    } catch (error) {
      setLoadError(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    adminManagementService.list()
      .then((result) => { if (alive) { setData({ admins: result?.admins || [], subjects: result?.subjects || [] }); setLoadError(''); } })
      .catch((error) => { if (alive) setLoadError(error.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  const load = useCallback(() => { setLoading(true); return fetchList(); }, [fetchList]);

  const openManage = (record) => {
    setManaging(record);
    setAssign({ subjectCode: record.subjectCode || '' });
    setAssignErrors({});
  };
  const refreshManaged = async (id) => {
    const result = await load();
    const next = result?.admins.find((a) => a.id === id);
    if (next) openManage(next);
  };

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { admin, credentials: issued } = await adminManagementService.create(form);
      log('Created administrator', admin.adminId, `Subject Admin · ${admin.subjectCode}`);
      setAdding(false);
      setCredentials({ title: 'Administrator account created', values: issued });
      load();
    } catch (error) {
      setErrors(error.fieldErrors || { form: error.message });
    } finally {
      setBusy(false);
    }
  };

  const saveAssignment = async () => {
    setBusy(true);
    try {
      const { admin } = await adminManagementService.assignSubject(managing.id, assign.subjectCode);
      log('Changed administrator subject', admin.adminId || admin.email, admin.subjectCode);
      notify(`${admin.adminId || admin.email} updated.`);
      await refreshManaged(managing.id);
    } catch (error) {
      setAssignErrors(error.fieldErrors || { form: error.message });
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    const target = managing;
    setBusy(true);
    try {
      if (confirm === 'reset') {
        const { credentials: issued } = await adminManagementService.resetPassword(target.id);
        log('Reset administrator password', target.adminId || target.email);
        setCredentials({ title: 'Temporary password', values: issued });
      } else {
        const next = target.status === 'Active' ? 'Inactive' : 'Active';
        await adminManagementService.setStatus(target.id, next);
        log(next === 'Active' ? 'Activated administrator' : 'Deactivated administrator', target.adminId || target.email);
        notify(`${target.adminId || target.email} ${next === 'Active' ? 'activated' : 'deactivated'}.`, next === 'Active' ? 'success' : 'warning');
      }
      await refreshManaged(target.id);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const issued = credentials?.values;
  const copyText = issued ? [
    'ExamSphere — Dr. AIT staff sign-in',
    `Admin ID: ${issued.adminId || '—'}`,
    `Email: ${issued.email}`,
    `Temporary Password: ${issued.temporaryPassword}`,
    `Sign in: ${window.location.origin}/login → Staff Login. A new password is required at first sign-in.`,
  ].join('\n') : '';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform Administration"
        title="Admin Management"
        actions={(
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={load} isLoading={loading}>Refresh</Button>
            <Button icon={UserPlus} onClick={() => { setForm({ ...EMPTY }); setErrors({}); setAdding(true); }} disabled={Boolean(loadError)}>Add admin</Button>
          </>
        )}
      />

      {loadError && <Alert tone="danger" title="Could not load administrators">{loadError}</Alert>}

      <Card bodyClassName="p-0">
        {!loading && data.admins.length === 0 ? (
          <EmptyState icon={UserCog} title={loadError ? 'Unavailable' : 'No administrators'} />
        ) : (
          <Table className="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>Admin ID</TableHead>
                <TableHead>Admin Name</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead className="hidden sm:table-cell">Assigned Subject</TableHead>
                <TableHead className="hidden md:table-cell">Subject Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.admins.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[#1E3A5F]">{a.adminId || '—'}</TableCell>
                  <TableCell>
                    <p className="font-medium text-slate-900">{a.name}</p>
                    <p className="text-[11px] text-slate-500 lg:hidden">{a.email}</p>
                    <p className="text-[11px] text-slate-500 sm:hidden">{a.subjectShort || 'No subject assigned'}</p>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{a.email}</TableCell>
                  <TableCell className="hidden sm:table-cell">{a.subjectShort || <span className="text-amber-700">No subject assigned</span>}</TableCell>
                  <TableCell className="hidden font-mono md:table-cell">{a.subjectCode || '—'}</TableCell>
                  <TableCell><StatusBadge status={a.status} size="sm" /></TableCell>
                  <TableCell align="right"><Button size="sm" variant="secondary" onClick={() => openManage(a)} aria-label={`Manage ${a.adminId || a.email}`}>Manage</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* ── Add admin ── */}
      <Modal
        isOpen={adding}
        onClose={() => setAdding(false)}
        title="Add admin"
        maxWidth="max-w-2xl"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAdding(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" form="admin-form" isLoading={busy}>Create admin</Button>
          </>
        )}
      >
        <form id="admin-form" onSubmit={create} className="grid gap-4 sm:grid-cols-2" noValidate>
          {errors.form && <div className="sm:col-span-2"><Alert tone="danger">{errors.form}</Alert></div>}
          <InputField label="Full name" required value={form.name} onChange={(e) => setField('name', e.target.value)} error={errors.name} />
          <InputField label="Admin ID" required value={form.adminId} onChange={(e) => setField('adminId', e.target.value.toUpperCase())} error={errors.adminId} placeholder="ADMIN006" inputClassName="font-mono uppercase" />
          <InputField label="Email address" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} error={errors.email} helperText="Blank = adminid@drait.edu.in" />
          <InputField label="Role" value="Subject Admin" disabled error={errors.adminType} />
          <Field id="admin-subject" label="Subject" required error={errors.subjectCode}>
            <SubjectSelect id="admin-subject" subjects={data.subjects} value={form.subjectCode} onChange={(v) => setField('subjectCode', v)} />
          </Field>
          <InputField label="Subject code" value={form.subjectCode || '—'} disabled inputClassName="font-mono" />
          <InputField label="Temporary password" value="Generated on create" disabled />
          <Field id="admin-status" label="Account status" required>
            <select id="admin-status" className={selectCls} value={form.status} onChange={(e) => setField('status', e.target.value)}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </Field>
        </form>
      </Modal>

      {/* ── Manage admin ── */}
      <Modal
        isOpen={Boolean(managing) && !confirm && !credentials}
        onClose={() => setManaging(null)}
        title={managing ? `${managing.name}` : ''}
        subtitle={managing ? [managing.adminId, managing.email].filter(Boolean).join(' · ') : ''}
        maxWidth="max-w-xl"
        footer={<Button variant="secondary" onClick={() => setManaging(null)}>Close</Button>}
      >
        {managing && (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
              {[['Role', TYPE_LABEL.subject], ['Status', <StatusBadge key="s" status={managing.status} size="sm" />],
                ['Last sign-in', managing.lastSignInAt ? formatDateTime(managing.lastSignInAt) : 'Never'],
                ['Password', managing.mustChangePassword ? 'Temporary (change required)' : 'Set by admin']].map(([k, v]) => (
                <div key={k}><dt className="text-slate-500">{k}</dt><dd className="mt-0.5 font-medium text-slate-900">{v}</dd></div>
              ))}
            </dl>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Subject assignment</h3>
              {assignErrors.form && <Alert tone="danger" className="mb-3">{assignErrors.form}</Alert>}
              {!managing.subjectCode && <Alert tone="warning" className="mb-3">No subject assigned: this administrator cannot open any examination until one is assigned.</Alert>}
              <div className="grid gap-3 sm:grid-cols-[2fr_auto] sm:items-end">
                <Field id="assign-subject" label="Subject" error={assignErrors.subjectCode}>
                  <SubjectSelect id="assign-subject" subjects={data.subjects} value={assign.subjectCode} selfAdminId={managing.adminId || managing.email} onChange={(v) => { setAssign({ subjectCode: v }); setAssignErrors({}); }} />
                </Field>
                <Button onClick={saveAssignment} isLoading={busy}
                  disabled={!assign.subjectCode || assign.subjectCode === managing.subjectCode}>Save</Button>
              </div>
            </section>

            <SubjectActivity admin={managing} />

            <section className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" icon={KeyRound} onClick={() => setConfirm('reset')}>Reset password</Button>
              <Button variant={managing.status === 'Active' ? 'danger' : 'success'} icon={Power} onClick={() => setConfirm('status')}>
                {managing.status === 'Active' ? 'Deactivate' : 'Activate'}
              </Button>
            </section>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirm === 'reset'}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        tone="warning"
        title={`Reset password for ${managing?.adminId || managing?.email || ''}?`}
        confirmLabel="Reset password"
        description="The current password stops working. A new temporary password is shown once."
      />
      <ConfirmDialog
        isOpen={confirm === 'status'}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        tone={managing?.status === 'Active' ? 'danger' : 'primary'}
        title={managing?.status === 'Active' ? `Deactivate ${managing?.adminId || managing?.email}?` : `Activate ${managing?.adminId || managing?.email}?`}
        confirmLabel={managing?.status === 'Active' ? 'Deactivate' : 'Activate'}
        description={managing?.status === 'Active' ? 'The administrator can no longer sign in.' : 'The administrator can sign in again.'}
      />

      <CredentialsDialog
        credentials={issued}
        title={credentials?.title}
        rows={issued ? [['Admin ID', issued.adminId || '—'], ['Email', issued.email], ['Temporary Password', issued.temporaryPassword]] : []}
        copyText={copyText}
        onClose={() => setCredentials(null)}
      />
    </div>
  );
}
