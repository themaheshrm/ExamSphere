import React from 'react';
import {
  GraduationCap,
  Calendar,
  Clock,
  Award,
  CheckCircle2,
  AlertCircle,
  FileText,
  ShieldCheck,
  PlayCircle,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';

export default function StudentDashboard() {
  const { user } = useAuth();

  const activeExams = [
    {
      code: 'CS-401',
      title: 'Advanced Computer Networks Midterm CBT',
      time: 'Today • 10:00 AM – 11:30 AM',
      duration: '90 Minutes',
      totalQuestions: 60,
      hall: 'Computing Block B, Terminal 14',
      status: 'Ready',
      statusVariant: 'success',
      canStart: true,
    },
    {
      code: 'CS-302',
      title: 'Operating Systems & Virtual Memory Quiz',
      time: 'Tomorrow • 02:00 PM – 02:45 PM',
      duration: '45 Minutes',
      totalQuestions: 30,
      hall: 'Main CBT Lab, Terminal 08',
      status: 'Scheduled',
      statusVariant: 'info',
      canStart: false,
    },
  ];

  const pastResults = [
    {
      code: 'CS-201',
      title: 'Data Structures & Algorithms Final',
      score: '92 / 100',
      percentile: '98.4%',
      grade: 'A+',
      status: 'Verified',
      statusVariant: 'success',
    },
    {
      code: 'MA-101',
      title: 'Engineering Mathematics Comprehensive',
      score: '84 / 100',
      percentile: '91.2%',
      grade: 'A',
      status: 'Verified',
      statusVariant: 'success',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Student Banner */}
      <div className="bg-white rounded border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-[#EBF2FA] text-[#1E3A5F] border border-[#BFDBFE] flex items-center justify-center font-bold text-base shadow-xs shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  Welcome, {user?.name || 'Alex Chen'}
                </h1>
                <Badge variant="success" size="sm" dot>
                  Enrolled Candidate
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  USN: <strong className="font-mono text-slate-800">{user?.identifier || '1MS22CS042'}</strong>
                </span>
                <span>•</span>
                <span>{user?.institution || 'Dept of Computer Science & Engineering'}</span>
                <span>•</span>
                <span className="text-emerald-700 font-medium">Terminal Authorized</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Academic Term</p>
              <p className="text-xs font-semibold text-slate-800">AY 2026-27 | Semester V</p>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Scheduled Assessments"
          value="2"
          change="1 today"
          icon={Calendar}
          iconColor="text-[#1E3A5F] bg-[#EBF2FA]"
        />
        <StatCard
          title="Completed Exams"
          value="18"
          change="100% attendance"
          icon={CheckCircle2}
          iconColor="text-emerald-700 bg-emerald-50"
        />
        <StatCard
          title="Cumulative Grade"
          value="8.84"
          change="Top 5%"
          icon={Award}
          iconColor="text-amber-700 bg-amber-50"
        />
        <StatCard
          title="Proctor Clearance"
          value="100%"
          change="0 violations"
          icon={ShieldCheck}
          iconColor="text-blue-700 bg-blue-50"
        />
      </div>

      {/* Main Grid: Active Tests & Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active & Scheduled Tests */}
        <div className="lg:col-span-2 space-y-4">
          <Card
            title="Assigned CBT Examinations"
            subtitle="Admit Card verified tests eligible for computer terminal entry"
          >
            <div className="space-y-4">
              {activeExams.map((exam) => (
                <div
                  key={exam.code}
                  className={`p-4 rounded border transition ${
                    exam.canStart
                      ? 'border-[#1E3A5F]/40 bg-[#EBF2FA]/40'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#1E3A5F]">
                          {exam.code}
                        </span>
                        <Badge variant={exam.statusVariant} size="sm" dot>
                          {exam.status}
                        </Badge>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {exam.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {exam.time}
                        </span>
                        <span>•</span>
                        <span>{exam.duration}</span>
                        <span>•</span>
                        <span>{exam.totalQuestions} Questions</span>
                      </div>
                      <p className="text-[11px] text-slate-500 pt-1">
                        Assigned Seat: <strong className="text-slate-700">{exam.hall}</strong>
                      </p>
                    </div>

                    <div className="shrink-0 self-start sm:self-center">
                      {exam.canStart ? (
                        <Button
                          variant="primary"
                          size="md"
                          icon={PlayCircle}
                          onClick={() => alert('Starting Secure CBT Examination Client... Fullscreen proctoring mode enabled.')}
                        >
                          Launch CBT Exam
                        </Button>
                      ) : (
                        <Button variant="secondary" size="sm" disabled>
                          Opens Tomorrow
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Recent Performance & System Readiness */}
        <div className="space-y-6">
          <Card
            title="Candidate System Diagnostics"
            subtitle="Terminal security checks for CBT exam"
          >
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-600">Secure Browser Locking</span>
                <Badge variant="success" size="sm">Supported</Badge>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-600">Local Lab WebSocket Ping</span>
                <span className="font-mono text-slate-700 font-semibold">8 ms (Excellent)</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-600">Biometric Verification</span>
                <span className="text-emerald-700 font-medium">Cleared</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Admit Card Barcode</span>
                <span className="font-mono text-[11px] text-slate-500">AC-2026-9042</span>
              </div>
            </div>
          </Card>

          <Card
            title="Recent Scorecards"
            subtitle="Published academic records"
          >
            <div className="space-y-3">
              {pastResults.map((res) => (
                <div
                  key={res.code}
                  className="p-3 rounded border border-slate-100 bg-slate-50 text-xs flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{res.title}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {res.code} • Score: {res.score} ({res.percentile})
                    </p>
                  </div>
                  <Badge variant="success" size="sm">
                    {res.grade}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
