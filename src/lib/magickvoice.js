/**
 * MagickVoice platform API client.
 *
 * Auth (from MagickVoice → API keys → "Using your API keys"):
 *   X-Platform-Key: mgkp_...      (do NOT use Authorization: Bearer)
 *   X-Tenant-Id:    <tenant id>
 *   X-Account-Id:   <account id>
 *
 * Endpoints used:
 *   POST /proxy/calls        start one outbound AI call
 *   GET  /proxy/calls/:id    call detail incl. status + call_analysis
 *   GET  /credits            connection test
 */
import { activeVoiceSettings, getConfig, isPublicHttps, missingMagickVoiceSettings, webhookUrl } from './config.js';

export class MagickVoiceError extends Error {
  constructor(message, status = 0, body = null) {
    super(message);
    this.name = 'MagickVoiceError';
    this.status = status;
    this.body = body;
  }
}

function errorMessage(data, status) {
  if (!data) return `MagickVoice API error (HTTP ${status})`;
  const candidates = [data.message, data.error?.message, data.error, data.detail, data.errors?.[0]?.message];
  const msg = candidates.find((m) => typeof m === 'string' && m.trim());
  if (msg) return `${msg} (HTTP ${status})`;
  if (Array.isArray(data.detail)) return `${JSON.stringify(data.detail).slice(0, 300)} (HTTP ${status})`;
  return `MagickVoice API error (HTTP ${status})`;
}

async function request(method, pathname, body) {
  const cfg = getConfig();
  const missing = missingMagickVoiceSettings(cfg);
  if (missing.length) {
    throw new MagickVoiceError(`MagickVoice is not configured. Missing: ${missing.join(', ')}`);
  }
  const headers = {
    Accept: 'application/json',
    'X-Platform-Key': cfg.mv.apiKey,
    'X-Tenant-Id': cfg.mv.tenantId,
    'X-Account-Id': cfg.mv.accountId,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${cfg.mv.apiBase}${pathname}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new MagickVoiceError(`Could not reach MagickVoice: ${err.message}`);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 2000) };
  }
  if (!res.ok) throw new MagickVoiceError(errorMessage(data, res.status), res.status, data);
  return data;
}

/** Values injected into the "Candidate Pre-Screening Agent" call script. */
export function buildPromptVariables({ candidate, job }) {
  const cfg = getConfig();
  return {
    agent_name: job.agentName || cfg.defaults.agentName,
    company_name: job.companyName || cfg.defaults.companyName,
    candidate_name: candidate.name,
    job_role: job.title,
    job_id: String(job.id),
    candidate_email: candidate.email,
  };
}

/** Body for POST /proxy/calls — mirrors what the MagickVoice "Initiate Call" screen sends. */
export function buildCallPayload({ candidate, job, externalRefId, variables }) {
  const cfg = getConfig();
  const vars = variables || buildPromptVariables({ candidate, job });

  const recipient = {
    phone: candidate.phone,
    name: candidate.name,
    // metadata is exposed to automations as {{callee.metadata.*}}
    metadata: {
      ...vars,
      email: candidate.email,
      application_id: String(candidate.id),
      external_ref_id: externalRefId,
    },
  };
  // AI quality from .env — Platinum, or Custom (voice stack + voice + language).
  // Same shape the MagickVoice "Initiate Call" screen sends:
  //   config.ai_pipeline, config.voice_stack_id (custom only), config.voice, recipient.language
  const voice = activeVoiceSettings(cfg);
  if (voice.isCustom && !voice.voiceStackId) {
    throw new MagickVoiceError('MAGICKVOICE_CUSTOM_VOICE_STACK_ID is required when MAGICKVOICE_AI_PIPELINE=custom');
  }
  if (voice.language) recipient.language = voice.language;

  const config = {
    ai_pipeline: voice.pipeline,
    ...(voice.isCustom ? { voice_stack_id: voice.voiceStackId } : {}),
    ...(voice.voice ? { voice: voice.voice } : {}),
    prompt_template_id: cfg.mv.promptId,
    caller_id: cfg.mv.callerId,
    prompt_variables: vars,
    enable_recording: cfg.mv.enableRecording,
    machine_detection: cfg.mv.machineDetection,
    hangup_on_machine: cfg.mv.machineDetection,
  };

  const payload = { external_ref_id: externalRefId, recipient, config };

  if (cfg.mv.sendCallWebhook && isPublicHttps(cfg.publicBaseUrl)) {
    payload.webhook_url = webhookUrl(cfg);
  }
  if (cfg.mv.automationIds.length) payload.automation_ids = cfg.mv.automationIds;
  return payload;
}

export function extractCallId(resp) {
  if (!resp || typeof resp !== 'object') return null;
  return (
    resp.call_id ??
    resp.core_resource_id ??
    resp.id ??
    resp.data?.call_id ??
    resp.data?.id ??
    resp.call?.id ??
    resp.call?.call_id ??
    resp.interaction?.core_resource_id ??
    null
  );
}

export function createCall(payload) {
  return request('POST', '/proxy/calls', payload);
}

export function fetchCall(mvCallId) {
  return request('GET', `/proxy/calls/${encodeURIComponent(mvCallId)}`);
}

export function fetchCredits() {
  return request('GET', '/credits');
}

/** Removes secrets before a payload is stored or shown in the UI. */
export function redactPayload(payload) {
  const copy = JSON.parse(JSON.stringify(payload));
  if (copy.webhook_url) copy.webhook_url = copy.webhook_url.replace(/token=[^&]+/, 'token=***');
  return copy;
}
