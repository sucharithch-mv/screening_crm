import crypto from 'node:crypto';
import { getConfig } from './config.js';
import { safeEqual } from './auth.js';
import * as db from './db.js';
import { applyMagickVoiceUpdate } from './calls.js';
import { fetchCall } from './magickvoice.js';
import { parseMagickVoicePayload } from './screening.js';

/**
 * Verifies X-Magick-Signature (HMAC-SHA256 with the automation's signing secret).
 * The exact signing string isn't documented, so the common variants are accepted:
 * "<timestamp>.<body>", "<timestamp><body>" or "<body>", hex or base64, optional "sha256=" prefix.
 */
export function verifyMagickSignature(rawBody, signatureHeader, timestampHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const provided = String(signatureHeader)
    .split(',')
    .map((s) => s.trim().replace(/^(sha256|v1|s)=/i, ''))
    .filter((s) => s && !/^t=/.test(s));
  const messages = timestampHeader ? [`${timestampHeader}.${rawBody}`, `${timestampHeader}${rawBody}`, rawBody] : [rawBody];
  const expected = [];
  for (const m of messages) {
    const d = crypto.createHmac('sha256', secret).update(m).digest();
    expected.push(d.toString('hex'), d.toString('base64'), d.toString('base64url'));
  }
  return provided.some((p) => expected.some((e) => safeEqual(p, e) || safeEqual(p.toLowerCase(), e)));
}

/** 'ok' | 'unauthorized' — token in URL (?token=) or a valid HMAC signature. */
export function authorizeWebhook({ token, rawBody, signature, timestamp }) {
  const cfg = getConfig();
  const tokenConfigured = !!cfg.webhookToken;
  const secretConfigured = !!cfg.mv.webhookSecret;
  if (!tokenConfigured && !secretConfigured) return 'ok'; // dev mode: nothing configured
  if (tokenConfigured && token && safeEqual(token, cfg.webhookToken)) return 'ok';
  if (secretConfigured && verifyMagickSignature(rawBody, signature, timestamp, cfg.mv.webhookSecret)) return 'ok';
  return 'unauthorized';
}

/**
 * Handles one webhook delivery from MagickVoice and updates the matching candidate.
 * Always resolves with a result object (the HTTP layer decides the status code).
 */
export async function processWebhook({ body, eventHeader, deliveryId }) {
  if (db.isDeliveryProcessed(deliveryId)) return { ok: true, duplicate: true };

  let parsed = parseMagickVoicePayload(body, { eventHeader });
  const call = db.findCall(parsed);

  if (!call) {
    db.markDeliveryProcessed(deliveryId);
    db.logWebhookEvent({
      event: parsed.event,
      deliveryId: deliveryId || null,
      matched: false,
      candidateId: null,
      callId: null,
      mvCallId: parsed.mvCallId,
      payload: body,
    });
    return { ok: true, matched: false, message: 'No CRM call matches this payload; event logged.' };
  }

  // Analysis event without analysis data in the payload → fetch it from the API
  // (skipped once the call already has a final result).
  const cfg = getConfig();
  const looksFinal = parsed.statusClass === 'completed' || /analysis/i.test(parsed.event || '');
  const alreadyFinal = ['qualified', 'disqualified', 'needs_review'].includes(call.stage);
  const mvCallId = call.mvCallId || parsed.mvCallId;
  if (looksFinal && !alreadyFinal && !parsed.analysis && mvCallId && cfg.mv.apiKey) {
    try {
      const detail = parseMagickVoicePayload(await fetchCall(mvCallId));
      parsed = {
        ...parsed,
        analysis: detail.analysis || parsed.analysis,
        recordingUrl: parsed.recordingUrl || detail.recordingUrl,
        rawStatus: parsed.rawStatus || detail.rawStatus,
        statusClass: parsed.statusClass || detail.statusClass,
        talkTimeSeconds: parsed.talkTimeSeconds ?? detail.talkTimeSeconds,
        durationSeconds: parsed.durationSeconds ?? detail.durationSeconds,
      };
    } catch {
      // keep what we have; the recruiter can press "Sync" later
    }
  }

  const updated = applyMagickVoiceUpdate(call, parsed);
  db.markDeliveryProcessed(deliveryId);
  db.logWebhookEvent({
    event: parsed.event,
    deliveryId: deliveryId || null,
    matched: true,
    candidateId: call.candidateId,
    callId: call.id,
    mvCallId: updated.mvCallId,
    stage: updated.stage,
    emailStatus: updated.emailStatus,
    payload: body,
  });

  return {
    ok: true,
    matched: true,
    candidateId: call.candidateId,
    stage: updated.stage,
    emailStatus: updated.emailStatus,
  };
}
