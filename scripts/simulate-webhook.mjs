/**
 * Sends a fake MagickVoice "analysis ready" automation webhook to your running CRM,
 * so you can see the full flow without placing a real call.
 *
 *   npm run simulate:webhook -- <candidateId> [QUALIFIED|DISQUALIFIED] [score]
 *   e.g. npm run simulate:webhook -- 1 QUALIFIED 80
 *
 * The candidate must already have a triggered call (or one is matched by application id).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const [candidateId, decisionArg = 'QUALIFIED', scoreArg] = process.argv.slice(2);
if (!candidateId) {
  console.error('Usage: npm run simulate:webhook -- <candidateId> [QUALIFIED|DISQUALIFIED] [score]');
  process.exit(1);
}
const decision = decisionArg.toUpperCase();
const score = scoreArg ?? (decision === 'QUALIFIED' ? '80' : '20');

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const db = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
const candidate = db.candidates.find((c) => String(c.id) === String(candidateId));
if (!candidate) {
  console.error(`Candidate ${candidateId} not found in ${dataDir}/db.json`);
  process.exit(1);
}
const call = db.calls.find((k) => k.id === candidate.latestCallId);
const base = process.env.SIMULATE_BASE_URL || 'http://localhost:3000';
const token = process.env.WEBHOOK_TOKEN;
const url = `${base}/api/webhooks/magickvoice${token ? `?token=${encodeURIComponent(token)}` : ''}`;

const results = Array.from({ length: 10 }, (_, i) =>
  decision === 'QUALIFIED' ? (i < 8 ? 'ADEQUATE' : 'INADEQUATE') : i < 2 ? 'ADEQUATE' : i < 6 ? 'INADEQUATE' : 'SKIPPED',
);
const runId = `run_sim_${crypto.randomBytes(4).toString('hex')}`;
const payload = {
  version: '1',
  event: 'analysis.ready',
  automation_id: 'auto_simulated',
  run_id: runId,
  context: {
    call: { id: call?.mvCallId || `sim-${crypto.randomUUID()}`, type: 'ai_voice_call', status: 'completed', talk_time_seconds: 412 },
    callee: {
      phone: candidate.phone,
      name: candidate.name,
      email: candidate.email,
      metadata: { application_id: String(candidate.id), candidate_email: candidate.email },
    },
    analysis: {
      sentiment: decision === 'QUALIFIED' ? 'positive' : 'neutral',
      dimensions: {
        ...Object.fromEntries(results.map((r, i) => [`Q${i + 1} Result`, r])),
        'Call Outcome': 'COMPLETED',
        'Call Summary':
          decision === 'QUALIFIED'
            ? `${candidate.name} answered most technical questions clearly and confirmed interest in the role.`
            : `${candidate.name} struggled with the core technical questions and skipped several.`,
        'Integrity Flag': 'NONE',
        'Confirmed Email': candidate.email,
        'Score Percentage': String(score),
        'Screening Status': decision,
        'Adequate Answer Count': String(results.filter((r) => r === 'ADEQUATE').length),
      },
    },
    tenant: { id: process.env.MAGICKVOICE_TENANT_ID || 't1' },
    account: { id: process.env.MAGICKVOICE_ACCOUNT_ID || 'a1' },
  },
  variables: {},
};

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Magick-Event': 'analysis.ready', 'Idempotency-Key': runId },
  body: JSON.stringify(payload),
});
console.log(res.status, await res.text());
