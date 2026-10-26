import crypto from 'node:crypto';
import { getConfig } from './config.js';
import * as db from './db.js';
import {
  buildCallPayload,
  buildPromptVariables,
  createCall as mvCreateCall,
  extractCallId,
  fetchCall,
  redactPayload,
} from './magickvoice.js';
import { ACTIVE_STAGES, nextEmailStatus, nextStage, parseMagickVoicePayload } from './screening.js';

const MAX_PER_BATCH = 50;

function newExternalRef(candidateId) {
  return `crm-${candidateId}-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
}

/**
 * Starts AI screening calls for the given candidates, one MagickVoice call each.
 * Returns a per-candidate result list (never throws for a single failure).
 */
export async function triggerScreeningCalls(candidateIds, { force = false } = {}) {
  const ids = [...new Set((candidateIds || []).map(Number).filter(Number.isInteger))].slice(0, MAX_PER_BATCH);
  const results = [];

  for (const id of ids) {
    const candidate = db.getCandidate(id);
    if (!candidate) {
      results.push({ candidateId: id, ok: false, error: 'Candidate not found' });
      continue;
    }
    if (!candidate.job) {
      results.push({ candidateId: id, ok: false, error: 'Job not found for this candidate' });
      continue;
    }
    if (!force && ACTIVE_STAGES.has(candidate.stage)) {
      results.push({ candidateId: id, ok: false, skipped: true, error: 'A screening call is already in progress' });
      continue;
    }

    const externalRefId = newExternalRef(candidate.id);
    const variables = buildPromptVariables({ candidate, job: candidate.job });
    let payload;
    try {
      payload = buildCallPayload({ candidate, job: candidate.job, externalRefId, variables });
    } catch (err) {
      results.push({ candidateId: id, ok: false, error: err.message });
      continue;
    }

    const call = db.createCall({
      candidateId: candidate.id,
      jobId: candidate.job.id,
      externalRefId,
      variables,
      request: redactPayload(payload),
    });

    try {
      const resp = await mvCreateCall(payload);
      const mvCallId = extractCallId(resp);
      const parsed = parseMagickVoicePayload(resp);
      db.updateCall(call.id, {
        mvCallId,
        response: resp,
        status: parsed.rawStatus || 'queued',
        stage: nextStage('call_queued', parsed),
      });
      results.push({ candidateId: id, ok: true, callId: call.id, mvCallId });
    } catch (err) {
      db.updateCall(call.id, {
        status: 'trigger_failed',
        stage: 'trigger_failed',
        error: err.message,
        response: err.body || null,
      });
      results.push({ candidateId: id, ok: false, callId: call.id, error: err.message });
    }
  }
  return results;
}

/**
 * Applies data from MagickVoice (webhook or API) to a CRM call record.
 * Returns the updated call.
 */
export function applyMagickVoiceUpdate(call, parsed) {
  const cfg = getConfig();
  const stage = nextStage(call.stage, parsed);
  const patch = { stage };

  if (parsed.rawStatus) patch.status = parsed.rawStatus;
  else if (parsed.statusClass === 'completed' && call.status !== 'completed') patch.status = 'completed';
  if (!call.mvCallId && parsed.mvCallId) patch.mvCallId = parsed.mvCallId;
  if (parsed.analysis) patch.analysis = parsed.analysis;
  if (parsed.recordingUrl) patch.recordingUrl = parsed.recordingUrl;
  if (parsed.talkTimeSeconds != null) patch.talkTimeSeconds = parsed.talkTimeSeconds;
  if (parsed.durationSeconds != null) patch.durationSeconds = parsed.durationSeconds;
  if (parsed.analysisStatus) patch.analysisStatus = parsed.analysisStatus;
  if (stage === 'call_failed' && parsed.rawStatus) patch.error = `Call ended: ${parsed.rawStatus}`;

  const email = nextEmailStatus(call.emailStatus, {
    parsed,
    stage,
    automationSendsEmail: cfg.mv.automationSendsEmail,
  });
  if (email) {
    patch.emailStatus = email.status;
    patch.emailStatusDetail = email.detail;
  }
  return db.updateCall(call.id, patch);
}

/** Pulls the latest call detail from MagickVoice (useful when webhooks can't reach you). */
export async function syncCall(callId) {
  const call = db.getCall(callId);
  if (!call) throw new Error('Call not found');
  if (!call.mvCallId) throw new Error('This call has no MagickVoice call id yet');
  const resp = await fetchCall(call.mvCallId);
  const parsed = parseMagickVoicePayload(resp);
  return applyMagickVoiceUpdate(call, parsed);
}

export async function syncActiveCalls() {
  const calls = db.listActiveCalls();
  const results = [];
  for (const call of calls) {
    try {
      const updated = await syncCall(call.id);
      results.push({ callId: call.id, ok: true, stage: updated.stage });
    } catch (err) {
      results.push({ callId: call.id, ok: false, error: err.message });
    }
  }
  return results;
}
