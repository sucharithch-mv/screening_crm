import Link from 'next/link';
import { listJobs } from '../../../../lib/db.js';
import { getConfig } from '../../../../lib/config.js';
import { requireRecruiterPage } from '../../../../lib/page-auth.js';
import { formatDate } from '../../../../lib/format.js';
import JobForm from '../../../../components/JobForm.jsx';
import JobToggle from '../../../../components/JobToggle.jsx';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  await requireRecruiterPage();
  const cfg = getConfig();
  const jobs = listJobs();

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <h1>Jobs</h1>
        <p className="muted mt-8">
          Open jobs appear on the careers page. The job title, id, company and agent name are passed to the AI call as{' '}
          <code>job_role</code>, <code>job_id</code>, <code>company_name</code> and <code>agent_name</code>.
        </p>
      </div>

      <div className="detail-grid">
        <JobForm defaults={{ companyName: cfg.defaults.companyName, agentName: cfg.defaults.agentName }} />

        <section className="card">
          <div className="card-head">
            <h3>All jobs</h3>
            <span className="muted small">{jobs.length}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>AI agent</th>
                  <th className="right">Applicants</th>
                  <th>Created</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      No jobs yet.
                    </td>
                  </tr>
                )}
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <div className="cell-title">{j.title}</div>
                      <div className="cell-sub">
                        #{j.id} · {j.companyName}
                        {j.location ? ` · ${j.location}` : ''}
                      </div>
                    </td>
                    <td>{j.agentName}</td>
                    <td className="right">
                      {j.applicantCount > 0 ? <Link href={`/recruiter?job=${j.id}`}>{j.applicantCount}</Link> : 0}
                    </td>
                    <td className="small nowrap">{formatDate(j.createdAt)}</td>
                    <td>
                      <JobToggle jobId={j.id} isOpen={j.isOpen} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
