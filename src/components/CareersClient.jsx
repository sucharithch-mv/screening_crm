'use client';

import { useRef, useState } from 'react';

const EMPTY = { name: '', email: '', phone: '', experienceYears: '', currentLocation: '', linkedinUrl: '' };
const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function CareersClient({ jobs, preselectedJobId }) {
  const initialJob = jobs.some((j) => j.id === preselectedJobId) ? String(preselectedJobId) : '';
  const [jobId, setJobId] = useState(initialJob);
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const formRef = useRef(null);
  const fileRef = useRef(null);

  const selectJob = (id) => {
    setJobId(String(id));
    setErrors((e) => ({ ...e, jobId: undefined }));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const pickFile = (f) => {
    if (!f) return;
    setFile(f);
    setErrors((er) => ({ ...er, resume: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setMessage(null);
    const local = {};
    if (!jobId) local.jobId = 'Please choose a position.';
    if (form.name.trim().length < 2) local.name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) local.email = 'Please enter a valid email address.';
    if (form.phone.replace(/\D/g, '').length < 10) local.phone = 'Please enter a valid mobile number.';
    if (!file) local.resume = 'Please attach your resume.';
    else if (file.size > 5 * 1024 * 1024) local.resume = 'Resume must be 5 MB or smaller.';
    if (!consent) local.consent = 'Please agree to receive an AI screening call.';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    const data = new FormData();
    data.set('jobId', jobId);
    for (const [k, v] of Object.entries(form)) data.set(k, v.trim());
    data.set('consent', consent ? 'true' : 'false');
    data.set('resume', file);

    setSubmitting(true);
    try {
      const res = await fetch('/api/applications', { method: 'POST', body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.fields || {});
        setMessage({ tone: 'danger', text: body.error || 'Something went wrong. Please try again.' });
        return;
      }
      setDone(body);
      setForm(EMPTY);
      setFile(null);
      setConsent(false);
    } catch {
      setMessage({ tone: 'danger', text: 'Network error. Please check your connection and try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="container-narrow">
        <div className="card card-body stack" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <h2>Application received</h2>
          <p className="muted">
            Thanks for applying for <strong>{done.jobTitle}</strong>. Your reference is{' '}
            <strong className="mono">{done.reference}</strong>.
          </p>
          <p className="muted">
            If you&apos;re shortlisted, our AI recruiter will call you for a short screening and you&apos;ll get the
            result by email.
          </p>
          <div>
            <button className="btn" onClick={() => setDone(null)}>
              Apply for another role
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 28 }}>
      <section className="stack">
        <h2>Open positions</h2>
        {jobs.length === 0 ? (
          <div className="card empty">No open positions right now. Please check back soon.</div>
        ) : (
          <div className="grid-3">
            {jobs.map((job) => (
              <article key={job.id} className={`card job-card${jobId === String(job.id) ? ' selected' : ''}`}>
                <div>
                  <h3>{job.title}</h3>
                  <div className="muted small">{job.companyName}</div>
                </div>
                <div className="job-meta">
                  {job.location && <span className="badge plain tone-neutral">{job.location}</span>}
                  {job.employmentType && <span className="badge plain tone-neutral">{job.employmentType}</span>}
                  {job.experience && <span className="badge plain tone-info">{job.experience}</span>}
                </div>
                {job.description && <p className="muted small">{job.description}</p>}
                <div style={{ marginTop: 'auto' }}>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => selectJob(job.id)}>
                    {jobId === String(job.id) ? 'Selected' : 'Apply'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {jobs.length > 0 && (
        <section ref={formRef} className="container-narrow" style={{ padding: 0, width: '100%' }}>
          <form className="card" onSubmit={onSubmit} noValidate>
            <div className="card-head">
              <div>
                <h2>Your application</h2>
                <div className="muted small">All fields marked * are required.</div>
              </div>
            </div>
            <div className="card-body stack">
              {message && <div className={`alert tone-${message.tone}`}>{message.text}</div>}

              <div className="field">
                <label className="label" htmlFor="jobId">
                  Position *
                </label>
                <select
                  id="jobId"
                  className={`select${errors.jobId ? ' invalid' : ''}`}
                  value={jobId}
                  onChange={(e) => {
                    setJobId(e.target.value);
                    setErrors((er) => ({ ...er, jobId: undefined }));
                  }}
                >
                  <option value="">Select the job you are applying for…</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} {j.location ? `— ${j.location}` : ''}
                    </option>
                  ))}
                </select>
                {errors.jobId && <span className="error-text">{errors.jobId}</span>}
              </div>

              <div className="grid-2">
                <Field label="Full name *" id="name" error={errors.name}>
                  <input id="name" className={`input${errors.name ? ' invalid' : ''}`} value={form.name} onChange={update('name')} autoComplete="name" />
                </Field>
                <Field label="Email *" id="email" error={errors.email} hint="Your screening result is sent here.">
                  <input id="email" type="email" className={`input${errors.email ? ' invalid' : ''}`} value={form.email} onChange={update('email')} autoComplete="email" />
                </Field>
                <Field label="Mobile number *" id="phone" error={errors.phone} hint="Our AI recruiter will call this number. +91 is added if you skip the country code.">
                  <input id="phone" type="tel" className={`input${errors.phone ? ' invalid' : ''}`} value={form.phone} onChange={update('phone')} placeholder="98765 43210" autoComplete="tel" />
                </Field>
                <Field label="Total experience (years)" id="experienceYears" error={errors.experienceYears}>
                  <input id="experienceYears" type="number" min="0" max="50" step="0.5" className="input" value={form.experienceYears} onChange={update('experienceYears')} />
                </Field>
                <Field label="Current location" id="currentLocation" error={errors.currentLocation}>
                  <input id="currentLocation" className="input" value={form.currentLocation} onChange={update('currentLocation')} placeholder="Hyderabad" />
                </Field>
                <Field label="LinkedIn profile" id="linkedinUrl" error={errors.linkedinUrl}>
                  <input id="linkedinUrl" className="input" value={form.linkedinUrl} onChange={update('linkedinUrl')} placeholder="https://linkedin.com/in/…" />
                </Field>
              </div>

              <div className="field">
                <span className="label">Resume *</span>
                <div
                  className={`dropzone${drag ? ' drag' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    pickFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <input ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => pickFile(e.target.files?.[0])} />
                  {file ? (
                    <div>
                      <div className="strong">{file.name}</div>
                      <div className="muted small">{(file.size / 1024).toFixed(0)} KB · click to replace</div>
                    </div>
                  ) : (
                    <div>
                      <div className="strong">Drop your resume here or click to browse</div>
                      <div className="muted small">PDF, DOC or DOCX · max 5 MB</div>
                    </div>
                  )}
                </div>
                {errors.resume && <span className="error-text">{errors.resume}</span>}
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    setErrors((er) => ({ ...er, consent: undefined }));
                  }}
                />
                <span>
                  I agree to receive a recorded screening call from an AI voice agent on the number above, and to be
                  contacted by email about this application.
                </span>
              </label>
              {errors.consent && <span className="error-text">{errors.consent}</span>}
            </div>
            <div className="card-foot row-between">
              <span className="muted small">We only use your details for this hiring process.</span>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function Field({ label, id, error, hint, children }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
