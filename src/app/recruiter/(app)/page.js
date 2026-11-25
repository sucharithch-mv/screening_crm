import { listCandidates, listDrafts, listJobs } from '../../../lib/db.js';
import { formatDateTime } from '../../../lib/format.js';
import { describeVoiceSettings, getConfig, isPublicHttps, missingMagickVoiceSettings } from '../../../lib/config.js';
import { requireRecruiterPage } from '../../../lib/page-auth.js';
import CandidatesTable from '../../../components/CandidatesTable.jsx';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }) {
  await requireRecruiterPage();
  const params = (await searchParams) || {};
  const initialJob = params.job ? String(params.job) : '';
  const cfg = getConfig();
  const candidates = listCandidates();
  const jobs = listJobs().map((j) => ({ id: j.id, title: j.title, isOpen: j.isOpen }));
  const missing = missingMagickVoiceSettings(cfg);
  const voiceSummary = describeVoiceSettings();

  const drafts = listDrafts();

  const rows = candidates.map((c) => ({
    id: c.id,
    ref: c.ref,
    name: c.name,
    email: c.email,
    phone: c.phone,
    personKey: c.personKey,
    experienceYears: c.experienceYears,
    currentLocation: c.currentLocation,
    noticePeriod: c.noticePeriod || '',
    currentCtc: c.currentCtc || '',
    expectedCtc: c.expectedCtc || '',
    jobId: c.jobId,
    jobTitle: c.jobTitle,
    stage: c.stage,
    decision: c.screening?.decision || null,
    score: c.screening?.score ?? null,
    summary: c.screening?.summary || '',
    manualScore: c.manualScore || null,
    resumeMatch: c.resumeMatch
      ? { score: c.resumeMatch.score, level: c.resumeMatch.level, reasons: c.resumeMatch.reasons, missing: c.resumeMatch.missing }
      : null,
    emailStatus: c.emailStatus,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    connected: c.connected,
    callAttempt: c.callAttempt,
    nextRetryAt: c.nextRetryAt || null,
    latestCall: c.latestCall
      ? { createdAt: c.latestCall.createdAt, updatedAt: c.latestCall.updatedAt, analysisStartedAt: c.latestCall.analysisStartedAt }
      : null,
    lastCallError: c.latestCall?.error || null,
    notesCount: c.notesCount,
    hasResume: !!c.resume,
  }));
  const settings = {
    maxAttempts: cfg.calls.maxAttempts,
    retryDelayMinutes: cfg.calls.retryDelayMinutes,
    autoRetry: cfg.calls.autoRetry,
    analysisTimeoutMinutes: cfg.calls.analysisTimeoutMinutes,
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row-between">
        <div>
          <h1>Candidates</h1>
          <p className="muted mt-8">Select applicants and launch AI screening calls. Results and emails update automatically.</p>
        </div>
        <Link href="/recruiter/integration" className="badge plain tone-info" title="AI quality used for new calls (set in .env)">
          AI quality: {voiceSummary}
        </Link>
      </div>

      {missing.length > 0 && (
        <div className="alert tone-warning">
          MagickVoice isn&apos;t fully configured — missing <strong>{missing.join(', ')}</strong>. Add it to{' '}
          <code>.env</code> and restart. <Link href="/recruiter/integration">Integration settings →</Link>
        </div>
      )}
      {missing.length === 0 && !isPublicHttps(cfg.publicBaseUrl) && (
        <div className="alert tone-info">
          <strong>PUBLIC_BASE_URL</strong> is <code>{cfg.publicBaseUrl}</code>, which MagickVoice can&apos;t reach, so
          results won&apos;t arrive by webhook. Use <strong>Sync results</strong> to pull them, or expose the app over
          https. <Link href="/recruiter/integration">Details →</Link>
        </div>
      )}

      <CandidatesTable
        rows={rows}
        jobs={jobs}
        callerId={cfg.mv.callerId}
        voiceSummary={voiceSummary}
        initialJob={initialJob}
        settings={settings}
      />

      <p className="small muted">
        Busy / no-answer calls are retried automatically{' '}
        {cfg.calls.autoRetry
          ? `up to ${cfg.calls.maxAttempts} attempts, ${cfg.calls.retryDelayMinutes} min apart`
          : '— turned off (CALL_AUTO_RETRY=false)'}
        . Change this in <code>.env</code>.
      </p>

      {drafts.length > 0 && (
        <details className="card">
          <summary className="card-head" style={{ cursor: 'pointer' }}>
            <h3>Unfinished applications</h3>
            <span className="muted small">{drafts.length} saved to finish later</span>
          </summary>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Job</th>
                  <th>Last saved</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.token}>
                    <td>{d.name || '—'}</td>
                    <td>{d.email ? <a href={`mailto:${d.email}`}>{d.email}</a> : '—'}</td>
                    <td className="mono">{d.phone || '—'}</td>
                    <td>{d.jobTitle}</td>
                    <td className="small nowrap">{formatDateTime(d.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
