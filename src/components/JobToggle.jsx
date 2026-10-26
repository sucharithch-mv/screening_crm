'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JobToggle({ jobId, isOpen }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOpen: !isOpen }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not update the job.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-sm">
      <button
        className={`badge plain ${isOpen ? 'tone-success' : 'tone-neutral'}`}
        style={{ cursor: 'pointer' }}
        onClick={toggle}
        disabled={busy}
        title={isOpen ? 'Click to close this job' : 'Click to reopen this job'}
      >
        {busy ? '…' : isOpen ? 'Open' : 'Closed'}
      </button>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
