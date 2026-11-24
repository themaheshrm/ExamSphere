import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  FileSpreadsheet,
  Filter,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import Modal from '../../components/common/Modal';
import SelectDropdown from '../../components/common/SelectDropdown';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '../../components/common/Table';
import { questionBankService, DIFFICULTIES, validateQuestion } from '../../services/questionBankService.js';
import { examRandomizerService } from '../../services/examRandomizerService.js';
import { downloadQuestionTemplate, readQuestionImportFile } from '../../utils/questionImport.js';

const EMPTY_FORM = {
  subject: '', topic: '', statement: '', options: ['', '', '', ''],
  correctOption: null, difficulty: 'Medium', marks: 2, negativeMarks: 0,
};

const difficultyTone = {
  Easy: 'success',
  Medium: 'warning',
  Hard: 'danger',
};

export default function QuestionBankPage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [questions, setQuestions] = useState(() => questionBankService.getQuestions());
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
  const [notice, setNotice] = useState(null);

  const showNotice = (message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4000);
  };

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

  const subjectCounts = useMemo(() => {
    const counts = new Map();
    questions.forEach((item) => counts.set(item.subject, (counts.get(item.subject) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [questions]);
  const difficultyCounts = useMemo(() => DIFFICULTIES.map((difficulty) => ({
    difficulty,
    count: questions.filter((item) => item.difficulty === difficulty).length,
  })), [questions]);
  const recentQuestions = useMemo(() => [...questions]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5), [questions]);
  const readyImportRows = importRows.filter((row) => row.status === 'Ready');

  const refreshQuestions = () => setQuestions(questionBankService.getQuestions());

  const openCreate = () => {
    setEditingQuestion(null);
    setForm(EMPTY_FORM);
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
      questionBankService.saveQuestion(form, editingQuestion?.id ?? null);
      refreshQuestions();
      setQuestionModal(false);
      showNotice(editingQuestion ? 'Question updated.' : 'Question added to the bank.');
    } catch (error) {
      setFormErrors([error.message]);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    questionBankService.deleteQuestion(deleteTarget.id);
    setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id));
    refreshQuestions();
    setDeleteTarget(null);
    showNotice('Question deleted.');
  };

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id);
      if (current.length >= 25) {
        showNotice('Select no more than 25 questions for an examination.', 'error');
        return current;
      }
      return [...current, id];
    });
  };

  const sendQuestionsToGenerator = () => {
    if (selectedIds.length !== 25) return;
    const selectedQuestions = selectedIds.map((id) => questions.find((item) => item.id === id));
    try {
      examRandomizerService.setMasterQuestions(selectedQuestions.map((question) => ({
        id: Number(question.id),
        text: question.statement,
        options: [...question.options],
        correctOption: Number(question.correctOption),
        subject: question.subject,
        topic: question.topic,
        difficulty: question.difficulty,
        marks: Number(question.marks),
        negativeMarks: Number(question.negativeMarks),
      })));
      showNotice('The selected 25 questions were sent to the exam generator. Active attempts keep their saved paper.');
      navigate('/admin/exams');
    } catch (error) {
      showNotice(error.message || 'Could not update the exam generator.', 'error');
    }
  };

  const openImport = () => {
    setImportRows([]);
    setImportErrors([]);
    setImportModal(true);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportRows([]);
    try {
      const preview = await readQuestionImportFile(file, questions);
      setImportRows(preview.rows);
      setImportErrors(preview.errors);
      if (!preview.rows.length && !preview.errors.length) {
        setImportErrors(['No question rows were found in the selected file.']);
      }
    } catch (error) {
      setImportErrors([error.message || 'Could not read this file.']);
    }
  };

  const confirmImport = () => {
    try {
      const imported = questionBankService.importQuestions(readyImportRows.map((row) => row.question));
      refreshQuestions();
      setImportRows((current) => current.map((row) => row.status === 'Ready'
        ? { ...row, status: 'Imported' }
        : row));
      showNotice(`Imported ${imported.length} question${imported.length === 1 ? '' : 's'}.`);
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
  };

  return (
    <div className="space-y-6 text-slate-800 font-sans">
      {notice && (
        <div className={`fixed top-4 right-4 z-[60] flex max-w-lg items-start gap-2 rounded border px-4 py-3 text-xs shadow-lg ${
          notice.type === 'error' ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'
        }`} role="status">
          {notice.type === 'error' ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span>{notice.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Admin Question Bank</h1>
          <p className="mt-1 text-xs text-slate-500">Manage validated MCQs, import question sets, and select a 25-question exam master.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={Download} onClick={downloadQuestionTemplate}>Download template</Button>
          <Button variant="secondary" icon={Upload} onClick={openImport}>Import questions</Button>
          <Button variant="primary" icon={Plus} onClick={openCreate}>Add question</Button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Question bank summary">
        <Card bodyClassName="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total questions</p>
          <p className="mt-2 font-mono text-3xl font-bold text-[#1E3A5F]">{questions.length}</p>
          <p className="mt-1 text-xs text-slate-500">Validated MCQs in this browser</p>
        </Card>
        <Card bodyClassName="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">By subject</p>
          <div className="mt-2 max-h-24 space-y-1.5 overflow-y-auto">
            {subjectCounts.map(([subject, count]) => (
              <div key={subject} className="flex justify-between gap-2 text-xs">
                <span className="truncate text-slate-700">{subject}</span><span className="font-mono font-semibold text-[#1E3A5F]">{count}</span>
              </div>
            ))}
            {!subjectCounts.length && <p className="text-xs text-slate-400">No questions yet.</p>}
          </div>
        </Card>
        <Card bodyClassName="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">By difficulty</p>
          <div className="mt-2 space-y-1.5">
            {difficultyCounts.map(({ difficulty, count }) => (
              <div key={difficulty} className="flex items-center justify-between text-xs">
                <span className="text-slate-700">{difficulty}</span><span className="font-mono font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card bodyClassName="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recently added</p>
            <ClipboardList className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 space-y-1.5">
            {recentQuestions.map((question) => (
              <p key={question.id} className="truncate text-xs text-slate-700" title={question.statement}>{question.statement}</p>
            ))}
            {!recentQuestions.length && <p className="text-xs text-slate-400">No questions yet.</p>}
          </div>
        </Card>
      </section>

      <Card className="overflow-hidden" bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Question management</h2>
            <p className="mt-1 text-xs text-slate-500">Search, filter, edit, or select exactly 25 questions for the exam generator.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(150px,1fr))_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input aria-label="Search questions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search question bank" className="h-9 w-full rounded border border-slate-300 bg-white pl-9 pr-3 text-xs outline-none focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F]" />
            </div>
            <SelectDropdown aria-label="Filter by subject" value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value); setTopicFilter(''); }} options={subjects} placeholder="All subjects" selectClassName="h-9" />
            <SelectDropdown aria-label="Filter by topic" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} options={topics} placeholder="All topics" selectClassName="h-9" />
            <SelectDropdown aria-label="Filter by difficulty" value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)} options={DIFFICULTIES} placeholder="All difficulties" selectClassName="h-9" />
            <Button variant="ghost" icon={Filter} onClick={resetFilters}>Reset</Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <BookOpen className="h-4 w-4 text-[#1E3A5F]" />
            <span><strong className="font-mono text-[#1E3A5F]">{selectedIds.length}/25</strong> selected</span>
            <span className="text-slate-400">•</span><span>{filteredQuestions.length} results</span>
          </div>
          <Button variant="primary" icon={FileSpreadsheet} disabled={selectedIds.length !== 25} onClick={sendQuestionsToGenerator}>
            Send 25 to exam generator
          </Button>
        </div>

        <Table>
          <TableHeader>
            <tr>
              <TableHead className="w-10">Select</TableHead>
              <TableHead>Question</TableHead>
              <TableHead>Subject / Topic</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead align="center">Marks</TableHead>
              <TableHead align="right">Actions</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {filteredQuestions.length === 0 ? <TableEmpty colSpan={6} message="No questions match these filters." /> : filteredQuestions.map((question) => (
              <TableRow key={question.id}>
                <TableCell>
                  <input type="checkbox" aria-label={`Select question ${question.id}`} checked={selectedIds.includes(question.id)} onChange={() => toggleSelected(question.id)} className="h-4 w-4 rounded border-slate-300 text-[#1E3A5F] focus:ring-[#1E3A5F]" />
                </TableCell>
                <TableCell className="min-w-[280px] max-w-xl">
                  <p className="line-clamp-2 font-medium text-slate-900" title={question.statement}>{question.statement}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('  ·  ')}</p>
                </TableCell>
                <TableCell className="min-w-[160px]">
                  <p className="font-medium text-slate-800">{question.subject}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{question.topic}</p>
                </TableCell>
                <TableCell><Badge variant={difficultyTone[question.difficulty] || 'neutral'}>{question.difficulty}</Badge></TableCell>
                <TableCell align="center"><span className="font-mono">{question.marks}</span><span className="text-slate-400"> / -{question.negativeMarks}</span></TableCell>
                <TableCell align="right">
                  <div className="flex justify-end gap-1">
                    <button type="button" aria-label={`Edit question ${question.id}`} onClick={() => openEdit(question)} className="rounded p-2 text-slate-500 hover:bg-blue-50 hover:text-[#1E3A5F]"><Edit3 className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Delete question ${question.id}`} onClick={() => setDeleteTarget(question)} className="rounded p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Modal isOpen={questionModal} onClose={() => setQuestionModal(false)} title={editingQuestion ? 'Edit question' : 'Add a question'} subtitle="All four options and exactly one correct answer are required." maxWidth="max-w-3xl" footer={null}>
        <form onSubmit={submitQuestion} className="space-y-4">
          {formErrors.length > 0 && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><ul className="list-inside list-disc space-y-1">{formErrors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InputField label="Subject" required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="e.g. Software Engineering" />
            <InputField label="Topic" required value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })} placeholder="e.g. Design Patterns" />
          </div>
          <label className="block text-xs font-semibold text-slate-700">Question statement <span className="text-rose-600">*</span>
            <textarea required rows={3} value={form.statement} onChange={(event) => setForm({ ...form, statement: event.target.value })} className="mt-1.5 w-full rounded border border-slate-300 p-3 text-xs font-normal text-slate-900 outline-none focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F]" placeholder="Enter the full question statement" />
          </label>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-slate-700">Answer options <span className="text-rose-600">*</span> — choose the correct answer</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {form.options.map((option, index) => (
                <div key={index} className={`flex items-center gap-2 rounded border p-2 ${form.correctOption === index ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200'}`}>
                  <input type="radio" name="correctOption" aria-label={`Mark option ${String.fromCharCode(65 + index)} correct`} checked={form.correctOption === index} onChange={() => setForm({ ...form, correctOption: index })} className="h-4 w-4 accent-emerald-700" />
                  <span className="w-5 shrink-0 font-mono font-bold text-slate-500">{String.fromCharCode(65 + index)}</span>
                  <input required value={option} onChange={(event) => setForm({ ...form, options: form.options.map((value, optionIndex) => optionIndex === index ? event.target.value : value) })} aria-label={`Option ${String.fromCharCode(65 + index)}`} className="h-8 min-w-0 flex-1 border-0 bg-transparent text-xs outline-none placeholder:text-slate-400" placeholder={`Option ${String.fromCharCode(65 + index)}`} />
                  {form.correctOption === index && <Check className="h-4 w-4 shrink-0 text-emerald-700" />}
                </div>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectDropdown label="Difficulty" required value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value })} options={DIFFICULTIES} placeholder="Select difficulty" />
            <InputField label="Marks per question" type="number" min="0.01" step="0.01" required value={form.marks} onChange={(event) => setForm({ ...form, marks: event.target.value })} />
            <InputField label="Negative marks" type="number" min="0" step="0.01" required value={form.negativeMarks} onChange={(event) => setForm({ ...form, negativeMarks: event.target.value })} />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="secondary" onClick={() => setQuestionModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit" icon={Check}>{editingQuestion ? 'Save changes' : 'Add question'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete question?" subtitle="This action removes the question from this browser’s question bank." footer={null}>
        <p className="text-xs leading-relaxed text-slate-600">{deleteTarget?.statement}</p>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" icon={Trash2} onClick={confirmDelete}>Delete question</Button>
        </div>
      </Modal>

      <Modal isOpen={importModal} onClose={() => setImportModal(false)} title="Import questions" subtitle="Upload CSV or Excel, inspect row validation, then confirm the valid rows." maxWidth="max-w-5xl" footer={null}>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-800">Use the import template</p>
              <p className="mt-1 text-[11px] text-slate-500">Correct Answer accepts A–D or 1–4. Difficulty must be Easy, Medium, or Hard.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" icon={Download} onClick={downloadQuestionTemplate}>Download CSV template</Button>
              <Button variant="primary" icon={Upload} onClick={() => fileRef.current?.click()}>Choose file</Button>
              <input ref={fileRef} className="hidden" type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} />
            </div>
          </div>
          {importErrors.length > 0 && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{importErrors.map((error) => <p key={error}>{error}</p>)}</div>}
          {importRows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="success">{readyImportRows.length} ready</Badge>
                <Badge variant="warning">{importRows.filter((row) => row.status === 'Duplicate').length} duplicates</Badge>
                <Badge variant="danger">{importRows.filter((row) => row.status === 'Invalid').length} with errors</Badge>
                <Badge variant="neutral">{importRows.filter((row) => row.status === 'Imported').length} imported</Badge>
              </div>
              <Table>
                <TableHeader><tr><TableHead>Row</TableHead><TableHead>Question</TableHead><TableHead>Subject / Topic</TableHead><TableHead>Options / key</TableHead><TableHead>Level / marks</TableHead><TableHead>Status / validation</TableHead></tr></TableHeader>
                <TableBody>
                  {importRows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell className="min-w-[220px] max-w-sm"><p className="line-clamp-2">{row.question.statement || '—'}</p></TableCell>
                      <TableCell>{row.question.subject || '—'}<p className="mt-1 text-[11px] text-slate-500">{row.question.topic || '—'}</p></TableCell>
                      <TableCell className="min-w-[190px]">
                        {row.question.options.map((option, index) => <p key={index} className={row.question.correctOption === index ? 'font-semibold text-emerald-800' : 'text-slate-500'}>{String.fromCharCode(65 + index)}. {option || '—'}{row.question.correctOption === index ? ' ✓' : ''}</p>)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.question.difficulty || '—'}<p className="mt-1 text-[11px] text-slate-500">{row.question.marks || '—'} marks · −{row.question.negativeMarks ?? 0}</p></TableCell>
                      <TableCell className="min-w-[220px]">
                        <Badge variant={row.status === 'Ready' || row.status === 'Imported' ? 'success' : row.status === 'Duplicate' ? 'warning' : 'danger'}>{row.status}</Badge>
                        {row.duplicate && <p className="mt-1 text-[11px] text-amber-800">Duplicate of an existing or earlier file question.</p>}
                        {row.errors.map((error) => <p key={error} className="mt-1 text-[11px] text-rose-700">{error}</p>)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button variant="secondary" onClick={() => { setImportRows([]); setImportErrors([]); }}>Clear preview</Button>
                <Button variant="primary" icon={Check} disabled={!readyImportRows.length} onClick={confirmImport}>Import {readyImportRows.length} valid questions</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
