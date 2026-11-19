import React, { useState } from 'react';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import SelectDropdown from '../../components/common/SelectDropdown';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '../../components/common/Table';
import {
  Spinner,
  SkeletonText,
  SkeletonBlock,
} from '../../components/common/LoadingStates';
import {
  Search,
  Calendar,
  Download,
  Plus,
  Trash2,
  CheckCircle,
  FileText,
  Clock,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

export default function ComponentShowcase() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [buttonLoading, setButtonLoading] = useState(false);

  const sampleTableData = [
    {
      code: 'CS-401',
      title: 'Advanced Computer Networks Midterm',
      department: 'Computer Science & Engineering',
      duration: '90 Min',
      candidates: 184,
      status: 'Active',
      statusVariant: 'success',
    },
    {
      code: 'EE-302',
      title: 'Digital Signal Processing Comprehensive',
      department: 'Electrical Engineering',
      duration: '120 Min',
      candidates: 142,
      status: 'Scheduled',
      statusVariant: 'info',
    },
    {
      code: 'ME-205',
      title: 'Thermodynamics & Heat Transfer Quiz',
      department: 'Mechanical Engineering',
      duration: '45 Min',
      candidates: 96,
      status: 'In Review',
      statusVariant: 'warning',
    },
    {
      code: 'MA-101',
      title: 'Linear Algebra & Calculus Diagnostic',
      department: 'Basic Sciences',
      duration: '60 Min',
      candidates: 320,
      status: 'Concluded',
      statusVariant: 'neutral',
    },
    {
      code: 'CS-509',
      title: 'Distributed Systems Terminal Assessment',
      department: 'Computer Science & Engineering',
      duration: '180 Min',
      candidates: 54,
      status: 'Cancelled',
      statusVariant: 'danger',
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Page Header */}
      <div>
        <Breadcrumbs
          items={[
            { label: 'ExamSphere', path: '/' },
            { label: 'Design System', path: '/design-system' },
            { label: 'Component Specification' },
          ]}
          className="mb-2"
        />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              ExamSphere Design System
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Enterprise UI specification inspired by academic ERP and computerized examination management standards.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="primary" size="md" dot>
              System Specification v1.0
            </Badge>
          </div>
        </div>
      </div>

      {/* 1. Design Tokens: Colors & Typography */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          1. Color Palette & Enterprise Tokens
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 bg-white border border-slate-200 rounded">
            <div className="h-10 w-full rounded bg-[#1E3A5F] shadow-xs" />
            <p className="text-xs font-semibold text-slate-800 mt-2">Primary Navy</p>
            <p className="text-[11px] font-mono text-slate-500">#1E3A5F</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Primary brand & buttons</p>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded">
            <div className="h-10 w-full rounded bg-[#64748B] shadow-xs" />
            <p className="text-xs font-semibold text-slate-800 mt-2">Slate Neutral</p>
            <p className="text-[11px] font-mono text-slate-500">#64748B</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Secondary text & icons</p>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded">
            <div className="h-10 w-full rounded bg-[#F8FAFC] border border-slate-300 shadow-xs" />
            <p className="text-xs font-semibold text-slate-800 mt-2">Canvas Background</p>
            <p className="text-[11px] font-mono text-slate-500">#F8FAFC</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Application background</p>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded">
            <div className="h-10 w-full rounded bg-white border border-slate-300 shadow-xs" />
            <p className="text-xs font-semibold text-slate-800 mt-2">Surface White</p>
            <p className="text-[11px] font-mono text-slate-500">#FFFFFF</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Cards, tables & modals</p>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded">
            <div className="h-10 w-full rounded bg-emerald-600 shadow-xs" />
            <p className="text-xs font-semibold text-slate-800 mt-2">Success Emerald</p>
            <p className="text-[11px] font-mono text-slate-500">#059669</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Passed, active, online</p>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded">
            <div className="h-10 w-full rounded bg-amber-600 shadow-xs" />
            <p className="text-xs font-semibold text-slate-800 mt-2">Warning Amber</p>
            <p className="text-[11px] font-mono text-slate-500">#D97706</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Pending, draft, review</p>
          </div>
        </div>
      </section>

      {/* 2. Reusable Buttons */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          2. Buttons & Actions
        </h2>

        <Card title="Button Variants & Interactive States" subtitle="Consistent height tokens: sm (32px), md (36px), lg (40px)">
          <div className="space-y-4">
            {/* Variants */}
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">Variants</p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant="primary">Primary Navy</Button>
                <Button variant="secondary">Secondary Surface</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="danger">Destructive / Danger</Button>
                <Button variant="ghost">Ghost Action</Button>
              </div>
            </div>

            {/* Sizes */}
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-2">Sizes</p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button size="sm" variant="primary">Small (sm)</Button>
                <Button size="md" variant="primary">Medium (md)</Button>
                <Button size="lg" variant="primary">Large (lg)</Button>
              </div>
            </div>

            {/* States & Icons */}
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-2">With Icons & Loading State</p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant="primary" icon={Plus}>
                  New Question
                </Button>
                <Button variant="secondary" icon={Download}>
                  Export Marksheet
                </Button>
                <Button
                  variant="outline"
                  isLoading={buttonLoading}
                  onClick={() => {
                    setButtonLoading(true);
                    setTimeout(() => setButtonLoading(false), 2000);
                  }}
                >
                  {buttonLoading ? 'Synchronizing...' : 'Click for Loading State'}
                </Button>
                <Button variant="secondary" disabled>
                  Disabled Control
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* 3. Form Controls: Inputs & Select Dropdowns */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          3. Input Fields & Dropdowns
        </h2>

        <Card title="ERP Form Controls" subtitle="Labels, validation errors, prefix icons, and helper descriptions">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <InputField
              label="Examination Code"
              placeholder="e.g. CBT-2026-CS101"
              helperText="Unique institutional assessment identifier"
              required
            />

            <InputField
              label="Candidate Search"
              placeholder="Search by Hall Ticket No..."
              prefixIcon={Search}
              helperText="Instant lookup across registered batches"
            />

            <InputField
              label="Passing Score Threshold"
              defaultValue="40"
              error="Minimum threshold cannot be lower than 35%"
              required
            />

            <SelectDropdown
              label="Academic Semester"
              options={[
                { value: 'sem-1', label: 'Semester I (Fall 2026)' },
                { value: 'sem-2', label: 'Semester II (Spring 2027)' },
                { value: 'sem-special', label: 'Supplementary Examination 2026' },
              ]}
              defaultValue="sem-1"
              helperText="Designates target student cohort"
              required
            />

            <SelectDropdown
              label="Evaluation Method"
              options={[
                { value: 'auto', label: 'Automated MCQ Scoring' },
                { value: 'hybrid', label: 'Hybrid (MCQ + Manual Coding)' },
                { value: 'double-blind', label: 'Double-Blind Evaluator Review' },
              ]}
              defaultValue="auto"
            />

            <InputField
              label="Proctoring IP Subnet (Disabled)"
              value="192.168.10.0/24"
              disabled
              helperText="Restricted to authorized CBT computer lab nodes"
            />
          </div>
        </Card>
      </section>

      {/* 4. Status Badges */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          4. Status Badges
        </h2>

        <Card title="Semantic Status Indicators" subtitle="Standardized labels for candidate eligibility, exam lifecycle, and network states">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">With Status Dot (Recommended for tables & headers)</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success" dot>Live / In-Progress</Badge>
                <Badge variant="primary" dot>Primary Navy</Badge>
                <Badge variant="info" dot>Scheduled (24h)</Badge>
                <Badge variant="warning" dot>Pending Verification</Badge>
                <Badge variant="danger" dot>Proctor Violation Flag</Badge>
                <Badge variant="neutral" dot>Archived Examination</Badge>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-2">Compact Badges</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success" size="sm">Active</Badge>
                <Badge variant="warning" size="sm">Draft</Badge>
                <Badge variant="danger" size="sm">Terminated</Badge>
                <Badge variant="neutral" size="sm">Closed</Badge>
                <Badge variant="info" size="sm">Queue: 42</Badge>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* 5. Enterprise Data Table & Pagination */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            5. Enterprise Data Table & Pagination
          </h2>
          <Button variant="secondary" size="sm" icon={Download}>
            Export Roster
          </Button>
        </div>

        <div className="rounded border border-slate-200 bg-white shadow-xs">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Examination Master Roster
              </h3>
              <p className="text-xs text-slate-500">
                Showing scheduled and concluded CBT sessions for current term
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-48 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter table..."
                  className="w-full rounded border border-slate-200 bg-slate-50 py-1 pl-8 pr-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
                />
              </div>
            </div>
          </div>

          <Table className="border-0">
            <TableHeader>
              <tr>
                <TableHead>Test Code</TableHead>
                <TableHead>Course Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead align="right">Candidates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="right">Actions</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {sampleTableData.map((row) => (
                <TableRow key={row.code}>
                  <TableCell className="font-mono font-medium text-slate-900">
                    {row.code}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {row.title}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {row.department}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {row.duration}
                    </span>
                  </TableCell>
                  <TableCell align="right" className="font-medium">
                    {row.candidates}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.statusVariant} size="sm" dot>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell align="right">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#1E3A5F] hover:underline"
                    >
                      View Details
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Integrated Pagination Component */}
          <Pagination
            currentPage={currentPage}
            totalPages={5}
            totalItems={48}
            pageSize={10}
            onPageChange={(page) => setCurrentPage(page)}
          />
        </div>
      </section>

      {/* 6. Cards & Modal Dialog Demo */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          6. Cards & Modal Dialog
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card
            title="Interactive Modal Demonstration"
            subtitle="Accessible overlay with escape key dismissal and focus trap"
            footer={
              <div className="flex items-center justify-between">
                <span>Accessible Dialog specification</span>
                <span className="font-mono text-[10px]">WAI-ARIA compliant</span>
              </div>
            }
          >
            <p className="text-xs text-slate-600 leading-relaxed">
              Modals in ExamSphere are restricted to essential administrative confirmation workflows (such as releasing results, cancelling exam sessions, or assigning proctors).
            </p>
            <div className="mt-4">
              <Button
                variant="primary"
                onClick={() => setIsModalOpen(true)}
              >
                Launch Modal Preview
              </Button>
            </div>
          </Card>

          <Card
            title="Card Container Hierarchy"
            subtitle="Header divider, padding control, and structured footer"
            action={
              <Badge variant="primary" size="sm">
                ERP Standard
              </Badge>
            }
            footer={
              <div className="flex items-center justify-between text-slate-500">
                <span>System Policy Enforced</span>
                <span className="text-[#1E3A5F] font-semibold cursor-pointer hover:underline">
                  Read documentation &rarr;
                </span>
              </div>
            }
          >
            <p className="text-xs text-slate-600 leading-relaxed">
              Every card has restrained elevation (<code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">shadow-xs</code>), 1px solid slate-200 border, consistent 20px internal padding, and high information readability.
            </p>
          </Card>
        </div>
      </section>

      {/* 7. Loading States & Skeletons */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          7. Loading States & Skeletons
        </h2>

        <Card title="Asynchronous Loading Indicators" subtitle="Spinners and placeholder skeleton lines for clean latency transitions">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-3">Spinners</p>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Spinner size="sm" variant="primary" />
                  <span className="text-xs text-slate-600">Small (Navy)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Spinner size="md" variant="primary" />
                  <span className="text-xs text-slate-600">Medium</span>
                </div>
                <div className="flex items-center gap-2">
                  <Spinner size="lg" variant="primary" />
                  <span className="text-xs text-slate-600">Large</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 mb-3">Skeleton Text Loading Block</p>
              <SkeletonText lines={3} />
            </div>
          </div>
        </Card>
      </section>

      {/* Modal Demo Instance */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Authorize CBT Assessment Schedule"
        subtitle="Confirmation required before broadcasting test codes to candidates"
        footer={
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                alert('Exam session successfully authorized and locked.');
                setIsModalOpen(false);
              }}
            >
              Authorize & Lock Schedule
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            You are authorizing <strong className="text-slate-900">CS-401: Advanced Computer Networks Midterm</strong> for 184 registered examinees.
          </p>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            <strong>Security Notice:</strong> Once authorized, test question sequences and randomization seeds cannot be modified while candidates are logging in.
          </div>
        </div>
      </Modal>
    </div>
  );
}
