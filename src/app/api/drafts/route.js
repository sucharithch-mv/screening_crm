import * as db from '../../../lib/db.js';
import { badRequest, json, notFound, readJson } from '../../../lib/http.js';
import { cleanText } from '../../../lib/validation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELDS = { jobId: 10, name: 120, email: 160, phone: 30, experienceYears: 10, currentLocation: 120, linkedinUrl: 300, noticePeriod: 60, currentCtc: 60, expectedCtc: 60 };

/** Public: save a partly filled application so the candidate can finish later. Body: { token?, data } */
export async function POST(request) {
  const body = await readJson(request);
  if (!body || typeof body.data !== 'object') return badRequest('Nothing to save.');
  const data = {};
  for (const [k, max] of Object.entries(FIELDS)) data[k] = cleanText(body.data[k], max);
  if (!data.email && !data.name && !data.phone) return badRequest('Add at least your name or email before saving.');
  const token = typeof body.token === 'string' && /^[a-f0-9]{32}$/.test(body.token) ? body.token : null;
  const draft = db.saveDraft({ token, data });
  return json({ token: draft.token, savedAt: draft.updatedAt });
}

/** Public: load a saved draft by its token (?token=). */
export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!/^[a-f0-9]{32}$/.test(token)) return badRequest('Invalid link.');
  const draft = db.getDraft(token);
  if (!draft) return notFound('This saved application has expired or was already submitted.');
  return json({ data: draft.data, savedAt: draft.updatedAt });
}
