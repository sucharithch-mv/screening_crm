import fs from 'node:fs';
import path from 'node:path';
import * as db from '../../../../../lib/db.js';
import { notFound, requireRecruiterApi } from '../../../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recruiter: download / view a candidate's resume. Add ?inline=1 to open PDFs in the browser. */
export async function GET(request, { params }) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const { id } = await params;
  const candidate = db.getCandidate(id);
  if (!candidate?.resume?.storedName) return notFound('Resume not found');

  const dir = db.resumesDir();
  const file = path.join(dir, path.basename(candidate.resume.storedName));
  if (!file.startsWith(dir) || !fs.existsSync(file)) return notFound('Resume file is missing');

  const inline = new URL(request.url).searchParams.get('inline') === '1' && candidate.resume.mimeType === 'application/pdf';
  const downloadName = `${candidate.name.replace(/[^\w]+/g, '_')}_${candidate.resume.originalName}`.slice(0, 150);
  const data = fs.readFileSync(file);
  return new Response(data, {
    headers: {
      'Content-Type': candidate.resume.mimeType || 'application/octet-stream',
      'Content-Length': String(data.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${downloadName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
