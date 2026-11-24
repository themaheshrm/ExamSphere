import React from 'react';
import Badge from './Badge';

/** Single source of truth for status → colour across the portals. */
const MAP = {
  Published: 'success', Live: 'success', Active: 'success', Eligible: 'success', Submitted: 'success', Pass: 'success', Passed: 'success', Verified: 'success', Imported: 'success', Ready: 'success',
  Draft: 'warning', 'In progress': 'primary', Pending: 'warning', Withheld: 'danger', Suspended: 'danger', Disabled: 'neutral', Duplicate: 'warning',
  Fail: 'danger', Failed: 'danger', Invalid: 'danger', Error: 'danger', Easy: 'success', Medium: 'warning', Hard: 'danger', 'Not attempted': 'neutral',
};

export default function StatusBadge({ status, children, size = 'md', dot = true, className = '' }) {
  return (
    <Badge variant={MAP[status] || 'neutral'} size={size} dot={dot} className={className}>
      {children || status}
    </Badge>
  );
}
