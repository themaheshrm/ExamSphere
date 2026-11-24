import React, { useState } from 'react';
import { Download, Plus, Search, Trash2 } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import SelectDropdown from '../../components/common/SelectDropdown';
import Badge from '../../components/common/Badge';
import StatusBadge from '../../components/common/StatusBadge';
import StatCard from '../../components/common/StatCard';
import Alert from '../../components/common/Alert';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import Pagination from '../../components/common/Pagination';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Tabs from '../../components/common/Tabs';
import { Spinner, SkeletonText, SkeletonTableRow } from '../../components/common/LoadingStates';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { useToast } from '../../components/common/Toast';

const COLORS = [
  ['Navy (primary)', '#1E3A5F'], ['Navy hover', '#152A45'], ['Canvas', '#F4F6F9'], ['Surface', '#FFFFFF'],
  ['Border', '#E2E8F0'], ['Text', '#0F172A'], ['Muted text', '#64748B'], ['Success', '#047857'], ['Warning', '#B45309'], ['Danger', '#BE123C'],
];

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

/** Living reference for the ExamSphere design system. */
export default function ComponentShowcase() {
  const { notify } = useToast();
  const [tab, setTab] = useState('one');
  const [page, setPage] = useState(2);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Reference"
        title="ExamSphere Design System"
        description="Tokens and components shared by the candidate, examination office and platform portals."
        breadcrumbs={[{ label: 'Design system' }]}
        actions={<Button icon={Plus}>Primary action</Button>}
      />

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COLORS.map(([name, hex]) => (
            <div key={hex} className="overflow-hidden rounded-sm border border-slate-200 bg-white">
              <div className="h-12" style={{ background: hex }} />
              <div className="p-2 text-[11px]"><p className="font-semibold text-slate-900">{name}</p><p className="font-mono text-slate-500">{hex}</p></div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <Card>
          <p className="text-2xl font-semibold tracking-tight text-slate-900">Page title — 24/600</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">Section title — 14/600</p>
          <p className="mt-2 text-sm text-slate-600">Body copy — 14/400. Clear, institutional, no decoration.</p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Eyebrow / table header — 11/600 caps</p>
          <p className="mt-2 font-mono text-xs text-[#1E3A5F]">1DA22CS001 · 22CS601-A — identifiers use mono</p>
        </Card>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary" icon={Download}>Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="success">Publish / submit</Button>
          <Button variant="danger" icon={Trash2}>Destructive</Button>
          <Button variant="ghost">Ghost</Button>
          <Button isLoading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
        </div>
      </Section>

      <Section title="Form controls">
        <Card>
          <div className="grid gap-4 md:grid-cols-3">
            <InputField label="USN" required placeholder="1DA22CS001" helperText="10-character university seat number" />
            <InputField label="Search" prefixIcon={Search} placeholder="Search questions" />
            <InputField label="Email" error="Enter a valid email address." defaultValue="coe@" />
            <SelectDropdown label="Difficulty" options={['Easy', 'Medium', 'Hard']} defaultValue="" placeholder="Choose difficulty" />
          </div>
        </Card>
      </Section>

      <Section title="Status indicators">
        <div className="flex flex-wrap gap-2">
          {['Published', 'Draft', 'Eligible', 'Withheld', 'In progress', 'Pass', 'Fail', 'Suspended', 'Disabled'].map((s) => <StatusBadge key={s} status={s} />)}
          <Badge variant="primary">Neutral label</Badge>
        </div>
      </Section>

      <Section title="Feedback">
        <div className="grid gap-3 md:grid-cols-2">
          <Alert tone="info" title="Information">Configuration is locked while the examination is published.</Alert>
          <Alert tone="success" title="Success">Ten patterns generated and verified.</Alert>
          <Alert tone="warning" title="Warning">3 questions are unanswered and will score zero.</Alert>
          <Alert tone="danger" title="Error">The file could not be processed.</Alert>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => notify('Question 26 added to the bank.')}>Success toast</Button>
          <Button variant="secondary" onClick={() => notify('Could not save. Try again.', 'error')}>Error toast</Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Confirmation dialog</Button>
        </div>
      </Section>

      <Section title="Metrics">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard title="Question bank" value="25" hint="Validated MCQs available" icon={Search} />
          <StatCard title="Eligible candidates" value="10/10" hint="On the examination roster" tone="success" icon={Plus} />
          <StatCard title="Attempts in progress" value="0" hint="No live attempts" tone="neutral" icon={Download} />
        </div>
      </Section>

      <Section title="Tabs, tables & pagination">
        <Card bodyClassName="p-0">
          <div className="px-4"><Tabs tabs={[{ id: 'one', label: 'Register', count: 3 }, { id: 'two', label: 'Analysis' }]} value={tab} onChange={setTab} /></div>
          <Table className="rounded-none border-0">
            <TableHeader>
              <TableRow><TableHead>USN</TableHead><TableHead>Candidate</TableHead><TableHead align="right">Score</TableHead><TableHead>Result</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              <TableRow><TableCell className="font-mono">1DA22CS001</TableCell><TableCell>Alex Chen</TableCell><TableCell align="right">42 / 50</TableCell><TableCell><StatusBadge status="Pass" size="sm" /></TableCell></TableRow>
              <TableRow><TableCell className="font-mono">1DA22CS002</TableCell><TableCell>Bhavana K.</TableCell><TableCell align="right">18 / 50</TableCell><TableCell><StatusBadge status="Fail" size="sm" /></TableCell></TableRow>
              <SkeletonTableRow columns={4} />
            </TableBody>
          </Table>
          <Pagination currentPage={page} totalPages={9} totalItems={86} pageSize={10} onPageChange={setPage} />
        </Card>
      </Section>

      <Section title="Empty & loading states">
        <div className="grid gap-4 md:grid-cols-2">
          <Card><EmptyState title="No submissions yet" description="Evaluated answer sheets appear here as candidates submit." /></Card>
          <Card><div className="flex items-center gap-3"><Spinner /><span className="text-sm text-slate-600">Verifying session…</span></div><SkeletonText className="mt-4" lines={3} /></Card>
        </div>
      </Section>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); notify('Confirmed.'); }}
        title="Publish this examination?"
        description="Eligible candidates will see the examination and can start it."
        confirmLabel="Publish examination"
      />
    </div>
  );
}
