import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession } from './auth.js';

/** For server components: returns the recruiter session or redirects to the login page. */
export async function requireRecruiterPage() {
  const store = await cookies();
  const session = verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) redirect('/recruiter/login');
  return session;
}

export async function currentRecruiter() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}
