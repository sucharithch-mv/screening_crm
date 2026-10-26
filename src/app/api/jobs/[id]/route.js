import * as db from '../../../../lib/db.js';
import { badRequest, json, notFound, readJson, requireRecruiterApi } from '../../../../lib/http.js';
import { cleanText } from '../../../../lib/validation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recruiter: update a job (e.g. open/close it). */
export async function PATCH(request, { params }) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');

  const patch = {};
  for (const [key, max] of [
    ['title', 120],
    ['companyName', 120],
    ['agentName', 60],
    ['location', 120],
    ['employmentType', 60],
    ['experience', 60],
    ['description', 2000],
  ]) {
    if (body[key] !== undefined) patch[key] = cleanText(body[key], max);
  }
  if (body.isOpen !== undefined) patch.isOpen = !!body.isOpen;
  if (patch.title !== undefined && patch.title.length < 2) return badRequest('Job title is required');

  const job = db.updateJob(id, patch);
  if (!job) return notFound('Job not found');
  return json({ job });
}
