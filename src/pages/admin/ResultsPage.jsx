import React, { useState } from 'react';
import { BarChart3, ClipboardList, Download, Eye, Search } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import Pagination from '../../components/common/Pagination';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import Tabs, { TabPanel } from '../../components/common/Tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { useAdminExamContext } from '../../utils/useAdminExamContext';
import { ExamSwitcher, ExamNotCreated, ScopeDenied } from '../../components/admin/ExamScope';
import { studentRosterService } from '../../services/studentRosterService';
import { PATTERN_LABELS } from '../../utils/randomizationEngine';
import { usePagination } from '../../utils/usePagination';
import { downloadText, toCsv } from '../../services/localStore';
import { formatDateTime } from '../../utils/format';
import { useDataVersion } from '../../utils/useDataVersion';

const selectCls = 'es-select h-9 w-full rounded-sm border border-slate-300 bg-white pl-3 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]';
const LETTERS = ['A', 'B', 'C', 'D'];

function ResultsView({ service, examCode, summaries, selectExam }) {
  useDataVersion(); // live: re-read when attempts change
  const [tab, setTab] = useState('register');
  const [search, setSearch] = useState('');
  const [pattern, setPattern] = useState('');
  const [outcome, setOutcome] = useState('');
  const [detail, setDetail] = useState(null);

  const attempts = service.listAttempts();
  const names = Object.fromEntries(studentRosterService.list().map((s) => [s.usn, s.name]));
  const { meta } = service.getExamState();

  const submitted = attempts.filter((a) => a.status === 'submitted' && a.result);
  const active = attempts.filter((a) => a.status === 'active');

  const stats = (() => {
    if (!submitted.length) return null;
    const pcts = submitted.map((a) => a.result.percentage);
    return {
      average: pcts.reduce((s, x) => s + x, 0) / pcts.length,
      passRate: (submitted.filter((a) => a.result.passed).length / submitted.length) * 100,
      highest: Math.max(...submitted.map((a) => a.result.score)),
      lowest: Math.min(...submitted.map((a) => a.result.score)),
    };
  })();

  const distribution = (() => {
    const buckets = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i * 10 + 10}%`, count: 0 }));
    submitted.forEach((a) => { buckets[Math.min(9, Math.floor(Math.max(0, a.result.percentage) / 10))].count += 1; });
    return buckets;
  })();
  const maxBucket = Math.max(1, ...distribution.map((b) => b.count));

  const byPattern = PATTERN_LABELS.map((label) => {
    const rows = submitted.filter((a) => a.patternLabel === `Pattern ${label}`);
    return {
      label,
      count: rows.length,
      average: rows.length ? rows.reduce((s, a) => s + a.result.percentage, 0) / rows.length : null,
    };
  });

  const itemAnalysis = (() => {
    const items = {};
    submitted.forEach((a) => a.result.breakdown?.forEach((b) => {
      const it = items[b.questionId] || { questionId: b.questionId, text: b.questionText, attempted: 0, correct: 0, total: 0 };
      it.total += 1;
      if (b.isAttempted) it.attempted += 1;
      if (b.isCorrect) it.correct += 1;
      items[b.questionId] = it;
    }));
    return Object.values(items).sort((x, y) => x.correct / x.total - y.correct / y.total);
  })();

  const register = (() => {
    const term = search.trim().toLowerCase();
    return attempts.filter((a) => {
      const name = names[a.studentIdentifier] || '';
      if (term && !`${a.studentIdentifier} ${name}`.toLowerCase().includes(term)) return false;
      if (pattern && a.patternLabel !== `Pattern ${pattern}`) return false;
      if (outcome === 'pass' && !a.result?.passed) return false;
      if (outcome === 'fail' && (!a.result || a.result.passed)) return false;
      if (outcome === 'active' && a.status !== 'active') return false;
      return true;
    });
  })();
  const { pageItems, paginationProps, resetPage } = usePagination(register, 10);

  const exportCsv = () => {
    downloadText(`examsphere-results-${meta.courseCode}.csv`, toCsv(register, [
      { label: 'USN', value: (a) => a.studentIdentifier },
      { label: 'Name', value: (a) => names[a.studentIdentifier] || '' },
      { label: 'Paper code', value: (a) => a.paperCode },
      { label: 'Status', value: (a) => a.status },
      { label: 'Score', value: (a) => a.result?.score ?? '' },
      { label: 'Max score', value: (a) => a.result?.maxScore ?? '' },
      { label: 'Percentage', value: (a) => a.result?.percentage ?? '' },
      { label: 'Result', value: (a) => (a.result ? (a.result.passed ? 'Pass' : 'Fail') : '') },
      { label: 'Correct', value: (a) => a.result?.correctCount ?? '' },
      { label: 'Incorrect', value: (a) => a.result?.incorrectCount ?? '' },
      { label: 'Unattempted', value: (a) => a.result?.unattemptedCount ?? '' },
      { label: 'Started', value: (a) => a.startedAt },
      { label: 'Submitted', value: (a) => a.submittedAt || '' },
    ]));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Examinations"
        title="Results & Reports"
        description={`${meta.courseCode} — ${meta.courseTitle}`}
        actions={(
          <>
            <ExamSwitcher summaries={summaries} value={examCode} onChange={selectExam} />
            <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!register.length}>Export CSV</Button>
          </>
        )}
      />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200 md:grid-cols-3 xl:grid-cols-6" aria-label="Result summary">
        {[
          ['Submitted', submitted.length],
          ['In progress', active.length],
          ['Average', stats ? `${stats.average.toFixed(1)}%` : '—'],
          ['Pass rate', stats ? `${stats.passRate.toFixed(0)}%` : '—'],
          ['Highest', stats ? `${stats.highest}/${meta.totalMarks}` : '—'],
          ['Lowest', stats ? `${stats.lowest}/${meta.totalMarks}` : '—'],
        ].map(([k, v]) => (
          <div key={k} className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{v}</p>
          </div>
        ))}
      </section>

      <div>
        <Tabs
          tabs={[
            { id: 'register', label: 'Results register', count: attempts.length },
            { id: 'analysis', label: 'Performance analysis' },
            { id: 'items', label: 'Question analysis', count: itemAnalysis.length },
          ]}
          value={tab}
          onChange={setTab}
          label="Report sections"
        />

        <TabPanel id="register" className={tab === 'register' ? 'pt-5' : 'hidden'}>
          <Card bodyClassName="p-0">
            <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[2fr_1fr_1fr]">
              <InputField aria-label="Search results" placeholder="Search by USN or name" prefixIcon={Search} value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
              <select aria-label="Filter by pattern" className={selectCls} value={pattern} onChange={(e) => { setPattern(e.target.value); resetPage(); }}>
                <option value="">All patterns</option>
                {PATTERN_LABELS.map((l) => <option key={l} value={l}>Pattern {l}</option>)}
              </select>
              <select aria-label="Filter by result" className={selectCls} value={outcome} onChange={(e) => { setOutcome(e.target.value); resetPage(); }}>
                <option value="">All results</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="active">In progress</option>
              </select>
            </div>
            {register.length === 0 ? (
              <EmptyState icon={ClipboardList} title={attempts.length ? 'No results match' : 'No attempts recorded yet'} />
            ) : (
              <>
                <Table className="rounded-none border-x-0 border-b-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead className="hidden sm:table-cell">Paper</TableHead>
                      <TableHead align="right">Score</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="hidden lg:table-cell" align="center">C / I / U</TableHead>
                      <TableHead className="hidden md:table-cell">Submitted</TableHead>
                      <TableHead align="right"><span className="sr-only">Details</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((a) => (
                      <TableRow key={a.attemptId}>
                        <TableCell>
                          <p className="font-mono text-xs font-semibold text-[#1E3A5F]">{a.studentIdentifier}</p>
                          <p className="text-slate-700">{names[a.studentIdentifier] || 'Candidate'}</p>
                        </TableCell>
                        <TableCell className="hidden font-mono sm:table-cell">{a.paperCode}</TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {a.result ? <><strong className="text-slate-900">{a.result.score}</strong> / {a.result.maxScore}<span className="block text-[11px] text-slate-500">{a.result.percentage}%</span></> : '—'}
                        </TableCell>
                        <TableCell>{a.result ? <StatusBadge status={a.result.passed ? 'Pass' : 'Fail'} size="sm" /> : <StatusBadge status="In progress" size="sm" />}</TableCell>
                        <TableCell className="hidden tabular-nums lg:table-cell" align="center">{a.result ? `${a.result.correctCount} / ${a.result.incorrectCount} / ${a.result.unattemptedCount}` : '—'}</TableCell>
                        <TableCell className="hidden text-slate-500 md:table-cell">{a.submittedAt ? formatDateTime(a.submittedAt) : `Started ${formatDateTime(a.startedAt)}`}</TableCell>
                        <TableCell align="right">
                          {a.result && <Button size="sm" variant="ghost" icon={Eye} onClick={() => setDetail(a)} aria-label={`View answer sheet of ${a.studentIdentifier}`}>View</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pagination {...paginationProps} pageSizeOptions={[10, 25, 50]} />
              </>
            )}
          </Card>
        </TabPanel>

        <TabPanel id="analysis" className={tab === 'analysis' ? 'pt-5' : 'hidden'}>
          {!submitted.length ? (
            <Card><EmptyState icon={BarChart3} title="No evaluated answer sheets yet" /></Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Score distribution">
                <ul className="space-y-2">
                  {distribution.map((b) => (
                    <li key={b.label} className="flex items-center gap-3 text-xs">
                      <span className="w-16 tabular-nums text-slate-600">{b.label}</span>
                      <span className="h-3 flex-1 bg-slate-100"><span className="block h-3 bg-[#1E3A5F]" style={{ width: `${(b.count / maxBucket) * 100}%` }} /></span>
                      <span className="w-6 text-right font-semibold tabular-nums text-slate-900">{b.count}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Performance by pattern" bodyClassName="p-0">
                <Table className="rounded-none border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pattern</TableHead>
                      <TableHead align="right">Submitted</TableHead>
                      <TableHead align="right">Average</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byPattern.map((p) => (
                      <TableRow key={p.label}>
                        <TableCell className="font-mono font-semibold">{meta.courseCode}-{p.label}</TableCell>
                        <TableCell align="right" className="tabular-nums">{p.count}</TableCell>
                        <TableCell align="right" className="tabular-nums">{p.average === null ? '—' : `${p.average.toFixed(1)}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
        </TabPanel>

        <TabPanel id="items" className={tab === 'items' ? 'pt-5' : 'hidden'}>
          <Card title="Question analysis" subtitle="Correct answers per question, hardest first" bodyClassName="p-0">
            {itemAnalysis.length === 0 ? (
              <EmptyState compact title="No data yet" />
            ) : (
              <Table className="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Bank ID</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead align="right">Attempted</TableHead>
                    <TableHead className="w-48">Correct</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemAnalysis.map((it) => {
                    const pct = (it.correct / it.total) * 100;
                    return (
                      <TableRow key={it.questionId}>
                        <TableCell className="font-mono text-slate-500">{it.questionId}</TableCell>
                        <TableCell className="text-slate-800">{it.text}</TableCell>
                        <TableCell align="right" className="tabular-nums">{it.attempted}/{it.total}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="h-2 flex-1 bg-slate-100"><span className={`block h-2 ${pct < 40 ? 'bg-rose-600' : pct < 70 ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${pct}%` }} /></span>
                            <span className="w-10 text-right tabular-nums">{pct.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabPanel>
      </div>

      <Modal
        isOpen={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Answer sheet · ${detail.studentIdentifier}` : ''}
        subtitle={detail ? `${names[detail.studentIdentifier] || 'Candidate'} · ${detail.paperCode} · submitted ${formatDateTime(detail.submittedAt)}` : ''}
        maxWidth="max-w-4xl"
      >
        {detail?.result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200 sm:grid-cols-5">
              {[
                ['Score', `${detail.result.score} / ${detail.result.maxScore}`],
                ['Percentage', `${detail.result.percentage}%`],
                ['Correct', detail.result.correctCount],
                ['Incorrect', detail.result.incorrectCount],
                ['Unattempted', detail.result.unattemptedCount],
              ].map(([k, v]) => (
                <div key={k} className="bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{v}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-sm border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Q</th>
                    <th className="px-3 py-2">Question</th>
                    <th className="px-3 py-2">Candidate answer</th>
                    <th className="px-3 py-2">Correct answer</th>
                    <th className="px-3 py-2 text-right">Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.result.breakdown.map((b) => (
                    <tr key={b.displayNumber} className={b.isCorrect ? '' : b.isAttempted ? 'bg-rose-50/50' : 'bg-slate-50/60'}>
                      <td className="px-3 py-2 font-mono text-slate-500">{b.displayNumber}</td>
                      <td className="max-w-sm px-3 py-2 text-slate-800">{b.questionText}</td>
                      <td className="px-3 py-2">{b.isAttempted ? `${LETTERS[b.studentAnswerIndex]}. ${b.studentAnswerText}` : <span className="text-slate-400">Not attempted</span>}</td>
                      <td className="px-3 py-2 text-emerald-800">{LETTERS[b.correctAnswerIndex]}. {b.correctAnswerText}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${b.marksAwarded > 0 ? 'text-emerald-700' : b.marksAwarded < 0 ? 'text-rose-700' : 'text-slate-500'}`}>{b.marksAwarded > 0 ? `+${b.marksAwarded}` : b.marksAwarded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function ResultsPage() {
  const ctx = useAdminExamContext();
  if (!ctx.allowed) return <ScopeDenied examCode={ctx.examCode} scope={ctx.scope} />;
  if (!ctx.service.exists()) return <ExamNotCreated eyebrow="Examinations" title="Results & Reports" examCode={ctx.examCode} summaries={ctx.summaries} onSelect={ctx.selectExam} scope={ctx.scope} />;
  return <ResultsView key={ctx.examCode} {...ctx} />;
}
