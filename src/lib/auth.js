import crypto from 'node:crypto';
import { getConfig } from './config.js';

export const SESSION_COOKIE = 'crm_session';
const SESSION_HOURS = 12;

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  return ab.length === bb.length && ab.length > 0 && crypto.timingSafeEqual(ab, bb);
}

function secret() {
  const s = getConfig().sessionSecret;
  if (!s) throw new Error('SESSION_SECRET is not set in .env');
  return s;
}

export function signSession(email) {
  const payload = Buffer.from(JSON.stringify({ e: email, exp: Date.now() + SESSION_HOURS * 3600 * 1000 })).toString(
    'base64url',
  );
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  let expected;
  try {
    expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  } catch {
    return null;
  }
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return { email: data.e };
  } catch {
    return null;
  }
}

export function checkCredentials(email, password) {
  const { recruiter } = getConfig();
  if (!recruiter.email || !recruiter.password) return false;
  const emailOk = safeEqual(String(email || '').trim().toLowerCase(), recruiter.email.toLowerCase());
  const passOk = safeEqual(String(password || ''), recruiter.password);
  return emailOk && passOk;
}

export function readCookie(request, name = SESSION_COOKIE) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Session for an API request, or null. */
export function getRecruiter(request) {
  return verifySession(readCookie(request));
}

/** True when the browser reached us over https (directly or via a proxy/tunnel). */
export function isHttpsRequest(request) {
  const forwarded = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (forwarded) return forwarded === 'https';
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function sessionCookie(token, { secure = false, maxAgeSeconds = SESSION_HOURS * 3600 } = {}) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
