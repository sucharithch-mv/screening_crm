import Link from 'next/link';
import { getConfig } from '../../lib/config.js';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Privacy notice — screening calls' };

export default function PrivacyPage() {
  const cfg = getConfig();
  const company = cfg.defaults.companyName;
  const contact = cfg.privacy.contactEmail;
  const days = cfg.privacy.retentionDays;

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">{company.charAt(0)}</span>
            {company} Careers
          </Link>
          <nav className="nav">
            <Link href="/">Open positions</Link>
          </nav>
        </div>
      </header>
      <main className="container-narrow page privacy">
        <div className="card card-body stack">
          <h1>Privacy notice for job applicants</h1>
          <p className="muted">How {company} handles your application and the AI screening call.</p>

          <h2>What we collect</h2>
          <ul>
            <li>The details you enter: name, email, mobile number, experience, location, LinkedIn URL, notice period and salary expectations.</li>
            <li>Your resume file.</li>
            <li>
              If you’re called: an <strong>audio recording</strong> of the screening call with our AI voice agent, a written transcript, and an automated
              analysis (a summary, a score and a qualified / not-qualified result).
            </li>
            <li>Notes our recruiters add while reviewing your application.</li>
          </ul>

          <h2>Why we use it</h2>
          <p>
            Only to assess your application for the role you chose and to contact you about it. The AI call asks standard screening questions; a recruiter
            reviews the result and can override it. We don’t sell your data or use it for marketing.
          </p>

          <h2>Who processes it</h2>
          <p>
            Calls are placed and analysed by our voice-AI provider (MagickVoice) on our behalf. Results are stored in our recruiting system and seen only by our
            hiring team.
          </p>

          <h2>How long we keep it</h2>
          <p>
            We keep your application, resume, call recording and analysis for <strong>{days} days</strong> after the hiring decision for this role, then delete
            them. Unfinished applications you saved to finish later are deleted after 30 days.
          </p>

          <h2>Your choices and how to ask for deletion</h2>
          <ul>
            <li>You can decline or hang up on the screening call at any time.</li>
            <li>
              To see, correct or delete your data — including the call recording — email{' '}
              {contact ? <a href={`mailto:${contact}?subject=Data%20deletion%20request`}>{contact}</a> : 'our recruiting team'} from the address you applied with,
              with “Data deletion request” in the subject. We’ll confirm within 30 days.
            </li>
            <li>Withdrawing consent ends the screening process for that application.</li>
          </ul>

          <div className="mt-16">
            <Link href="/" className="btn">
              ← Back to the application
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
