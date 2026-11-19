import React from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Plus, BookOpen, Layers } from 'lucide-react';

export default function QuestionBankPage() {
  const subjects = [
    { title: 'Computer Networks', count: 480, tags: ['OSI Model', 'TCP/IP', 'Routing', 'Subnetting'] },
    { title: 'Operating Systems', count: 620, tags: ['Process Synchronization', 'Paging', 'Deadlocks'] },
    { title: 'Data Structures', count: 810, tags: ['Binary Trees', 'Graphs', 'Dynamic Programming'] },
    { title: 'Discrete Mathematics', count: 350, tags: ['Set Theory', 'Propositional Logic', 'Relations'] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Question Bank & Taxonomies</h1>
          <p className="text-sm text-slate-500">Subject pools, multiple-choice options, LaTeX math formulas, and difficulty tags.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">Import Questions</Button>
          <Button variant="primary" icon={Plus}>Add Question</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subjects.map((sub, idx) => (
          <Card key={idx}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">{sub.title}</h3>
                  <p className="text-xs text-slate-500">{sub.count} Verified Questions</p>
                </div>
              </div>
              <Badge variant="primary">{sub.count} items</Badge>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2">Topics & Categories</div>
              <div className="flex flex-wrap gap-1.5">
                {sub.tags.map((tag, tIdx) => (
                  <span key={tIdx} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
