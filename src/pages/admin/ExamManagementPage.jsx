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
import { studentRosterService } from '../../services/studentRosterService';
import { activityLogService } from '../../services/activityLogService';
import { PATTERN_LABELS } from '../../utils/randomizationEngine';
import { assignPatternForCandidate } from '../../utils/patternAssignment';
import { formatDateTime } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import { useAdminExamContext } from '../../utils/useAdminExamContext';
import { ExamSwitcher, ScopeDenied } from '../../components/admin/ExamScope';
import { scopedQuestionBank } from '../../services/scopedQuestionBank';
import { defaultSubjectMeta } from '../../services/examRegistry';
import { DEFAULT_EXAM_CODE } from '../../services/adminScope';
import { subjectByCode } from '../../data/subjectCatalog';

const LETTERS = ['A', 'B', 'C', 'D'];
const CHECK_LABELS = {
  exact10Patterns: 'Exactly 10 patterns (A–J) generated',
  allPatternsHave25Questions: 'Every pattern contains 25 questions',
  allQuestionIdsPreserved: 'Same 25 master questions in every pattern',
  uniqueQuestionSequences: 'All 10 question sequences are distinct',
  allQuestionsHave4Options: 'Every question has four options',
  answerKeysValid: 'Answer key valid for every pattern',
};

function metaToForm(meta) {
  return {
    courseTitle: meta.courseTitle,
    semester: meta.semester,
    examDate: meta.examDate,
    durationMinutes: meta.durationMinutes,
    instructions: (meta.instructions || []).join('\n'),
  };
}

function ExamConsole({ service, examCode, summaries, selectExam, isDefaultExam }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useToast();
  const [examState, setExamState] = useState(() => service.getExamState());
  const [activeTab, setActiveTab] = useState('configuration');
  const [selectedPattern, setSelectedPattern] = useState('A');
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'regenerate' | 'publish' | 'unpublish' | 'reset'
  const [configForm, setConfigForm] = useState(() => metaToForm(examState.meta));
  const [configError, setConfigError] = useState('');

  const roster = useMemo(() => studentRosterService.list(), []);
  const attempts = service.listAttempts();
  const attemptByStudent = {};
  attempts.forEach((a) => { if (!attemptByStudent[a.studentIdentifier]) attemptByStudent[a.studentIdentifier] = a; });

  const { meta } = examState;
  const verification = examState.verificationReport;
  const currentPatternData = examState.patterns[selectedPattern];
  const masterById = Object.fromEntries((examState.masterQuestions || []).map((q) => [q.id, q]));
  const distribution = PATTERN_LABELS.map((label) => ({
    label,
    count: roster.filter((s) => s.status === 'Eligible' && assignPatternForCandidate(s.usn) === label).length,
  }));
  const maxDist = Math.max(1, ...distribution.map((d) => d.count));
  const activeAttempts = attempts.filter((a) => a.status === 'active').length;
  const submittedAttempts = attempts.filter((a) => a.status === 'submitted').length;

  const log = (action, details = '') => activityLogService.log({ action, category: 'exam', actor: user, target: meta.courseCode, details });
  const refresh = (state) => {
    setExamState({ ...state });
    setConfigForm(metaToForm(state.meta));
  };

  const runConfirmed = () => {
    try {
      if (confirm === 'regenerate') {
        refresh(service.regeneratePatterns());
        log('Regenerated patterns A–J');
        notify('Ten new patterns (A–J) were generated and verified.');
      } else if (confirm === 'publish') {
        refresh(service.publishExam());
        log('Published examination');
        notify('Examination published. Eligible candidates can now start.');
      } else if (confirm === 'unpublish') {
        refresh(service.unpublishExam());
        log('Unpublished examination', 'Returned to draft', 'warning');
        notify('Examination returned to draft and hidden from candidates.', 'info');
      } else if (confirm === 'reset') {
        refresh(service.resetToDefaults());
        log('Reset examination to the standard question set');
        notify('Reset to the standard 25 questions and regenerated patterns.', 'info');
      }
    } catch (error) {
      notify(error.message || 'The action could not be completed.', 'error');
    }
    setConfirm(null);
  };

  const saveConfiguration = (event) => {
    event.preventDefault();
    setConfigError('');
    try {
      refresh(service.updateExamMeta(configForm));
      log('Updated examination configuration');
      notify('Examination configuration saved.');
    } catch (error) {
      setConfigError(error.message);
    }
  };

  const confirmCopy = {
    regenerate: {
      title: 'Regenerate all 10 patterns?',
      tone: 'warning',
      label: 'Regenerate patterns',
      text: examState.isPublished
        ? 'The examination is live. New attempts will use the new patterns; candidates already writing keep their saved paper.'
        : 'Question order and option order are re-randomised for patterns A–J.',
    },
    publish: { title: 'Publish this examination?', tone: 'primary', label: 'Publish examination', text: 'Eligible candidates will see the examination and can start it. Configuration is locked while it is published.' },
    unpublish: { title: 'Return the examination to draft?', tone: 'warning', label: 'Unpublish', text: 'Candidates will no longer be able to start it. Attempts already in progress continue on their saved paper.' },
    reset: { title: 'Reset to the standard question set?', tone: 'danger', label: 'Reset question set', text: 'The master set returns to the standard 25 verified questions and patterns are regenerated. The examination returns to its default published state.' },
  }[confirm] || {};

  const tabs = [
    { id: 'configuration', label: 'Configuration' },
    { id: 'questions', label: 'Question set', count: examState.masterQuestions?.length || 0 },
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
            <StatusBadge status={examState.isPublished ? 'Published' : 'Draft'} />
            <span>{meta.semester}</span>
          </>
        )}
        actions={(
          <>
            <ExamSwitcher summaries={summaries} value={examCode} onChange={selectExam} />
            <Button variant="secondary" icon={RefreshCw} onClick={() => setConfirm('regenerate')}>Regenerate patterns</Button>
            {examState.isPublished ? (
              <Button variant="secondary" icon={Lock} onClick={() => setConfirm('unpublish')}>Unpublish</Button>
            ) : (
              <Button variant="success" icon={Send} disabled={!verification?.isValid} onClick={() => setConfirm('publish')}>Publish examination</Button>
            )}
          </>
        )}
      />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200 max-lg:[&>*:last-child]:col-span-2 lg:grid-cols-5" aria-label="Examination status">
        {[
          ['Status', examState.isPublished ? 'Published' : 'Draft', examState.isPublished ? `Since ${formatDateTime(examState.publishedAt)}` : 'Hidden from candidates'],
          ['Patterns', `${Object.keys(examState.patterns).length} × 25`, verification?.isValid ? 'Integrity verified' : 'Verification failed'],
          ['Total marks', meta.totalMarks, meta.negativeMarking ? 'Negative marking on' : 'No negative marking'],
          ['Duration', `${meta.durationMinutes} min`, meta.examDate],
          ['Attempts', `${activeAttempts} / ${submittedAttempts}`, 'In progress / submitted'],
        ].map(([label, value, hint]) => (
          <div key={label} className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
            <p className="text-[11px] text-slate-500">{hint}</p>
          </div>
        ))}
      </section>

      {!verification?.isValid && (
        <Alert tone="danger" title="Pattern verification failed">Regenerate the patterns before publishing this examination.</Alert>
      )}

      <div>
        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} label="Examination sections" />

        <TabPanel id="configuration" className={activeTab === 'configuration' ? 'pt-5' : 'hidden'}>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="Examination configuration" subtitle="Shown to candidates on the instruction screen.">
              {examState.isPublished && (
                <Alert tone="info" className="mb-4" title="Configuration is locked while published">
                  Unpublish the examination to make changes. Candidates already writing keep their own copy of these settings.
                </Alert>
              )}
              {configError && <Alert tone="danger" className="mb-4">{configError}</Alert>}
              <form onSubmit={saveConfiguration} className="space-y-4">
                <fieldset disabled={examState.isPublished} className="grid gap-4 sm:grid-cols-2">
                  <InputField label="Course code" value={meta.courseCode} disabled helperText="Fixed: used in paper codes (e.g. 22CS601-A)" />
                  <InputField label="Course title" required value={configForm.courseTitle} onChange={(e) => setConfigForm({ ...configForm, courseTitle: e.target.value })} />
                  <InputField label="Semester / programme" value={configForm.semester} onChange={(e) => setConfigForm({ ...configForm, semester: e.target.value })} />
                  <InputField label="Examination date" value={configForm.examDate} onChange={(e) => setConfigForm({ ...configForm, examDate: e.target.value })} helperText="As printed on hall tickets" />
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
                {!examState.isPublished && (
                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <Button variant="secondary" onClick={() => setConfigForm(metaToForm(meta))}>Discard changes</Button>
                    <Button type="submit" icon={Save}>Save configuration</Button>
                  </div>
                )}
              </form>
            </Card>
            <Card title="Marking scheme" subtitle="Derived from the selected questions">
              <dl className="divide-y divide-slate-100 text-xs">
                {[
                  ['Questions', meta.totalQuestions],
                  ['Marks per question', meta.marksPerQuestion ?? 'Varies by question'],
                  ['Total marks', meta.totalMarks],
                  ['Negative marking', meta.negativeMarking ? 'Yes, per question' : 'No'],
                  ['Pass threshold', '40%'],
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
            subtitle="All 10 patterns are permutations of these 25 questions."
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

          {currentPatternData && (
            <Card
              title={`${currentPatternData.patternLabel} · ${currentPatternData.paperCode}`}
              subtitle={`Opens with bank question ${currentPatternData.questions[0].originalId}, ends with ${currentPatternData.questions[24].originalId}`}
              bodyClassName="p-0"
            >
              <ol className="divide-y divide-slate-100">
                {currentPatternData.questions.map((q, idx) => {
                  const correctIdx = currentPatternData.answerKey[q.originalId];
                  return (
                    <li key={q.originalId} className="px-5 py-4">
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

          <Card title="Permutation matrix" subtitle="Bank question shown at each position of every pattern" bodyClassName="p-0" action={<Grid3x3 className="h-4 w-4 text-slate-400" aria-hidden="true" />}>
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
            <Card title="Pattern distribution" subtitle="Eligible candidates per pattern">
              <ul className="space-y-1.5">
                {distribution.map((d) => (
                  <li key={d.label} className="flex items-center gap-3 text-xs">
                    <span className="w-6 font-mono font-bold text-slate-700">{d.label}</span>
                    <span className="h-2 flex-1 bg-slate-100"><span className="block h-2 bg-[#1E3A5F]" style={{ width: `${(d.count / maxDist) * 100}%` }} /></span>
                    <span className="w-6 text-right tabular-nums text-slate-600">{d.count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[11px] leading-relaxed text-slate-500">Patterns are assigned automatically from each candidate's USN. Candidates cannot choose or change their pattern.</p>
            </Card>
            <Card
              className="lg:col-span-2"
              title="Candidate allocation"
              subtitle="Assigned pattern and attempt status"
              bodyClassName="p-0"
              action={<Link to="/admin/students" className="text-xs font-semibold text-[#1E3A5F] hover:underline">Manage candidates</Link>}
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
                  {roster.map((s) => {
                    const attempt = attemptByStudent[s.usn];
                    return (
                      <TableRow key={s.usn}>
                        <TableCell className="font-mono font-semibold text-[#1E3A5F]">{s.usn}</TableCell>
                        <TableCell>{s.name}<span className="block text-[11px] text-slate-500">Sem {s.semester} · Sec {s.section}</span></TableCell>
                        <TableCell><StatusBadge status={s.status} size="sm" /></TableCell>
                        <TableCell className="font-mono">{s.status === 'Eligible' ? `${assignPatternForCandidate(s.usn)} · ${meta.courseCode}-${assignPatternForCandidate(s.usn)}` : '—'}</TableCell>
                        <TableCell>
                          {attempt ? <StatusBadge status={attempt.status === 'active' ? 'In progress' : 'Submitted'} size="sm" /> : <span className="text-[11px] text-slate-400">Not started</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
        title={confirmCopy.title}
        tone={confirmCopy.tone}
        confirmLabel={confirmCopy.label}
        description={confirmCopy.text}
      />
    </div>
  );
}

/** Create a subject examination (draft) from that subject's question bank. */
function CreateExamPanel({ service, examCode, scope, summaries, selectExam, onCreated }) {
  const { user } = useAuth();
  const { notify } = useToast();
  const subject = subjectByCode(examCode);
  const subjectQuestions = scopedQuestionBank(scope).getQuestions()
    .filter((q) => q.subject === subject.title)
    .sort((a, b) => a.id - b.id);
  const defaults = defaultSubjectMeta(examCode);
  const [form, setForm] = useState({ courseTitle: defaults.courseTitle, examDate: '', durationMinutes: defaults.durationMinutes });
  const [error, setError] = useState('');

  const create = (event) => {
    event.preventDefault();
    setError('');
    const minutes = Number(form.durationMinutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 300) { setError('Duration must be a whole number between 5 and 300 minutes.'); return; }
    if (subjectQuestions.length < 25) { setError(`At least 25 ${subject.title} questions are needed (${subjectQuestions.length} in the bank).`); return; }
    try {
      service.createExam(
        { ...defaults, courseTitle: form.courseTitle.trim() || defaults.courseTitle, examDate: form.examDate.trim() || 'To be announced', durationMinutes: minutes },
        subjectQuestions.slice(0, 25).map((q) => ({
          id: Number(q.id), text: q.statement, options: [...q.options], correctOption: Number(q.correctOption),
          subject: q.subject, topic: q.topic, difficulty: q.difficulty, marks: Number(q.marks), negativeMarks: Number(q.negativeMarks),
        })),
      );
      activityLogService.log({ action: 'Created examination', category: 'exam', actor: user, target: examCode, details: subject.title });
      notify(`${examCode} created as a draft with 10 patterns (${examCode}-A … -J).`);
      onCreated();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Examinations"
        title={subject.title}
        meta={<span className="rounded-sm border border-slate-200 bg-white px-2 py-0.5 font-mono font-bold text-[#1E3A5F]">{examCode}</span>}
        description="No examination exists for this subject yet. Create it from this subject's question bank."
        actions={<ExamSwitcher summaries={summaries} value={examCode} onChange={selectExam} />}
      />
      <Card title="Create examination" subtitle={`Uses the first 25 of ${subjectQuestions.length} ${subject.short} questions; change the set later from the Question Bank.`} className="max-w-2xl">
        {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <InputField className="sm:col-span-2" label="Examination title" value={form.courseTitle} onChange={(e) => setForm({ ...form, courseTitle: e.target.value })} />
          <InputField label="Examination date" placeholder="e.g. 05 Dec 2026" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
          <InputField label="Duration (minutes)" type="number" min="5" max="300" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" icon={Send}>Create examination</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function ExamManagementPage() {
  const { scope, examCode, allowed, service, selectExam, summaries } = useAdminExamContext();
  const [, setCreatedVersion] = useState(0);
  if (!allowed || !service) return <ScopeDenied examCode={examCode} scope={scope} />;
  if (!service.exists()) {
    return (
      <CreateExamPanel
        key={examCode}
        service={service}
        examCode={examCode}
        scope={scope}
        summaries={summaries}
        selectExam={selectExam}
        onCreated={() => setCreatedVersion((v) => v + 1)}
      />
    );
  }
  return (
    <ExamConsole
      key={examCode}
      service={service}
      examCode={examCode}
      summaries={summaries}
      selectExam={selectExam}
      isDefaultExam={examCode === DEFAULT_EXAM_CODE}
    />
  );
}
