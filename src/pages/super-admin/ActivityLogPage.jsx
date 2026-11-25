import React, { useState } from 'react';
import { Download, ScrollText, Search } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import PageHeader from '../../components/common/PageHeader';
import Pagination from '../../components/common/Pagination';
import EmptyState from '../../components/common/EmptyState';
import Badge from '../../components/common/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { activityLogService, ACTIVITY_CATEGORIES } from '../../services/activityLogService';
import { usePagination } from '../../utils/usePagination';
import { useDataVersion } from '../../utils/useDataVersion';
import { downloadText, toCsv } from '../../services/localStore';
import { formatDateTime } from '../../utils/format';
import { ROLE_LABELS } from '../../utils/constants';

const selectCls = 'es-select h-9 w-full rounded-sm border border-slate-300 bg-white pl-3 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]';
const CATEGORY_LABEL = { exam: 'Examination', 'question-bank': 'Question bank', candidate: 'Candidate', attempt: 'Attempt', institution: 'Institution', user: 'User', settings: 'Settings' };

/** Append-only audit trail of administrative actions and submissions. */
export default function ActivityLogPage() {
  useDataVersion();
  const entries = activityLogService.list();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [role, setRole] = useState('');

  const term = search.trim().toLowerCase();
  const shown = entries.filter((e) => (!term || `${e.action} ${e.actor.name} ${e.actor.identifier || ''} ${e.target} ${e.details}`.toLowerCase().includes(term))
    && (!category || e.category === category) && (!role || e.actor.role === role));
  const { pageItems, paginationProps, resetPage } = usePagination(shown, 25);

  const exportCsv = () => downloadText('examsphere-activity-log.csv', toCsv(shown, [
    { label: 'Time', value: (e) => e.at },
    { label: 'User', value: (e) => e.actor.name },
    { label: 'Role', value: (e) => e.actor.role },
    { label: 'Identifier', value: (e) => e.actor.identifier || '' },
    { label: 'Category', value: (e) => e.category },
    { label: 'Action', value: (e) => e.action },
    { label: 'Target', value: (e) => e.target },
    { label: 'Details', value: (e) => e.details },
  ]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform Administration"
        title="Activity Logs"
        description="Read-only · newest first"
        actions={<Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!shown.length}>Export CSV</Button>}
      />
      <Card bodyClassName="p-0">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[2fr_1fr_1fr]">
          <InputField aria-label="Search activity" placeholder="Search action, user or target" prefixIcon={Search} value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          <select aria-label="Filter by category" className={selectCls} value={category} onChange={(e) => { setCategory(e.target.value); resetPage(); }}>
            <option value="">All categories</option>
            {ACTIVITY_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          <select aria-label="Filter by role" className={selectCls} value={role} onChange={(e) => { setRole(e.target.value); resetPage(); }}>
            <option value="">All roles</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {shown.length === 0 ? (
          <EmptyState icon={ScrollText} title={entries.length ? 'No entries match' : 'No activity recorded yet'} />
        ) : (
          <>
            <Table className="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden md:table-cell">User</TableHead>
                  <TableHead className="hidden sm:table-cell">Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap tabular-nums text-slate-500">{formatDateTime(e.at)}</TableCell>
                    <TableCell>
                      <p className={`font-medium ${e.severity === 'warning' ? 'text-amber-800' : 'text-slate-900'}`}>{e.action}</p>
                      {(e.target || e.details) && <p className="text-[11px] text-slate-500">{[e.target, e.details].filter(Boolean).join(' · ')}</p>}
                      <p className="text-[11px] text-slate-500 md:hidden">{e.actor.name}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{e.actor.name}<span className="block text-[11px] text-slate-500">{ROLE_LABELS[e.actor.role] || e.actor.role}{e.actor.identifier ? ` · ${e.actor.identifier}` : ''}</span></TableCell>
                    <TableCell className="hidden sm:table-cell"><Badge size="sm">{CATEGORY_LABEL[e.category] || e.category}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination {...paginationProps} pageSizeOptions={[25, 50, 100]} />
          </>
        )}
      </Card>
    </div>
  );
}
