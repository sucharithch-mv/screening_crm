import { listCandidates, listJobs } from '../../../lib/db.js';
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
  const jobs = listJobs().map((j) => ({ id: j.id, title: j.title }));
  const missing = missingMagickVoiceSettings(cfg);
  const voiceSummary = describeVoiceSettings();

  const stats = {
    total: candidates.length,
    called: candidates.filter((c) => c.latestCallId).length,
    qualified: candidates.filter((c) => c.stage === 'qualified').length,
    disqualified: candidates.filter((c) => c.stage === 'disqualified').length,
    emailsSent: candidates.filter((c) => c.emailStatus === 'sent').length,
  };

  const rows = candidates.map((c) => ({
    id: c.id,
    ref: c.ref,
    name: c.name,
    email: c.email,
    phone: c.phone,
    experienceYears: c.experienceYears,
    jobId: c.jobId,
    jobTitle: c.jobTitle,
    stage: c.stage,
    decision: c.screening?.decision || null,
    score: c.screening?.score ?? null,
    emailStatus: c.emailStatus,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    lastCallError: c.latestCall?.error || null,
    hasResume: !!c.resume,
  }));

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

      <div className="stats">
        <Stat label="Applicants" value={stats.total} />
        <Stat label="Screening calls" value={stats.called} />
        <Stat label="Qualified" value={stats.qualified} tone="var(--success)" />
        <Stat label="Disqualified" value={stats.disqualified} tone="var(--danger)" />
        <Stat label="Result emails sent" value={stats.emailsSent} />
      </div>

      <CandidatesTable rows={rows} jobs={jobs} callerId={cfg.mv.callerId} voiceSummary={voiceSummary} initialJob={initialJob} />
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  );
}
