/**
 * End-to-end test of the server side (API routes + MagickVoice integration) with plain Node —
 * no Next.js needed. A mock MagickVoice API runs on a local port.
 *
 *   node scripts/test-core.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-test-'));

/* ─── Mock MagickVoice API ─────────────────────────────────────────── */
const received = [];
const calls = new Map();
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const entry = { method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null };
    received.push(entry);
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.headers['x-platform-key'] !== 'mgkp_test_key') return send(401, { message: 'Invalid API key' });
    if (!req.headers['x-tenant-id'] || !req.headers['x-account-id']) return send(400, { message: 'Missing tenant/account' });

    if (req.method === 'POST' && req.url === '/proxy/calls') {
      if (entry.body.recipient?.phone === '+919999999999') return send(422, { message: 'Phone number is on DND list' });
      const id = crypto.randomUUID();
      calls.set(id, entry.body);
      return send(201, { call_id: id, status: 'queued', external_ref_id: entry.body.external_ref_id });
    }
    const m = /^\/proxy\/calls\/([\w-]+)$/.exec(req.url);
    if (req.method === 'GET' && m) {
      if (!calls.has(m[1])) return send(404, { message: 'Call not found' });
      return send(200, {
        call_id: m[1],
        status: 'completed',
        analysis_status: 'completed',
        recording_url: 'https://example.com/rec.mp3',
        talk_time_seconds: 173,
        prompt_variables: calls.get(m[1]).config.prompt_variables,
        call_analysis: {
          common: { summary: 'Weak answers overall.', overall_sentiment: { label: 'Neutral', score: 0.05 }, key_topics: ['ETL vs ELT'] },
          custom: {
            Q1_Result: 'INADEQUATE',
            Q2_Result: 'SKIPPED',
            Screening_Status: 'DISQUALIFIED',
            Score_Percentage: '0',
            Call_Summary: 'Candidate could not answer core data engineering questions.',
            Integrity_Flag: 'NONE',
            Confirmed_Email: 'asha@example.com',
            Adequate_Answer_Count: '0',
          },
          _meta: { provider: 'azure_openai', model: 'gpt-4o' },
        },
      });
    }
    if (req.method === 'GET' && req.url === '/credits') return send(200, { balance: 3382.71 });
    send(404, { message: `Route ${req.method}:${req.url} not found` });
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mockPort = mock.address().port;

Object.assign(process.env, {
  DATA_DIR: dataDir,
  MAGICKVOICE_API_BASE_URL: `http://127.0.0.1:${mockPort}`,
  MAGICKVOICE_API_KEY: 'mgkp_test_key',
  MAGICKVOICE_TENANT_ID: 'tenant-123',
  MAGICKVOICE_ACCOUNT_ID: 'account-456',
  MAGICKVOICE_PROMPT_ID: 'prompt-789',
  MAGICKVOICE_CALLER_ID: '+919429391386',
  MAGICKVOICE_AI_PIPELINE: 'platinum',
  MAGICKVOICE_AUTOMATION_IDS: 'auto_1',
  MAGICKVOICE_WEBHOOK_SECRET: '',
  PUBLIC_BASE_URL: 'https://crm.example.com',
  WEBHOOK_TOKEN: 'tok_secret',
  RECRUITER_EMAIL: 'recruiter@example.com',
  RECRUITER_PASSWORD: 'pw-123456',
  SESSION_SECRET: 'test-session-secret',
  DEFAULT_COMPANY_NAME: 'Bilvantis Technologies',
  DEFAULT_AGENT_NAME: 'Priya',
});

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const route = (p) => import(path.join(root, 'src/app/api', p, 'route.js'));

const jobsRoute = await route('jobs');
const applicationsRoute = await route('applications');
const loginRoute = await route('auth/login');
const candidatesRoute = await route('candidates');
const candidateRoute = await route('candidates/[id]');
const resumeRoute = await route('candidates/[id]/resume');
const triggerRoute = await route('calls/trigger');
const syncRoute = await route('calls/sync');
const webhookRoute = await route('webhooks/magickvoice');
const testRoute = await route('integration/test');

const BASE = 'http://localhost:3000';
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.stack}`);
    process.exitCode = 1;
  }
}
const jsonReq = (url, body, headers = {}) =>
  new Request(`${BASE}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
function applicationForm(overrides = {}) {
  const fd = new FormData();
  const fields = {
    jobId: '1',
    name: 'Asha Rao',
    email: 'asha@example.com',
    phone: '98765 43210',
    experienceYears: '3',
    currentLocation: 'Hyderabad',
    consent: 'true',
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) if (v !== null) fd.set(k, v);
  if (overrides.resume !== null) fd.set('resume', new File([overrides.resumeBytes || pdfBytes], overrides.resumeName || 'Asha Resume.pdf', { type: 'application/pdf' }));
  return new Request(`${BASE}/api/applications`, { method: 'POST', body: fd });
}

let cookie = '';
const authed = (req) => {
  req.headers.set('cookie', cookie);
  return req;
};
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });

console.log('\nCandidate apply flow');
await test('lists seeded open jobs', async () => {
  const res = await jobsRoute.GET(new Request(`${BASE}/api/jobs`));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.jobs.length, 3);
  assert.ok(body.jobs.some((j) => j.title === 'Data Engineer'));
});

await test('accepts a valid application with resume', async () => {
  const res = await applicationsRoute.POST(applicationForm());
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body.reference, 'C-0001');
});

await test('rejects invalid fields with per-field errors', async () => {
  const res = await applicationsRoute.POST(applicationForm({ email: 'nope', phone: '12', consent: null, jobId: '99' }));
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.ok(body.fields.email && body.fields.phone && body.fields.consent && body.fields.jobId);
});

await test('rejects a non-PDF file renamed to .pdf', async () => {
  const res = await applicationsRoute.POST(applicationForm({ email: 'x@example.com', resumeBytes: Buffer.from('hello world') }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).fields.resume, /valid/);
});

await test('rejects duplicate application for the same job', async () => {
  const res = await applicationsRoute.POST(applicationForm());
  assert.equal(res.status, 409);
});

await test('accepts more candidates', async () => {
  for (const [name, email, phone, jobId] of [
    ['Ravi Kumar', 'ravi@example.com', '+91 91234 56789', '1'],
    ['Meera N', 'meera@example.com', '09123456780', '2'],
    ['Dnd Person', 'dnd@example.com', '9999999999', '2'],
    ['Kiran P', 'kiran@example.com', '9000000001', '3'],
  ]) {
    const res = await applicationsRoute.POST(applicationForm({ name, email, phone, jobId }));
    assert.equal(res.status, 201, await res.clone().text());
  }
});

console.log('\nRecruiter auth');
await test('blocks recruiter APIs without a session', async () => {
  const res = await candidatesRoute.GET(new Request(`${BASE}/api/candidates`));
  assert.equal(res.status, 401);
});
await test('rejects wrong password', async () => {
  const res = await loginRoute.POST(jsonReq('/api/auth/login', { email: 'recruiter@example.com', password: 'bad' }));
  assert.equal(res.status, 401);
});
await test('logs in and sets an HttpOnly session cookie', async () => {
  const res = await loginRoute.POST(jsonReq('/api/auth/login', { email: 'Recruiter@Example.com', password: 'pw-123456' }));
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie');
  assert.match(setCookie, /crm_session=.*HttpOnly/);
  assert.doesNotMatch(setCookie, /Secure/, 'plain http must not get a Secure cookie');
  cookie = setCookie.split(';')[0];
});
await test('marks the cookie Secure behind an https proxy/tunnel', async () => {
  const res = await loginRoute.POST(
    jsonReq('/api/auth/login', { email: 'recruiter@example.com', password: 'pw-123456' }, { 'X-Forwarded-Proto': 'https' }),
  );
  assert.match(res.headers.get('set-cookie'), /; Secure/);
});
await test('lists candidates with phone normalised to E.164', async () => {
  const res = await candidatesRoute.GET(authed(new Request(`${BASE}/api/candidates`)));
  const { candidates } = await res.json();
  assert.equal(candidates.length, 5);
  const phones = Object.fromEntries(candidates.map((c) => [c.name, c.phone]));
  assert.equal(phones['Asha Rao'], '+919876543210');
  assert.equal(phones['Ravi Kumar'], '+919123456789');
  assert.equal(phones['Meera N'], '+919123456780');
  assert.ok(candidates.every((c) => c.stage === 'applied' && c.emailStatus === 'not_sent'));
});
await test('serves the resume to recruiters', async () => {
  const res = await resumeRoute.GET(authed(new Request(`${BASE}/api/candidates/1/resume`)), params(1));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), pdfBytes);
});

console.log('\nTrigger AI screening calls');
await test('requires a selection', async () => {
  const res = await triggerRoute.POST(authed(jsonReq('/api/calls/trigger', { candidateIds: [] })));
  assert.equal(res.status, 400);
});
await test('starts calls via POST /proxy/calls with the right headers and variables', async () => {
  const res = await triggerRoute.POST(authed(jsonReq('/api/calls/trigger', { candidateIds: [1, 2, 4] })));
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.started, 2);
  assert.equal(body.failed, 1);
  assert.match(body.results.find((r) => r.candidateId === 4).error, /DND/);

  const posts = received.filter((r) => r.method === 'POST' && r.url === '/proxy/calls');
  const first = posts.find((p) => p.body.recipient.name === 'Asha Rao');
  assert.equal(first.headers['x-platform-key'], 'mgkp_test_key');
  assert.equal(first.headers['x-tenant-id'], 'tenant-123');
  assert.equal(first.headers['x-account-id'], 'account-456');
  assert.equal(first.headers.authorization, undefined);
  const b = first.body;
  assert.equal(b.recipient.phone, '+919876543210');
  assert.equal(b.config.ai_pipeline, 'platinum');
  assert.equal(b.config.prompt_template_id, 'prompt-789');
  assert.equal(b.config.caller_id, '+919429391386');
  assert.deepEqual(b.config.prompt_variables, {
    agent_name: 'Priya',
    company_name: 'Bilvantis Technologies',
    candidate_name: 'Asha Rao',
    job_role: 'Data Engineer',
    job_id: '1',
    candidate_email: 'asha@example.com',
  });
  assert.equal(b.recipient.metadata.application_id, '1');
  assert.equal(b.recipient.metadata.candidate_email, 'asha@example.com');
  assert.deepEqual(b.automation_ids, ['auto_1']);
  assert.equal(b.webhook_url, 'https://crm.example.com/api/webhooks/magickvoice?token=tok_secret');
  assert.match(b.external_ref_id, /^crm-1-/);
});
await test('marks failed trigger on the candidate', async () => {
  const res = await candidateRoute.GET(authed(new Request(`${BASE}/api/candidates/4`)), params(4));
  const { candidate } = await res.json();
  assert.equal(candidate.stage, 'trigger_failed');
  assert.match(candidate.calls[0].error, /DND/);
  assert.equal(candidate.calls[0].request.webhook_url.includes('tok_secret'), false, 'token must be redacted');
});
await test('skips candidates whose call is already running', async () => {
  const res = await triggerRoute.POST(authed(jsonReq('/api/calls/trigger', { candidateIds: [1] })));
  const body = await res.json();
  assert.equal(body.started, 0);
  assert.equal(body.results[0].skipped, true);
});

console.log('\nWebhooks from MagickVoice');
const callOf = async (id) => (await (await candidateRoute.GET(authed(new Request(`${BASE}/api/candidates/${id}`)), params(id))).json()).candidate;
const asha = await callOf(1);
const ashaMvId = asha.calls[0].mvCallId;

await test('rejects webhook without token', async () => {
  const res = await webhookRoute.POST(jsonReq('/api/webhooks/magickvoice', { call_id: ashaMvId, status: 'ringing' }));
  assert.equal(res.status, 401);
});
await test('live status update moves candidate to "On call"', async () => {
  const res = await webhookRoute.POST(jsonReq('/api/webhooks/magickvoice?token=tok_secret', { event: 'call.started', call_id: ashaMvId, status: 'in-progress' }));
  const body = await res.json();
  assert.equal(body.matched, true);
  assert.equal(body.stage, 'call_in_progress');
});
const envelope = {
  version: '1',
  event: 'analysis.ready',
  automation_id: 'auto_1',
  run_id: 'run_abc',
  context: {
    call: { id: ashaMvId, type: 'ai_voice_call', status: 'completed', talk_time_seconds: 180 },
    callee: { phone: '+919876543210', name: 'Asha Rao', metadata: { application_id: '1', candidate_email: 'asha@example.com' } },
    analysis: {
      sentiment: 'positive',
      dimensions: {
        'Screening Status': 'QUALIFIED',
        'Score Percentage': '80%',
        'Call Summary': 'Strong on Spark and modelling.',
        'Q1 Result': 'ADEQUATE',
        'Q2 Result': 'ADEQUATE',
        'Q3 Result': 'INADEQUATE',
        'Integrity Flag': 'NONE',
        'Confirmed Email': 'asha@example.com',
      },
    },
    tenant: { id: 'tenant-123' },
    account: { id: 'account-456' },
  },
  variables: {},
};
await test('automation envelope marks candidate Qualified and email Sent', async () => {
  const res = await webhookRoute.POST(
    jsonReq('/api/webhooks/magickvoice?token=tok_secret', envelope, { 'X-Magick-Event': 'analysis.ready', 'Idempotency-Key': 'run_abc' }),
  );
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.stage, 'qualified');
  assert.equal(body.emailStatus, 'sent');
  const c = await callOf(1);
  assert.equal(c.stage, 'qualified');
  assert.equal(c.screening.score, 80);
  assert.equal(c.screening.summary, 'Strong on Spark and modelling.');
  assert.equal(c.calls[0].analysis.questions.length, 3);
  assert.equal(c.calls[0].talkTimeSeconds, 180);
  assert.equal(c.emailStatus, 'sent');
});
await test('dedupes retried deliveries by Idempotency-Key', async () => {
  const res = await webhookRoute.POST(jsonReq('/api/webhooks/magickvoice?token=tok_secret', envelope, { 'Idempotency-Key': 'run_abc' }));
  assert.equal((await res.json()).duplicate, true);
});
await test('a late "completed" status does not undo the result', async () => {
  await webhookRoute.POST(jsonReq('/api/webhooks/magickvoice?token=tok_secret', { event: 'call.completed', call_id: ashaMvId, status: 'completed' }));
  assert.equal((await callOf(1)).stage, 'qualified');
});

const ravi = await callOf(2);
await test('envelope without analysis → CRM fetches GET /proxy/calls/:id', async () => {
  const res = await webhookRoute.POST(
    jsonReq('/api/webhooks/magickvoice?token=tok_secret', {
      version: '1',
      event: 'analysis.ready',
      automation_id: 'auto_1',
      run_id: 'run_def',
      context: { call: { id: ravi.calls[0].mvCallId, status: 'completed' }, callee: { phone: '+919123456789' } },
    }),
  );
  const body = await res.json();
  assert.equal(body.stage, 'disqualified');
  assert.equal(body.emailStatus, 'sent');
  const c = await callOf(2);
  assert.equal(c.screening.score, 0);
  assert.equal(c.calls[0].recordingUrl, 'https://example.com/rec.mp3');
  assert.equal(c.calls[0].analysis.sentiment, 'Neutral');
  assert.equal(c.calls[0].analysis.confirmedEmail, 'asha@example.com');
  assert.ok(received.some((r) => r.method === 'GET' && r.url === `/proxy/calls/${ravi.calls[0].mvCallId}`));
});
await test('object-valued dimensions are flattened to text', async () => {
  const { normalizeAnalysis } = await import(path.join(root, 'src/lib/screening.js'));
  const a = normalizeAnalysis({
    custom: { Call_Summary: { text: 'Hello' }, Screening_Status: { value: 'qualified' }, Q1_Result: { value: 'adequate' } },
    common: { key_topics: ['ETL', { t: 1 }] },
  });
  assert.equal(a.summary, 'Hello');
  assert.equal(a.decision, 'QUALIFIED');
  assert.equal(a.questions[0].result, 'ADEQUATE');
  assert.deepEqual(a.keyTopics, ['ETL', '{"t":1}']);
});
await test('unknown call is logged but acknowledged (200)', async () => {
  const res = await webhookRoute.POST(jsonReq('/api/webhooks/magickvoice?token=tok_secret', { call_id: 'does-not-exist', status: 'completed' }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).matched, false);
});

console.log('\nSync + failures');
await test('manual sync pulls the result; email stays "awaiting confirmation"', async () => {
  let res = await triggerRoute.POST(authed(jsonReq('/api/calls/trigger', { candidateIds: [3] })));
  assert.equal((await res.json()).started, 1);
  res = await syncRoute.POST(authed(jsonReq('/api/calls/sync', { candidateId: 3 })));
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.stage, 'disqualified');
  assert.equal(body.emailStatus, 'pending');
});
await test('no-answer marks the call as not connected', async () => {
  await triggerRoute.POST(authed(jsonReq('/api/calls/trigger', { candidateIds: [5] })));
  const kiran = await callOf(5);
  const res = await webhookRoute.POST(
    jsonReq('/api/webhooks/magickvoice?token=tok_secret', { event: 'call.failed', call_id: kiran.calls[0].mvCallId, status: 'no-answer' }),
  );
  assert.equal((await res.json()).stage, 'call_failed');
  assert.equal((await callOf(5)).emailStatus, 'not_sent');
});
await test('"Call again" (force) starts a fresh attempt and resets the result', async () => {
  const res = await triggerRoute.POST(authed(jsonReq('/api/calls/trigger', { candidateIds: [1], force: true })));
  assert.equal((await res.json()).started, 1);
  const c = await callOf(1);
  assert.equal(c.calls.length, 2);
  assert.equal(c.stage, 'call_queued');
  assert.equal(c.emailStatus, 'not_sent');
});
await test('old call webhooks do not overwrite the newer attempt', async () => {
  await webhookRoute.POST(jsonReq('/api/webhooks/magickvoice?token=tok_secret', { ...envelope, run_id: 'run_old' }, { 'Idempotency-Key': 'run_old' }));
  const c = await callOf(1);
  assert.equal(c.stage, 'call_queued');
});

console.log('\nAI quality (Platinum / Custom from .env)');
const lastCallPost = () => received.filter((r) => r.method === 'POST' && r.url === '/proxy/calls').at(-1);
await test('platinum: no voice stack; optional voice + language are sent', async () => {
  process.env.MAGICKVOICE_PLATINUM_VOICE = 'Kore';
  process.env.MAGICKVOICE_PLATINUM_LANGUAGE = 'en';
  const res = await triggerRoute.POST(authed(jsonReq('/api/calls/trigger', { candidateIds: [3], force: true })));
  assert.equal((await res.json()).started, 1);
  const b = lastCallPost().body;
  assert.equal(b.config.ai_pipeline, 'platinum');
  assert.equal('voice_stack_id' in b.config, false);
  assert.equal(b.config.voice, 'Kore');
  assert.equal(b.recipient.language, 'en');
  delete process.env.MAGICKVOICE_PLATINUM_VOICE;
  delete process.env.MAGICKVOICE_PLATINUM_LANGUAGE;
});
await test('platinum without voice/language leaves them to the call script', async () => {
  await triggerRoute.POST(authed(jsonReq('/api/calls/trigger', { candidateIds: [3], force: true })));
  const b = lastCallPost().body;
  assert.equal('voice' in b.config, false);
  assert.equal('language' in b.recipient, false);
});
await test('custom: sends ai_pipeline=custom, voice_stack_id, voice and recipient language', async () => {
  Object.assign(process.env, {
    MAGICKVOICE_AI_PIPELINE: 'Custom',
    MAGICKVOICE_CUSTOM_VOICE_STACK_ID: '972f32a1-723d-49cc-a61f-3c855b0f67a1',
    MAGICKVOICE_CUSTOM_VOICE: 'anushka',
    MAGICKVOICE_CUSTOM_LANGUAGE: 'te',
  });
  const res = await triggerRoute.POST(authed(jsonReq('/api/calls/trigger', { candidateIds: [3], force: true })));
  assert.equal((await res.json()).started, 1);
  const b = lastCallPost().body;
  assert.equal(b.config.ai_pipeline, 'custom');
  assert.equal(b.config.voice_stack_id, '972f32a1-723d-49cc-a61f-3c855b0f67a1');
  assert.equal(b.config.voice, 'anushka');
  assert.equal(b.recipient.language, 'te');
  assert.equal(b.config.prompt_template_id, 'prompt-789');
  const c = await callOf(3);
  assert.equal(c.calls[0].request.config.voice_stack_id, '972f32a1-723d-49cc-a61f-3c855b0f67a1');
});
await test('custom summary + warnings for unsupported language/voice', async () => {
  const cfgMod = await import(path.join(root, 'src/lib/config.js'));
  assert.equal(cfgMod.describeVoiceSettings(), 'Custom · Copper (system) · voice anushka · te');
  process.env.MAGICKVOICE_CUSTOM_LANGUAGE = 'fr';
  process.env.MAGICKVOICE_CUSTOM_VOICE = 'Kore';
  assert.equal(cfgMod.voiceSettingsWarnings().length, 2);
  process.env.MAGICKVOICE_CUSTOM_LANGUAGE = 'te';
  process.env.MAGICKVOICE_CUSTOM_VOICE = 'anushka';
});
await test('custom without a voice stack id is refused before calling MagickVoice', async () => {
  delete process.env.MAGICKVOICE_CUSTOM_VOICE_STACK_ID;
  const before = received.length;
  const res = await triggerRoute.POST(authed(jsonReq('/api/calls/trigger', { candidateIds: [3], force: true })));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /MAGICKVOICE_CUSTOM_VOICE_STACK_ID/);
  assert.equal(received.length, before);
  process.env.MAGICKVOICE_AI_PIPELINE = 'platinum';
  delete process.env.MAGICKVOICE_CUSTOM_VOICE;
  delete process.env.MAGICKVOICE_CUSTOM_LANGUAGE;
});

console.log('\nSignature + connection');
await test('accepts HMAC-signed webhook when a signing secret is set', async () => {
  process.env.MAGICKVOICE_WEBHOOK_SECRET = 'whsec_test';
  const raw = JSON.stringify({ call_id: 'x', status: 'completed' });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', 'whsec_test').update(`${ts}.${raw}`).digest('hex');
  const ok = await webhookRoute.POST(
    new Request(`${BASE}/api/webhooks/magickvoice`, { method: 'POST', headers: { 'X-Magick-Signature': `sha256=${sig}`, 'X-Magick-Timestamp': ts }, body: raw }),
  );
  assert.equal(ok.status, 200);
  const bad = await webhookRoute.POST(
    new Request(`${BASE}/api/webhooks/magickvoice`, { method: 'POST', headers: { 'X-Magick-Signature': 'sha256=deadbeef', 'X-Magick-Timestamp': ts }, body: raw }),
  );
  assert.equal(bad.status, 401);
  process.env.MAGICKVOICE_WEBHOOK_SECRET = '';
});
await test('connection test reads /credits', async () => {
  const res = await testRoute.POST(authed(new Request(`${BASE}/api/integration/test`, { method: 'POST' })));
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.balance, 3382.71);
});
await test('bad API key surfaces a clear error', async () => {
  process.env.MAGICKVOICE_API_KEY = 'mgkp_wrong';
  const res = await testRoute.POST(authed(new Request(`${BASE}/api/integration/test`, { method: 'POST' })));
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /Invalid API key \(HTTP 401\)/);
  process.env.MAGICKVOICE_API_KEY = 'mgkp_test_key';
});

mock.close();
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}\n`);
