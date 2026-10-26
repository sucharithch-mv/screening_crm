import { checkCredentials, isHttpsRequest, sessionCookie, signSession } from '../../../../lib/auth.js';
import { getConfig } from '../../../../lib/config.js';
import { json, readJson } from '../../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const cfg = getConfig();
  if (!cfg.recruiter.email || !cfg.recruiter.password || !cfg.sessionSecret) {
    return json({ error: 'Recruiter login is not configured. Set RECRUITER_EMAIL, RECRUITER_PASSWORD and SESSION_SECRET in .env.' }, 500);
  }
  const body = (await readJson(request)) || {};
  if (!checkCredentials(body.email, body.password)) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return json({ error: 'Incorrect email or password.' }, 401);
  }
  const token = signSession(String(body.email).trim().toLowerCase());
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, { secure: isHttpsRequest(request) }) });
}
