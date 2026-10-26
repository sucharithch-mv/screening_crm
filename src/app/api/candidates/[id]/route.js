import * as db from '../../../../lib/db.js';
import { json, notFound, requireRecruiterApi } from '../../../../lib/http.js';

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
