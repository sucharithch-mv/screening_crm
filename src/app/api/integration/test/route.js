import { fetchCredits } from '../../../../lib/magickvoice.js';
import { json, requireRecruiterApi } from '../../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recruiter: checks the API key / tenant / account by reading the credit balance (read-only). */
export async function POST(request) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  try {
    const data = await fetchCredits();
    const balance =
      data?.balance ?? data?.credits ?? data?.available ?? data?.data?.balance ?? data?.remaining ?? null;
    return json({ ok: true, balance, raw: data });
  } catch (err) {
    return json({ ok: false, error: err.message }, 502);
  }
}
