'use client';

import { useState } from 'react';

export default function TestConnection({ disabled }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setState(null);
    try {
      const res = await fetch('/api/integration/test', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setState({
          tone: 'success',
          text: body.balance != null ? `Connected. Credits available: ${body.balance}` : 'Connected to MagickVoice.',
        });
      } else setState({ tone: 'danger', text: body.error || 'Connection failed.' });
    } catch {
      setState({ tone: 'danger', text: 'Network error.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row-between">
      <span className={`small ${state?.tone === 'danger' ? 'error-text' : state ? '' : 'muted'}`}>
        {state ? state.text : 'Checks the API key with a read-only request.'}
      </span>
      <button className="btn btn-sm" onClick={run} disabled={busy || disabled}>
        {busy ? 'Testing…' : 'Test connection'}
      </button>
    </div>
  );
}
