'use client';

import { useState } from 'react';
import EmailReviewDialog from './EmailReviewDialog.jsx';

export default function ReviewEmailButton({ candidateId, candidateName, label = 'Review & send', primary = true }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  return (
    <>
      <button className={`btn btn-sm${primary ? ' btn-primary' : ''}`} onClick={() => setOpen(true)}>
        {label}
      </button>
      {msg && <span className="small muted">{msg}</span>}
      {open && (
        <EmailReviewDialog
          candidateId={candidateId}
          candidateName={candidateName}
          onClose={(m) => {
            setOpen(false);
            if (m) setMsg(m);
          }}
        />
      )}
    </>
  );
}
