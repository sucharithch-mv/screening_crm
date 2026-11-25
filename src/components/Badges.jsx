import { EMAIL_STATUSES, STAGES } from '../lib/screening.js';

const PULSING = new Set(['call_queued', 'call_in_progress', 'awaiting_analysis']);

export function StageBadge({ stage }) {
  const s = STAGES[stage] || { label: stage || '—', tone: 'neutral' };
  return <span className={`badge tone-${s.tone}${PULSING.has(stage) ? ' pulse' : ''}`}>{s.label}</span>;
}

export function EmailBadge({ status }) {
  const s = EMAIL_STATUSES[status] || EMAIL_STATUSES.not_sent;
  return <span className={`badge tone-${s.tone}`}>{s.label}</span>;
}

export function DecisionBadge({ decision }) {
  if (!decision) return <span className="badge tone-neutral plain">No result yet</span>;
  const tone = decision === 'QUALIFIED' ? 'success' : decision === 'DISQUALIFIED' ? 'danger' : 'warning';
  return <span className={`badge tone-${tone}`}>{decision.replace(/_/g, ' ')}</span>;
}

export function ToneBadge({ tone = 'neutral', children }) {
  return <span className={`badge plain tone-${tone}`}>{children}</span>;
}

const MATCH = {
  strong: { label: 'Strong', tone: 'success', hint: 'Worth calling' },
  possible: { label: 'Possible', tone: 'warning', hint: 'Partial fit' },
  weak: { label: 'Weak', tone: 'danger', hint: 'Likely mismatch — skipping saves call minutes' },
  unknown: { label: 'Unread', tone: 'neutral', hint: 'Resume could not be read' },
};

/** Resume ↔ job match, e.g. "68% · Strong". */
export function MatchBadge({ match, showHint = false }) {
  if (!match) return <span className="muted small">Scoring…</span>;
  const m = MATCH[match.level] || MATCH.unknown;
  const title = [m.hint, ...(match.reasons || []), match.missing?.length ? `Missing: ${match.missing.join(', ')}` : '']
    .filter(Boolean)
    .join('\n');
  return (
    <span className="stack-sm" style={{ gap: 2, alignItems: "flex-start" }} title={title}>
      <span className={`badge plain tone-${m.tone}`}>
        {match.score != null ? `${match.score}% · ` : ''}
        {m.label}
      </span>
      {showHint && <span className="cell-sub">{m.hint}</span>}
    </span>
  );
}
