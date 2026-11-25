/**
 * Result emails the recruiter reviews before they go out ("Review & send"),
 * plus @mention notifications. Sent over SMTP when SMTP_HOST / SMTP_FROM are set;
 * otherwise the recruiter can open the draft in their own mail app and mark it sent.
 */
import { getConfig, smtpConfigured } from './config.js';

export function buildResultEmail(candidate) {
  const job = candidate.job || {};
  const company = job.companyName || getConfig().defaults.companyName;
  const decision = candidate.screening?.decision || null;
  const to = candidate.screening?.confirmedEmail || latestConfirmedEmail(candidate) || candidate.email;
  const first = String(candidate.name || '').split(/\s+/)[0] || 'there';
  const role = job.title || 'the role';

  if (decision === 'QUALIFIED') {
    return {
      decision,
      to,
      subject: `Next steps for your ${role} application at ${company}`,
      body:
        `Hi ${first},\n\n` +
        `Thank you for taking the time to speak with us about the ${role} role at ${company}.\n\n` +
        `We're happy to let you know that you've cleared the initial screening. Our hiring team will contact you shortly to schedule the next round.\n\n` +
        `Your application reference is ${candidate.ref}.\n\n` +
        `Best regards,\n${company} Talent Team`,
    };
  }
  if (decision === 'DISQUALIFIED') {
    return {
      decision,
      to,
      subject: `Your ${role} application at ${company}`,
      body:
        `Hi ${first},\n\n` +
        `Thank you for your interest in the ${role} role at ${company} and for taking the screening call.\n\n` +
        `After careful review, we won't be moving forward with your application for this position. We'll keep your details on file and reach out if a better-matched opening comes up.\n\n` +
        `We wish you the very best in your search.\n\n` +
        `Best regards,\n${company} Talent Team`,
    };
  }
  return {
    decision,
    to,
    subject: `Update on your ${role} application at ${company}`,
    body:
      `Hi ${first},\n\nThank you for speaking with us about the ${role} role at ${company}. ` +
      `We're reviewing your screening and will be in touch soon.\n\nBest regards,\n${company} Talent Team`,
  };
}

function latestConfirmedEmail(candidate) {
  const latest = (candidate.calls || []).find((k) => k.id === candidate.latestCallId);
  return latest?.analysis?.confirmedEmail || null;
}

export async function sendMail({ to, subject, text, replyTo }) {
  const cfg = getConfig();
  if (!smtpConfigured(cfg)) throw new Error('SMTP is not configured (set SMTP_HOST and SMTP_FROM in .env).');
  const nodemailer = (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
  });
  const info = await transport.sendMail({ from: cfg.smtp.from, to, subject, text, replyTo });
  return { messageId: info.messageId };
}

/** Emails each mentioned teammate who has an address. Never throws. */
export async function notifyMentions({ mentions, note, candidate, authorName }) {
  const cfg = getConfig();
  if (!smtpConfigured(cfg) || !mentions?.length) return { sent: 0 };
  let sent = 0;
  for (const handle of mentions) {
    const member = cfg.team.find((m) => m.handle === handle);
    if (!member?.email) continue;
    try {
      await sendMail({
        to: member.email,
        subject: `${authorName} mentioned you on ${candidate.name} (${candidate.ref})`,
        text: `${authorName} wrote:\n\n"${note.text}"\n\nCandidate: ${candidate.name} — ${candidate.job?.title || ''}\n${cfg.publicBaseUrl}/recruiter/candidates/${candidate.id}`,
      });
      sent += 1;
    } catch (err) {
      console.warn('[mentions] email failed for', handle, err.message);
    }
  }
  return { sent };
}
