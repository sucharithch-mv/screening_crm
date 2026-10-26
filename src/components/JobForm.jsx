'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JobForm({ defaults }) {
  const router = useRouter();
  const blank = {
    title: '',
    companyName: defaults.companyName || '',
    agentName: defaults.agentName || '',
    location: '',
    employmentType: 'Full-time',
    experience: '',
    description: '',
  };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setMsg(null);
    if (form.title.trim().length < 2) {
      setMsg({ tone: 'danger', text: 'Job title is required.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ tone: 'danger', text: body.error || 'Could not create job.' });
      else {
        setMsg({ tone: 'success', text: `“${body.job.title}” is live on the careers page.` });
        setForm(blank);
        router.refresh();
      }
    } catch {
      setMsg({ tone: 'danger', text: 'Network error.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="card-head">
        <h3>Post a job</h3>
      </div>
      <div className="card-body stack">
        {msg && <div className={`alert tone-${msg.tone}`}>{msg.text}</div>}
        <div className="field">
          <label className="label" htmlFor="title">
            Job title * <span className="muted">(job_role)</span>
          </label>
          <input id="title" className="input" value={form.title} onChange={set('title')} placeholder="Data Engineer" />
        </div>
        <div className="field">
          <label className="label" htmlFor="companyName">
            Company <span className="muted">(company_name)</span>
          </label>
          <input id="companyName" className="input" value={form.companyName} onChange={set('companyName')} />
        </div>
        <div className="field">
          <label className="label" htmlFor="agentName">
            AI agent name <span className="muted">(agent_name)</span>
          </label>
          <input id="agentName" className="input" value={form.agentName} onChange={set('agentName')} />
          <span className="hint">The name the voice agent introduces itself with.</span>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="location">
              Location
            </label>
            <input id="location" className="input" value={form.location} onChange={set('location')} placeholder="Hyderabad · Hybrid" />
          </div>
          <div className="field">
            <label className="label" htmlFor="experience">
              Experience
            </label>
            <input id="experience" className="input" value={form.experience} onChange={set('experience')} placeholder="2–5 years" />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="employmentType">
            Employment type
          </label>
          <select id="employmentType" className="select" value={form.employmentType} onChange={set('employmentType')}>
            <option>Full-time</option>
            <option>Part-time</option>
            <option>Contract</option>
            <option>Internship</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="description">
            Description
          </label>
          <textarea id="description" className="textarea" value={form.description} onChange={set('description')} />
        </div>
      </div>
      <div className="card-foot" style={{ textAlign: 'right' }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Create job'}
        </button>
      </div>
    </form>
  );
}
