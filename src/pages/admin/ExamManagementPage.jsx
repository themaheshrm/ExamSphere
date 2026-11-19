import React from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Plus, Clock, Users, FileText, CheckCircle } from 'lucide-react';

export default function ExamManagementPage() {
  const exams = [
    {
      code: 'CBT-2026-01',
      title: 'Advanced Computer Networks Midterm',
      questions: 60,
      duration: '90 Minutes',
      enrolled: 240,
      status: 'Scheduled',
      negativeMarking: 'Yes (-0.25)',
    },
    {
      code: 'CBT-2026-02',
      title: 'Operating Systems Virtual Memory Quiz',
      questions: 30,
      duration: '45 Minutes',
      enrolled: 190,
      status: 'Draft',
      negativeMarking: 'No',
    },
    {
      code: 'CBT-2026-03',
      title: 'Software Engineering Principles Assessment',
      questions: 75,
      duration: '120 Minutes',
      enrolled: 310,
      status: 'Completed',
      negativeMarking: 'Yes (-0.5)',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Exam Management</h1>
          <p className="text-sm text-slate-500">Configure CBT time limits, negative marking, randomized pools, and access codes.</p>
        </div>
        <Button variant="primary" icon={Plus}>Create New Assessment</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {exams.map((exam, idx) => (
          <Card key={idx} className="flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-slate-400 font-semibold">{exam.code}</span>
                <Badge variant={exam.status === 'Scheduled' ? 'primary' : exam.status === 'Completed' ? 'success' : 'warning'}>
                  {exam.status}
                </Badge>
              </div>
              <h3 className="font-semibold text-slate-900 mt-2 text-sm leading-snug">{exam.title}</h3>

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Duration: {exam.duration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>{exam.questions} Questions • Neg: {exam.negativeMarking}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>{exam.enrolled} Students Enrolled</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400">Randomized Questions</span>
              <button className="text-blue-600 font-semibold hover:underline">Configure &rarr;</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
