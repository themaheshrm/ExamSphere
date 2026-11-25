import React, { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import InputField from '../../components/common/InputField';
import PageHeader from '../../components/common/PageHeader';
import { useToast } from '../../components/common/Toast';
import { Spinner } from '../../components/common/LoadingStates';
import { platformApi } from '../../services/api/platformApi';
import { useSettings } from '../../context/SettingsContext';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FIELDS = ['supportEmail', 'helplinePhone', 'resultDisplay', 'timerWarningMinutes', 'showPatternToCandidates', 'maintenanceNotice'];
const pick = (s) => Object.fromEntries(FIELDS.map((k) => [k, s[k]]));

function validate(form) {
  const errors = {};
  const minutes = Number(form.timerWarningMinutes);
  if (!EMAIL.test(String(form.supportEmail ?? '').trim())) errors.supportEmail = 'Enter a valid email address.';
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 30) errors.timerWarningMinutes = 'Choose between 1 and 30 minutes.';
  if (String(form.maintenanceNotice ?? '').length > 240) errors.maintenanceNotice = 'At most 240 characters.';
  return errors;
}

/** Platform settings (Supabase platform_settings; saved by the super admin only). */
export default function SystemSettingsPage() {
  const { settings, loaded } = useSettings();
  if (!loaded) return <div className="flex justify-center py-16" role="status"><Spinner size="lg" /><span className="sr-only">Loading settings…</span></div>;
  return <SettingsForm key={settings.updatedAt || 'defaults'} initial={pick(settings)} />;
}

function SettingsForm({ initial }) {
  const { notify } = useToast();
  const { reload } = useSettings();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const save = async (event) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const value = pick(await platformApi.saveSettings({ ...form, timerWarningMinutes: Number(form.timerWarningMinutes) }));
      setSaved(value);
      setForm(value);
      reload();
      notify('Platform settings saved.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const radio = (name, value, label, help) => (
    <label className={`flex cursor-pointer gap-3 rounded-sm border p-3 ${form[name] === value ? 'border-[#1E3A5F] bg-[#F0F4F8]' : 'border-slate-200 hover:bg-slate-50'}`}>
      <input type="radio" name={name} checked={form[name] === value} onChange={() => setForm({ ...form, [name]: value })} className="mt-0.5 h-4 w-4 accent-[#1E3A5F]" />
      <span><span className="block text-sm font-medium text-slate-900">{label}</span><span className="block text-xs text-slate-500">{help}</span></span>
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-6 pb-16" noValidate>
      <PageHeader
        eyebrow="Platform Administration"
        title="Platform Settings"
      />

      <Card title="Result display" subtitle="After a candidate submits">
        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="sr-only">Result display</legend>
          {radio('resultDisplay', 'immediate', 'Show provisional score', 'Score and pass status on submission.')}
          {radio('resultDisplay', 'withheld', 'Withhold until published', 'Submission receipt only.')}
        </fieldset>
      </Card>

      <Card title="Examination screen">
        <div className="grid gap-5 md:grid-cols-2">
          <InputField
            label="Low-time warning (minutes)"
            type="number"
            min="1"
            max="30"
            value={form.timerWarningMinutes}
            onChange={(e) => setForm({ ...form, timerWarningMinutes: e.target.value })}
            error={errors.timerWarningMinutes}
          />
          <label className="flex items-start gap-3 rounded-sm border border-slate-200 p-3">
            <input type="checkbox" checked={form.showPatternToCandidates} onChange={(e) => setForm({ ...form, showPatternToCandidates: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#1E3A5F]" />
            <span>
              <span className="block text-sm font-medium text-slate-900">Show paper pattern to candidates</span>
              <span className="block text-xs text-slate-500">Pattern (A–J) and paper code on candidate screens.</span>
            </span>
          </label>
        </div>
      </Card>

      <Card title="Help desk & notices">
        <div className="grid gap-5 md:grid-cols-2">
          <InputField label="Support email" type="email" required value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} error={errors.supportEmail} />
          <InputField label="Helpline" value={form.helplinePhone} onChange={(e) => setForm({ ...form, helplinePhone: e.target.value })} />
          <div className="md:col-span-2">
            <label htmlFor="maintenance" className="mb-1 block text-xs font-medium text-slate-800">Platform-wide notice</label>
            <textarea
              id="maintenance"
              rows={2}
              maxLength={240}
              value={form.maintenanceNotice}
              onChange={(e) => setForm({ ...form, maintenanceNotice: e.target.value })}
              className="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
              placeholder="e.g. Scheduled maintenance on Sunday 02:00–04:00 IST. Examinations are unaffected."
            />
            <p className="mt-1 text-[11px] text-slate-500">Banner on every page; leave empty to hide. {form.maintenanceNotice.length}/240</p>
          </div>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-300 bg-white px-4 py-3 lg:left-64">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="text-xs text-slate-600" aria-live="polite">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</p>
          <div className="flex gap-2">
            <Button variant="secondary" icon={RotateCcw} disabled={!dirty} onClick={() => { setForm(saved); setErrors({}); }}>Discard</Button>
            <Button type="submit" icon={Save} disabled={!dirty} isLoading={saving}>Save settings</Button>
          </div>
        </div>
      </div>
    </form>
  );
}
