import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

/**
 * Standard confirmation for consequential actions (publish, delete, submit…).
 * tone: 'primary' | 'danger' | 'warning'
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  isLoading = false,
  confirmDisabled = false,
}) {
  const Icon = tone === 'primary' ? Info : AlertTriangle;
  const iconTone = tone === 'danger'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[#D1DEEB] bg-[#F0F4F8] text-[#1E3A5F]';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>{cancelLabel}</Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
            disabled={confirmDisabled}
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border ${iconTone}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-3 text-sm leading-relaxed text-slate-700">
          {description && <p>{description}</p>}
          {children}
        </div>
      </div>
    </Modal>
  );
}
