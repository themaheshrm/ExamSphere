import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Eye, EyeOff, Grid3x3, Lock, RefreshCw, RotateCcw, Save, Send, ShieldCheck, XCircle,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import PageHeader from '../../components/common/PageHeader';
import Alert from '../../components/common/Alert';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import StatusBadge from '../../components/common/StatusBadge';
import Tabs, { TabPanel } from '../../components/common/Tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { useToast } from '../../components/common/Toast';
import EmptyState from '../../components/common/EmptyState';
import { activityLogService } from '../../services/activityLogService';
import { examsApi, examDateOf, PATTERN_LABELS } from '../../services/api/examsApi';
import { questionsApi } from '../../services/api/questionsApi';
import { useAsync, useAutoReload, emitDataChanged } from '../../utils/useAsync';
import { useSettings } from '../../context/SettingsContext';
import { formatDateTime } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import { useAdminExamContext } from '../../utils/useAdminExamContext';
import { ExamSwitcher, ScopeDenied, AdminExamGate } from '../../components/admin/ExamScope';
import { DEFAULT_EXAM_CODE } from '../../services/adminScope';

const LETTERS = ['A', 'B', 'C', 'D'];
const CHECK_LABELS = {
  exact10Patterns: 'Exactly 10 patterns (A–J) generated',
  allPatternsHave25Questions: 'Every pattern contains 25 questions',
  allQuestionIdsPreserved: 'Same 25 master questions in every pattern',
  uniqueQuestionSequences: 'All 10 question sequences are distinct',
  allQuestionsHave4Options: 'Every question has four options',
  answerKeysValid: 'Answer key valid for every pattern',
};

const ATTEMPTED = ['active', 'submitted', 'auto_submitted'];
const DEFAULT_INSTRUCTIONS = [
  '25 multiple-choice questions. Marks are shown with each question.',
  'Select one option per question.',
  'You can revisit questions and change answers until you submit. Use Mark for review to flag a question.',
  'The examination is submitted automatically when time runs out.',
  'Once submitted, answers cannot be changed.',
];

function metaToForm(meta) {
  return {
    courseTitle: meta.courseTitle,
    semester: meta.semester,
    examDate: meta.examDate,
    durationMinutes: meta.durationMinutes,
    instructions: (meta.instructions || []).join('\n'),
  };
}

const toMaster = (q) => ({
  id: q.questionNo, uuid: q.id, text: q.statement, options: q.options, correctOption: q.correctOption,
  topic: q.topic, marks: q.marks, negativeMarks: q.negativeMarks,
});

async function loadConsole(exam) {
  const [master, patterns, candidates, verification] = await Promise.all([
    examsApi.masterQuestions(exam.id),
    examsApi.patterns(exam.id),
    examsApi.candidates(exam.id),
    exam.patternCount > 0 ? examsApi.verification(exam.id) : Promise.resolve(null),
  ]);
  const questionNo = Object.fromEntries(master.map((q) => [q.id, q.questionNo]));
  return {
    master: master.map(toMaster),
    patterns: Object.fromEntries(patterns.map((p) => [p.label, {
      patternLabel: p.patternLabel,
      paperCode: p.paperCode,
      questions: p.questions.map((q) => ({
        displayNumber: q.displayNumber, originalId: questionNo[q.questionId] ?? '—', text: q.text, options: q.options, correctOption: q.correctOption,
      })),
    }])),
    candidates,
    verification,
  };
}

function ExamConsole({ exam, examCode, summaries, selectExam, isDefaultExam, reload: reloadContext }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useToast();
  const { data, error, loading, reload } = useAsync(() => loadConsole(exam), [exam.id, exam.patternsGeneratedAt, exam.status, exam.questionCount]);
  useAutoReload(reload, 30000);
  const [activeTab, setActiveTab] = useState('configuration');
  const [selectedPattern, setSelectedPattern] = useState('A');
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'regenerate' | 'publish' | 'unpublish' | 'close' | 'reset'
  const [busy, setBusy] = useState(false);
  const [configError, setConfigError] = useState('');

  const masterQuestions = useMemo(() => data?.master || [], [data]);
  const totalFromQuestions = masterQuestions.reduce((sum, q) => sum + q.marks, 0);
  const marks = [...new Set(masterQuestions.map((q) => q.marks))];
  const meta = {
    courseCode: exam.courseCode,
    courseTitle: exam.title,
    semester: exam.semesterLabel,
    examDate: examDateOf(exam),
    durationMinutes: exam.durationMinutes,
    instructions: exam.instructions,
    totalQuestions: masterQuestions.length || 25,
    totalMarks: exam.totalMarks ?? (totalFromQuestions || '—'),
    marksPerQuestion: marks.length === 1 ? marks[0] : null,
    negativeMarking: masterQuestions.some((q) => q.negativeMarks > 0),
  };
  const examState = {
    isPublished: exam.isPublished,
    publishedAt: exam.publishedAt,
    patterns: data?.patterns || {},
    masterQuestions,
  };
  const [configForm, setConfigForm] = useState(() => metaToForm(meta));
  const candidates = data?.candidates || [];
  const roster = candidates.filter((c) => c.assignmentStatus === 'assigned');
  const verification = data?.verification && !exam.patternsStale ? data.verification : null;
  const currentPatternData = examState.patterns[selectedPattern];
  const masterById = Object.fromEntries(masterQuestions.map((q) => [q.id, q]));
  const distribution = PATTERN_LABELS.map((label) => ({
    label,
    count: roster.filter((c) => c.patternLabel === label).length,
  }));
  const maxDist = Math.max(1, ...distribution.map((d) => d.count));
  const activeAttempts = candidates.filter((c) => c.attemptStatus === 'active').length;
  const submittedAttempts = candidates.filter((c) => ['submitted', 'auto_submitted'].includes(c.attemptStatus)).length;
  const hasAttempts = candidates.some((c) => ATTEMPTED.includes(c.attemptStatus));
  const isDraft = exam.status === 'draft';

  const log = (action, details = '') => activityLogService.log({ action, category: 'exam', actor: user, target: meta.courseCode, details });
  const refresh = () => { reload(); reloadContext(); emitDataChanged(); };

  /** Standard question set of the default (22CS601) examination: its first 25 bank questions. */
  const resetToStandard = async () => {
    const bank = (await questionsApi.list()).filter((q) => q.subjectCode === exam.courseCode).sort((x, y) => x.questionNo - y.questionNo);
    if (bank.length < 25) throw new Error(`At least 25 ${exam.courseCode} questions are needed (${bank.length} in the bank).`);
    const wasPublished = exam.isPublished;
    if (wasPublished) await examsApi.unpublish(exam.id);
    await examsApi.setQuestions(exam.id, bank.slice(0, 25).map((q) => q.id));
    await examsApi.generatePatterns(exam.id);
    if (wasPublished) await examsApi.publish(exam.id);
  };

  const runConfirmed = async () => {
    setBusy(true);
    try {
      if (confirm === 'regenerate') {
        const report = await examsApi.generatePatterns(exam.id);
        log('Regenerated patterns A–J');
        notify(report?.isValid === false ? 'Patterns generated but verification failed.' : 'Ten new patterns (A–J) were generated and verified.', report?.isValid === false ? 'error' : 'success');
      } else if (confirm === 'publish') {
        const result = await examsApi.publish(exam.id);
        log('Published examination', `${result?.patternsAllocated ?? 0} pattern(s) allocated`);
        notify('Examination published. Eligible candidates can now start.');
      } else if (confirm === 'unpublish') {
        await examsApi.unpublish(exam.id);
        log('Unpublished examination', 'Returned to draft');
        notify('Examination returned to draft and hidden from candidates.', 'info');
      } else if (confirm === 'close') {
        await examsApi.close(exam.id);
        log('Closed examination');
        notify('Examination closed. No new attempts can start.', 'info');
      } else if (confirm === 'reset') {
        await resetToStandard();
        log('Reset examination to the standard question set');
        notify('Reset to the standard 25 questions and regenerated patterns.', 'info');
      }
    } catch (err) {
      notify(err.message || 'The action could not be completed.', 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
      refresh();
    }
  };

  const saveConfiguration = async (event) => {
    event.preventDefault();
    setConfigError('');
    const minutes = Number(configForm.durationMinutes);
    const instructions = configForm.instructions.split('\n').map((l) => l.trim()).filter(Boolean);
    if (configForm.courseTitle.trim().length < 3) { setConfigError('Enter the examination title.'); return; }
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 300) { setConfigError('Duration must be a whole number between 5 and 300 minutes.'); return; }
    if (!instructions.length) { setConfigError('Add at least one candidate instruction.'); return; }
    if (configForm.examDate && !/^\d{4}-\d{2}-\d{2}$/.test(configForm.examDate)) { setConfigError('Choose a valid examination date.'); return; }
    setBusy(true);
    try {
      await examsApi.updateConfig(exam.id, {
        title: configForm.courseTitle.trim(),
        semesterLabel: configForm.semester.trim(),
        durationMinutes: minutes,
        instructions,
        examDate: configForm.examDate !== meta.examDate ? configForm.examDate : undefined,
      });
      log('Updated examination configuration');
      notify('Examination configuration saved.');
      refresh();
    } catch (err) {
      setConfigError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmCopy = {
    regenerate: {
      title: 'Regenerate all 10 patterns?',
      tone: 'warning',
      label: 'Regenerate patterns',
      text: 'Question and option order are re-randomised for patterns A–J on the server.',
    },
    publish: { title: 'Publish this examination?', tone: 'primary', label: 'Publish examination', text: 'Eligible candidates can start it and each is allocated a pattern. Configuration is locked while published.' },
    unpublish: { title: 'Return the examination to draft?', tone: 'warning', label: 'Unpublish', text: 'Candidates can no longer start it.' },
    close: { title: 'Close this examination?', tone: 'danger', label: 'Close examination', text: 'No new attempts can start. Attempts in progress are submitted when their time runs out.' },
    reset: { title: 'Reset to the standard question set?', tone: 'danger', label: 'Reset question set', text: `Restores the standard 25 questions and regenerates the patterns${exam.isPublished ? ', then republishes the examination' : ''}. Not possible once attempts have started.` },
  }[confirm] || {};

  const tabs = [
    { id: 'configuration', label: 'Configuration' },
    { id: 'questions', label: 'Question set', count: masterQuestions.length },
    { id: 'patterns', label: 'Pattern preview', count: Object.keys(examState.patterns).length },
    { id: 'verification', label: 'Verification' },
    { id: 'candidates', label: 'Candidate allocation', count: roster.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Examinations"
        title={meta.courseTitle}
        meta={(
          <>
            <span className="rounded-sm border border-slate-200 bg-white px-2 py-0.5 font-mono font-bold text-[#1E3A5F]">{meta.courseCode}</span>
            <StatusBadge status={exam.status === 'closed' ? 'Closed' : examState.isPublished ? 'Published' : 'Draft'} />
            <span>{meta.semester}</span>
          </>
        )}
        actions={(
          <>
            <ExamSwitcher summaries={summaries} value={examCode} onChange={selectExam} />
            <Button variant="secondary" icon={RefreshCw} disabled={!isDraft || masterQuestions.length !== 25} title={isDraft ? undefined : 'Unpublish to regenerate patterns'} onClick={() => setConfirm('regenerate')}>Regenerate patterns</Button>
            {examState.isPublished && !hasAttempts && (
              <Button variant="secondary" icon={Lock} onClick={() => setConfirm('unpublish')}>Unpublish</Button>
            )}
            {examState.isPublished && hasAttempts && (
              <Button variant="secondary" icon={Lock} onClick={() => setConfirm('close')}>Close examination</Button>
            )}
            {isDraft && (
              <Button variant="success" icon={Send} disabled={!verification?.isValid} onClick={() => setConfirm('publish')}>Publish examination</Button>
            )}
          </>
        )}
      />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200 max-lg:[&>*:last-child]:col-span-2 lg:grid-cols-5" aria-label="Examination status">
        {[
          ['Status', exam.status === 'closed' ? 'Closed' : examState.isPublished ? 'Published' : 'Draft', examState.isPublished ? `Since ${formatDateTime(examState.publishedAt)}` : 'Hidden from candidates'],
          ['Patterns', `${Object.keys(examState.patterns).length} × 25`, verification?.isValid ? 'Integrity verified' : 'Verification failed'],
          ['Total marks', meta.totalMarks, meta.negativeMarking ? 'Negative marking on' : 'No negative marking'],
          ['Duration', `${meta.durationMinutes} min`, meta.examDate || ''],
          ['In progress / submitted', `${activeAttempts} / ${submittedAttempts}`, ''],
        ].map(([label, value, hint]) => (
          <div key={label} className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
            {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
          </div>
        ))}
      </section>

      {error && (
        <Alert tone="danger" title="Could not load examination data">
          {error.message} <button type="button" className="ml-2 font-semibold underline" onClick={reload}>Try again</button>
        </Alert>
      )}
      {loading && !data && <p className="text-sm text-slate-500" role="status">Loading examination…</p>}
      {data && isDraft && masterQuestions.length !== 25 && (
        <Alert tone="warning" title="Question set incomplete">Select exactly 25 questions in the Question Bank, then generate the patterns.</Alert>
      )}
      {data && masterQuestions.length === 25 && !verification?.isValid && (
        <Alert tone="danger" title="Pattern verification failed">Regenerate the patterns before publishing this examination.</Alert>
      )}

      <div>
        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} label="Examination sections" />

        <TabPanel id="configuration" className={activeTab === 'configuration' ? 'pt-5' : 'hidden'}>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="Examination configuration">
              {!isDraft && (
                <Alert tone="info" className="mb-4">{exam.status === 'closed' ? 'This examination is closed.' : 'Locked while published. Unpublish to make changes.'}</Alert>
              )}
              {configError && <Alert tone="danger" className="mb-4">{configError}</Alert>}
              <form onSubmit={saveConfiguration} className="space-y-4">
                <fieldset disabled={!isDraft || busy} className="grid gap-4 sm:grid-cols-2">
                  <InputField label="Course code" value={meta.courseCode} disabled />
                  <InputField label="Course title" required value={configForm.courseTitle} onChange={(e) => setConfigForm({ ...configForm, courseTitle: e.target.value })} />
                  <InputField label="Semester / programme" value={configForm.semester} onChange={(e) => setConfigForm({ ...configForm, semester: e.target.value })} />
                  <InputField label="Examination date" type="date" value={configForm.examDate} onChange={(e) => setConfigForm({ ...configForm, examDate: e.target.value })} />
                  <InputField label="Duration (minutes)" type="number" min="5" max="300" required value={configForm.durationMinutes} onChange={(e) => setConfigForm({ ...configForm, durationMinutes: e.target.value })} />
                  <InputField label="Questions per paper" value="25 (fixed)" disabled />
                  <div className="sm:col-span-2">
                    <label htmlFor="exam-instructions" className="mb-1 block text-xs font-medium text-slate-800">Candidate instructions <span className="text-red-600">*</span></label>
                    <textarea
                      id="exam-instructions"
                      rows={7}
                      value={configForm.instructions}
                      onChange={(e) => setConfigForm({ ...configForm, instructions: e.target.value })}
                      className="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">One instruction per line.</p>
                  </div>
                </fieldset>
                {isDraft && (
                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <Button variant="secondary" onClick={() => setConfigForm(metaToForm(meta))} disabled={busy}>Discard changes</Button>
                    <Button type="submit" icon={Save} isLoading={busy}>Save configuration</Button>
                  </div>
                )}
              </form>
            </Card>
            <Card title="Marking scheme">
              <dl className="divide-y divide-slate-100 text-xs">
                {[
                  ['Questions', meta.totalQuestions],
                  ['Marks per question', meta.marksPerQuestion ?? 'Varies by question'],
                  ['Total marks', meta.totalMarks],
                  ['Negative marking', meta.negativeMarking ? 'Yes, per question' : 'No'],
                  ['Pass threshold', `${exam.passPercentage}%`],
                  ['Paper patterns', '10 (A–J)'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-semibold text-slate-900 tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </TabPanel>

        <TabPanel id="questions" className={activeTab === 'questions' ? 'pt-5' : 'hidden'}>
          <Card
            title="Master question set"
            bodyClassName="p-0"
            action={(
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={showAnswerKey ? EyeOff : Eye} onClick={() => setShowAnswerKey((v) => !v)}>{showAnswerKey ? 'Hide key' : 'Show key'}</Button>
                {isDefaultExam && <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setConfirm('reset')}>Reset to standard</Button>}
                <Button size="sm" onClick={() => navigate(`/admin/questions?exam=${examCode}`)}>Change in Question Bank</Button>
              </div>
            )}
          >
            <Table className="rounded-none border-x-0 border-b-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead className="hidden md:table-cell">Topic</TableHead>
                  <TableHead align="center">Marks</TableHead>
                  {showAnswerKey && <TableHead>Key</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(examState.masterQuestions || []).map((q, index) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-slate-500">{index + 1}</TableCell>
                    <TableCell>
                      <p className="text-[13px] text-slate-900">{q.text}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">Bank ID {q.id}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{q.topic || '—'}</TableCell>
                    <TableCell align="center" className="tabular-nums">{q.marks ?? meta.marksPerQuestion}</TableCell>
                    {showAnswerKey && (
                      <TableCell>
                        <span className="font-semibold text-emerald-800">{LETTERS[q.correctOption]}.</span>{' '}
                        <span className="text-slate-600">{q.options[q.correctOption]}</span>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabPanel>

        <TabPanel id="patterns" className={activeTab === 'patterns' ? 'space-y-4 pt-5' : 'hidden'}>
          <div className="flex flex-col gap-3 rounded-sm border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="radiogroup" aria-label="Pattern" className="flex flex-wrap gap-1">
              {PATTERN_LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={selectedPattern === label}
                  onClick={() => setSelectedPattern(label)}
                  className={`h-9 w-9 rounded-sm border font-mono text-xs font-bold ${selectedPattern === label ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button size="sm" variant={showAnswerKey ? 'outline' : 'secondary'} icon={showAnswerKey ? EyeOff : Eye} onClick={() => setShowAnswerKey((v) => !v)}>
              {showAnswerKey ? 'Hide answer key' : 'Show answer key'}
            </Button>
          </div>

          {!currentPatternData && data && <EmptyState compact title="No patterns generated yet" />}
          {currentPatternData && (
            <Card
              title={`${currentPatternData.patternLabel} · ${currentPatternData.paperCode}`}
              bodyClassName="p-0"
            >
              <ol className="divide-y divide-slate-100">
                {currentPatternData.questions.map((q, idx) => {
                  const correctIdx = q.correctOption;
                  return (
                    <li key={q.displayNumber} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[13px] font-medium text-slate-900">
                          <span className="mr-2 font-mono text-slate-500">Q{idx + 1}.</span>{q.text}
                        </p>
                        <span className="shrink-0 font-mono text-[10px] text-slate-400">Bank {q.originalId}</span>
                      </div>
                      <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {q.options.map((opt, optIdx) => {
                          const isCorrect = showAnswerKey && optIdx === correctIdx;
                          return (
                            <li key={optIdx} className={`flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs ${isCorrect ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-900' : 'border-slate-200 text-slate-700'}`}>
                              <span className="font-mono text-[11px] text-slate-500">{LETTERS[optIdx]}.</span>
                              <span className="flex-1">{opt}</span>
                              {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-label="Correct answer" />}
                            </li>
                          );
                        })}
                      </ol>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}
        </TabPanel>

        <TabPanel id="verification" className={activeTab === 'verification' ? 'space-y-6 pt-5' : 'hidden'}>
          <Card
            title="Integrity checks"
            subtitle={verification ? `Last verified ${formatDateTime(verification.timestamp)}` : 'Not verified yet'}
            action={verification?.isValid ? <StatusBadge status="Verified">All checks passed</StatusBadge> : <StatusBadge status="Failed">Checks failed</StatusBadge>}
          >
            <ul className="grid gap-2 sm:grid-cols-2">
              {Object.entries(CHECK_LABELS).map(([key, label]) => {
                const ok = verification?.checks?.[key];
                const Icon = ok ? CheckCircle2 : XCircle;
                return (
                  <li key={key} className="flex items-center gap-2 rounded-sm border border-slate-200 px-3 py-2 text-xs">
                    <Icon className={`h-4 w-4 shrink-0 ${ok ? 'text-emerald-600' : 'text-rose-600'}`} aria-hidden="true" />
                    <span className="text-slate-800">{label}</span>
                    <span className="sr-only">{ok ? 'passed' : 'failed'}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Permutation matrix" bodyClassName="p-0" action={<Grid3x3 className="h-4 w-4 text-slate-400" aria-hidden="true" />}>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[720px] text-center text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">Position</th>
                    {PATTERN_LABELS.map((label) => <th key={label} className="px-2 py-2 font-mono">{label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {Array.from({ length: 25 }, (_, slotIdx) => (
                    <tr key={slotIdx} className="hover:bg-slate-50">
                      <td className="sticky left-0 bg-white px-3 py-1.5 text-left text-slate-500">Q{slotIdx + 1}</td>
                      {PATTERN_LABELS.map((label) => {
                        const qId = examState.patterns[label]?.questions[slotIdx]?.originalId;
                        return <td key={label} className="px-2 py-1.5 text-slate-800" title={masterById[qId]?.text}>{qId}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabPanel>

        <TabPanel id="candidates" className={activeTab === 'candidates' ? 'space-y-6 pt-5' : 'hidden'}>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Pattern distribution" subtitle={isDraft ? 'Patterns are allocated when the examination is published' : 'Eligible candidates per pattern'}>
              <ul className="space-y-1.5">
                {distribution.map((d) => (
                  <li key={d.label} className="flex items-center gap-3 text-xs">
                    <span className="w-6 font-mono font-bold text-slate-700">{d.label}</span>
                    <span className="h-2 flex-1 bg-slate-100"><span className="block h-2 bg-[#1E3A5F]" style={{ width: `${(d.count / maxDist) * 100}%` }} /></span>
                    <span className="w-6 text-right tabular-nums text-slate-600">{d.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card
              className="lg:col-span-2"
              title="Candidate allocation"
                bodyClassName="p-0"
              action={<Link to={`/admin/students?exam=${examCode}`} className="text-xs font-semibold text-[#1E3A5F] hover:underline">Manage candidates</Link>}
            >
              <Table className="rounded-none border-x-0 border-b-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>USN</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Eligibility</TableHead>
                    <TableHead>Pattern</TableHead>
                    <TableHead>Attempt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-xs text-slate-500">No candidates assigned yet.</TableCell></TableRow>
                  )}
                  {candidates.map((c) => (
                    <TableRow key={c.assignmentId}>
                      <TableCell className="font-mono font-semibold text-[#1E3A5F]">{c.usn}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell><StatusBadge status={c.assignmentStatus === 'assigned' ? 'Eligible' : 'Withheld'} size="sm" /></TableCell>
                      <TableCell className="font-mono">{c.patternLabel ? `${c.patternLabel} · ${c.paperCode}` : '—'}</TableCell>
                      <TableCell>
                        {c.attemptId ? <StatusBadge status={c.attemptStatus === 'active' ? 'In progress' : 'Submitted'} size="sm" /> : <span className="text-[11px] text-slate-400">Not started</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabPanel>
      </div>

      <Card bodyClassName="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E3A5F]" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-slate-600">
            Every attempt stores an immutable copy of its paper and answer key when it starts. Regenerating, editing or unpublishing never changes a paper that a candidate is already writing.
          </p>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirmed}
        isLoading={busy}
        title={confirmCopy.title}
        tone={confirmCopy.tone}
        confirmLabel={confirmCopy.label}
        description={confirmCopy.text}
      />
    </div>
  );
}

/** Create a subject examination (draft) from that subject's question bank. */
function CreateExamPanel({ subject, examCode, summaries, selectExam, onCreated }) {
  const { user } = useAuth();
  const { notify } = useToast();
  const { settings } = useSettings();
  const bank = useAsync(async () => (await questionsApi.list())
    .filter((q) => q.subjectCode === examCode)
    .sort((a, b) => a.questionNo - b.questionNo), [examCode]);
  const subjectQuestions = bank.data || [];
  const [form, setForm] = useState({ courseTitle: subject.title, examDate: '', durationMinutes: 45 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (event) => {
    event.preventDefault();
    setError('');
    const minutes = Number(form.durationMinutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 300) { setError('Duration must be a whole number between 5 and 300 minutes.'); return; }
    if (form.examDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.examDate)) { setError('Choose a valid examination date.'); return; }
    if (subjectQuestions.length < 25) { setError(`At least 25 ${subject.title} questions are needed (${subjectQuestions.length} in the bank).`); return; }
    setBusy(true);
    try {
      const examId = await examsApi.create({
        subject,
        title: form.courseTitle.trim() || subject.title,
        examDate: form.examDate,
        durationMinutes: minutes,
        semesterLabel: subject.semester ? `Semester ${subject.semester}` : '',
        instructions: DEFAULT_INSTRUCTIONS,
        resultDisplay: settings.resultDisplay,
      });
      await examsApi.setQuestions(examId, subjectQuestions.slice(0, 25).map((q) => q.id));
      await examsApi.generatePatterns(examId);
      activityLogService.log({ action: 'Created examination', category: 'exam', actor: user, target: examCode, details: subject.title });
      notify(`${examCode} created as a draft with 10 patterns (${examCode}-A … -J).`);
      onCreated();
    } catch (err) {
      setError(err.message);
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Examinations"
        title={subject.title}
        meta={<span className="rounded-sm border border-slate-200 bg-white px-2 py-0.5 font-mono font-bold text-[#1E3A5F]">{examCode}</span>}
        description="No examination yet."
        actions={<ExamSwitcher summaries={summaries} value={examCode} onChange={selectExam} />}
      />
      <Card title="Create examination" subtitle={bank.loading && !bank.data ? 'Loading question bank…' : `First 25 of ${subjectQuestions.length} questions`} className="max-w-2xl">
        {(error || bank.error) && <Alert tone="danger" className="mb-4">{error || bank.error.message}</Alert>}
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <InputField className="sm:col-span-2" label="Examination title" value={form.courseTitle} onChange={(e) => setForm({ ...form, courseTitle: e.target.value })} />
          <InputField label="Examination date" type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} helperText="Blank = open for 30 days" />
          <InputField label="Duration (minutes)" type="number" min="5" max="300" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" icon={Send} isLoading={busy} disabled={!bank.data}>Create examination</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function ExamManagementPage() {
  const ctx = useAdminExamContext();
  return (
    <AdminExamGate ctx={ctx} eyebrow="Examinations" title="Examination" requireExam={false}>
      {(c) => {
        if (!c.exam) {
          if (!c.subject) return <ScopeDenied examCode={c.examCode} scope={c.scope} />;
          return <CreateExamPanel key={c.examCode} subject={c.subject} examCode={c.examCode} summaries={c.summaries} selectExam={c.selectExam} onCreated={() => { c.reload(); emitDataChanged(); }} />;
        }
        return <ExamConsole key={c.exam.id} {...c} isDefaultExam={c.examCode === DEFAULT_EXAM_CODE} />;
      }}
    </AdminExamGate>
  );
}
