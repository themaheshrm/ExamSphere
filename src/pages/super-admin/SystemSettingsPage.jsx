import React from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';

export default function SystemSettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System Configuration</h1>
        <p className="text-sm text-slate-500">Global CBT platform parameters, proctoring security limits, and email dispatchers.</p>
      </div>

      <Card title="Assessment Security & Proctoring Defaults">
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <p className="font-semibold text-slate-800">Fullscreen Enforcement</p>
              <p className="text-slate-500">Automatically flag candidates when tab/window is switched.</p>
            </div>
            <input type="checkbox" defaultChecked className="h-4 w-4 rounded text-blue-600" />
          </div>

          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <p className="font-semibold text-slate-800">Automatic Answer Autosave Frequency</p>
              <p className="text-slate-500">Autosave answers on candidate keystroke or tick.</p>
            </div>
            <select className="border border-slate-300 rounded-lg p-1.5 text-xs bg-white">
              <option>Every 5 seconds</option>
              <option>Every 10 seconds</option>
              <option>Instant (WebSocket)</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Max Reconnection Grace Window</p>
              <p className="text-slate-500">Allow candidate to resume exam if power or network drops.</p>
            </div>
            <span className="font-medium text-slate-700">15 minutes</span>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
          <Button variant="primary">Save Changes</Button>
        </div>
      </Card>
    </div>
  );
}
