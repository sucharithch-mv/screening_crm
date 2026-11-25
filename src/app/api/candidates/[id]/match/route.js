import { computeCandidateMatch } from '../../../../../lib/resume-match.js';
import { json, notFound, requireRecruiterApi } from '../../../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recruiter: (re)compute the resume ↔ job match for one candidate. */
export async function POST(request, { params }) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const { id } = await params;
  const match = await computeCandidateMatch(id);
  if (!match) return notFound('Candidate not found');
  return json({ match });
}
