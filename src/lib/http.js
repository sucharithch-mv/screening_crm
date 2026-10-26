import { getRecruiter } from './auth.js';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export const badRequest = (error, extra = {}) => json({ error, ...extra }, 400);
export const notFound = (error = 'Not found') => json({ error }, 404);

/** Returns a 401 Response when the request has no recruiter session, otherwise null. */
export function requireRecruiterApi(request) {
  return getRecruiter(request) ? null : json({ error: 'Please sign in as a recruiter.' }, 401);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
