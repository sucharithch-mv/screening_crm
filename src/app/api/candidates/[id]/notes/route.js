import * as db from '../../../../../lib/db.js';
import { getConfig } from '../../../../../lib/config.js';
import { getRecruiter } from '../../../../../lib/auth.js';
import { notifyMentions } from '../../../../../lib/email.js';
import { badRequest, json, notFound, readJson, requireRecruiterApi } from '../../../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recruiter: add a note. "@handle" mentions teammates listed in TEAM_MEMBERS. Body: { text } */
export async function POST(request, { params }) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const { id } = await params;
  const body = await readJson(request);
  const text = String(body?.text || '').trim().slice(0, 4000);
  if (!text) return badRequest('Write something first.');
  const candidate = db.getCandidate(id);
  if (!candidate) return notFound('Candidate not found');

  const cfg = getConfig();
  const session = getRecruiter(request);
  const me = cfg.team.find((m) => m.email && m.email.toLowerCase() === String(session?.email).toLowerCase());
  const handles = new Set(cfg.team.map((m) => m.handle));
  const mentions = [...new Set([...text.matchAll(/(^|[^\w@])@([a-z0-9._-]+)/gi)].map((m) => m[2].toLowerCase().replace(/[._-]+$/, '')))].filter(
    (h) => handles.has(h),
  );
  const authorName = me?.name || session?.email || 'Recruiter';
  const note = db.addNote(id, { author: session?.email || 'recruiter', authorName, text, mentions });
  const notified = await notifyMentions({ mentions, note, candidate, authorName });
  return json({ note, notified: notified.sent }, 201);
}

/** Recruiter: delete a note. ?noteId= */
export async function DELETE(request, { params }) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const { id } = await params;
  const noteId = new URL(request.url).searchParams.get('noteId');
  if (!db.deleteNote(id, noteId)) return notFound('Note not found');
  return json({ ok: true });
}
