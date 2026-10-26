import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentRecruiter } from '../../../lib/page-auth.js';
import LoginForm from '../../../components/LoginForm.jsx';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await currentRecruiter()) redirect('/recruiter');
  return (
    <div className="login-shell">
      <div className="login-card stack">
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="brand-mark">S</span>
          <span className="strong" style={{ fontSize: 16 }}>Screening CRM</span>
        </div>
        <div className="card card-body stack">
          <div>
            <h2>Recruiter sign in</h2>
            <p className="muted small mt-8">Review applicants and launch AI screening calls.</p>
          </div>
          <LoginForm />
        </div>
        <p className="muted small" style={{ textAlign: 'center' }}>
          Looking for a job? <Link href="/">See open positions</Link>
        </p>
      </div>
    </div>
  );
}
