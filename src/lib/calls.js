import crypto from 'node:crypto';
import { getConfig, missingMagickVoiceSettings } from './config.js';
import * as db from './db.js';
import {
  buildCallPayload,
  buildPromptVariables,
  createCall as mvCreateCall,
  extractCallId,
  fetchCall,
  redactPayload,
} from './magickvoice.js';
import { resumePromptVariables } from './resume-match.js';
import { ACTIVE_STAGES, nextEmailStatus, nextStage, parseMagickVoicePayload } from './screening.js';

const MAX_PER_BATCH = 50;

function newExternalRef(candidateId) {
  return `crm-${candidateId}-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
}

/**
 * Starts AI screening calls for the given candidates, one MagickVoice call each.
 * Returns a per-candidate result list (never throws for a single failure).
 */
export async function triggerScreeningCalls(candidateIds, { force = false, trigger = 'manual' } = {}) {
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
    let resume = null;
    try {
      resume = await resumePromptVariables(candidate);
    } catch (err) {
      console.warn('[calls] could not read resume keywords for candidate', id, err.message);
    }
    const variables = buildPromptVariables({ candidate, job: candidate.job, resume });
    let payload;
    try {
      payload = buildCallPayload({ candidate, job: candidate.job, externalRefId, variables });
    } catch (err) {
      results.push({ candidateId: id, ok: false, error: err.message });
      continue;
    }

    // A new call after "Not connected" continues the same attempt series (Attempt 2/3, 3/3 …).
    const continuing = candidate.stage === 'call_failed' || trigger === 'auto' || trigger === 'retry';
    const attempt = continuing ? (candidate.callAttempt || previousAttempts(candidate)) + 1 : 1;

    const call = db.createCall({
      candidateId: candidate.id,
      jobId: candidate.job.id,
      attempt,
      trigger,
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
      results.push({ candidateId: id, ok: true, callId: call.id, mvCallId, attempt });
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
  const updated = db.updateCall(call.id, patch);
  if (updated && stage === 'call_failed' && call.stage !== 'call_failed') scheduleAutoRetry(updated);
  return updated;
}

/** Legacy records have no attempt counter: count the run of unconnected calls at the end of the history. */
function previousAttempts(candidate) {
  let n = 0;
  for (const k of candidate.calls || []) {
    if (k.stage === 'call_failed' || k.stage === 'trigger_failed') n += 1;
    else break;
  }
  return Math.max(n, 1);
}

/**
 * Busy / no answer / switched off … → schedule another attempt after the configured delay,
 * until CALL_MAX_ATTEMPTS is reached.
 */
export function scheduleAutoRetry(call) {
  const cfg = getConfig();
  if (!cfg.calls.autoRetry) return null;
  const cand = db.getCandidate(call.candidateId);
  if (!cand || cand.latestCallId !== call.id) return null;
  const attempt = call.attempt || cand.callAttempt || 1;
  if (attempt >= cfg.calls.maxAttempts) {
    db.updateCandidate(cand.id, { nextRetryAt: null });
    return null;
  }
  const at = new Date(Date.now() + cfg.calls.retryDelayMinutes * 60000).toISOString();
  db.updateCandidate(cand.id, { nextRetryAt: at });
  return at;
}

export function cancelAutoRetry(candidateId) {
  return db.updateCandidate(candidateId, { nextRetryAt: null });
}

/** Places every automatic retry that is due. Called by the background scheduler. */
export async function processDueRetries() {
  const due = db.listDueRetries();
  if (!due.length || missingMagickVoiceSettings().length) return [];
  const results = [];
  for (const c of due) {
    db.updateCandidate(c.id, { nextRetryAt: null }); // claim it first so it never fires twice
    const [r] = await triggerScreeningCalls([c.id], { trigger: 'auto' });
    results.push(r);
    if (r && !r.ok) console.warn('[auto-retry] candidate', c.id, r.error);
  }
  return results;
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
