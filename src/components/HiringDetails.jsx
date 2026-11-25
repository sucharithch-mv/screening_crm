'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Notice period and pay — filled by the candidate, editable by the recruiter (used in Compare). */
export default function HiringDetails({ candidateId, values }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(values);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    await fetch(`/api/candidates/${candidateId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setBusy(false);
    setEdit(false);
    router.refresh();
  }

  const fields = [
    ['noticePeriod', 'Notice period', 'e.g. 30 days'],
    ['currentCtc', 'Current CTC', 'e.g. ₹8 LPA'],
    ['expectedCtc', 'Expected CTC', 'e.g. ₹12 LPA'],
  ];

  if (!edit) {
    return (
      <>
        {fields.map(([k, label]) => (
          <FragmentKV key={k} k={label} v={values[k]} />
        ))}
        <dt />
        <dd>
          <button className="link-btn small" onClick={() => setEdit(true)}>
            Edit notice period / pay
          </button>
        </dd>
      </>
    );
  }
  return (
    <>
      <dt>Hiring details</dt>
      <dd>
        <form onSubmit={save} className="stack-sm">
          {fields.map(([k, label, ph]) => (
            <input key={k} className="input input-sm" aria-label={label} placeholder={`${label} — ${ph}`} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          ))}
          <div className="row">
            <button className="btn btn-sm btn-primary" disabled={busy}>
              Save
            </button>
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => setEdit(false)}>
              Cancel
            </button>
          </div>
        </form>
      </dd>
    </>
  );
}

function FragmentKV({ k, v }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v || <span className="muted">—</span>}</dd>
    </>
  );
}
