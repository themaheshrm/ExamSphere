import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Bell,
  User,
  HelpCircle,
  Award,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  studentInfo,
  dashboardSummary,
  activeExam,
  upcomingExams,
  recentResults,
  notifications,
} from '../../data/studentMockData';
import Modal from '../../components/common/Modal';
import { examRandomizerService } from '../../services/examRandomizerService';
import { assignPatternToStudent } from '../../utils/randomizationEngine';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Active view tab synced with sidebar (defaults to 'dashboard')
  const activeTab = searchParams.get('tab') || 'dashboard';

  // Details Modal State
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedExamDetails, setSelectedExamDetails] = useState(activeExam);

  // Live Exam & Randomization State
  const examState = examRandomizerService.getExamState();
  const isCbtPublished = examState.isPublished;

  // Student details: prioritizes authenticated session, falls back to Dr. AIT mock
  const currentStudent = {
    name: user?.name || studentInfo.name,
    usn: user ? (user.usn || user.identifier || 'Unavailable') : studentInfo.usn,
    department: studentInfo.department,
    semester: studentInfo.semester,
    institution: studentInfo.institution,
    email: user?.email || studentInfo.email,
  };

  // Deterministically assigned question pattern (Pattern A - J)
  const studentIdentity = user
    ? (user.usn || user.identifier || user.id || null)
    : studentInfo.usn;
  const assignedPattern = assignPatternToStudent(studentIdentity);

  const openExamDetails = (exam) => {
    setSelectedExamDetails(exam || activeExam);
    setIsDetailsModalOpen(true);
  };

  return (
    <div className="space-y-6 text-slate-800 font-sans max-w-7xl mx-auto">
      {/* ── 1. Compact Welcome Section ─────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Welcome, {currentStudent.name}
            </h1>
            <p className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span>
                USN: <strong className="font-mono text-slate-900">{currentStudent.usn}</strong>
              </span>
              <span className="text-slate-300">&bull;</span>
              <span>{currentStudent.department}</span>
              <span className="text-slate-300">&bull;</span>
              <span className="font-medium text-slate-800">{currentStudent.semester}</span>
            </p>
          </div>
          <div className="text-xs text-slate-500 sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
            <p className="font-semibold text-slate-800">{currentStudent.institution}</p>
            <p className="text-[11px] text-slate-500">Autonomous Degree Examinations &bull; 2026–27</p>
          </div>
        </div>
      </section>

      {/* ── View Router: Main Dashboard or Sub-Views ────────────────────────── */}

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN DASHBOARD (Simplified 6 Elements)
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* ── 2. One Prominent Next Examination Section ────────────────────── */}
          <section className="bg-white border border-slate-300 rounded-xs overflow-hidden">
            <div className="bg-[#1E3A5F] text-white px-5 py-2.5 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                Next Examination
              </h2>
              <span className="text-xs text-slate-200 font-medium">
                Scheduled Assessment
              </span>
            </div>

            <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-xs">
                    {activeExam.courseCode}
                  </span>
                  {isCbtPublished ? (
                    <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-xs">
                      {assignedPattern ? `Assigned: Pattern ${assignedPattern}` : 'Student ID Required'}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-xs">
                      Under Board Moderation (Draft)
                    </span>
                  )}
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  {activeExam.courseTitle}
                </h3>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Date:</span>
                    <strong className="text-slate-900">{activeExam.examDate}</strong>
                  </div>
                  <span className="text-slate-300">&bull;</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Time:</span>
                    <strong className="text-slate-900">{activeExam.time}</strong>
                  </div>
                  <span className="text-slate-300">&bull;</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Duration:</span>
                    <strong className="text-slate-900">{activeExam.duration}</strong>
                  </div>
                  <span className="text-slate-300">&bull;</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Total Marks:</span>
                    <strong className="text-slate-900">50 Marks (25 MCQs)</strong>
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => openExamDetails(activeExam)}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xs transition-colors cursor-pointer"
                >
                  View Details
                </button>
                {isCbtPublished ? (
                  <button
                    type="button"
                    onClick={() => navigate('/student/exam')}
                    className="bg-[#1E3A5F] hover:bg-[#152A45] active:bg-[#0F1D30] text-white text-xs sm:text-sm font-semibold px-5 py-2.5 rounded-xs transition-colors cursor-pointer"
                  >
                    Start Examination
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="bg-slate-100 text-slate-400 border border-slate-200 text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xs cursor-not-allowed"
                    title="This examination has not yet been published by the examination authority."
                  >
                    Paper In Moderation
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ── 3. Two Small Statistics: Upcoming & Completed Exams ───────────── */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xs p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Upcoming Exams
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-[#1E3A5F]">
                  {dashboardSummary.upcomingExamsCount}
                </span>
                <span className="text-xs text-slate-500">tests scheduled</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xs p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Completed Exams
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-slate-900">
                  {dashboardSummary.completedExamsCount}
                </span>
                <span className="text-xs text-slate-500">tests completed</span>
              </div>
            </div>
          </section>

          {/* ── 4. Recent Results Section ────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xs overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Recent Results
              </h2>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: 'results' })}
                className="text-xs text-[#1E3A5F] font-semibold hover:underline cursor-pointer"
              >
                View All Results &rarr;
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-semibold">
                    <th className="py-2.5 px-5">Subject</th>
                    <th className="py-2.5 px-5">Exam Date</th>
                    <th className="py-2.5 px-5 text-center">Marks</th>
                    <th className="py-2.5 px-5 text-center">Grade</th>
                    <th className="py-2.5 px-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentResults.slice(0, 4).map((res) => (
                    <tr key={res.courseCode} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-5">
                        <span className="font-mono font-bold text-[#1E3A5F] mr-2">
                          {res.courseCode}
                        </span>
                        <span className="text-slate-900 font-medium">
                          {res.courseTitle}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-slate-600 whitespace-nowrap">
                        {res.examDate}
                      </td>
                      <td className="py-3 px-5 text-center font-mono font-semibold text-slate-900">
                        {res.scoredMarks} / {res.maxMarks}
                      </td>
                      <td className="py-3 px-5 text-center font-semibold text-slate-800">
                        {res.grade.split(' ')[0]}
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-xs">
                          Pass
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 5. Simple Quick Navigation ──────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xs p-5">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Quick Navigation
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setSearchParams({ tab: 'exams' })}
                className="p-3.5 border border-slate-200 hover:border-[#1E3A5F] hover:bg-slate-50 rounded-xs text-left transition-colors cursor-pointer group"
              >
                <p className="text-xs font-bold text-slate-900 group-hover:text-[#1E3A5F]">
                  My Examinations
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  View complete timetable
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSearchParams({ tab: 'results' })}
                className="p-3.5 border border-slate-200 hover:border-[#1E3A5F] hover:bg-slate-50 rounded-xs text-left transition-colors cursor-pointer group"
              >
                <p className="text-xs font-bold text-slate-900 group-hover:text-[#1E3A5F]">
                  All Results
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  View full grade sheet
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSearchParams({ tab: 'notifications' })}
                className="p-3.5 border border-slate-200 hover:border-[#1E3A5F] hover:bg-slate-50 rounded-xs text-left transition-colors cursor-pointer group"
              >
                <p className="text-xs font-bold text-slate-900 group-hover:text-[#1E3A5F]">
                  Notifications
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Read official circulars
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSearchParams({ tab: 'profile' })}
                className="p-3.5 border border-slate-200 hover:border-[#1E3A5F] hover:bg-slate-50 rounded-xs text-left transition-colors cursor-pointer group"
              >
                <p className="text-xs font-bold text-slate-900 group-hover:text-[#1E3A5F]">
                  My Profile
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  View student records
                </p>
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECONDARY VIEWS (Linked from Sidebar & Quick Navigation)
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* ── MY EXAMS VIEW ──────────────────────────────────────────────────── */}
      {activeTab === 'exams' && (
        <section className="bg-white border border-slate-200 rounded-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                My Examination Schedule
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upcoming assessments for 6th Semester
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'dashboard' })}
              className="text-xs text-[#1E3A5F] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-2.5 px-4">Course Code</th>
                  <th className="py-2.5 px-4">Subject Title</th>
                  <th className="py-2.5 px-4">Exam Date</th>
                  <th className="py-2.5 px-4">Time</th>
                  <th className="py-2.5 px-4">Duration</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcomingExams
                  .filter((exam) => exam.courseCode !== '22CS601' || isCbtPublished)
                  .map((exam) => (
                  <tr key={exam.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#1E3A5F]">
                      {exam.courseCode}
                    </td>
                    <td className="py-3 px-4 text-slate-900 font-medium">
                      {exam.courseTitle}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {exam.examDate}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {exam.time}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {exam.duration}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openExamDetails(exam)}
                        className="text-[#1E3A5F] hover:underline font-semibold text-xs cursor-pointer"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── RESULTS VIEW ───────────────────────────────────────────────────── */}
      {activeTab === 'results' && (
        <section className="bg-white border border-slate-200 rounded-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Examination Results & Marks
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Official statement of marks for 5th Semester
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'dashboard' })}
              className="text-xs text-[#1E3A5F] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-2.5 px-4">Course Code</th>
                  <th className="py-2.5 px-4">Subject Title</th>
                  <th className="py-2.5 px-4">Exam Date</th>
                  <th className="py-2.5 px-4 text-center">Marks Scored</th>
                  <th className="py-2.5 px-4 text-center">Maximum</th>
                  <th className="py-2.5 px-4 text-center">Grade</th>
                  <th className="py-2.5 px-4 text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentResults.map((res) => (
                  <tr key={res.courseCode} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#1E3A5F]">
                      {res.courseCode}
                    </td>
                    <td className="py-3 px-4 text-slate-900 font-medium">
                      {res.courseTitle}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {res.examDate}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                      {res.scoredMarks}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-500">
                      {res.maxMarks}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-800">
                      {res.grade.split(' ')[0]}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-xs">
                        Pass
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── NOTIFICATIONS VIEW ──────────────────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <section className="bg-white border border-slate-200 rounded-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Notifications & Circulars
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Official notices dispatched to students
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'dashboard' })}
              className="text-xs text-[#1E3A5F] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xs">
            {notifications.map((item) => (
              <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-900">{item.title}</h3>
                  <span className="text-[11px] text-slate-400 font-mono">{item.time}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{item.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── PROFILE VIEW ───────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <section className="bg-white border border-slate-200 rounded-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Student Profile
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Official academic registration details
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'dashboard' })}
              className="text-xs text-[#1E3A5F] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>
          </div>

          <div className="border border-slate-200 rounded-xs p-5 bg-slate-50/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-xs">
              <div>
                <span className="text-slate-500 block">Full Name:</span>
                <span className="font-bold text-slate-900 text-sm">{currentStudent.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">University Seat Number (USN):</span>
                <span className="font-mono font-bold text-[#1E3A5F] text-sm">{currentStudent.usn}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Department / Branch:</span>
                <span className="font-medium text-slate-800">{currentStudent.department}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Semester:</span>
                <span className="font-medium text-slate-800">{currentStudent.semester}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Institution:</span>
                <span className="font-medium text-slate-800">{currentStudent.institution}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Official Email:</span>
                <span className="font-mono text-slate-700">{currentStudent.email}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── HELP VIEW ──────────────────────────────────────────────────────── */}
      {activeTab === 'support' && (
        <section className="bg-white border border-slate-200 rounded-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Help & Examination Support
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Contact information for examination related inquiries
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'dashboard' })}
              className="text-xs text-[#1E3A5F] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>
          </div>

          <div className="border border-slate-200 rounded-xs p-5 bg-slate-50/50 space-y-3 text-xs">
            <h3 className="font-bold text-slate-900 text-sm">Controller of Examinations (COE) Office</h3>
            <p className="text-slate-600">
              For queries related to examination timetable, hall tickets, or marks sheets:
            </p>
            <div className="space-y-1.5 text-slate-700">
              <p><strong>Office Location:</strong> Central Administrative Block, 2nd Floor, Dr. AIT Campus</p>
              <p><strong>Helpline:</strong> 080-23211505</p>
              <p><strong>Official Email:</strong> coe@drait.edu.in</p>
              <p><strong>Office Hours:</strong> Monday – Friday, 9:30 AM to 5:00 PM</p>
            </div>
          </div>
        </section>
      )}

      {/* ── Examination Details Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title="Examination Details"
        subtitle={`${selectedExamDetails.courseCode} • ${selectedExamDetails.courseTitle}`}
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Course Code:</span>
              <span className="font-mono font-bold text-[#1E3A5F]">
                {selectedExamDetails.courseCode}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Subject:</span>
              <span className="font-semibold text-slate-900">
                {selectedExamDetails.courseTitle}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date:</span>
              <span className="font-medium text-slate-900">{selectedExamDetails.examDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Time Window:</span>
              <span className="font-medium text-slate-900">{selectedExamDetails.time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Duration:</span>
              <span className="font-medium text-slate-900">{selectedExamDetails.duration}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total Marks:</span>
              <span className="font-medium text-slate-900">
                {selectedExamDetails.totalMarks || selectedExamDetails.marks || 50} Marks
              </span>
            </div>
            {isCbtPublished && assignedPattern && (
              <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1">
                <span className="text-slate-500 font-semibold">Your Assigned Paper:</span>
                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-xs border border-emerald-200">
                  Pattern {assignedPattern} (22CS601-{assignedPattern})
                </span>
              </div>
            )}
          </div>

          <div className="border border-slate-200 p-3 rounded-xs space-y-1 bg-white">
            <p className="font-bold text-slate-800">General Instructions:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1 text-[11px]">
              <li>Arrive 15 minutes prior to the exam start time.</li>
              <li>Carry your valid Student ID Card.</li>
              <li>Each candidate is issued an automated randomized pattern. Questions and options are shuffled.</li>
              <li>Mobile phones and electronic gadgets are strictly prohibited.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsDetailsModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xs cursor-pointer transition-colors"
            >
              Close
            </button>
            {(selectedExamDetails.isLive || selectedExamDetails.status === 'Ready to Start') && isCbtPublished && assignedPattern && (
              <button
                type="button"
                onClick={() => navigate('/student/exam')}
                className="bg-[#1E3A5F] hover:bg-[#152A45] text-white text-xs font-semibold px-4 py-2 rounded-xs cursor-pointer transition-colors"
              >
                Start Examination (Pattern {assignedPattern})
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
