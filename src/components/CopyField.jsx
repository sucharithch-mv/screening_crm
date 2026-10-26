'use client';

import { useState } from 'react';

export default function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select the text */
    }
  }
  return (
    <div className="copy-field">
      <input className="input" readOnly value={value} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
