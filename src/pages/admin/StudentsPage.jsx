import React, { useMemo, useState } from 'react';
import { Ban, CheckCircle2, Download, Edit3, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PageHeader from '../../components/common/PageHeader';
import Pagination from '../../components/common/Pagination';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { useToast } from '../../components/common/Toast';
import { studentRosterService } from '../../services/studentRosterService';
import { examRandomizerService } from '../../services/examRandomizerService';
import { activityLogService } from '../../services/activityLogService';
import { assignPatternToStudent } from '../../utils/randomizationEngine';
import { usePagination } from '../../utils/usePagination';
import { downloadText, toCsv } from '../../services/localStore';
import { useAuth } from '../../context/AuthContext';

const EMPTY = { usn: '', name: '', email: '', department: 'Computer Science & Engineering', semester: 6, section: 'A', status: 'Eligible', remarks: '' };
const selectCls = 'es-select h-9 w-full rounded-sm border border-slate-300 bg-white pl-3 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]';

export default function StudentsPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [roster, setRoster] = useState(() => studentRosterService.list());
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | usn
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [removeTarget, setRemoveTarget] = useState(null);
  const [withholdOpen, setWithholdOpen] = useState(false);
  const [withholdReason, setWithholdReason] = useState('');

  const meta = examRandomizerService.getExamState().meta;
  const attempts = useMemo(() => {
    const map = {};
    examRandomizerService.listAttempts().forEach((a) => { if (!map[a.studentIdentifier]) map[a.studentIdentifier] = a; });
    return map;
  }, []);

  const refresh = () => setRoster(studentRosterService.list());
  const log = (action, target, details) => activityLogService.log({ action, category: 'candidate', actor: user, target, details });

  const sections = [...new Set(roster.map((s) => s.section))].sort();
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return roster.filter((s) => (!term || `${s.usn} ${s.name} ${s.email}`.toLowerCase().includes(term))
      && (!section || s.section === section) && (!status || s.status === status));
  }, [roster, search, section, status]);
  const { pageItems, paginationProps, resetPage } = usePagination(filtered, 10);

  const counts = {
    total: roster.length,
    eligible: roster.filter((s) => s.status === 'Eligible').length,
    withheld: roster.filter((s) => s.status === 'Withheld').length,
    submitted: roster.filter((s) => attempts[s.usn]?.status === 'submitted').length,
  };

  const openForm = (candidate) => {
    setEditing(candidate ? candidate.usn : 'new');
    setForm(candidate ? { ...candidate } : EMPTY);
    setFieldErrors({});
  };

  const saveCandidate = (event) => {
    event.preventDefault();
    try {
      const saved = studentRosterService.save(form, editing === 'new' ? null : editing);
      log(editing === 'new' ? 'Added candidate' : 'Updated candidate', saved.usn, saved.name);
      notify(editing === 'new' ? `${saved.usn} added to the roster.` : `${saved.usn} updated.`);
      setEditing(null);
      refresh();
    } catch (error) {
      setFieldErrors(error.fieldErrors || { form: error.message });
    }
  };

  const applyStatus = (next, reason = '') => {
    studentRosterService.setStatus(selected, next, reason);
    log(next === 'Withheld' ? 'Withheld candidates' : 'Restored candidate eligibility', `${selected.length} candidate(s)`, reason);
    notify(`${selected.length} candidate${selected.length === 1 ? '' : 's'} marked ${next.toLowerCase()}.`, next === 'Withheld' ? 'warning' : 'success');
    setSelected([]);
    setWithholdOpen(false);
    setWithholdReason('');
    refresh();
  };

  const confirmRemove = () => {
    studentRosterService.remove(removeTarget.usn);
    log('Removed candidate', removeTarget.usn, removeTarget.name);
    notify(`${removeTarget.usn} removed from the roster.`);
    setSelected((s) => s.filter((u) => u !== removeTarget.usn));
    setRemoveTarget(null);
    refresh();
  };

  const exportCsv = () => {
    downloadText(`examsphere-candidates-${meta.courseCode}.csv`, toCsv(filtered, [
      { label: 'USN', value: (s) => s.usn },
      { label: 'Name', value: (s) => s.name },
      { label: 'Email', value: (s) => s.email },
      { label: 'Department', value: (s) => s.department },
      { label: 'Semester', value: (s) => s.semester },
      { label: 'Section', value: (s) => s.section },
      { label: 'Eligibility', value: (s) => s.status },
      { label: 'Pattern', value: (s) => assignPatternToStudent(s.usn) },
      { label: 'Attempt', value: (s) => attempts[s.usn]?.status || 'not started' },
      { label: 'Score', value: (s) => attempts[s.usn]?.result?.score ?? '' },
    ]));
  };

  const pageUsns = pageItems.map((s) => s.usn);
  const allOnPage = pageUsns.length > 0 && pageUsns.every((u) => selected.includes(u));
  const toggleAll = () => setSelected((cur) => (allOnPage ? cur.filter((u) => !pageUsns.includes(u)) : [...new Set([...cur, ...pageUsns])]));
  const toggle = (usn) => setSelected((cur) => (cur.includes(usn) ? cur.filter((u) => u !== usn) : [...cur, usn]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Examinations"
        title="Candidates"
        description={`Roster and eligibility for ${meta.courseCode} — ${meta.courseTitle}. Withheld candidates cannot start the examination.`}
        actions={(
          <>
            <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!filtered.length}>Export CSV</Button>
            <Button icon={UserPlus} onClick={() => openForm(null)}>Add candidate</Button>
          </>
        )}
      />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200 lg:grid-cols-4" aria-label="Roster summary">
        {[['On roster', counts.total], ['Eligible', counts.eligible], ['Withheld', counts.withheld], ['Submitted', counts.submitted]].map(([k, v]) => (
          <div key={k} className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{v}</p>
          </div>
        ))}
      </section>

      <Card bodyClassName="p-0">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[2fr_1fr_1fr]">
          <InputField aria-label="Search candidates" placeholder="Search by USN, name or email" prefixIcon={Search} value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          <select aria-label="Filter by section" className={selectCls} value={section} onChange={(e) => { setSection(e.target.value); resetPage(); }}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
          </select>
          <select aria-label="Filter by eligibility" className={selectCls} value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }}>
            <option value="">All eligibility</option>
            <option value="Eligible">Eligible</option>
            <option value="Withheld">Withheld</option>
          </select>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#F0F4F8] px-4 py-2.5 text-xs" aria-live="polite">
            <span className="font-semibold text-[#1E3A5F]">{selected.length} selected</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => applyStatus('Eligible')}>Mark eligible</Button>
              <Button size="sm" variant="secondary" icon={Ban} onClick={() => setWithholdOpen(true)}>Withhold</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={Users} title={roster.length ? 'No candidates match' : 'No candidates yet'} description={roster.length ? 'Try a different search or filter.' : 'Add candidates to build the examination roster.'} action={!roster.length && <Button size="sm" icon={Plus} onClick={() => openForm(null)}>Add candidate</Button>} />
        ) : (
          <>
            <Table className="rounded-none border-x-0 border-b-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={toggleAll} className="h-4 w-4 accent-[#1E3A5F]" /></TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead className="hidden md:table-cell">Sem / Sec</TableHead>
                  <TableHead>Eligibility</TableHead>
                  <TableHead className="hidden sm:table-cell">Pattern</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead align="right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((s) => {
                  const attempt = attempts[s.usn];
                  return (
                    <TableRow key={s.usn} isSelected={selected.includes(s.usn)}>
                      <TableCell><input type="checkbox" aria-label={`Select ${s.usn}`} checked={selected.includes(s.usn)} onChange={() => toggle(s.usn)} className="h-4 w-4 accent-[#1E3A5F]" /></TableCell>
                      <TableCell>
                        <p className="font-mono text-xs font-semibold text-[#1E3A5F]">{s.usn}</p>
                        <p className="font-medium text-slate-900">{s.name}</p>
                        <p className="text-[11px] text-slate-500">{s.email}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{s.semester} / {s.section}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} size="sm" />
                        {s.remarks && <p className="mt-1 max-w-48 text-[11px] text-slate-500">{s.remarks}</p>}
                      </TableCell>
                      <TableCell className="hidden font-mono sm:table-cell">{assignPatternToStudent(s.usn)}</TableCell>
                      <TableCell>
                        {!attempt && <span className="text-[11px] text-slate-400">Not started</span>}
                        {attempt?.status === 'active' && <StatusBadge status="In progress" size="sm" />}
                        {attempt?.status === 'submitted' && (
                          <span className="text-xs tabular-nums"><strong className="text-slate-900">{attempt.result?.score}</strong> / {attempt.result?.maxScore}</span>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex justify-end gap-1">
                          <button type="button" aria-label={`Edit ${s.usn}`} onClick={() => openForm(s)} className="rounded-sm p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1E3A5F]"><Edit3 className="h-4 w-4" /></button>
                          <button type="button" aria-label={`Remove ${s.usn}`} onClick={() => setRemoveTarget(s)} className="rounded-sm p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination {...paginationProps} pageSizeOptions={[10, 25, 50]} />
          </>
        )}
      </Card>

      <Modal
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add candidate' : `Edit ${editing}`}
        subtitle="Candidates are matched to their login by USN."
        maxWidth="max-w-2xl"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="candidate-form">{editing === 'new' ? 'Add candidate' : 'Save changes'}</Button>
          </>
        )}
      >
        <form id="candidate-form" onSubmit={saveCandidate} className="grid gap-4 sm:grid-cols-2" noValidate>
          {fieldErrors.form && <p className="text-xs text-red-600 sm:col-span-2">{fieldErrors.form}</p>}
          <InputField label="USN" required value={form.usn} onChange={(e) => setForm({ ...form, usn: e.target.value.toUpperCase() })} error={fieldErrors.usn} placeholder="1DA22CS011" inputClassName="font-mono uppercase" />
          <InputField label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fieldErrors.name} />
          <InputField label="Institutional email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={fieldErrors.email} helperText="Defaults to usn@drait.edu.in" />
          <InputField label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <InputField label="Semester" type="number" min="1" max="8" required value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} error={fieldErrors.semester} />
          <InputField label="Section" required maxLength={1} value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value.toUpperCase() })} error={fieldErrors.section} />
          <div>
            <label htmlFor="cand-status" className="mb-1 block text-xs font-medium text-slate-800">Eligibility</label>
            <select id="cand-status" className={selectCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Eligible</option>
              <option>Withheld</option>
            </select>
          </div>
          <InputField label="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} helperText="Reason when withheld (e.g. attendance shortage)" />
        </form>
      </Modal>

      <Modal
        isOpen={withholdOpen}
        onClose={() => setWithholdOpen(false)}
        title={`Withhold ${selected.length} candidate${selected.length === 1 ? '' : 's'}?`}
        subtitle="Withheld candidates cannot start the examination."
        maxWidth="max-w-md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setWithholdOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={withholdReason.trim().length < 3} onClick={() => applyStatus('Withheld', withholdReason.trim())}>Withhold</Button>
          </>
        )}
      >
        <InputField label="Reason" required value={withholdReason} onChange={(e) => setWithholdReason(e.target.value)} placeholder="e.g. Attendance below 85%" data-autofocus />
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
        tone="danger"
        title="Remove candidate from roster?"
        confirmLabel="Remove"
        description={removeTarget ? `${removeTarget.usn} · ${removeTarget.name} will be removed from the roster. Any submitted answer sheet is kept in the results register.` : ''}
      />
    </div>
  );
}
