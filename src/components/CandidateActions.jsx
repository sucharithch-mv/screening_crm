'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CandidateActions({ candidateId, hasCall, isActive }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  async function trigger() {
    const again = hasCall ? ' again' : '';
    const warn = isActive ? '\n\nA call is still in progress for this candidate — this starts another one.' : '';
    if (!window.confirm(`Start the AI screening call${again}? This places a real phone call.${warn}`)) return;
    setBusy('trigger');
    setNote(null);
    try {
      const res = await fetch('/api/calls/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: [candidateId], force: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNote({ tone: 'danger', text: body.error || 'Could not start the call.' });
      else if (body.started) setNote({ tone: 'success', text: 'Screening call started.' });
      else setNote({ tone: 'danger', text: body.results?.[0]?.error || 'Call was not started.' });
    } catch {
      setNote({ tone: 'danger', text: 'Network error.' });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function sync() {
    setBusy('sync');
    setNote(null);
    try {
      const res = await fetch('/api/calls/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId }),
      });
      const body = await res.json().catch(() => ({}));
      setNote(res.ok ? { tone: 'success', text: 'Synced from MagickVoice.' } : { tone: 'danger', text: body.error || 'Sync failed.' });
    } catch {
      setNote({ tone: 'danger', text: 'Network error.' });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  return (
    <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
      <div className="row">
        {hasCall && (
          <button className="btn" onClick={sync} disabled={busy !== null}>
            {busy === 'sync' ? 'Syncing…' : 'Sync from MagickVoice'}
          </button>
        )}
        <button className="btn btn-primary" onClick={trigger} disabled={busy !== null}>
          {busy === 'trigger' ? 'Starting…' : hasCall ? 'Call again' : 'Trigger AI call'}
        </button>
      </div>
      {note && <span className={`small ${note.tone === 'danger' ? 'error-text' : 'muted'}`}>{note.text}</span>}
    </div>
  );
}
