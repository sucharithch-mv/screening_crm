'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmailBadge, MatchBadge, StageBadge } from './Badges.jsx';
import EmailReviewDialog from './EmailReviewDialog.jsx';
import ScoreEditor from './ScoreEditor.jsx';
import { STAGES } from '../lib/screening.js';
import { formatDateTime } from '../lib/format.js';
import { downloadCsv, effectiveScore, formatElapsed, hasDecision } from '../lib/ui.js';

const ACTIVE = new Set(['call_queued', 'call_in_progress', 'awaiting_analysis']);
const REFRESH_MS = 10000;
const PAGE_SIZES = [10, 25, 50, 100];

/* Funnel: each step is a subset of the one before it. */
const FUNNEL = [
  { key: '', label: 'Applied', test: () => true },
  { key: 'called', label: 'Called', test: (r) => !!r.latestCall },
  { key: 'connected', label: 'Connected', test: (r) => r.connected },
  { key: 'qualified', label: 'Qualified', test: (r) => r.stage === 'qualified', tone: 'var(--success)' },
  { key: 'emailed', label: 'Emailed', test: (r) => r.stage === 'qualified' && r.emailStatus === 'sent' },
];
const SIDE_CARDS = [
  { key: 'disqualified', label: 'Disqualified', test: (r) => r.stage === 'disqualified', tone: 'var(--danger)' },
  { key: 'not_connected', label: 'Not connected', test: (r) => r.stage === 'call_failed', tone: 'var(--warning)' },
  { key: 'to_review', label: 'Emails to review', test: (r) => hasDecision(r.stage) && r.emailStatus !== 'sent' },
];
const CARD_TESTS = Object.fromEntries([...FUNNEL, ...SIDE_CARDS].map((c) => [c.key, c.test]));

const DATE_PRESETS = { any: 'Any time', today: 'Today', '7': 'Last 7 days', '30': 'Last 30 days', custom: 'Custom range' };

const SORTS = {
  createdAt: (r) => r.createdAt,
  lastCall: (r) => r.latestCall?.createdAt || '',
  score: (r) => effectiveScore(r).value ?? -1,
  match: (r) => r.resumeMatch?.score ?? -1,
  name: (r) => String(r.name || '').toLowerCase(),
};

function dateBounds(preset, from, to) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  if (preset === 'today') return [startOfDay(now), null];
  if (preset === '7' || preset === '30') return [new Date(startOfDay(now).getTime() - (Number(preset) - 1) * 86400000), null];
  if (preset === 'custom') {
    return [from ? new Date(`${from}T00:00:00`) : null, to ? new Date(`${to}T23:59:59.999`) : null];
  }
  return [null, null];
}

export default function CandidatesTable({ rows, jobs, callerId, voiceSummary, initialJob = '', settings }) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set());
  const [jobFilter, setJobFilter] = useState(initialJob);
  const [cardFilter, setCardFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [matchFilter, setMatchFilter] = useState('');
  const [datePreset, setDatePreset] = useState('any');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [query, setQuery] = useState('');
  const [groupPeople, setGroupPeople] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [emailFor, setEmailFor] = useState(null);
  const [now, setNow] = useState(null);

  /* Base set: job + date + search. The funnel counts come from this. */
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    const [from, to] = dateBounds(datePreset, dateFrom, dateTo);
    return rows.filter((r) => {
      if (jobFilter && String(r.jobId) !== jobFilter) return false;
      const t = new Date(r.createdAt);
      if (from && t < from) return false;
      if (to && t > to) return false;
      if (q && ![r.name, r.email, r.phone, r.ref].some((v) => String(v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, jobFilter, datePreset, dateFrom, dateTo, query]);

  const filtered = useMemo(() => {
    const test = CARD_TESTS[cardFilter] || (() => true);
    const list = base.filter(
      (r) =>
        test(r) &&
        (!stageFilter || r.stage === stageFilter) &&
        (!matchFilter || (r.resumeMatch?.level || 'unknown') === matchFilter),
    );
    const get = SORTS[sort.key] || SORTS.createdAt;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x < y) return -dir;
      if (x > y) return dir;
      return b.id - a.id;
    });
  }, [base, cardFilter, stageFilter, matchFilter, sort]);

  /* Group applications from the same person (same email + phone). */
  const appsPerPerson = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(r.personKey, (m.get(r.personKey) || 0) + 1);
    return m;
  }, [rows]);

  const groups = useMemo(() => {
    if (!groupPeople) return filtered.map((r) => ({ key: `r${r.id}`, primary: r, others: [] }));
    const map = new Map();
    const out = [];
    for (const r of filtered) {
      let g = map.get(r.personKey);
      if (!g) {
        g = { key: r.personKey, primary: r, others: [] };
        map.set(r.personKey, g);
        out.push(g);
      } else g.others.push(r);
    }
    return out;
  }, [filtered, groupPeople]);

  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageGroups = groups.slice((safePage - 1) * pageSize, safePage * pageSize);
  const visibleRows = pageGroups.flatMap((g) => (expanded.has(g.key) ? [g.primary, ...g.others] : [g.primary]));

  useEffect(() => setPage(1), [jobFilter, cardFilter, stageFilter, matchFilter, datePreset, dateFrom, dateTo, query, groupPeople, pageSize]);

  const anyActive = rows.some((r) => ACTIVE.has(r.stage));
  const anyAnalysing = rows.some((r) => r.stage === 'awaiting_analysis' || r.nextRetryAt);

  // Auto-refresh while calls are running so webhook updates appear without reloading.
  useEffect(() => {
    if (!anyActive) return undefined;
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [anyActive, router]);

  // Live clock for "Analysing for 2m 10s" and retry countdowns (client only, avoids hydration mismatch).
  useEffect(() => {
    setNow(Date.now());
    if (!anyAnalysing) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyAnalysing]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  // Drop selections that disappeared from the list.
  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => rows.some((r) => r.id === id))));
  }, [rows]);

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleRows.forEach((r) => next.delete(r.id));
      else visibleRows.forEach((r) => next.add(r.id));
      return next;
    });
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleExpand = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const setSortKey = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const compareJobIds = new Set(selectedRows.map((r) => r.jobId));
  const compareReason =
    selectedRows.length < 2
      ? 'Select 2–3 candidates for the same job to compare'
      : selectedRows.length > 3
        ? 'Compare works with up to 3 candidates'
        : compareJobIds.size > 1
          ? 'Pick candidates who applied for the same job'
          : null;

  async function triggerCalls(ids, { trigger = 'manual', confirmText } = {}) {
    if (!ids.length) return;
    const picked = rows.filter((r) => ids.includes(r.id));
    const activeOnes = picked.filter((r) => ACTIVE.has(r.stage)).length;
    const weak = picked.filter((r) => r.resumeMatch?.level === 'weak').length;
    const byPerson = new Map();
    for (const r of picked) byPerson.set(r.personKey, [...(byPerson.get(r.personKey) || []), r]);
    const dupes = [...byPerson.values()].filter((list) => list.length > 1);
    const msg =
      (confirmText ||
        `Start AI screening calls for ${ids.length} candidate${ids.length > 1 ? 's' : ''}` + (callerId ? ` from ${callerId}` : '') + '?') +
      (voiceSummary ? `\nAI quality: ${voiceSummary}` : '') +
      '\n\nThis places real phone calls and uses MagickVoice credits.' +
      (weak ? `\n\n${weak} selected ${weak === 1 ? 'is a weak' : 'are weak'} resume match${weak === 1 ? '' : 'es'} for the job.` : '') +
      (dupes.length
        ? `\n\nSame person selected for several jobs: ${dupes.map((l) => `${l[0].name} (${l.length} jobs)`).join(', ')} — they'll get one call per job.`
        : '') +
      (activeOnes ? `\n\n${activeOnes} already have a call in progress and will be skipped.` : '');
    if (!window.confirm(msg)) return;

    setBusy(trigger === 'retry' ? `retry-${ids[0]}` : 'trigger');
    try {
      const res = await fetch('/api/calls/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: ids, trigger }),
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
        if (trigger !== 'retry') setSelected(new Set());
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

  async function retryAnalysis(r) {
    setBusy(`sync-${r.id}`);
    try {
      const res = await fetch('/api/calls/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: r.id }),
      });
      const body = await res.json().catch(() => ({}));
      setToast(
        res.ok
          ? { tone: body.stage === 'awaiting_analysis' ? 'warning' : 'success', text: body.stage === 'awaiting_analysis' ? 'MagickVoice is still analysing this call.' : 'Result fetched.' }
          : { tone: 'danger', text: body.error || 'Could not reach MagickVoice.' },
      );
    } catch {
      setToast({ tone: 'danger', text: 'Network error.' });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function cancelRetry(r) {
    await fetch(`/api/candidates/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cancelAutoRetry: true }) });
    router.refresh();
  }

  function exportCsv(scope) {
    const sets = {
      selected: selectedRows,
      view: filtered,
      qualified: base.filter((r) => r.stage === 'qualified'),
      disqualified: base.filter((r) => r.stage === 'disqualified'),
      all: rows,
    };
    const list = sets[scope] || filtered;
    if (!list.length) {
      setToast({ tone: 'warning', text: 'Nothing to export for that choice.' });
      return;
    }
    const header = [
      'Ref', 'Name', 'Email', 'Phone', 'Job', 'Applied at', 'Status', 'Decision', 'Score %', 'Score source',
      'Resume match %', 'Resume match', 'Call attempts', 'Last call at', 'Result email', 'Experience (yrs)',
      'Location', 'Notice period', 'Current CTC', 'Expected CTC', 'Notes', 'Summary',
    ];
    const data = list.map((r) => {
      const s = effectiveScore(r);
      return [
        r.ref, r.name, r.email, r.phone, r.jobTitle, formatDateTime(r.createdAt), STAGES[r.stage]?.label || r.stage,
        r.decision || '', s.value ?? '', s.source === 'manual' ? 'Recruiter' : s.source === 'ai' ? 'AI call' : '',
        r.resumeMatch?.score ?? '', r.resumeMatch ? r.resumeMatch.level : '', r.callAttempt || 0,
        r.latestCall ? formatDateTime(r.latestCall.createdAt) : '', r.emailStatus, r.experienceYears ?? '',
        r.currentLocation || '', r.noticePeriod || '', r.currentCtc || '', r.expectedCtc || '', r.notesCount || 0, r.summary || '',
      ];
    });
    const jobPart = jobFilter ? `-${(jobs.find((j) => String(j.id) === jobFilter)?.title || 'job').replace(/[^\w]+/g, '-').toLowerCase()}` : '';
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`candidates-${scope}${jobPart}-${stamp}.csv`, header, data);
    setToast({ tone: 'success', text: `Exported ${list.length} candidate${list.length === 1 ? '' : 's'}.` });
  }

  const jobCounts = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(String(r.jobId), (m.get(String(r.jobId)) || 0) + 1);
    return m;
  }, [rows]);

  const funnelCounts = FUNNEL.map((c) => base.filter(c.test).length);
  const triggerLabel =
    busy === 'trigger' ? 'Starting calls…' : selected.size ? `Call ${selected.size} candidate${selected.size > 1 ? 's' : ''}` : 'Trigger AI call';

  const colCount = 9;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* ── Funnel / stat cards (click to filter) ───────────── */}
      <div className="funnel">
        {FUNNEL.map((c, i) => {
          const n = funnelCounts[i];
          const prev = i > 0 ? funnelCounts[i - 1] : null;
          const pct = prev ? Math.round((n / prev) * 100) : null;
          const foot = i === 0 ? 'All applications' : pct != null ? `${pct}% of ${FUNNEL[i - 1].label.toLowerCase()}` : `of ${prev} ${FUNNEL[i - 1].label.toLowerCase()}`;
          return (
            <Fragment key={c.key || 'all'}>
              {i > 0 && <span className="funnel-arrow" aria-hidden="true">→</span>}
              <button
                type="button"
                className={`card stat stat-btn${cardFilter === c.key ? ' active' : ''}`}
                onClick={() => setCardFilter(cardFilter === c.key && c.key ? '' : c.key)}
                aria-pressed={cardFilter === c.key}
                title={`Show ${c.label.toLowerCase()} candidates`}
              >
                <div className="stat-label">{c.label}</div>
                <div className="stat-value" style={c.tone ? { color: c.tone } : undefined}>
                  {n}
                </div>
                <div className="stat-foot">{foot}</div>
              </button>
            </Fragment>
          );
        })}
      </div>
      <div className="side-stats">
        {SIDE_CARDS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`chip${cardFilter === c.key ? ' active' : ''}`}
            onClick={() => setCardFilter(cardFilter === c.key ? '' : c.key)}
            aria-pressed={cardFilter === c.key}
          >
            <span className="chip-dot" style={{ background: c.tone || 'var(--info)' }} />
            {c.label} <strong>{base.filter(c.test).length}</strong>
          </button>
        ))}
        {cardFilter && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCardFilter('')}>
            Clear card filter
          </button>
        )}
      </div>

      <div className="card">
        {/* ── Job chips ───────────── */}
        <div className="chip-row" role="group" aria-label="Filter by job">
          <button type="button" className={`chip${!jobFilter ? ' active' : ''}`} onClick={() => setJobFilter('')}>
            All jobs <strong>{rows.length}</strong>
          </button>
          {jobs.map((j) => (
            <button
              key={j.id}
              type="button"
              className={`chip${jobFilter === String(j.id) ? ' active' : ''}${j.isOpen === false ? ' closed' : ''}`}
              onClick={() => setJobFilter(jobFilter === String(j.id) ? '' : String(j.id))}
              title={j.isOpen === false ? 'Closed job' : undefined}
            >
              {j.title} <strong>{jobCounts.get(String(j.id)) || 0}</strong>
            </button>
          ))}
        </div>

        {/* ── Filters ───────────── */}
        <div className="toolbar">
          <input className="input grow" placeholder="Search name, email, phone or ref…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="select" value={datePreset} onChange={(e) => setDatePreset(e.target.value)} aria-label="Applied date">
            {Object.entries(DATE_PRESETS).map(([k, v]) => (
              <option key={k} value={k}>
                Applied: {v}
              </option>
            ))}
          </select>
          {datePreset === 'custom' && (
            <>
              <input type="date" className="input" style={{ minWidth: 0 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
              <span className="muted small">to</span>
              <input type="date" className="input" style={{ minWidth: 0 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
            </>
          )}
          <select className="select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {Object.entries(STAGES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select className="select" value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)} aria-label="Resume match">
            <option value="">Any resume match</option>
            <option value="strong">Strong match — worth calling</option>
            <option value="possible">Possible match</option>
            <option value="weak">Weak match</option>
            <option value="unknown">Not scored</option>
          </select>
          <label className="checkbox-row small nowrap" title="Show one row per person when they applied to several jobs (same email and phone)">
            <input type="checkbox" checked={groupPeople} onChange={(e) => setGroupPeople(e.target.checked)} />
            <span>Group same person</span>
          </label>
        </div>

        {/* ── Actions ───────────── */}
        <div className="toolbar actions">
          <span className="muted small">
            {selected.size ? (
              <>
                <strong className="text-primary">{selected.size} selected</strong>{' '}
                <button className="btn btn-sm btn-ghost link-btn" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </>
            ) : (
              'Tick candidates to call, compare or export them.'
            )}
          </span>
          <div className="row wrap" style={{ marginLeft: 'auto', gap: 8 }}>
            <button className="btn" onClick={syncAll} disabled={busy !== null} title="Pull status and results for calls in progress">
              {busy === 'sync' ? 'Syncing…' : 'Sync results'}
            </button>
            <details className="menu">
              <summary className="btn">Download CSV ▾</summary>
              <div className="menu-list card">
                <button onClick={(e) => { e.currentTarget.closest('details').open = false; exportCsv('selected'); }} disabled={!selected.size}>
                  Selected candidates <span className="muted">({selected.size})</span>
                </button>
                <button onClick={(e) => { e.currentTarget.closest('details').open = false; exportCsv('view'); }}>
                  Current view <span className="muted">({filtered.length})</span>
                </button>
                <div className="menu-sep" />
                <button onClick={(e) => { e.currentTarget.closest('details').open = false; exportCsv('qualified'); }}>
                  Qualified only <span className="muted">({base.filter((r) => r.stage === 'qualified').length})</span>
                </button>
                <button onClick={(e) => { e.currentTarget.closest('details').open = false; exportCsv('disqualified'); }}>
                  Disqualified only <span className="muted">({base.filter((r) => r.stage === 'disqualified').length})</span>
                </button>
                <div className="menu-sep" />
                <button onClick={(e) => { e.currentTarget.closest('details').open = false; exportCsv('all'); }}>
                  Everything, all jobs <span className="muted">({rows.length})</span>
                </button>
                <div className="menu-hint">Qualified / disqualified follow the job, date and search filters above.</div>
              </div>
            </details>
            <span className="tip" data-tip={compareReason || undefined}>
              <button
                className="btn"
                disabled={!!compareReason}
                onClick={() => router.push(`/recruiter/compare?ids=${selectedRows.map((r) => r.id).join(',')}`)}
              >
                Compare{selectedRows.length >= 2 && !compareReason ? ` ${selectedRows.length}` : ''}
              </button>
            </span>
            <span className="tip" data-tip={selected.size === 0 ? 'Select candidates to call' : undefined}>
              <button className="btn btn-primary" onClick={() => triggerCalls([...selected])} disabled={busy !== null || selected.size === 0}>
                {triggerLabel}
              </button>
            </span>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" aria-label="Select all on this page" checked={allVisibleSelected} onChange={toggleAll} />
                </th>
                <SortTh label="Candidate" k="name" sort={sort} onSort={setSortKey} />
                <th>Job</th>
                <SortTh label="Applied" k="createdAt" sort={sort} onSort={setSortKey} />
                <SortTh label="Last call" k="lastCall" sort={sort} onSort={setSortKey} />
                <SortTh label="Resume match" k="match" sort={sort} onSort={setSortKey} />
                <th>Screening status</th>
                <SortTh label="Score" k="score" sort={sort} onSort={setSortKey} className="right" />
                <th>Result email</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="empty">
                    {rows.length === 0 ? 'No applications yet. Share the careers page to start receiving candidates.' : 'No candidates match these filters.'}
                  </td>
                </tr>
              )}
              {pageGroups.map((g) => {
                const isOpen = expanded.has(g.key);
                const list = isOpen ? [g.primary, ...g.others] : [g.primary];
                return list.map((r, idx) => (
                  <Row
                    key={r.id}
                    r={r}
                    child={idx > 0}
                    group={idx === 0 && groupPeople ? { others: g.others.length, total: appsPerPerson.get(r.personKey) || 1, open: isOpen, toggle: () => toggleExpand(g.key) } : null}
                    selected={selected.has(r.id)}
                    onToggle={() => toggle(r.id)}
                    now={now}
                    settings={settings}
                    busy={busy}
                    onRetryCall={() =>
                      triggerCalls([r.id], {
                        trigger: 'retry',
                        confirmText: `Call ${r.name} again (attempt ${(r.callAttempt || 1) + 1})?`,
                      })
                    }
                    onRetryAnalysis={() => retryAnalysis(r)}
                    onCancelRetry={() => cancelRetry(r)}
                    onReviewEmail={() => setEmailFor(r)}
                  />
                ));
              })}
            </tbody>
          </table>
        </div>

        <div className="card-foot pager">
          <span className="small muted">
            {groups.length === 0
              ? 'No results'
              : `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, groups.length)} of ${groups.length} ${groupPeople ? 'people' : 'applications'}`}
            {groupPeople && filtered.length !== groups.length ? ` (${filtered.length} applications)` : ''}
            {' · '}
            {anyActive ? 'Calls in progress — refreshing every 10s' : 'Up to date'}
          </span>
          <div className="row" style={{ gap: 6 }}>
            <select className="select select-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page">
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => setPage(1)} disabled={safePage <= 1} aria-label="First page">
              «
            </button>
            <button className="btn btn-sm" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1}>
              ‹ Prev
            </button>
            {pageNumbers(safePage, pageCount).map((p, i) =>
              p === '…' ? (
                <span key={`gap${i}`} className="muted small">
                  …
                </span>
              ) : (
                <button key={p} className={`btn btn-sm${p === safePage ? ' btn-primary' : ''}`} onClick={() => setPage(p)} aria-current={p === safePage ? 'page' : undefined}>
                  {p}
                </button>
              ),
            )}
            <button className="btn btn-sm" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount}>
              Next ›
            </button>
            <button className="btn btn-sm" onClick={() => setPage(pageCount)} disabled={safePage >= pageCount} aria-label="Last page">
              »
            </button>
          </div>
        </div>
      </div>

      {emailFor && (
        <EmailReviewDialog
          candidateId={emailFor.id}
          candidateName={emailFor.name}
          onClose={(msg) => {
            setEmailFor(null);
            if (msg) setToast({ tone: 'success', text: msg });
          }}
        />
      )}

      {toast && (
        <div className={`alert toast tone-${toast.tone}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}

function pageNumbers(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= total));
  const list = [...set].sort((a, b) => a - b);
  const out = [];
  list.forEach((p, i) => {
    if (i && p - list[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

function SortTh({ label, k, sort, onSort, className = '' }) {
  const active = sort.key === k;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`th-sort${active ? ' active' : ''}`} onClick={() => onSort(k)} title={`Sort by ${label.toLowerCase()}`}>
        {label}
        <span className="sort-ind">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

function Row({ r, child, group, selected, onToggle, now, settings, busy, onRetryCall, onRetryAnalysis, onCancelRetry, onReviewEmail }) {
  const s = effectiveScore(r);
  const attempt = r.callAttempt || (r.latestCall ? 1 : 0);
  const max = settings.maxAttempts;
  const analysingSince = r.stage === 'awaiting_analysis' ? r.latestCall?.analysisStartedAt || r.latestCall?.updatedAt : null;
  const analysingMs = analysingSince && now ? now - new Date(analysingSince).getTime() : null;
  const analysisLate = analysingMs != null && analysingMs > settings.analysisTimeoutMinutes * 60000;
  const retryInMs = r.nextRetryAt && now ? new Date(r.nextRetryAt).getTime() - now : null;
  const canReview = hasDecision(r.stage) && r.emailStatus !== 'sent';

  return (
    <tr className={`${selected ? 'selected' : ''}${child ? ' child-row' : ''}`}>
      <td>
        <input type="checkbox" aria-label={`Select ${r.name} for ${r.jobTitle}`} checked={selected} onChange={onToggle} />
      </td>
      <td>
        {child ? (
          <span className="cell-sub">↳ same person</span>
        ) : (
          <>
            <Link href={`/recruiter/candidates/${r.id}`} className="cell-title">
              {r.name}
            </Link>
            <div className="cell-sub">{r.email}</div>
            <div className="cell-sub">{r.phone}</div>
            {r.notesCount > 0 && (
              <Link href={`/recruiter/candidates/${r.id}#notes`} className="notes-count" title={`${r.notesCount} note${r.notesCount === 1 ? '' : 's'}`}>
                💬 {r.notesCount} note{r.notesCount === 1 ? '' : 's'}
              </Link>
            )}
            {group && group.total > 1 && (
              <button type="button" className="dup-toggle" onClick={group.toggle} aria-expanded={group.open}>
                {group.others > 0 ? `${group.open ? '▾' : '▸'} Applied to ${group.total} jobs` : `Applied to ${group.total} jobs`}
              </button>
            )}
          </>
        )}
      </td>
      <td style={{ minWidth: 170 }}>
        <div>{r.jobTitle}</div>
        <div className="cell-sub">
          {r.ref}
          {r.experienceYears != null ? ` · ${r.experienceYears} yrs` : ''}
        </div>
      </td>
      <td className="nowrap small" suppressHydrationWarning>
        {formatDateTime(r.createdAt)}
      </td>
      <td className="nowrap small" suppressHydrationWarning>
        {r.latestCall ? (
          <>
            {formatDateTime(r.latestCall.createdAt)}
            {attempt > 0 && <div className="cell-sub">{attempt} attempt{attempt === 1 ? '' : 's'}</div>}
          </>
        ) : (
          <span className="muted">Not called</span>
        )}
      </td>
      <td>
        <MatchBadge match={r.resumeMatch} />
      </td>
      <td>
        <div className="row wrap" style={{ gap: 6 }}>
          <StageBadge stage={r.stage} />
          {attempt > 0 && (ACTIVE.has(r.stage) || r.stage === 'call_failed' || r.stage === 'trigger_failed') && (
            <span className="badge plain tone-neutral" title="Call attempts in this round">
              Attempt {attempt}/{Math.max(max, attempt)}
            </span>
          )}
        </div>
        {analysingMs != null && (
          <div className={`cell-sub${analysisLate ? ' warn-text' : ''}`}>
            {analysisLate ? 'Analysis taking longer than expected' : 'Analysing for'} {analysisLate ? `(${formatElapsed(analysingMs)})` : formatElapsed(analysingMs)}
            {analysisLate && (
              <button className="btn btn-sm mt-4" onClick={onRetryAnalysis} disabled={busy !== null}>
                {busy === `sync-${r.id}` ? 'Checking…' : 'Retry'}
              </button>
            )}
          </div>
        )}
        {(r.stage === 'trigger_failed' || r.stage === 'call_failed') && r.lastCallError && (
          <div className="cell-sub" style={{ maxWidth: 240 }} title={r.lastCallError}>
            {r.lastCallError.length > 60 ? `${r.lastCallError.slice(0, 60)}…` : r.lastCallError}
          </div>
        )}
        {r.stage === 'call_failed' && (
          <div className="row wrap mt-4" style={{ gap: 6 }}>
            <button className="btn btn-sm" onClick={onRetryCall} disabled={busy !== null}>
              {busy === `retry-${r.id}` ? 'Calling…' : 'Retry call'}
            </button>
            {r.nextRetryAt ? (
              <span className="cell-sub" suppressHydrationWarning>
                Auto-retry {retryInMs != null && retryInMs > 0 ? `in ${formatElapsed(retryInMs)}` : 'due now'} ·{' '}
                <button className="btn-ghost link-btn small" onClick={onCancelRetry}>
                  cancel
                </button>
              </span>
            ) : attempt >= max ? (
              <span className="cell-sub">No more auto-retries</span>
            ) : null}
          </div>
        )}
      </td>
      <td className="right">
        {s.value != null ? (
          <span className="strong" title={s.source === 'manual' ? `Added by ${r.manualScore?.by || 'recruiter'}` : 'From the AI screening call'}>
            {s.value}%{s.source === 'manual' && <span className="manual-tag"> manual</span>}
          </span>
        ) : hasDecision(r.stage) ? (
          <ScoreEditor candidateId={r.id} compact />
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        {canReview ? (
          <div className="stack-sm" style={{ gap: 4, alignItems: 'flex-start' }}>
            {r.emailStatus !== 'not_sent' && <EmailBadge status={r.emailStatus} />}
            <button className="btn btn-sm" onClick={onReviewEmail}>
              Review &amp; send
            </button>
          </div>
        ) : (
          <EmailBadge status={r.emailStatus} />
        )}
      </td>
    </tr>
  );
}
