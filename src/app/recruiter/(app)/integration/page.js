import {
  KNOWN_VOICE_STACKS,
  activeVoiceSettings,
  getConfig,
  isPublicHttps,
  missingMagickVoiceSettings,
  voiceSettingsWarnings,
  webhookUrl,
} from '../../../../lib/config.js';
import { listWebhookEvents } from '../../../../lib/db.js';
import { requireRecruiterPage } from '../../../../lib/page-auth.js';
import { formatDateTime } from '../../../../lib/format.js';
import { ToneBadge } from '../../../../components/Badges.jsx';
import CopyField from '../../../../components/CopyField.jsx';
import TestConnection from '../../../../components/TestConnection.jsx';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const mask = (v) => (v ? `${v.slice(0, 10)}…${v.slice(-4)}` : null);

export default async function IntegrationPage() {
  await requireRecruiterPage();
  const cfg = getConfig();
  const missing = missingMagickVoiceSettings(cfg);
  const voice = activeVoiceSettings(cfg);
  const voiceWarnings = voiceSettingsWarnings(voice);
  const hookUrl = webhookUrl(cfg);
  const reachable = isPublicHttps(cfg.publicBaseUrl);
  const events = listWebhookEvents(25);
  const promptUrl = `${cfg.mv.appBase}/t/${cfg.mv.tenantId}/a/${cfg.mv.accountId}/app/automations/new`;

  const rows = [
    ['API base URL', cfg.mv.apiBase],
    ['API key', mask(cfg.mv.apiKey)],
    ['Tenant id', cfg.mv.tenantId],
    ['Account id', cfg.mv.accountId],
    ['Call script id', cfg.mv.promptId],
    ['Caller id', cfg.mv.callerId],
    ['AI quality', voice.pipeline],
    ...(voice.isCustom
      ? [['Voice stack', voice.voiceStackId ? `${voice.voiceStackName ? `${voice.voiceStackName} · ` : ''}${voice.voiceStackId}` : null]]
      : []),
    ['Voice', voice.voice || 'default'],
    ['Language', voice.language || 'default'],
    ['Automation ids', cfg.mv.automationIds.join(', ') || null],
    ['Webhook signing secret', cfg.mv.webhookSecret ? 'set' : null],
  ];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <h1>MagickVoice integration</h1>
        <p className="muted mt-8">
          Values come from <code>.env</code>. Edit the file and restart the app to change them.
        </p>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h3>Connection</h3>
            {missing.length ? <ToneBadge tone="warning">Incomplete</ToneBadge> : <ToneBadge tone="success">Configured</ToneBadge>}
          </div>
          <div className="card-body">
            <dl className="kv">
              {rows.map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
            </dl>
            {voiceWarnings.map((w) => (
              <div key={w} className="alert tone-warning small mt-16">
                {w}
              </div>
            ))}
          </div>
          <div className="card-foot stack-sm">
            <span className="muted small">
              Sent as <code>X-Platform-Key</code>, <code>X-Tenant-Id</code> and <code>X-Account-Id</code> headers.
            </span>
            <TestConnection disabled={missing.length > 0} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Webhook for MagickVoice</h3>
            {reachable ? <ToneBadge tone="success">Public</ToneBadge> : <ToneBadge tone="warning">Not reachable</ToneBadge>}
          </div>
          <div className="card-body stack">
            <p className="small">Paste this URL into the Webhook step of your MagickVoice automation (method POST, body blank).</p>
            <CopyField value={hookUrl} />
            {!reachable && (
              <div className="alert tone-warning small">
                <code>PUBLIC_BASE_URL</code> is <code>{cfg.publicBaseUrl}</code>. MagickVoice only posts to public{' '}
                <code>https://</code> URLs, so deploy the app or run a tunnel (e.g. <code>ngrok http 3000</code>) and set{' '}
                <code>PUBLIC_BASE_URL</code> to that URL. Until then use “Sync results” on the candidates page.
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>AI quality: Platinum or Custom</h3>
          <ToneBadge tone="info">Using {voice.isCustom ? 'Custom' : voice.pipeline === 'platinum' ? 'Platinum' : voice.pipeline}</ToneBadge>
        </div>
        <div className="card-body small stack">
          <div className="grid-2">
            <div className="stack-sm">
              <div className="strong">Platinum</div>
              <pre className="mono" style={{ margin: 0, background: 'var(--surface-2)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
{`MAGICKVOICE_AI_PIPELINE=platinum
MAGICKVOICE_PLATINUM_VOICE=Kore      # optional
MAGICKVOICE_PLATINUM_LANGUAGE=en     # optional`}
              </pre>
              <span className="muted">Voices include Kore (default), Aoede, Charon, Fenrir, Puck, Zephyr…</span>
            </div>
            <div className="stack-sm">
              <div className="strong">Custom (your voice stack)</div>
              <pre className="mono" style={{ margin: 0, background: 'var(--surface-2)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
{`MAGICKVOICE_AI_PIPELINE=custom
MAGICKVOICE_CUSTOM_VOICE_STACK_ID=<stack id>
MAGICKVOICE_CUSTOM_VOICE=anushka     # voice id
MAGICKVOICE_CUSTOM_LANGUAGE=en`}
              </pre>
              <span className="muted">Restart the app after changing .env.</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Voice stack</th>
                  <th>Id</th>
                  <th>Languages</th>
                  <th>Voices</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(KNOWN_VOICE_STACKS).map(([id, s]) => (
                  <tr key={id} className={voice.isCustom && voice.voiceStackId === id ? 'selected' : ''}>
                    <td className="strong">{s.name}</td>
                    <td className="mono">{id}</td>
                    <td>{s.languages.join(', ')}</td>
                    <td>{s.voices ? s.voices.join(', ') : 'voice ids (UUIDs) from the MagickVoice Voice dropdown'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Set up the automation in MagickVoice (one time)</h3>
          <a className="btn btn-sm" href={promptUrl} target="_blank" rel="noreferrer">
            Open Automations ↗
          </a>
        </div>
        <div className="card-body small stack-sm">
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>
              <strong>Trigger:</strong> “After analysis is ready”.
            </li>
            <li>
              <strong>Step 1 – Email</strong> (qualified): To <code>{'{{callee.metadata.candidate_email}}'}</code>; “Only run if”{' '}
              <code>analysis.dimensions.screening_status = QUALIFIED</code>.
            </li>
            <li>
              <strong>Step 2 – Email</strong> (disqualified): same recipient; “Only run if”{' '}
              <code>analysis.dimensions.screening_status = DISQUALIFIED</code>.
            </li>
            <li>
              <strong>Step 3 – Webhook</strong>: POST to the URL above, leave body blank (default JSON envelope). Optionally
              generate a signing secret and put it in <code>MAGICKVOICE_WEBHOOK_SECRET</code>.
            </li>
            <li>
              Save, copy the automation id into <code>MAGICKVOICE_AUTOMATION_IDS</code> and restart. Every call the CRM
              starts will attach it.
            </li>
          </ol>
          <p className="muted">
            Check the exact dimension key with the automation’s Dry-run → “A recent run” context. The CRM accepts any
            casing (Screening Status, screening_status…).
          </p>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Recent webhook deliveries</h3>
          <span className="muted small">{events.length}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Event</th>
                <th>Matched</th>
                <th>Candidate</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    No webhook deliveries yet.
                  </td>
                </tr>
              )}
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="small nowrap">{formatDateTime(e.receivedAt)}</td>
                  <td className="small">{e.event || '—'}</td>
                  <td>{e.matched ? <ToneBadge tone="success">Yes</ToneBadge> : <ToneBadge tone="warning">No</ToneBadge>}</td>
                  <td className="small">
                    {e.candidateId ? <Link href={`/recruiter/candidates/${e.candidateId}`}>#{e.candidateId}</Link> : '—'}
                  </td>
                  <td style={{ maxWidth: 420 }}>
                    <details className="raw">
                      <summary>View</summary>
                      <pre>{JSON.stringify(e.payload, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <>
      <dt>{k}</dt>
      <dd className={v ? 'mono' : 'muted'}>{v || 'not set'}</dd>
    </>
  );
}
