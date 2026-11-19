import React from 'react';
import {
  FileSpreadsheet,
  Users,
  CheckCircle2,
  Clock,
  Plus,
  ArrowRight,
  Calendar,
  AlertCircle
} from 'lucide-react';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { Link } from 'react-router-dom';

export default function AdminDashboard() {
  const stats = [
    { title: 'Scheduled Exams', value: '14', change: '+3 this week', icon: FileSpreadsheet, iconColor: 'text-blue-600 bg-blue-50' },
    { title: 'Enrolled Candidates', value: '3,840', change: '+120 today', icon: Users, iconColor: 'text-emerald-600 bg-emerald-50' },
    { title: 'Active Live Tests', value: '2', change: 'Running now', icon: Clock, iconColor: 'text-amber-600 bg-amber-50' },
    { title: 'Evaluated Submissions', value: '12,940', change: '99.4% auto-scored', icon: CheckCircle2, iconColor: 'text-purple-600 bg-purple-50' },
  ];

  const upcomingExams = [
    { id: 1, title: 'Data Structures & Algorithms Final CBT', date: 'Tomorrow, 10:00 AM', candidates: 340, duration: '90 mins', status: 'Ready' },
    { id: 2, title: 'Engineering Mathematics III Midterm', date: '22 Nov, 02:00 PM', candidates: 412, duration: '120 mins', status: 'Drafting' },
    { id: 3, title: 'Database Management Systems Lab Quiz', date: '24 Nov, 11:30 AM', candidates: 180, duration: '45 mins', status: 'Ready' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Institution Admin Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage test schedules, question repositories, and candidate seat allocations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/admin/exams">
            <Button variant="secondary" size="md">
              View All Exams
            </Button>
          </Link>
          <Link to="/admin/exams">
            <Button variant="primary" size="md" icon={Plus}>
              Create New CBT Exam
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, idx) => (
          <StatCard key={idx} {...s} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Exams Table */}
        <div className="lg:col-span-2">
          <Card
            title="Scheduled Examinations"
            subtitle="Upcoming and active test sessions for your institution"
            action={
              <Link to="/admin/exams">
                <Button variant="ghost" size="sm" icon={ArrowRight}>
                  Manage
                </Button>
              </Link>
            }
          >
            <div className="space-y-3">
              {upcomingExams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 hover:bg-white hover:shadow-xs transition gap-3"
                >
                  <div className="space-y-1">
                    <h4 className="font-semibold text-slate-800 text-sm">{exam.title}</h4>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> {exam.date}
                      </span>
                      <span>•</span>
                      <span>{exam.duration}</span>
                      <span>•</span>
                      <span>{exam.candidates} candidates</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Badge variant={exam.status === 'Ready' ? 'success' : 'warning'}>
                      {exam.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Quick Actions & Live Test Alert */}
        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-0">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/10 rounded-lg shrink-0">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Live CBT Session Active</h4>
                <p className="text-xs text-blue-100 mt-1">
                  CS301 Algorithm Assessment is currently ongoing with 218 active examinees online.
                </p>
                <button className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-white text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">
                  Open Proctor Monitor &rarr;
                </button>
              </div>
            </div>
          </Card>

          <Card title="Quick Management Links">
            <div className="grid grid-cols-1 gap-2 text-xs">
              <Link
                to="/admin/questions"
                className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 flex items-center justify-between transition font-medium text-slate-700"
              >
                <span>Import Question Bank (.CSV / JSON)</span>
                <span>&rarr;</span>
              </Link>
              <Link
                to="/admin/students"
                className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 flex items-center justify-between transition font-medium text-slate-700"
              >
                <span>Bulk Allocate Student Hall Tickets</span>
                <span>&rarr;</span>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
