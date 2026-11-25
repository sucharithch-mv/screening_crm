import Link from 'next/link';
import { listMentions } from '../../../../lib/db.js';
import { getConfig } from '../../../../lib/config.js';
import { requireRecruiterPage } from '../../../../lib/page-auth.js';
import { formatDateTime } from '../../../../lib/format.js';
import { StageBadge } from '../../../../components/Badges.jsx';

export const dynamic = 'force-dynamic';

export default async function MentionsPage({ searchParams }) {
  const session = await requireRecruiterPage();
  const params = (await searchParams) || {};
  const cfg = getConfig();
  const me = cfg.team.find((m) => m.email && m.email.toLowerCase() === String(session.email).toLowerCase());
  const who = params.who ?? (me ? me.handle : '');
  const all = listMentions();
  const list = who ? all.filter((n) => n.mentions.includes(who)) : all;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <h1>Mentions</h1>
        <p className="muted mt-8">Notes where a teammate was tagged with @. Add teammates with TEAM_MEMBERS in .env.</p>
      </div>
      <div className="chip-row card">
        <Link href="/recruiter/mentions?who=" className={`chip${!who ? ' active' : ''}`}>
          Everyone <strong>{all.length}</strong>
        </Link>
        {cfg.team.map((m) => (
          <Link key={m.handle} href={`/recruiter/mentions?who=${m.handle}`} className={`chip${who === m.handle ? ' active' : ''}`}>
            @{m.handle} {me?.handle === m.handle ? '(you)' : ''} <strong>{all.filter((n) => n.mentions.includes(m.handle)).length}</strong>
          </Link>
        ))}
      </div>
      <div className="card">
        {list.length === 0 ? (
          <div className="empty">No mentions{who ? ` for @${who}` : ''} yet.</div>
        ) : (
          <div className="card-body notes-list">
            {list.map((n) => (
              <div key={n.id} className="note">
                <div className="note-meta">
                  <span>
                    <strong style={{ color: 'var(--text)' }}>{n.authorName || n.author}</strong> on{' '}
                    <Link href={`/recruiter/candidates/${n.candidateId}#notes`}>{n.candidateName}</Link> · {n.jobTitle}
                  </span>
                  <span>{formatDateTime(n.createdAt)}</span>
                </div>
                <div className="note-text">{n.text}</div>
                <div className="mt-8">
                  <StageBadge stage={n.stage} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
