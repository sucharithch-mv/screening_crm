'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/recruiter', label: 'Candidates', match: (p) => p === '/recruiter' || p.startsWith('/recruiter/candidates') },
  { href: '/recruiter/jobs', label: 'Jobs', match: (p) => p.startsWith('/recruiter/jobs') },
  { href: '/recruiter/integration', label: 'MagickVoice', match: (p) => p.startsWith('/recruiter/integration') },
];

export default function RecruiterNav({ email }) {
  const pathname = usePathname() || '';
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/recruiter/login');
    router.refresh();
  }

  return (
    <div className="row">
      <nav className="nav">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={l.match(pathname) ? 'active' : ''}>
            {l.label}
          </Link>
        ))}
        <Link href="/" target="_blank">
          Careers page ↗
        </Link>
      </nav>
      <span className="muted small nowrap" title={email}>
        {email}
      </span>
      <button className="btn btn-sm" onClick={logout}>
        Sign out
      </button>
    </div>
  );
}
