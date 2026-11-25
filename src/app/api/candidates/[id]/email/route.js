import * as db from '../../../../../lib/db.js';
import { getConfig, smtpConfigured } from '../../../../../lib/config.js';
import { getRecruiter } from '../../../../../lib/auth.js';
import { buildResultEmail, sendMail } from '../../../../../lib/email.js';
import { badRequest, json, notFound, readJson, requireRecruiterApi } from '../../../../../lib/http.js';
import { isEmail } from '../../../../../lib/validation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recruiter: preview of the result email for review before sending. */
export async function GET(request, { params }) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const { id } = await params;
  const candidate = db.getCandidate(id);
  if (!candidate) return notFound('Candidate not found');
  return json({
    email: buildResultEmail(candidate),
    emailStatus: candidate.emailStatus,
    canSend: smtpConfigured(),
    from: getConfig().smtp.from || null,
  });
}

/**
 * Recruiter: send the reviewed email, or record that it was sent another way.
 * Body: { action: 'send' | 'mark_sent', to, subject, body }
 */
export async function POST(request, { params }) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const { id } = await params;
  const candidate = db.getCandidate(id);
  if (!candidate) return notFound('Candidate not found');
  const input = await readJson(request);
  if (!input) return badRequest('Invalid JSON body');
  const who = getRecruiter(request)?.email || 'recruiter';
  const to = String(input.to || '').trim();

  if (input.action === 'mark_sent') {
    applyEmailStatus(candidate, 'sent', `Marked as sent by ${who}`);
    return json({ ok: true, emailStatus: 'sent' });
  }

  if (!smtpConfigured()) return badRequest('Direct sending is not set up. Add SMTP_HOST and SMTP_FROM to .env, or send it from your mail app and mark it as sent.');
  if (!isEmail(to)) return badRequest('Enter a valid recipient email.');
  const subject = String(input.subject || '').trim().slice(0, 300);
  const text = String(input.body || '').trim().slice(0, 20000);
  if (!subject || !text) return badRequest('Subject and message are required.');
  try {
    const { messageId } = await sendMail({ to, subject, text, replyTo: getConfig().recruiter.email || undefined });
    applyEmailStatus(candidate, 'sent', `Reviewed and sent by ${who} to ${to}`, { to, subject, messageId });
    return json({ ok: true, emailStatus: 'sent' });
  } catch (err) {
    applyEmailStatus(candidate, 'failed', `Send failed: ${err.message}`);
    return json({ error: err.message }, 502);
  }
}

function applyEmailStatus(candidate, status, detail, extra = {}) {
  if (candidate.latestCallId) db.updateCall(candidate.latestCallId, { emailStatus: status, emailStatusDetail: detail, emailSent: extra });
  else db.updateCandidate(candidate.id, { emailStatus: status, emailStatusDetail: detail, emailUpdatedAt: new Date().toISOString() });
}
