'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** "Review & send": preview the result email, edit it, then send (SMTP) or record that it was sent. */
export default function EmailReviewDialog({ candidateId, candidateName, onClose }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({ to: '', subject: '', body: '' });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/candidates/${candidateId}/email`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!alive) return;
        if (!ok) return setError(b.error || 'Could not load the email.');
        setData(b);
        setDraft({ to: b.email.to || '', subject: b.email.subject, body: b.email.body });
      })
      .catch(() => alive && setError('Network error.'));
    return () => {
      alive = false;
    };
  }, [candidateId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(action) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...draft }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) return setError(b.error || 'Could not send.');
      router.refresh();
      onClose(action === 'send' ? 'Email sent.' : 'Marked as sent.');
    } catch {
      setError('Network error.');
    } finally {
      setBusy(null);
    }
  }

  const mailto = `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  const decision = data?.email?.decision;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="email-review-title">
        <div className="card-head">
          <div>
            <h3 id="email-review-title">Review result email</h3>
            <div className="muted small">
              {candidateName}
              {decision ? ` · ${decision === 'QUALIFIED' ? 'Qualified' : decision === 'DISQUALIFIED' ? 'Disqualified' : decision.replace(/_/g, ' ')} template` : ''}
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => onClose()} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="card-body stack">
          {!data && !error && <p className="muted">Loading preview…</p>}
          {error && <div className="alert tone-danger">{error}</div>}
          {data && (
            <>
              <div className="field">
                <label className="label" htmlFor="er-to">To</label>
                <input id="er-to" className="input" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="er-subject">Subject</label>
                <input id="er-subject" className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="er-body">Message</label>
                <textarea id="er-body" className="textarea" rows={11} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              </div>
              {!data.canSend && (
                <div className="alert tone-info small">
                  Direct sending isn&apos;t set up (add <code>SMTP_HOST</code> and <code>SMTP_FROM</code> to <code>.env</code>). Open the
                  draft in your mail app, send it, then mark it as sent here.
                </div>
              )}
            </>
          )}
        </div>
        <div className="card-foot row-between">
          <button className="btn btn-ghost btn-sm" onClick={() => onClose()}>
            Cancel
          </button>
          {data && (
            <div className="row">
              {!data.canSend && (
                <a className="btn" href={mailto}>
                  Open in mail app
                </a>
              )}
              <button className="btn" onClick={() => submit('mark_sent')} disabled={busy !== null}>
                {busy === 'mark_sent' ? 'Saving…' : 'Mark as sent'}
              </button>
              {data.canSend && (
                <button className="btn btn-primary" onClick={() => submit('send')} disabled={busy !== null}>
                  {busy === 'send' ? 'Sending…' : 'Send email'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
