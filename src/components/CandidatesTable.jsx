'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmailBadge, StageBadge } from './Badges.jsx';
import { STAGES } from '../lib/screening.js';
import { formatDateTime } from '../lib/format.js';

const ACTIVE = new Set(['call_queued', 'call_in_progress', 'awaiting_analysis']);
const REFRESH_MS = 10000;

export default function CandidatesTable({ rows, jobs, callerId, voiceSummary, initialJob = '' }) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set());
  const [jobFilter, setJobFilter] = useState(initialJob);
  const [stageFilter, setStageFilter] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!jobFilter || String(r.jobId) === jobFilter) &&
        (!stageFilter || r.stage === stageFilter) &&
        (!q || [r.name, r.email, r.phone, r.ref].some((v) => String(v || '').toLowerCase().includes(q))),
    );
  }, [rows, jobFilter, stageFilter, query]);

  const anyActive = rows.some((r) => ACTIVE.has(r.stage));

  // Auto-refresh while calls are running so webhook updates appear without reloading.
  useEffect(() => {
    if (!anyActive) return undefined;
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [anyActive, router]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  // Drop selections that disappeared from the list.
  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => rows.some((r) => r.id === id))));
  }, [rows]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function triggerCalls() {
    const ids = [...selected];
    if (!ids.length) return;
    const activeOnes = rows.filter((r) => selected.has(r.id) && ACTIVE.has(r.stage)).length;
    const msg =
      `Start AI screening calls for ${ids.length} candidate${ids.length > 1 ? 's' : ''}` +
      (callerId ? ` from ${callerId}` : '') +
      '?' +
      (voiceSummary ? `\nAI quality: ${voiceSummary}` : '') +
      '\n\nThis places real phone calls and uses MagickVoice credits.' +
      (activeOnes ? `\n\n${activeOnes} already have a call in progress and will be skipped.` : '');
    if (!window.confirm(msg)) return;

    setBusy('trigger');
    try {
      const res = await fetch('/api/calls/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: ids }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ tone: 'danger', text: body.error || 'Could not start calls.' });
      } else {
        const failures = body.results.filter((r) => !r.ok);
        setToast({
          tone: failures.length ? (body.started ? 'warning' : 'danger') : 'success',
          text:
            `${body.started} call${body.started === 1 ? '' : 's'} started.` +
            (failures.length ? ` ${failures.length} not started: ${failures.map((f) => f.error).filter(Boolean).slice(0, 2).join('; ')}` : ''),
        });
        setSelected(new Set());
      }
    } catch {
      setToast({ tone: 'danger', text: 'Network error while starting calls.' });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function syncAll() {
    setBusy('sync');
    try {
      const res = await fetch('/api/calls/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setToast({ tone: 'danger', text: body.error || 'Sync failed.' });
      else {
        const failed = (body.results || []).filter((r) => !r.ok);
        setToast({
          tone: failed.length ? 'warning' : 'success',
          text: body.results?.length
            ? `Synced ${body.synced} active call${body.synced === 1 ? '' : 's'} from MagickVoice.` + (failed.length ? ` ${failed.length} failed: ${failed[0].error}` : '')
            : 'No calls in progress to sync.',
        });
      }
    } catch {
      setToast({ tone: 'danger', text: 'Network error while syncing.' });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  return (
    <div className="card">
      <div className="toolbar">
        <input className="input grow" placeholder="Search name, email, phone or ref…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
        <select className="select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STAGES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button className="btn" onClick={syncAll} disabled={busy !== null} title="Pull status and results for calls in progress">
          {busy === 'sync' ? 'Syncing…' : 'Sync results'}
        </button>
        <button className="btn btn-primary" onClick={triggerCalls} disabled={busy !== null || selected.size === 0}>
          {busy === 'trigger' ? 'Starting calls…' : `Trigger AI call${selected.size ? ` (${selected.size})` : ''}`}
        </button>
      </div>

      {selected.size > 0 && (
        <div className="selection-bar">
          <span>
            {selected.size} candidate{selected.size > 1 ? 's' : ''} selected
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" aria-label="Select all" checked={allVisibleSelected} onChange={toggleAll} />
              </th>
              <th>Candidate</th>
              <th>Job</th>
              <th>Applied</th>
              <th>Screening status</th>
              <th className="right">Score</th>
              <th>Result email</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  {rows.length === 0 ? 'No applications yet. Share the careers page to start receiving candidates.' : 'No candidates match these filters.'}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className={selected.has(r.id) ? 'selected' : ''}>
                <td>
                  <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td>
                  <Link href={`/recruiter/candidates/${r.id}`} className="cell-title">
                    {r.name}
                  </Link>
                  <div className="cell-sub">
                    {r.email} · {r.phone}
                  </div>
                </td>
                <td>
                  <div>{r.jobTitle}</div>
                  <div className="cell-sub">
                    {r.ref}
                    {r.experienceYears != null ? ` · ${r.experienceYears} yrs` : ''}
                  </div>
                </td>
                <td className="nowrap small" suppressHydrationWarning>
                  {formatDateTime(r.createdAt)}
                </td>
                <td>
                  <StageBadge stage={r.stage} />
                  {(r.stage === 'trigger_failed' || r.stage === 'call_failed') && r.lastCallError && (
                    <div className="cell-sub" style={{ maxWidth: 240 }} title={r.lastCallError}>
                      {r.lastCallError.length > 60 ? `${r.lastCallError.slice(0, 60)}…` : r.lastCallError}
                    </div>
                  )}
                </td>
                <td className="right strong">{r.score != null ? `${r.score}%` : '—'}</td>
                <td>
                  <EmailBadge status={r.emailStatus} />
                </td>
                <td className="right">
                  <Link href={`/recruiter/candidates/${r.id}`} className="btn btn-sm">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-foot row-between small muted">
        <span>
          Showing {filtered.length} of {rows.length}
        </span>
        <span>{anyActive ? 'Calls in progress — refreshing every 10s' : 'Up to date'}</span>
      </div>

      {toast && (
        <div className={`alert toast tone-${toast.tone}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
