import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Alert from './Alert';

/**
 * One-time display of sign-in credentials. The caller holds the values in
 * component state only and clears them in onClose; nothing is persisted.
 */
export default function CredentialsDialog({ credentials, title, rows, copyText, onClose, notice }) {
  const [copied, setCopied] = useState(false);
  const close = () => { setCopied(false); onClose(); };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Modal
      isOpen={Boolean(credentials)}
      onClose={close}
      title={title}
      maxWidth="max-w-md"
      footer={(
        <>
          <Button variant="secondary" icon={Copy} onClick={copy}>{copied ? 'Copied' : 'Copy credentials'}</Button>
          <Button onClick={close}>Done</Button>
        </>
      )}
    >
      {credentials && (
        <div className="space-y-4">
          <dl className="divide-y divide-slate-100 rounded-sm border border-slate-200 text-sm" aria-label="Sign-in details">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="select-all break-all text-right font-mono font-semibold text-slate-900" data-credential={k}>{v}</dd>
              </div>
            ))}
          </dl>
          <Alert tone="warning" title="Shown once">
            {notice || 'The password is not stored and cannot be shown again. It must be changed at first sign-in.'}
          </Alert>
        </div>
      )}
    </Modal>
  );
}
