import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Check, Download, Edit3, FileSpreadsheet, Filter, Plus, Search, Trash2, Upload, X,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PageHeader from '../../components/common/PageHeader';
import Pagination from '../../components/common/Pagination';
import Alert from '../../components/common/Alert';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { useToast } from '../../components/common/Toast';
import { DIFFICULTIES, validateQuestion } from '../../services/questionBankService.js';
import { scopedQuestionBank } from '../../services/scopedQuestionBank.js';
import { getAdminScope, DEFAULT_EXAM_CODE } from '../../services/adminScope.js';
import { getScopedExamService, defaultSubjectMeta } from '../../services/examRegistry.js';
import { subjectByCode, subjectForQuestion } from '../../data/subjectCatalog.js';
import { activityLogService } from '../../services/activityLogService.js';
import { downloadQuestionTemplate, readQuestionImportFile, QUESTION_IMPORT_HEADERS } from '../../utils/questionImport.js';
import { usePagination } from '../../utils/usePagination';
import { useAuth } from '../../context/AuthContext';

const EMPTY_FORM = {
  subject: '', topic: '', statement: '', options: ['', '', '', ''],
  correctOption: null, difficulty: 'Medium', marks: 2, negativeMarks: 0,
};
const LETTERS = ['A', 'B', 'C', 'D'];
const selectCls = 'es-select h-9 w-full rounded-sm border border-slate-300 bg-white pl-3 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]';

export default function QuestionBankPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useToast();
  const fileRef = useRef(null);
  const scope = getAdminScope(user);
  const bank = scopedQuestionBank(scope);
  const scopedSubject = scope.scoped ? subjectByCode(scope.subjectCodes[0]) : null;
  const [questions, setQuestions] = useState(() => bank.getQuestions());
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [questionModal, setQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  const subjects = useMemo(() => [...new Set(questions.map((item) => item.subject))].sort(), [questions]);
  const topics = useMemo(() => [...new Set(
    questions.filter((item) => !subjectFilter || item.subject === subjectFilter).map((item) => item.topic),
  )].sort(), [questions, subjectFilter]);

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return questions.filter((item) => {
      const matchesSearch = !term || [item.statement, item.subject, item.topic, ...item.options]
        .some((value) => String(value).toLowerCase().includes(term));
      return matchesSearch && (!subjectFilter || item.subject === subjectFilter) &&
        (!topicFilter || item.topic === topicFilter) &&
        (!difficultyFilter || item.difficulty === difficultyFilter);
    });
  }, [questions, search, subjectFilter, topicFilter, difficultyFilter]);
  const { pageItems, paginationProps, resetPage } = usePagination(filteredQuestions, 10);

  const difficultyCounts = useMemo(() => DIFFICULTIES.map((difficulty) => ({
    difficulty,
    count: questions.filter((item) => item.difficulty === difficulty).length,
  })), [questions]);
  const readyImportRows = importRows.filter((row) => row.status === 'Ready');
  const importSummary = useMemo(() => ['Ready', 'Duplicate', 'Invalid', 'Imported']
    .map((status) => [status, importRows.filter((row) => row.status === status).length]), [importRows]);

  const refreshQuestions = () => setQuestions(bank.getQuestions());
  const log = (action, target, details) => activityLogService.log({ action, category: 'question-bank', actor: user, target, details });

  const openCreate = () => {
    setEditingQuestion(null);
    setForm({ ...EMPTY_FORM, subject: scopedSubject?.title || '' });
    setFormErrors([]);
    setQuestionModal(true);
  };

  const openEdit = (question) => {
    setEditingQuestion(question);
    setForm({
      subject: question.subject,
      topic: question.topic,
      statement: question.statement,
      options: [...question.options],
      correctOption: question.correctOption,
      difficulty: question.difficulty,
      marks: question.marks,
      negativeMarks: question.negativeMarks,
    });
    setFormErrors([]);
    setQuestionModal(true);
  };

  const submitQuestion = (event) => {
    event.preventDefault();
    const { errors } = validateQuestion(form);
    if (errors.length) {
      setFormErrors(errors);
      return;
    }
    try {
      const saved = bank.saveQuestion(form, editingQuestion?.id ?? null);
      refreshQuestions();
      setQuestionModal(false);
      log(editingQuestion ? 'Edited question' : 'Added question', `Q${saved.id}`, saved.statement.slice(0, 80));
      notify(editingQuestion ? `Question ${saved.id} updated.` : `Question ${saved.id} added to the bank.`);
    } catch (error) {
      setFormErrors([error.message]);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    try {
      bank.deleteQuestion(deleteTarget.id);
    } catch (error) {
      notify(error.message, 'error');
      setDeleteTarget(null);
      return;
    }
    setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id));
    refreshQuestions();
    log('Deleted question', `Q${deleteTarget.id}`, deleteTarget.statement.slice(0, 80));
    notify(`Question ${deleteTarget.id} deleted.`);
    setDeleteTarget(null);
  };

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id);
      if (current.length >= 25) {
        notify('An examination uses exactly 25 questions. Deselect one first.', 'warning');
        return current;
      }
      return [...current, id];
    });
  };

  const sendQuestionsToGenerator = () => {
    if (selectedIds.length !== 25) return;
    const selectedQuestions = selectedIds.map((id) => questions.find((item) => item.id === id));
    // Target exam: the single catalogue subject of all 25 questions; otherwise
    // (institution-wide admins only) the original 22CS601 examination.
    const codes = [...new Set(selectedQuestions.map((q) => subjectForQuestion(q.subject)?.code || null))];
    const target = codes.length === 1 && codes[0] ? codes[0] : (!scope.scoped ? DEFAULT_EXAM_CODE : null);
    if (!target) {
      setConfirmSend(false);
      notify('All 25 questions must belong to your assigned subject.', 'error');
      return;
    }
    try {
      const service = getScopedExamService(scope, target);
      const masters = selectedQuestions.map((question) => ({
        id: Number(question.id),
        text: question.statement,
        options: [...question.options],
        correctOption: Number(question.correctOption),
        subject: question.subject,
        topic: question.topic,
        difficulty: question.difficulty,
        marks: Number(question.marks),
        negativeMarks: Number(question.negativeMarks),
      }));
      if (service.exists()) service.setMasterQuestions(masters);
      else service.createExam(defaultSubjectMeta(target), masters);
      log('Replaced examination question set', target, '25 questions · patterns A–J regenerated');
      notify('The 25 questions were sent to the generator and patterns A–J were regenerated. Active attempts keep their saved paper.');
      setConfirmSend(false);
      navigate(`/admin/exams?exam=${target}`);
    } catch (error) {
      setConfirmSend(false);
      notify(error.message || 'Could not update the exam generator.', 'error');
    }
  };

  const openImport = () => {
    setImportRows([]);
    setImportErrors([]);
    setImportFileName('');
    setImportModal(true);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportRows([]);
    setImportErrors([]);
    setImportFileName(file.name);
    setIsReading(true);
    try {
      const preview = await readQuestionImportFile(file, questions);
      setImportRows(bank.applyScopeToPreview(preview.rows));
      setImportErrors(preview.errors);
      if (!preview.rows.length && !preview.errors.length) {
        setImportErrors(['No question rows were found in the selected file.']);
      }
    } catch (error) {
      setImportErrors([error.message || 'Could not read this file.']);
    } finally {
      setIsReading(false);
    }
  };

  const confirmImport = () => {
    try {
      const imported = bank.importQuestions(readyImportRows.map((row) => row.question));
      refreshQuestions();
      setImportRows((current) => current.map((row) => row.status === 'Ready'
        ? { ...row, status: 'Imported' }
        : row));
      log('Imported questions', importFileName, `${imported.length} question(s)`);
      notify(`Imported ${imported.length} question${imported.length === 1 ? '' : 's'}.`);
      if (!imported.length) setImportModal(false);
    } catch (error) {
      setImportErrors([error.message]);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setSubjectFilter('');
    setTopicFilter('');
    setDifficultyFilter('');
    resetPage();
  };
  const filtersActive = search || subjectFilter || topicFilter || difficultyFilter;

  const updateOption = (index, value) => setForm((current) => ({
    ...current,
    options: current.options.map((option, i) => (i === index ? value : option)),
  }));

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        eyebrow="Examination Office"
        title="Question Bank"
        description={scopedSubject ? `${scopedSubject.code} · ${scopedSubject.title}` : undefined}
        actions={(
          <>
            <Button variant="secondary" icon={Upload} onClick={openImport}>Import CSV / Excel</Button>
            <Button icon={Plus} onClick={openCreate}>Add question</Button>
          </>
        )}
      />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200 max-lg:[&>*:last-child]:col-span-2 lg:grid-cols-5" aria-label="Question bank summary">
        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total questions</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{questions.length}</p>
        </div>
        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Subjects</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{subjects.length}</p>
        </div>
        {difficultyCounts.map(({ difficulty, count }) => (
          <div key={difficulty} className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{difficulty}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{count}</p>
            <div className="mt-2 h-1 bg-slate-100" aria-hidden="true">
              <div className={`h-1 ${difficulty === 'Easy' ? 'bg-emerald-600' : difficulty === 'Medium' ? 'bg-amber-500' : 'bg-rose-600'}`} style={{ width: `${questions.length ? (count / questions.length) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </section>

      <Card bodyClassName="p-0">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
          <InputField
            aria-label="Search questions"
            placeholder="Search statement, option, subject or topic"
            prefixIcon={Search}
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          />
          <select aria-label="Filter by subject" className={selectCls} value={subjectFilter} onChange={(e) => { setSubjectFilter(e.target.value); setTopicFilter(''); resetPage(); }}>
            <option value="">All subjects</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Filter by topic" className={selectCls} value={topicFilter} onChange={(e) => { setTopicFilter(e.target.value); resetPage(); }}>
            <option value="">All topics</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select aria-label="Filter by difficulty" className={selectCls} value={difficultyFilter} onChange={(e) => { setDifficultyFilter(e.target.value); resetPage(); }}>
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <Button variant="ghost" icon={Filter} onClick={resetFilters} disabled={!filtersActive}>Clear</Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-slate-600">
          <span><strong className="text-slate-900 tabular-nums">{filteredQuestions.length}</strong> of {questions.length} questions</span>
          <span className="tabular-nums">Selected for examination: <strong className="text-[#1E3A5F]">{selectedIds.length}/25</strong></span>
        </div>

        {filteredQuestions.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={questions.length ? 'No questions match these filters' : 'The question bank is empty'}
            
            action={questions.length ? <Button variant="secondary" size="sm" onClick={resetFilters}>Clear filters</Button> : <Button size="sm" icon={Plus} onClick={openCreate}>Add question</Button>}
          />
        ) : (
          <>
            <Table className="rounded-none border-x-0 border-b-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"><span className="sr-only">Select</span></TableHead>
                  <TableHead className="hidden w-14 sm:table-cell">ID</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead className="hidden md:table-cell">Subject / topic</TableHead>
                  <TableHead className="hidden sm:table-cell">Difficulty</TableHead>
                  <TableHead align="center" className="hidden sm:table-cell">Marks</TableHead>
                  <TableHead align="right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((question) => {
                  const selected = selectedIds.includes(question.id);
                  return (
                    <TableRow key={question.id} isSelected={selected}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select question ${question.id} for the examination`}
                          checked={selected}
                          onChange={() => toggleSelected(question.id)}
                          className="h-4 w-4 rounded-sm border-slate-300 accent-[#1E3A5F]"
                        />
                      </TableCell>
                      <TableCell className="hidden font-mono text-slate-500 sm:table-cell">{question.id}</TableCell>
                      <TableCell className="max-w-xl">
                        <p className="text-[13px] font-medium leading-snug text-slate-900">{question.statement}</p>
                        <p className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 sm:hidden"><span className="font-mono">ID {question.id}</span><StatusBadge status={question.difficulty} dot={false} size="sm" /><span>{question.marks} marks</span></p>
                        <ol className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[11px] text-slate-500 sm:grid-cols-2">
                          {question.options.map((option, index) => (
                            <li key={index} className="truncate">
                              <span className="font-semibold">{LETTERS[index]}.</span> {option}
                            </li>
                          ))}
                        </ol>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-slate-800">{question.subject}</p>
                        <p className="text-[11px] text-slate-500">{question.topic}</p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell"><StatusBadge status={question.difficulty} dot={false} /></TableCell>
                      <TableCell align="center" className="hidden tabular-nums sm:table-cell">
                        {question.marks}{Number(question.negativeMarks) > 0 && <span className="text-rose-700"> / −{question.negativeMarks}</span>}
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex justify-end gap-1">
                          <button type="button" aria-label={`Edit question ${question.id}`} onClick={() => openEdit(question)} className="rounded-sm p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1E3A5F]"><Edit3 className="h-4 w-4" /></button>
                          <button type="button" aria-label={`Delete question ${question.id}`} onClick={() => setDeleteTarget(question)} className="rounded-sm p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
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

      {selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-300 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] lg:left-64">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-32 bg-slate-100" aria-hidden="true">
                <div className="h-1.5 bg-[#1E3A5F]" style={{ width: `${(selectedIds.length / 25) * 100}%` }} />
              </div>
              <p className="text-xs text-slate-700" aria-live="polite">
                <strong className="tabular-nums text-slate-900">{selectedIds.length}</strong> of 25 questions selected
                {selectedIds.length < 25 && <span className="text-slate-500"> · {25 - selectedIds.length} more needed</span>}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" icon={X} onClick={() => setSelectedIds([])}>Clear selection</Button>
              <Button size="sm" icon={FileSpreadsheet} disabled={selectedIds.length !== 25} onClick={() => setConfirmSend(true)}>Use as examination set</Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={questionModal}
        onClose={() => setQuestionModal(false)}
        title={editingQuestion ? `Edit question ${editingQuestion.id}` : 'Add question'}
        maxWidth="max-w-3xl"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setQuestionModal(false)}>Cancel</Button>
            <Button type="submit" form="question-form" icon={Check}>{editingQuestion ? 'Save changes' : 'Add question'}</Button>
          </>
        )}
      >
        <form id="question-form" onSubmit={submitQuestion} className="space-y-5" noValidate>
          {formErrors.length > 0 && (
            <Alert tone="danger" title="Please fix the following">
              <ul className="list-disc pl-4">{formErrors.map((error) => <li key={error}>{error}</li>)}</ul>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField label="Subject" required list="qb-subjects" value={form.subject} readOnly={Boolean(scopedSubject)} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Software Engineering" />
            <InputField label="Topic / unit" required list="qb-topics" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Unit 2 – Design Patterns" />
            <datalist id="qb-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
            <datalist id="qb-topics">{[...new Set(questions.map((q) => q.topic))].map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <div>
            <label htmlFor="q-statement" className="mb-1 block text-xs font-medium text-slate-800">Question statement <span className="text-red-600">*</span></label>
            <textarea id="q-statement" rows={3} value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} className="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]" placeholder="Type the question exactly as candidates should see it" />
          </div>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-slate-800">Options <span className="text-red-600">*</span> <span className="font-normal text-slate-500">— select the correct answer</span></legend>
            <div className="space-y-2">
              {form.options.map((option, index) => {
                const correct = form.correctOption === index;
                return (
                  <div key={index} className={`flex items-center gap-2 rounded-sm border p-1.5 ${correct ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 pl-1.5 pr-1">
                      <input type="radio" name="correct-option" checked={correct} onChange={() => setForm({ ...form, correctOption: index })} className="h-4 w-4 accent-emerald-700" aria-label={`Mark option ${LETTERS[index]} as correct`} />
                      <span className="w-4 text-xs font-bold text-slate-600">{LETTERS[index]}</span>
                    </label>
                    <input
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      aria-label={`Option ${LETTERS[index]}`}
                      placeholder={`Option ${LETTERS[index]}`}
                      className="h-9 min-w-0 flex-1 rounded-sm border border-slate-300 bg-white px-3 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
                    />
                    {correct && <span className="hidden pr-2 text-[11px] font-semibold text-emerald-800 sm:inline">Correct</span>}
                  </div>
                );
              })}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-slate-800">Difficulty</legend>
              <div className="grid grid-cols-3 overflow-hidden rounded-sm border border-slate-300">
                {DIFFICULTIES.map((d) => (
                  <label key={d} className={`cursor-pointer py-2 text-center text-xs font-semibold ${form.difficulty === d ? 'bg-[#1E3A5F] text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                    <input type="radio" name="difficulty" value={d} checked={form.difficulty === d} onChange={() => setForm({ ...form, difficulty: d })} className="sr-only" />
                    {d}
                  </label>
                ))}
              </div>
            </fieldset>
            <InputField label="Marks" type="number" min="0.5" step="0.5" required value={form.marks} onChange={(e) => setForm({ ...form, marks: e.target.value })} />
            <InputField label="Negative marks" type="number" min="0" step="0.25" value={form.negativeMarks} onChange={(e) => setForm({ ...form, negativeMarks: e.target.value })} />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        tone="danger"
        title="Delete question?"
        confirmLabel="Delete question"
        description="The question is removed permanently. Generated examinations keep their copy."
      >
        {deleteTarget && <p className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">{deleteTarget.statement}</p>}
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={sendQuestionsToGenerator}
        tone="warning"
        title="Replace the examination question set?"
        confirmLabel="Replace and regenerate"
        description="These 25 questions become the master set and patterns A–J are regenerated. Attempts in progress keep their paper."
      />

      <Modal
        isOpen={importModal}
        onClose={() => setImportModal(false)}
        title="Import questions"
        maxWidth="max-w-5xl"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setImportModal(false)}>Close</Button>
            {importRows.length > 0 && <Button variant="secondary" onClick={() => { setImportRows([]); setImportErrors([]); setImportFileName(''); }}>Choose another file</Button>}
            <Button icon={Check} disabled={!readyImportRows.length} onClick={confirmImport}>Import {readyImportRows.length} valid question{readyImportRows.length === 1 ? '' : 's'}</Button>
          </>
        )}
      >

        <div className="flex flex-col items-start gap-3 rounded-sm border border-dashed border-slate-300 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-600">
            <p className="font-semibold text-slate-900">{importFileName || 'No file selected'}</p>
            <p className="mt-0.5">Columns: {QUESTION_IMPORT_HEADERS.join(', ')} · Correct Answer: A–D or 1–4 · .csv, .xlsx, .xls</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" icon={Download} onClick={downloadQuestionTemplate}>Template</Button>
            <Button size="sm" icon={Upload} isLoading={isReading} onClick={() => fileRef.current?.click()}>Choose file</Button>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={handleFile} aria-label="Question import file" />
        </div>

        {importErrors.length > 0 && (
          <Alert tone="danger" title="The file could not be processed" className="mt-4">
            <ul className="list-disc pl-4">{importErrors.map((error) => <li key={error}>{error}</li>)}</ul>
          </Alert>
        )}

        {importRows.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {importSummary.filter(([, n]) => n).map(([status, n]) => <StatusBadge key={status} status={status}>{n} {status.toLowerCase()}</StatusBadge>)}
            </div>
            <div className="max-h-80 overflow-auto rounded-sm border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Question</th>
                    <th className="px-3 py-2">Answer</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importRows.map((row) => (
                    <tr key={row.rowNumber} className={row.status === 'Invalid' ? 'bg-rose-50/40' : ''}>
                      <td className="px-3 py-2 font-mono text-slate-500">{row.rowNumber}</td>
                      <td className="max-w-md px-3 py-2 text-slate-800">{row.question.statement || <em className="text-slate-400">empty</em>}</td>
                      <td className="px-3 py-2 font-mono">{Number.isInteger(row.question.correctOption) ? LETTERS[row.question.correctOption] : '—'}</td>
                      <td className="px-3 py-2"><StatusBadge status={row.status} size="sm" /></td>
                      <td className="px-3 py-2 text-[11px] text-rose-700">{row.errors.join(' ') || (row.duplicate ? 'Already in the bank or repeated in file.' : '')}</td>
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
