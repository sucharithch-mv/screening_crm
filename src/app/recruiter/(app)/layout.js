import Link from 'next/link';
import { requireRecruiterPage } from '../../../lib/page-auth.js';
import RecruiterNav from '../../../components/RecruiterNav.jsx';

export const dynamic = 'force-dynamic';

export default async function RecruiterLayout({ children }) {
  const session = await requireRecruiterPage();
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link href="/recruiter" className="brand">
            <span className="brand-mark">S</span>
            Screening CRM
          </Link>
          <RecruiterNav email={session.email} />
        </div>
      </header>
      <main className="container page">{children}</main>
    </>
  );
}
