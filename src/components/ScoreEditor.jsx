'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Inline "Add score" control for candidates whose AI analysis came back without one. */
export default function ScoreEditor({ candidateId, current, compact = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current?.value ?? '');
  const [reason, setReason] = useState(current?.reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(next) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualScore: next, reason }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) return setError(b.error || 'Could not save.');
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className={`btn btn-sm ${compact ? 'btn-ghost link-btn' : ''}`} onClick={() => setOpen(true)} title="The AI analysis has no score — add one yourself">
        {current ? 'Edit score' : '+ Add score'}
      </button>
    );
  }
  return (
    <form
      className="score-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
      }}
    >
      <div className="row" style={{ gap: 6 }}>
        <input
          className="input input-sm"
          type="number"
          min="0"
          max="100"
          step="1"
          autoFocus
          placeholder="0–100"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Score out of 100"
          style={{ width: 76 }}
        />
        <span className="muted small">%</span>
        <button className="btn btn-sm btn-primary" disabled={busy || value === ''} type="submit">
          Save
        </button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {!compact && (
        <input className="input input-sm mt-8" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      )}
      {current && (
        <button type="button" className="btn btn-sm btn-ghost link-btn" onClick={() => save(null)} disabled={busy}>
          Remove manual score
        </button>
      )}
      {error && <div className="error-text">{error}</div>}
    </form>
  );
}
