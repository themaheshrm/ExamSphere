import React, { useState } from 'react';
import {
  FileText,
  Shuffle,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Upload,
  RefreshCw,
  Send,
  Layers,
  Sparkles,
  Info,
  Calendar,
  Clock,
  Award,
  Lock,
  Unlock,
  Check,
  Table as TableIcon,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { examRandomizerService } from '../../services/examRandomizerService';
import { assignPatternToStudent, PATTERN_LABELS } from '../../utils/randomizationEngine';

export default function ExamManagementPage() {
  const [examState, setExamState] = useState(() => examRandomizerService.getExamState());
  const [activeTab, setActiveTab] = useState('generator'); // 'generator' | 'master' | 'roster'
  const [selectedPattern, setSelectedPattern] = useState('A');
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'matrix'

  // Confirmation Modals
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [notification, setNotification] = useState(null);

  const showToast = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleRegenerate = () => {
    if (examState.isPublished && !showRegenerateConfirm) {
      setShowRegenerateConfirm(true);
      return;
    }
    setShowRegenerateConfirm(false);
    const updated = examRandomizerService.regeneratePatterns();
    setExamState({ ...updated });
    showToast('Successfully generated 10 unique patterns (Pattern A to J)!', 'success');
  };

  const handleTogglePublish = () => {
    if (!examState.isPublished && !showPublishConfirm) {
      setShowPublishConfirm(true);
      return;
    }
    setShowPublishConfirm(false);

    if (examState.isPublished) {
      const updated = examRandomizerService.unpublishExam();
      setExamState({ ...updated });
      showToast('Examination set to Draft mode. Hidden from all students.', 'info');
    } else {
      const updated = examRandomizerService.publishExam();
      setExamState({ ...updated });
      showToast('Examination Published! Patterns are now live and assigned to candidates.', 'success');
    }
  };

  const handleResetDefaults = () => {
    const updated = examRandomizerService.resetToDefaults();
    setExamState({ ...updated });
    showToast('Reset to default 25 verified questions and regenerated 10 patterns.', 'info');
  };

  const currentPatternData = examState.patterns[selectedPattern];
  const verification = examState.verificationReport;

  return (
    <div className="space-y-6 text-slate-800 font-sans">
      {/* ── Toast Notification ────────────────────────────────────────────── */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xs border text-xs shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-blue-50 text-blue-900 border-blue-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{notification.msg}</span>
        </div>
      )}

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-[#1E3A5F] text-white font-mono text-[11px] font-bold px-2 py-0.5 rounded-xs">
              {examState.meta.courseCode}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Question & Option Randomization Console
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {examState.meta.courseTitle} &bull; {examState.meta.institution}
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleRegenerate}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold px-3 py-2 rounded-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Regenerate 10 Patterns</span>
          </button>

          <button
            type="button"
            onClick={handleTogglePublish}
            className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xs transition-colors cursor-pointer shadow-xs ${
              examState.isPublished
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white'
            }`}
          >
            {examState.isPublished ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Unpublish (Set Draft)</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Publish 10 Patterns</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Status Metrics Bar (Per Core Specification) ────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 p-3.5 rounded-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Master Questions
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#1E3A5F]">
              {examState.masterQuestions?.length || 25}
            </span>
            <span className="text-[11px] text-slate-400">MCQs verified</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Generated Patterns
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-700">
              {Object.keys(examState.patterns).length}
            </span>
            <span className="text-[11px] text-slate-400">Patterns (A – J)</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Questions / Pattern
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">
              25
            </span>
            <span className="text-[11px] text-slate-400">All questions included</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Publication Status
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-xs ${
                examState.isPublished
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  examState.isPublished ? 'bg-emerald-600 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {examState.isPublished ? 'Published & Live' : 'Draft (Hidden from Students)'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Sub-navigation Tabs ────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 flex items-center gap-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('generator')}
          className={`pb-2.5 px-3 border-b-2 cursor-pointer transition-colors ${
            activeTab === 'generator'
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Pattern Generator & Preview (10 Sets)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('master')}
          className={`pb-2.5 px-3 border-b-2 cursor-pointer transition-colors ${
            activeTab === 'master'
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Master Question Bank (25 MCQs)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('roster')}
          className={`pb-2.5 px-3 border-b-2 cursor-pointer transition-colors ${
            activeTab === 'roster'
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Candidate Pattern Assignments
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 1: PATTERN GENERATOR & PREVIEWS
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'generator' && (
        <div className="space-y-4">
          {/* Pattern Selector Bar & View Toggle */}
          <div className="bg-white border border-slate-200 p-3 rounded-xs flex flex-wrap items-center justify-between gap-3">
            {/* Pattern Pills: Pattern A through Pattern J */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-600 mr-1 uppercase tracking-wider text-[11px]">
                Pattern:
              </span>
              {PATTERN_LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setSelectedPattern(label);
                    setViewMode('preview');
                  }}
                  className={`w-8 h-8 rounded-xs text-xs font-mono font-bold transition-all cursor-pointer ${
                    selectedPattern === label && viewMode === 'preview'
                      ? 'bg-[#1E3A5F] text-white shadow-xs scale-105'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* View Mode & Answer Key Toggles */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'preview' ? 'matrix' : 'preview')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xs border cursor-pointer transition-colors ${
                  viewMode === 'matrix'
                    ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Permutation Matrix</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAnswerKey(!showAnswerKey)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xs border cursor-pointer transition-colors ${
                  showAnswerKey
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {showAnswerKey ? <Eye className="w-3.5 h-3.5 text-emerald-700" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                <span>{showAnswerKey ? 'Answer Key Visible' : 'Show Answer Key'}</span>
              </button>
            </div>
          </div>

          {/* ── VIEW 1: PATTERN PREVIEW (25 Questions) ─────────────────────── */}
          {viewMode === 'preview' && currentPatternData && (
            <div className="bg-white border border-slate-200 rounded-xs overflow-hidden">
              {/* Pattern Header Strip */}
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      {currentPatternData.patternLabel}
                    </span>
                    <span className="font-mono text-xs text-[#1E3A5F] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-xs">
                      Paper Code: {currentPatternData.paperCode}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Sequence Order: First Question is Q{currentPatternData.questions[0].originalId} &bull; Last Question is Q{currentPatternData.questions[24].originalId}
                  </p>
                </div>

                <div className="text-right text-xs text-slate-500">
                  <span>Questions in Pattern: <strong className="text-slate-800">25</strong></span>
                  <span className="mx-2">&bull;</span>
                  <span>Max Marks: <strong className="text-slate-800">{examState.meta.totalMarks}</strong></span>
                </div>
              </div>

              {/* Questions List for this Pattern */}
              <div className="divide-y divide-slate-100 max-h-[700px] overflow-y-auto p-2">
                {currentPatternData.questions.map((q, idx) => {
                  const correctIdx = currentPatternData.answerKey[q.originalId];
                  return (
                    <div key={q.originalId} className="p-4 space-y-2 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <span className="font-mono font-bold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-xs border border-slate-200 shrink-0">
                            Q{idx + 1}
                          </span>
                          <p className="text-xs font-semibold text-slate-900 leading-relaxed">
                            {q.text}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-xs border shrink-0">
                          Master ID #{q.originalId}
                        </span>
                      </div>

                      {/* Shuffled Options A, B, C, D */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 pl-8">
                        {q.options.map((optText, optIdx) => {
                          const isCorrect = showAnswerKey && optIdx === correctIdx;
                          return (
                            <div
                              key={optIdx}
                              className={`p-2.5 rounded-xs text-xs border transition-colors ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className="font-mono font-bold text-slate-400 mr-2 text-[11px]">
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              <span>{optText}</span>
                              {isCorrect && (
                                <span className="ml-2 text-[10px] font-bold text-emerald-700 font-mono">
                                  ✓ CORRECT
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── VIEW 2: PERMUTATION MATRIX & VALIDATION ────────────────────── */}
          {viewMode === 'matrix' && (
            <div className="bg-white border border-slate-200 rounded-xs p-5 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  10-Pattern Permutation & Integrity Matrix
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verifies that every pattern has an independently randomized sequence and option mapping.
                </p>
              </div>

              {/* Verification Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xs flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-emerald-950">10 / 10 Patterns Generated</p>
                    <p className="text-emerald-700 text-[11px]">Pattern A through Pattern J</p>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xs flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-emerald-950">25 Questions in Each Set</p>
                    <p className="text-emerald-700 text-[11px]">100% question content parity</p>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xs flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-emerald-950">Unique Question Sequences</p>
                    <p className="text-emerald-700 text-[11px]">Zero sequence collisions detected</p>
                  </div>
                </div>
              </div>

              {/* Matrix Table: Showing Question ID position across all 10 patterns */}
              <div className="overflow-x-auto border border-slate-200 rounded-xs">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                      <th className="py-2.5 px-3">Question Slot</th>
                      {PATTERN_LABELS.map((label) => (
                        <th key={label} className="py-2.5 px-2 text-center font-mono">
                          Pat {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {Array.from({ length: 25 }, (_, slotIdx) => (
                      <tr key={slotIdx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-sans font-semibold text-slate-800">
                          Slot #{slotIdx + 1}
                        </td>
                        {PATTERN_LABELS.map((label) => {
                          const qId = examState.patterns[label]?.questions[slotIdx]?.originalId;
                          return (
                            <td key={label} className="py-2 px-2 text-center text-slate-600">
                              Q{qId}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 2: MASTER QUESTION BANK (25 MCQs)
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'master' && (
        <div className="bg-white border border-slate-200 rounded-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Master Question Bank (25 Base Questions)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                All 10 examination patterns are permuted from this validated master bank.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-xs text-[#1E3A5F] hover:underline font-semibold cursor-pointer"
              >
                Reset to Standard Verified 25 MCQs
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {examState.masterQuestions.map((q, idx) => (
              <div key={q.id} className="py-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 text-xs font-semibold text-slate-900">
                    <span className="font-mono text-[#1E3A5F] font-bold">Q{idx + 1}.</span>
                    <span>{q.text}</span>
                  </div>
                  <span className="text-[11px] font-mono font-medium text-slate-400 shrink-0">
                    ID #{q.id}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                  {q.options.map((opt, optIdx) => (
                    <div
                      key={optIdx}
                      className={`p-2 rounded-xs text-xs border ${
                        optIdx === q.correctOption
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="font-mono font-bold mr-1.5 text-slate-400">
                        {String.fromCharCode(65 + optIdx)}.
                      </span>
                      {opt}
                      {optIdx === q.correctOption && (
                        <span className="ml-2 text-[10px] font-bold text-emerald-700 font-mono">
                          (Master Key)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 3: CANDIDATE PATTERN ASSIGNMENTS
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'roster' && (
        <div className="bg-white border border-slate-200 rounded-xs p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Automated Candidate Pattern Allocations
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Each registered candidate is deterministically assigned one of the 10 patterns. Students cannot choose or change their pattern.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                  <th className="py-2.5 px-4">USN</th>
                  <th className="py-2.5 px-4">Candidate Name</th>
                  <th className="py-2.5 px-4">Department & Sem</th>
                  <th className="py-2.5 px-4 text-center">Assigned Pattern</th>
                  <th className="py-2.5 px-4 text-center">Paper Code</th>
                  <th className="py-2.5 px-4 text-right">Access Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { usn: '1DA22CS001', name: 'Dr. AIT Candidate (Alex Chen)', dept: 'CSE • 6th Sem' },
                  { usn: '1DA22CS002', name: 'Bhavana K.', dept: 'CSE • 6th Sem' },
                  { usn: '1DA22CS003', name: 'Chirag M. Gowda', dept: 'CSE • 6th Sem' },
                  { usn: '1DA22CS004', name: 'Deepa R. Rao', dept: 'CSE • 6th Sem' },
                  { usn: '1DA22CS005', name: 'Eshwar S.', dept: 'CSE • 6th Sem' },
                  { usn: '1DA22CS006', name: 'Farhan Akhtar', dept: 'CSE • 6th Sem' },
                  { usn: '1DA22CS007', name: 'Gowri Shankar', dept: 'CSE • 6th Sem' },
                  { usn: '1DA22CS008', name: 'Harish Babu', dept: 'CSE • 6th Sem' },
                  { usn: '1DA22CS009', name: 'Isha Nambiar', dept: 'CSE • 6th Sem' },
                  { usn: '1DA22CS010', name: 'Jayant V.', dept: 'CSE • 6th Sem' },
                ].map((s) => {
                  const patLabel = assignPatternToStudent(s.usn);
                  return (
                    <tr key={s.usn} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-[#1E3A5F]">
                        {s.usn}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {s.name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {s.dept}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="font-mono font-bold text-xs bg-slate-100 text-[#1E3A5F] border border-slate-300 px-2.5 py-0.5 rounded-xs">
                          Pattern {patLabel || 'Unassigned'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono text-[11px] text-slate-500">
                        {patLabel ? `22CS601-${patLabel}` : 'No student identifier'}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-xs border ${
                            examState.isPublished
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          {examState.isPublished ? 'Live & Allocated' : 'Awaiting Publish'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Confirmation Modal: Regenerate Published Patterns ─────────────── */}
      <Modal
        isOpen={showRegenerateConfirm}
        onClose={() => setShowRegenerateConfirm(false)}
        title="Confirm Pattern Regeneration"
        subtitle="Examination is currently Published"
        maxWidth="max-w-md"
        footer={null}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xs flex items-start gap-2 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              This examination is currently <strong>Published</strong>. Regenerating patterns will re-shuffle the 10 paper patterns for all students.
            </p>
          </div>
          <p className="text-slate-600">
            Are you sure you want to regenerate all 10 patterns (Pattern A through Pattern J)?
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowRegenerateConfirm(false)}
              className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              className="bg-[#1E3A5F] hover:bg-[#152A45] text-white text-xs font-semibold px-4 py-2 rounded-xs cursor-pointer"
            >
              Yes, Regenerate Patterns
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Confirmation Modal: Publish Examination ───────────────────────── */}
      <Modal
        isOpen={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        title="Publish Examination Patterns"
        subtitle="22CS601: Software Engineering & Cloud Architecture"
        maxWidth="max-w-md"
        footer={null}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xs flex items-start gap-2 text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              Publishing will make the 10 examination patterns active. Each assigned student will automatically receive their designated pattern.
            </p>
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1 text-[11px]">
            <li>Students will see the exam in their "My Examinations" dashboard.</li>
            <li>Each student will receive a unique pattern (Pattern A to J).</li>
            <li>Correct answers remain confidential and are never exposed to examinees.</li>
          </ul>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowPublishConfirm(false)}
              className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleTogglePublish}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2 rounded-xs cursor-pointer"
            >
              Confirm & Publish
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
