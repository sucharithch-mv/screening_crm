import { triggerScreeningCalls } from '../../../../lib/calls.js';
import { missingMagickVoiceSettings } from '../../../../lib/config.js';
import { badRequest, json, readJson, requireRecruiterApi } from '../../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Recruiter: start AI screening calls.
 * Body: { candidateIds: number[], force?: boolean }
 */
export async function POST(request) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;

  const missing = missingMagickVoiceSettings();
  if (missing.length) {
    return json({ error: `MagickVoice is not configured. Add ${missing.join(', ')} to .env and restart.` }, 500);
  }

  const body = await readJson(request);
  const ids = Array.isArray(body?.candidateIds) ? body.candidateIds : [];
  if (!ids.length) return badRequest('Select at least one candidate.');

  const results = await triggerScreeningCalls(ids, { force: !!body.force });
  const started = results.filter((r) => r.ok).length;
  return json({ started, failed: results.length - started, results });
}
