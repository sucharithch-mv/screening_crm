import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCandidate } from '../../../../../lib/db.js';
import { magickVoiceCallUrl } from '../../../../../lib/config.js';
import { requireRecruiterPage } from '../../../../../lib/page-auth.js';
import { formatBytes, formatDateTime, formatDuration, titleCase } from '../../../../../lib/format.js';
import { DecisionBadge, EmailBadge, StageBadge, ToneBadge } from '../../../../../components/Badges.jsx';
import CandidateActions from '../../../../../components/CandidateActions.jsx';
import AutoRefresh from '../../../../../components/AutoRefresh.jsx';

export const dynamic = 'force-dynamic';

const ACTIVE = new Set(['call_queued', 'call_in_progress', 'awaiting_analysis']);
// Shown elsewhere on the card (score ring, badges, summary)
const SKIP_DIMENSIONS = new Set(['call_summary', 'screening_status', 'score_percentage', 'integrity_flag', 'adequate_answer_count']);

function qClass(result) {
  const r = String(result || '').toUpperCase();
  if (r.startsWith('ADEQUATE') || r === 'CORRECT' || r === 'GOOD') return 'q-adequate';
  if (r.startsWith('INADEQUATE') || r === 'INCORRECT' || r === 'WRONG') return 'q-inadequate';
  if (r.startsWith('PARTIAL')) return 'q-partial';
  return 'q-skipped';
}

export default async function CandidatePage({ params }) {
  await requireRecruiterPage();
  const { id } = await params;
  const c = getCandidate(id);
  if (!c) notFound();

  const latest = c.calls.find((k) => k.id === c.latestCallId) || c.calls[0] || null;
  const analysis = latest?.analysis || null;
  const score = analysis?.score;
  const ringColor = analysis?.decision === 'QUALIFIED' ? 'var(--success)' : analysis?.decision === 'DISQUALIFIED' ? 'var(--danger)' : 'var(--primary)';
  const otherDims = analysis
    ? Object.entries(analysis.dimensions || {}).filter(([k, v]) => !/^q\d+(_result)?$/.test(k) && !SKIP_DIMENSIONS.has(k) && v !== '' && v != null)
    : [];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <AutoRefresh enabled={ACTIVE.has(c.stage)} />
      <div className="small">
        <Link href="/recruiter">← All candidates</Link>
      </div>

      <div className="row-between">
        <div>
          <div className="row wrap">
            <h1>{c.name}</h1>
            <StageBadge stage={c.stage} />
          </div>
          <p className="muted mt-8">
            {c.ref} · Applied for <strong>{c.job?.title || '—'}</strong> on {formatDateTime(c.createdAt)}
          </p>
        </div>
        <CandidateActions candidateId={c.id} hasCall={!!c.latestCallId} isActive={ACTIVE.has(c.stage)} />
      </div>

      <div className="detail-grid">
        {/* ── Left column: profile ───────────────────── */}
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h3>Profile</h3>
            </div>
            <div className="card-body">
              <dl className="kv">
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${c.email}`}>{c.email}</a>
                </dd>
                <dt>Phone</dt>
                <dd className="mono">{c.phone}</dd>
                <dt>Experience</dt>
                <dd>{c.experienceYears != null ? `${c.experienceYears} years` : '—'}</dd>
                <dt>Location</dt>
                <dd>{c.currentLocation || '—'}</dd>
                <dt>LinkedIn</dt>
                <dd>
                  {c.linkedinUrl ? (
                    <a href={c.linkedinUrl} target="_blank" rel="noreferrer noopener">
                      Profile ↗
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
                <dt>Call consent</dt>
                <dd>{c.consentToCall ? 'Yes' : 'No'}</dd>
              </dl>
            </div>
            <div className="card-foot row-between">
              <div className="small">
                <div className="strong">{c.resume?.originalName || 'No resume'}</div>
                <div className="muted">{formatBytes(c.resume?.size)}</div>
              </div>
              {c.resume && (
                <div className="row">
                  {c.resume.mimeType === 'application/pdf' && (
                    <a className="btn btn-sm" href={`/api/candidates/${c.id}/resume?inline=1`} target="_blank" rel="noreferrer">
                      View
                    </a>
                  )}
                  <a className="btn btn-sm" href={`/api/candidates/${c.id}/resume`}>
                    Download
                  </a>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Result email</h3>
              <EmailBadge status={c.emailStatus} />
            </div>
            <div className="card-body small">
              {c.emailStatusDetail ? (
                <p>{c.emailStatusDetail}</p>
              ) : (
                <p className="muted">The qualified / disqualified email is sent by MagickVoice after the screening call.</p>
              )}
              {c.emailUpdatedAt && <p className="muted mt-8">Updated {formatDateTime(c.emailUpdatedAt)}</p>}
              <p className="muted mt-8">
                To: <span className="mono">{analysis?.confirmedEmail || c.email}</span>
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Variables sent to the AI agent</h3>
            </div>
            <div className="card-body">
              {latest?.variables && Object.keys(latest.variables).length ? (
                <dl className="kv">
                  {Object.entries(latest.variables).map(([k, v]) => (
                    <FragmentKV key={k} k={k} v={v} />
                  ))}
                </dl>
              ) : (
                <p className="muted small">Sent when you trigger a screening call.</p>
              )}
            </div>
          </section>
        </div>

        {/* ── Right column: screening ────────────────── */}
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h3>AI screening result</h3>
              <DecisionBadge decision={analysis?.decision} />
            </div>
            <div className="card-body stack">
              {!latest && <p className="muted">No screening call yet. Use “Trigger AI call” to start one.</p>}
              {latest && !analysis && (
                <p className="muted">
                  {ACTIVE.has(c.stage)
                    ? 'The call is in progress. Results appear here as soon as MagickVoice finishes the post-call analysis.'
                    : latest.error || 'No analysis received for this call.'}
                </p>
              )}
              {analysis && (
                <>
                  <div className="result-hero">
                    <div className="score-ring" style={{ '--p': Math.max(0, Math.min(100, score ?? 0)), '--ring-color': ringColor }}>
                      <span>{score != null ? `${score}%` : '—'}</span>
                    </div>
                    <div className="stack-sm" style={{ flex: 1, minWidth: 220 }}>
                      <div className="row wrap">
                        <DecisionBadge decision={analysis.decision} />
                        {analysis.integrityFlag && (
                          <ToneBadge tone={String(analysis.integrityFlag).toUpperCase() === 'NONE' ? 'neutral' : 'warning'}>
                            Integrity: {analysis.integrityFlag}
                          </ToneBadge>
                        )}
                        {analysis.sentiment && <ToneBadge>Sentiment: {analysis.sentiment}</ToneBadge>}
                        {analysis.adequateAnswers != null && <ToneBadge tone="info">{analysis.adequateAnswers} adequate answers</ToneBadge>}
                      </div>
                      {analysis.summary && <p>{analysis.summary}</p>}
                    </div>
                  </div>

                  {analysis.questions?.length > 0 && (
                    <div className="stack-sm">
                      <div className="label">Question-by-question</div>
                      <div className="q-grid">
                        {analysis.questions.map((q) => (
                          <div key={q.number} className="q-cell">
                            <div className="q-num">Q{q.number}</div>
                            <div className={`q-res ${qClass(q.result)}`}>{q.result}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {otherDims.length > 0 && (
                    <dl className="kv">
                      {otherDims.map(([k, v]) => (
                        <FragmentKV key={k} k={titleCase(k)} v={typeof v === 'object' ? JSON.stringify(v) : String(v)} />
                      ))}
                    </dl>
                  )}

                  {analysis.keyTopics?.length > 0 && (
                    <div className="row wrap">
                      {analysis.keyTopics.map((t, i) => (
                        <ToneBadge key={i}>{typeof t === 'string' ? t : JSON.stringify(t)}</ToneBadge>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Call attempts</h3>
              <span className="muted small">{c.calls.length}</span>
            </div>
            <div className="card-body">
              {c.calls.length === 0 ? (
                <p className="muted small">No calls yet.</p>
              ) : (
                <div className="timeline">
                  {c.calls.map((k) => {
                    const url = magickVoiceCallUrl(k.mvCallId);
                    return (
                      <div key={k.id} className="timeline-item">
                        <span className="timeline-dot" />
                        <div className="stack-sm">
                          <div className="row-between">
                            <div className="row wrap">
                              <StageBadge stage={k.stage} />
                              <span className="small muted">status: {k.status || '—'}</span>
                            </div>
                            <span className="small muted">{formatDateTime(k.createdAt)}</span>
                          </div>
                          <div className="small muted">
                            MagickVoice call:{' '}
                            {url ? (
                              <a href={url} target="_blank" rel="noreferrer">
                                <span className="mono">{String(k.mvCallId).slice(0, 8)}</span> ↗
                              </a>
                            ) : (
                              '—'
                            )}
                            {k.request?.config?.ai_pipeline && (
                              <>
                                {' · '}
                                {k.request.config.ai_pipeline}
                                {k.request.config.voice ? ` / ${k.request.config.voice}` : ''}
                                {k.request.recipient?.language ? ` / ${k.request.recipient.language}` : ''}
                              </>
                            )}
                            {' · '}talk time {formatDuration(k.talkTimeSeconds ?? k.durationSeconds)}
                            {k.recordingUrl && (
                              <>
                                {' · '}
                                <a href={k.recordingUrl} target="_blank" rel="noreferrer">
                                  Recording ↗
                                </a>
                              </>
                            )}
                          </div>
                          {k.error && <div className="error-text">{k.error}</div>}
                          <details className="raw">
                            <summary>Request sent to MagickVoice</summary>
                            <pre>{JSON.stringify(k.request, null, 2)}</pre>
                          </details>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Webhook events</h3>
              <span className="muted small">{c.events.length}</span>
            </div>
            <div className="card-body">
              {c.events.length === 0 ? (
                <p className="muted small">Nothing received from MagickVoice yet.</p>
              ) : (
                <div className="timeline">
                  {c.events.slice(0, 20).map((e) => (
                    <div key={e.id} className="timeline-item">
                      <span className="timeline-dot" />
                      <div className="stack-sm">
                        <div className="row-between">
                          <span className="strong small">{e.event || 'webhook'}</span>
                          <span className="small muted">{formatDateTime(e.receivedAt)}</span>
                        </div>
                        <div className="row wrap">
                          {e.stage && <StageBadge stage={e.stage} />}
                          {e.emailStatus && <EmailBadge status={e.emailStatus} />}
                        </div>
                        <details className="raw">
                          <summary>Payload</summary>
                          <pre>{JSON.stringify(e.payload, null, 2)}</pre>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function FragmentKV({ k, v }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v === '' || v == null ? '—' : String(v)}</dd>
    </>
  );
}
