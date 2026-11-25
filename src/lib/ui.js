/** Small helpers shared by client components (no Node APIs here). */

/** The score to show: AI analysis score, otherwise one a recruiter added. */
export function effectiveScore(r) {
  if (r?.score != null) return { value: Number(r.score), source: 'ai' };
  if (r?.manualScore?.value != null) return { value: Number(r.manualScore.value), source: 'manual' };
  return { value: null, source: null };
}

export const hasDecision = (stage) => stage === 'qualified' || stage === 'disqualified' || stage === 'needs_review';

/** 75 → "1m 15s", 4000 → "1h 6m" */
export function formatElapsed(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

export function csvEscape(v) {
  if (v == null) return '';
  let s = String(v);
  // Stop spreadsheet apps from treating a cell as a formula.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, header, rows) {
  const lines = [header.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
