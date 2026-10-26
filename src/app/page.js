import Link from 'next/link';
import { listJobs } from '../lib/db.js';
import { getConfig } from '../lib/config.js';
import CareersClient from '../components/CareersClient.jsx';

export const dynamic = 'force-dynamic';

export default async function CareersPage({ searchParams }) {
  const params = (await searchParams) || {};
  const cfg = getConfig();
  const jobs = listJobs({ openOnly: true }).map((j) => ({
    id: j.id,
    title: j.title,
    companyName: j.companyName,
    location: j.location,
    employmentType: j.employmentType,
    experience: j.experience,
    description: j.description,
  }));
  const preselected = Number(params.job) || null;

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">{cfg.defaults.companyName.charAt(0)}</span>
            {cfg.defaults.companyName} Careers
          </Link>
          <nav className="nav">
            <Link href="/recruiter">Recruiter login</Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <span className="pill">We&apos;re hiring · {jobs.length} open role{jobs.length === 1 ? '' : 's'}</span>
          <h1>Apply in two minutes. Get screened by our AI recruiter.</h1>
          <p>
            Pick a role, share your details and resume. Shortlisted applicants get a short phone screening from our AI
            voice agent, and you&apos;ll hear back by email right after the call.
          </p>
          <div className="steps mt-24">
            <div className="step">
              <span className="step-num">1</span>
              <div>
                <div className="strong">Choose a role</div>
                <div className="muted small">Select the job you want to apply for.</div>
              </div>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <div>
                <div className="strong">Upload your resume</div>
                <div className="muted small">PDF, DOC or DOCX up to 5 MB.</div>
              </div>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <div>
                <div className="strong">Take the AI screening call</div>
                <div className="muted small">About 10 minutes; results arrive by email.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="container page">
        <CareersClient jobs={jobs} preselectedJobId={preselected} />
      </main>
    </>
  );
}
