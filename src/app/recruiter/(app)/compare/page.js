import Link from 'next/link';
import { getCandidate } from '../../../../lib/db.js';
import { requireRecruiterPage } from '../../../../lib/page-auth.js';
import { formatDate } from '../../../../lib/format.js';
import { DecisionBadge, MatchBadge, StageBadge } from '../../../../components/Badges.jsx';

export const dynamic = 'force-dynamic';

/** "Immediate" → 0, "30 days" → 30, "2 months" → 60; unknown → null */
function noticeDays(v) {
  const s = String(v || '').toLowerCase();
  if (!s) return null;
  if (/immediate|serving|0 ?days?/.test(s)) return 0;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  if (/month/.test(s)) return n * 30;
  if (/week/.test(s)) return n * 7;
  return n;
}

function qClass(result) {
  const r = String(result || '').toUpperCase();
  if (r.startsWith('ADEQUATE') || r === 'CORRECT' || r === 'GOOD') return 'q-adequate';
  if (r.startsWith('INADEQUATE') || r === 'INCORRECT' || r === 'WRONG') return 'q-inadequate';
  if (r.startsWith('PARTIAL')) return 'q-partial';
  return 'q-skipped';
}

export default async function ComparePage({ searchParams }) {
  await requireRecruiterPage();
  const params = (await searchParams) || {};
  const ids = String(params.ids || '')
    .split(',')
    .map(Number)
    .filter(Number.isInteger)
    .slice(0, 3);
  const list = ids.map((id) => getCandidate(id)).filter(Boolean);

  if (list.length < 2) {
    return (
      <div className="stack">
        <Link href="/recruiter" className="small">
          ← All candidates
        </Link>
        <div className="card empty">Select 2–3 candidates for the same job on the Candidates page, then click Compare.</div>
      </div>
    );
  }

  const cols = list.map((c) => {
    const latest = c.calls.find((k) => k.id === c.latestCallId) || null;
    const a = latest?.analysis || null;
    const score = a?.score ?? c.manualScore?.value ?? null;
    return {
      c,
      a,
      score,
      scoreManual: a?.score == null && c.manualScore?.value != null,
      match: c.resumeMatch,
      exp: c.experienceYears ?? c.resumeMatch?.experienceYears ?? null,
      notice: c.noticePeriod || a?.dimensions?.notice_period || '',
      currentCtc: c.currentCtc || a?.dimensions?.current_ctc || '',
      expectedCtc: c.expectedCtc || a?.dimensions?.expected_ctc || a?.dimensions?.expected_salary || '',
    };
  });
  const sameJob = new Set(list.map((c) => c.jobId)).size === 1;
  const best = (vals, pick = Math.max) => {
    const nums = vals.filter((v) => v != null);
    return nums.length > 1 ? pick(...nums) : null;
  };
  const bestScore = best(cols.map((x) => x.score));
  const bestMatch = best(cols.map((x) => x.match?.score ?? null));
  const bestNotice = best(cols.map((x) => noticeDays(x.notice)), Math.min);
  const maxQ = Math.max(0, ...cols.map((x) => x.a?.questions?.length || 0));

  const Row = ({ label, children }) => (
    <tr>
      <th scope="row">{label}</th>
      {children}
    </tr>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Link href="/recruiter" className="small">
        ← All candidates
      </Link>
      <div>
        <h1>Compare candidates</h1>
        <p className="muted mt-8">
          {sameJob ? (
            <>
              For <strong>{list[0].job?.title}</strong>. Best value in each row is highlighted in green.
            </>
          ) : (
            'These candidates applied for different jobs.'
          )}
        </p>
      </div>

      <div className="card table-wrap">
        <table className="table compare-table">
          <thead>
            <tr>
              <th />
              {cols.map(({ c }) => (
                <th key={c.id} style={{ textTransform: 'none', letterSpacing: 0 }}>
                  <Link href={`/recruiter/candidates/${c.id}`} className="cell-title" style={{ fontSize: 15 }}>
                    {c.name}
                  </Link>
                  <div className="cell-sub">
                    {c.ref} · {c.job?.title}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Status">
              {cols.map(({ c }) => (
                <td key={c.id}>
                  <StageBadge stage={c.stage} />
                </td>
              ))}
            </Row>
            <Row label="Decision">
              {cols.map(({ c, a }) => (
                <td key={c.id}>
                  <DecisionBadge decision={a?.decision} />
                </td>
              ))}
            </Row>
            <Row label="Screening score">
              {cols.map(({ c, score, scoreManual }) => (
                <td key={c.id} className={score != null && score === bestScore ? 'best' : 'strong'}>
                  {score != null ? `${score}%` : '—'}
                  {scoreManual && <span className="manual-tag"> manual</span>}
                </td>
              ))}
            </Row>
            <Row label="Resume match">
              {cols.map(({ c, match }) => (
                <td key={c.id} className={match?.score != null && match.score === bestMatch ? 'best' : ''}>
                  <MatchBadge match={match} />
                </td>
              ))}
            </Row>
            <Row label="Skills found">
              {cols.map(({ c, match }) => (
                <td key={c.id}>
                  <div className="skill-list">
                    {(match?.matched || []).map((s) => (
                      <span key={s} className="badge plain tone-success">
                        {s}
                      </span>
                    ))}
                    {!match?.matched?.length && <span className="muted">—</span>}
                  </div>
                </td>
              ))}
            </Row>
            <Row label="Skills missing">
              {cols.map(({ c, match }) => (
                <td key={c.id}>
                  <div className="skill-list">
                    {(match?.missing || []).map((s) => (
                      <span key={s} className="badge plain tone-danger">
                        {s}
                      </span>
                    ))}
                    {!match?.missing?.length && <span className="muted">—</span>}
                  </div>
                </td>
              ))}
            </Row>
            <Row label="Experience">
              {cols.map(({ c, exp }) => (
                <td key={c.id}>{exp != null ? `${exp} years` : '—'}</td>
              ))}
            </Row>
            <Row label="Notice period">
              {cols.map(({ c, notice }) => (
                <td key={c.id} className={notice && noticeDays(notice) === bestNotice ? 'best' : ''}>
                  {notice || '—'}
                </td>
              ))}
            </Row>
            <Row label="Current CTC">
              {cols.map(({ c, currentCtc }) => (
                <td key={c.id}>{currentCtc || '—'}</td>
              ))}
            </Row>
            <Row label="Expected pay">
              {cols.map(({ c, expectedCtc }) => (
                <td key={c.id} className="strong">
                  {expectedCtc || '—'}
                </td>
              ))}
            </Row>
            <Row label="Location">
              {cols.map(({ c }) => (
                <td key={c.id}>{c.currentLocation || '—'}</td>
              ))}
            </Row>
            <Row label="Integrity / sentiment">
              {cols.map(({ c, a }) => (
                <td key={c.id} className="small">
                  {a?.integrityFlag ? `Integrity: ${a.integrityFlag}` : '—'}
                  {a?.sentiment ? ` · ${a.sentiment}` : ''}
                </td>
              ))}
            </Row>
            {maxQ > 0 && (
              <Row label="Question results">
                {cols.map(({ c, a }) => (
                  <td key={c.id}>
                    <div className="skill-list">
                      {(a?.questions || []).map((q) => (
                        <span key={q.number} className={`badge plain tone-neutral ${qClass(q.result)}`} title={q.result}>
                          Q{q.number}: {q.result.slice(0, 4)}
                        </span>
                      ))}
                      {!a?.questions?.length && <span className="muted">—</span>}
                    </div>
                  </td>
                ))}
              </Row>
            )}
            <Row label="AI summary">
              {cols.map(({ c, a }) => (
                <td key={c.id} className="small">
                  {a?.summary || c.screening?.summary || <span className="muted">No call result yet</span>}
                </td>
              ))}
            </Row>
            <Row label="Notes">
              {cols.map(({ c }) => (
                <td key={c.id} className="small">
                  {c.notes?.length ? `${c.notes.length} note${c.notes.length === 1 ? '' : 's'} — latest: “${c.notes[c.notes.length - 1].text.slice(0, 80)}”` : '—'}
                </td>
              ))}
            </Row>
            <Row label="Applied">
              {cols.map(({ c }) => (
                <td key={c.id} className="small">
                  {formatDate(c.createdAt)}
                </td>
              ))}
            </Row>
          </tbody>
        </table>
      </div>
    </div>
  );
}
