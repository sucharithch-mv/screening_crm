import { getConfig } from './config.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (v) => EMAIL_RE.test(String(v || '').trim());

/** Normalises a phone number to E.164. Bare 10-digit numbers get DEFAULT_COUNTRY_CODE (+91). */
export function normalizePhone(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith('+') || raw.startsWith('00');
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) digits = digits.slice(2);
  const cc = getConfig().defaults.countryCode.replace(/\D/g, '') || '91';

  let e164;
  if (hasPlus) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+${cc}${digits}`;
  else if (digits.length === 11 && digits.startsWith('0')) e164 = `+${cc}${digits.slice(1)}`;
  else if (digits.length === 10 + cc.length && digits.startsWith(cc)) e164 = `+${digits}`;
  else e164 = `+${digits}`;

  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

export const RESUME_TYPES = {
  pdf: { mime: 'application/pdf', magic: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: (b) => b[0] === 0x50 && b[1] === 0x4b,
  },
  doc: {
    mime: 'application/msword',
    magic: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  },
};

export function resumeExtension(fileName) {
  const m = /\.([a-z0-9]+)$/i.exec(String(fileName || ''));
  const ext = m ? m[1].toLowerCase() : '';
  return RESUME_TYPES[ext] ? ext : null;
}

export function safeFileName(name) {
  return String(name || 'resume')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

export function cleanText(v, max = 200) {
  return String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}
