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
