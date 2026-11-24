/**
 * Tiny JSON wrapper around localStorage with an in-memory fallback, shared by
 * the client-side demo services (roster, platform, activity log, notifications).
 */
const memory = new Map();

export function readJson(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw !== null && raw !== undefined) return JSON.parse(raw);
  } catch {
    // fall through to memory copy
  }
  return memory.has(key) ? memory.get(key) : fallback;
}

export function writeJson(key, value) {
  memory.set(key, value);
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function makeId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Notify open views that shared demo data changed (same tab). */
export function emitChange(topic) {
  try {
    globalThis.dispatchEvent?.(new CustomEvent('examsphere:data', { detail: { topic } }));
  } catch {
    // non-browser environment (tests)
  }
}

export function toCsv(rows, columns) {
  const escape = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map((c) => escape(c.label)).join(','), ...rows.map((row) => columns.map((c) => escape(c.value(row))).join(','))].join('\n');
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
