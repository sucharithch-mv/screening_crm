'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RecalcMatchButton({ candidateId, label = 'Recalculate' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-sm btn-ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/candidates/${candidateId}/match`, { method: 'POST' });
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? 'Reading resume…' : label}
    </button>
  );
}
