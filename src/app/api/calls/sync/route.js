import * as db from '../../../../lib/db.js';
import { syncActiveCalls, syncCall } from '../../../../lib/calls.js';
import { json, notFound, readJson, requireRecruiterApi } from '../../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Recruiter: pull call status + analysis from MagickVoice.
 * Body: { candidateId } for one candidate, or {} for every call still in progress.
 */
export async function POST(request) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const body = (await readJson(request)) || {};

  if (body.candidateId) {
    const candidate = db.getCandidate(body.candidateId);
    if (!candidate) return notFound('Candidate not found');
    if (!candidate.latestCallId) return json({ error: 'No screening call has been triggered for this candidate yet.' }, 400);
    try {
      const call = await syncCall(candidate.latestCallId);
      return json({ ok: true, stage: call.stage, emailStatus: call.emailStatus });
    } catch (err) {
      return json({ error: err.message }, 502);
    }
  }

  const results = await syncActiveCalls();
  return json({ ok: true, synced: results.filter((r) => r.ok).length, results });
}
