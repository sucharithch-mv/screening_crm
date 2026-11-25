import * as db from '../../../../lib/db.js';
import { cancelAutoRetry } from '../../../../lib/calls.js';
import { getRecruiter } from '../../../../lib/auth.js';
import { badRequest, json, notFound, readJson, requireRecruiterApi } from '../../../../lib/http.js';
import { cleanText } from '../../../../lib/validation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recruiter: full candidate record incl. call attempts and webhook events. */
export async function GET(request, { params }) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const { id } = await params;
  const candidate = db.getCandidate(id);
  if (!candidate) return notFound('Candidate not found');
  return json({ candidate });
}

/**
 * Recruiter: edit a candidate.
 * Body (all optional):
 *   manualScore: 0–100 | null   — score added by a recruiter when the AI analysis has none
 *   cancelAutoRetry: true       — stop the scheduled automatic retry call
 *   noticePeriod / currentCtc / expectedCtc: string
 */
export async function PATCH(request, { params }) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const existing = db.getCandidate(id);
  if (!existing) return notFound('Candidate not found');

  const patch = {};
  if (body.manualScore !== undefined) {
    if (body.manualScore === null || body.manualScore === '') patch.manualScore = null;
    else {
      const n = Number(body.manualScore);
      if (!Number.isFinite(n) || n < 0 || n > 100) return badRequest('Score must be a number from 0 to 100.');
      const by = getRecruiter(request)?.email || 'recruiter';
      patch.manualScore = { value: Math.round(n * 10) / 10, by, at: new Date().toISOString(), reason: cleanText(body.reason, 300) };
    }
  }
  for (const k of ['noticePeriod', 'currentCtc', 'expectedCtc']) {
    if (body[k] !== undefined) patch[k] = cleanText(body[k], 60);
  }
  let candidate = Object.keys(patch).length ? db.updateCandidate(id, patch) : existing;
  if (body.cancelAutoRetry) candidate = cancelAutoRetry(id);
  return json({ candidate });
}
