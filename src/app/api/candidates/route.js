import * as db from '../../../lib/db.js';
import { json, requireRecruiterApi } from '../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recruiter: all candidates with their latest screening status. Optional ?jobId=&stage= filters. */
export async function GET(request) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  const stage = url.searchParams.get('stage');
  let candidates = db.listCandidates();
  if (jobId) candidates = candidates.filter((c) => String(c.jobId) === jobId);
  if (stage) candidates = candidates.filter((c) => c.stage === stage);
  return json({ candidates });
}
