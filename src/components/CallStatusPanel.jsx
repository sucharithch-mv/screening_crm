'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatElapsed } from '../lib/ui.js';

/**
 * Status line under the candidate header:
 *   • "Attempt 2/3" for the current round of calls
 *   • live "Analysing for 1m 20s" → after the timeout, a warning with a Retry button
 *   • Not connected → Retry call now / auto-retry countdown / cancel
 */
export default function CallStatusPanel({ candidateId, stage, attempt, maxAttempts, nextRetryAt, analysingSince, timeoutMinutes, autoRetry }) {
  const router = useRouter();
  const [now, setNow] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  useEffect(() => {
    setNow(Date.now());
    if (!analysingSince && !nextRetryAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [analysingSince, nextRetryAt]);

  async function post(url, body, key) {
    setBusy(key);
    setNote(null);
    try {
      const res = await fetch(url, { method: body ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || { cancelAutoRetry: true }) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) setNote({ tone: 'danger', text: b.error || 'Request failed.' });
      else if (key === 'sync') setNote({ tone: 'muted', text: b.stage === 'awaiting_analysis' ? 'MagickVoice is still analysing the call.' : 'Result fetched.' });
      else if (key === 'retry') setNote(b.started ? { tone: 'muted', text: 'Calling again…' } : { tone: 'danger', text: b.results?.[0]?.error || 'Call was not started.' });
    } catch {
      setNote({ tone: 'danger', text: 'Network error.' });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  const analysingMs = analysingSince && now ? now - new Date(analysingSince).getTime() : null;
  const late = analysingMs != null && analysingMs > timeoutMinutes * 60000;
  const retryIn = nextRetryAt && now ? new Date(nextRetryAt).getTime() - now : null;
  const showAttempt = attempt > 0 && ['call_queued', 'call_in_progress', 'awaiting_analysis', 'call_failed', 'trigger_failed'].includes(stage);

  if (!showAttempt && analysingMs == null) return null;

  return (
    <div className={`alert ${late ? 'tone-warning' : stage === 'call_failed' ? 'tone-warning' : 'tone-info'} row-between`}>
      <div className="stack-sm" style={{ gap: 2 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          {showAttempt && <strong>Attempt {attempt}/{Math.max(maxAttempts, attempt)}</strong>}
          {analysingMs != null && (
            <span>
              {late ? (
                <>
                  <strong>Analysis taking longer than expected</strong> — {formatElapsed(analysingMs)} so far
                </>
              ) : (
                <>Analysing call · {formatElapsed(analysingMs)}</>
              )}
            </span>
          )}
          {stage === 'call_failed' && <span>The candidate didn&apos;t pick up (busy / no answer / unreachable).</span>}
        </div>
        {stage === 'call_failed' && (
          <span className="small" suppressHydrationWarning>
            {nextRetryAt
              ? `Automatic retry ${retryIn != null && retryIn > 0 ? `in ${formatElapsed(retryIn)}` : 'is due now'}.`
              : attempt >= maxAttempts
                ? `All ${maxAttempts} attempts used — no more automatic retries.`
                : autoRetry
                  ? 'No automatic retry scheduled.'
                  : 'Automatic retries are turned off.'}
          </span>
        )}
        {note && <span className={`small ${note.tone === 'danger' ? 'error-text' : ''}`}>{note.text}</span>}
      </div>
      <div className="row">
        {late && (
          <button className="btn btn-sm" onClick={() => post('/api/calls/sync', { candidateId }, 'sync')} disabled={busy !== null}>
            {busy === 'sync' ? 'Checking…' : 'Retry'}
          </button>
        )}
        {stage === 'call_failed' && nextRetryAt && (
          <button className="btn btn-sm btn-ghost" onClick={() => post(`/api/candidates/${candidateId}`, null, 'cancel')} disabled={busy !== null}>
            Cancel auto-retry
          </button>
        )}
        {stage === 'call_failed' && (
          <button
            className="btn btn-sm btn-primary"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm(`Call again now (attempt ${attempt + 1})? This places a real phone call.`)) {
                post('/api/calls/trigger', { candidateIds: [candidateId], trigger: 'retry' }, 'retry');
              }
            }}
          >
            {busy === 'retry' ? 'Calling…' : 'Retry call now'}
          </button>
        )}
      </div>
    </div>
  );
}
