/**
 * Normalises whatever MagickVoice sends (automation webhook envelope, live
 * call-status webhook, or GET /proxy/calls/:id response) into one shape the
 * CRM understands, and decides the candidate's pipeline stage.
 */

export const STAGES = {
  applied: { label: 'Applied', tone: 'neutral' },
  call_queued: { label: 'Call queued', tone: 'info' },
  call_in_progress: { label: 'On call', tone: 'info' },
  awaiting_analysis: { label: 'Analysing call', tone: 'info' },
  qualified: { label: 'Qualified', tone: 'success' },
  disqualified: { label: 'Disqualified', tone: 'danger' },
  needs_review: { label: 'Needs review', tone: 'warning' },
  call_failed: { label: 'Not connected', tone: 'warning' },
  trigger_failed: { label: 'Trigger failed', tone: 'danger' },
};

export const EMAIL_STATUSES = {
  not_sent: { label: 'Not sent', tone: 'neutral' },
  pending: { label: 'Awaiting confirmation', tone: 'info' },
  sent: { label: 'Sent', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

export const ACTIVE_STAGES = new Set(['call_queued', 'call_in_progress', 'awaiting_analysis']);
const FINAL_STAGES = new Set(['qualified', 'disqualified', 'needs_review']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const present = (v) => v !== undefined && v !== null && v !== '';

export const normKey = (k) =>
  String(k)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normStatus = (s) =>
  present(s)
    ? String(s)
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
    : '';

const QUEUED = new Set(['queued', 'initiating', 'initiated', 'scheduled', 'pending', 'created', 'dialing', 'triggering']);
const ACTIVE = new Set(['ringing', 'in progress', 'executing', 'active', 'answered', 'started', 'connected', 'ongoing']);
const DONE = new Set(['completed', 'complete', 'ended', 'finished', 'success', 'succeeded']);
const FAILED = new Set([
  'failed', 'no answer', 'busy', 'switched off', 'voicemail', 'timeout', 'cancelled', 'canceled',
  'rejected', 'unreachable', 'not reachable', 'service unavailable', 'partially failed', 'error',
]);

/** 'queued' | 'active' | 'completed' | 'failed' | 'unknown' | null */
export function classifyCallStatus(status) {
  const s = normStatus(status);
  if (!s) return null;
  if (DONE.has(s)) return 'completed';
  if (FAILED.has(s)) return 'failed';
  if (ACTIVE.has(s)) return 'active';
  if (QUEUED.has(s)) return 'queued';
  return 'unknown';
}

function classifyEvent(event) {
  const e = normStatus(event).replace(/\./g, ' ');
  if (!e) return null;
  if (/analysis/.test(e)) return 'completed';
  if (/(fail|no answer|busy|cancel)/.test(e)) return 'failed';
  if (/(complete|ended|finish)/.test(e)) return 'completed';
  if (/(start|ringing|answer|progress|connect)/.test(e)) return 'active';
  if (/(queue|initiat|creat)/.test(e)) return 'queued';
  return null;
}

export function normalizeDecision(raw) {
  if (!present(raw)) return null;
  const s = String(raw).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (/^(NOT_QUALIFIED|DISQUALIFIED|UNQUALIFIED|REJECTED|FAIL|FAILED|NO)$/.test(s)) return 'DISQUALIFIED';
  if (/^(QUALIFIED|SHORTLISTED|SELECTED|PASS|PASSED|YES)$/.test(s)) return 'QUALIFIED';
  return s;
}

function toNumber(v) {
  if (!present(v)) return null;
  const n = parseFloat(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

/** Dimension values are usually strings, but tolerate {text|value|label} objects and numbers. */
function asText(v) {
  if (!present(v)) return null;
  if (isObj(v)) {
    const inner = v.text ?? v.value ?? v.label ?? v.result;
    return present(inner) && !isObj(inner) ? String(inner) : JSON.stringify(v);
  }
  if (Array.isArray(v)) return v.map((x) => (isObj(x) ? JSON.stringify(x) : String(x))).join(', ');
  return String(v);
}

function sentimentLabel(v) {
  if (!present(v)) return null;
  if (isObj(v)) return v.label || v.sentiment || v.value || null;
  return String(v);
}

function dimensionsFrom(analysis) {
  let raw = null;
  for (const key of ['dimensions', 'custom_dimensions', 'custom', 'customDimensions']) {
    if (isObj(analysis[key]) || Array.isArray(analysis[key])) {
      raw = analysis[key];
      break;
    }
  }
  const dims = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isObj(item)) continue;
      const k = item.key ?? item.name ?? item.label;
      if (present(k)) dims[normKey(k)] = item.value ?? item.result ?? null;
    }
  } else if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      dims[normKey(k)] = isObj(v) && 'value' in v ? v.value : v;
    }
  }
  return dims;
}

/** Turns a MagickVoice analysis object into the CRM's screening result (or null if empty). */
export function normalizeAnalysis(analysis) {
  if (!isObj(analysis)) return null;
  const common = isObj(analysis.common) ? analysis.common : {};
  const dims = dimensionsFrom(analysis);

  const questions = [];
  for (let i = 1; i <= 30; i += 1) {
    const v = asText(dims[`q${i}_result`] ?? dims[`q${i}`]);
    if (present(v)) questions.push({ number: i, result: v.toUpperCase() });
  }

  const topics = common.key_topics ?? analysis.key_topics;
  const result = {
    decision: normalizeDecision(
      asText(
        dims.screening_status ??
          dims.screeningstatus ??
          dims.screening_result ??
          dims.qualification_status ??
          dims.qualification,
      ),
    ),
    score: toNumber(asText(dims.score_percentage ?? dims.score ?? dims.score_percent)),
    summary: asText(dims.call_summary ?? common.summary ?? analysis.summary),
    sentiment: asText(sentimentLabel(common.overall_sentiment ?? analysis.overall_sentiment ?? analysis.sentiment)),
    callOutcome: asText(dims.call_outcome),
    integrityFlag: asText(dims.integrity_flag),
    confirmedEmail: asText(dims.confirmed_email),
    adequateAnswers: toNumber(asText(dims.adequate_answer_count)),
    callbackDatetime: asText(dims.callback_datetime),
    keyTopics: Array.isArray(topics) ? topics.map(asText).filter(Boolean) : [],
    questions,
    dimensions: dims,
  };

  const hasContent = Object.keys(dims).length > 0 || present(result.summary);
  return hasContent ? result : null;
}

function getter(layers) {
  const objs = layers.filter(isObj);
  return (...keys) => {
    for (const o of objs) {
      for (const k of keys) {
        if (present(o[k])) return o[k];
      }
    }
    return undefined;
  };
}

/**
 * Parses an incoming webhook body or API response.
 * Handles the automation "default JSON envelope":
 *   { version, event, automation_id, run_id, context: { call, callee, analysis, ... }, variables }
 * as well as flat payloads ({ call_id, status, call_analysis, ... }).
 */
export function parseMagickVoicePayload(body, { eventHeader } = {}) {
  const root = isObj(body) ? body : {};
  const ctx = isObj(root.context) ? root.context : isObj(root.data) ? root.data : root;
  const call = isObj(ctx.call) ? ctx.call : isObj(root.call) ? root.call : {};
  const get = getter([call, ctx, root]);

  const callee = [ctx.callee, root.callee, ctx.recipient, root.recipient].find(isObj) || {};
  const metadata = isObj(callee.metadata) ? callee.metadata : isObj(root.metadata) ? root.metadata : {};
  const promptVars = [call.prompt_variables, ctx.prompt_variables, root.prompt_variables, root.variables].find(isObj) || {};

  const event = eventHeader || root.event || root.type || root.event_type || null;
  const rawStatus = get('status', 'call_status', 'state');
  const statusClass = classifyCallStatus(rawStatus) || classifyEvent(event);

  const analysisObj = [ctx.analysis, root.analysis, call.call_analysis, ctx.call_analysis, root.call_analysis, call.analysis].find(isObj);
  const analysis = normalizeAnalysis(analysisObj);

  const emailField = get('email_status', 'email_sent', 'mail_sent', 'email_delivery_status');

  return {
    event,
    isAutomationEnvelope: present(root.automation_id) || present(root.run_id) || (present(root.version) && isObj(root.context)),
    mvCallId: get('call_id', 'id', 'core_resource_id') ?? null,
    externalRefId: get('external_ref_id', 'reference_id') ?? metadata.external_ref_id ?? null,
    applicationId: metadata.application_id ?? promptVars.application_id ?? root.application_id ?? null,
    phone: callee.phone ?? get('phone', 'to') ?? null,
    rawStatus: present(rawStatus) ? String(rawStatus) : null,
    statusClass,
    analysisStatus: get('analysis_status') ?? null,
    analysis,
    recordingUrl: get('recording_url', 'recordingUrl') ?? null,
    talkTimeSeconds: toNumber(get('talk_time_seconds', 'talk_time')),
    durationSeconds: toNumber(get('duration_seconds', 'duration')),
    emailOverride: present(emailField) ? normalizeEmailField(emailField) : null,
  };
}

function normalizeEmailField(v) {
  if (typeof v === 'boolean') return v ? 'sent' : 'failed';
  const s = String(v).trim().toLowerCase();
  if (['true', 'sent', 'delivered', 'success', 'succeeded', 'yes', 'ok'].includes(s)) return 'sent';
  if (['false', 'failed', 'error', 'bounced', 'no'].includes(s)) return 'failed';
  if (['pending', 'queued'].includes(s)) return 'pending';
  return null;
}

/** Decides the new stage for a call given what we just learned. Final results never regress. */
export function nextStage(currentStage, { statusClass, analysis }) {
  const decision = analysis?.decision;
  if (decision === 'QUALIFIED') return 'qualified';
  if (decision === 'DISQUALIFIED') return 'disqualified';
  if (decision) return 'needs_review';
  if (FINAL_STAGES.has(currentStage)) return currentStage;
  if (statusClass === 'completed') return analysis ? 'needs_review' : 'awaiting_analysis';
  if (statusClass === 'failed') return 'call_failed';
  if (statusClass === 'active') return 'call_in_progress';
  if (statusClass === 'queued') return currentStage === 'call_in_progress' ? currentStage : 'call_queued';
  return currentStage;
}

/**
 * Decides the email status.
 *  - An explicit email_status / email_sent field in the payload always wins.
 *  - When a MagickVoice automation (Email step → Webhook step) reports a
 *    Qualified/Disqualified result, the email step already ran → "sent".
 *  - A result seen any other way (e.g. manual sync) → "pending" until confirmed.
 */
export function nextEmailStatus(current, { parsed, stage, automationSendsEmail }) {
  if (parsed.emailOverride) return { status: parsed.emailOverride, detail: 'Reported in MagickVoice webhook payload' };
  const hasDecision = stage === 'qualified' || stage === 'disqualified';
  if (hasDecision && parsed.isAutomationEnvelope && automationSendsEmail) {
    return {
      status: 'sent',
      detail: `${stage === 'qualified' ? 'Qualified' : 'Disqualified'} email sent by MagickVoice automation`,
    };
  }
  if (current === 'sent' || current === 'failed') return null; // keep confirmed values
  if (hasDecision && current !== 'pending') {
    return { status: 'pending', detail: 'Result received; waiting for MagickVoice automation to confirm the email' };
  }
  return null;
}
