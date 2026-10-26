import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as db from '../../../lib/db.js';
import { badRequest, json } from '../../../lib/http.js';
import {
  RESUME_MAX_BYTES,
  RESUME_TYPES,
  cleanText,
  isEmail,
  normalizePhone,
  resumeExtension,
  safeFileName,
} from '../../../lib/validation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public endpoint: a candidate applies for a job with their resume (multipart/form-data). */
export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return badRequest('Please submit the application form.');
  }

  const jobId = Number(form.get('jobId'));
  const name = cleanText(form.get('name'), 120);
  const email = cleanText(form.get('email'), 160).toLowerCase();
  const phoneInput = cleanText(form.get('phone'), 30);
  const experienceRaw = cleanText(form.get('experienceYears'), 10);
  const currentLocation = cleanText(form.get('currentLocation'), 120);
  const linkedinUrl = cleanText(form.get('linkedinUrl'), 300);
  const consent = ['on', 'true', '1', 'yes'].includes(String(form.get('consent') || '').toLowerCase());
  const file = form.get('resume');

  const errors = {};
  const job = Number.isInteger(jobId) ? db.getJob(jobId) : null;
  if (!job || !job.isOpen) errors.jobId = 'Please choose an open position.';
  if (name.length < 2) errors.name = 'Please enter your full name.';
  if (!isEmail(email)) errors.email = 'Please enter a valid email address.';
  const phone = normalizePhone(phoneInput);
  if (!phone) errors.phone = 'Please enter a valid mobile number (with country code if outside India).';
  let experienceYears = null;
  if (experienceRaw) {
    experienceYears = Number(experienceRaw);
    if (!Number.isFinite(experienceYears) || experienceYears < 0 || experienceYears > 50) {
      errors.experienceYears = 'Experience should be a number of years.';
    }
  }
  if (linkedinUrl && !/^https?:\/\//i.test(linkedinUrl)) errors.linkedinUrl = 'LinkedIn URL should start with https://';
  if (!consent) errors.consent = 'Please agree to receive an AI screening call.';

  let ext = null;
  let buffer = null;
  if (!file || typeof file === 'string' || !file.size) {
    errors.resume = 'Please attach your resume.';
  } else if (file.size > RESUME_MAX_BYTES) {
    errors.resume = 'Resume must be 5 MB or smaller.';
  } else {
    ext = resumeExtension(file.name);
    if (!ext) {
      errors.resume = 'Resume must be a PDF, DOC or DOCX file.';
    } else {
      buffer = Buffer.from(await file.arrayBuffer());
      if (!RESUME_TYPES[ext].magic(buffer)) errors.resume = `That file doesn't look like a valid .${ext} document.`;
    }
  }

  if (Object.keys(errors).length) return badRequest('Please fix the highlighted fields.', { fields: errors });

  if (db.findDuplicateApplication(email, jobId)) {
    return json({ error: `You have already applied for ${job.title} with this email.` }, 409);
  }

  const candidate = db.createCandidate({
    jobId,
    name,
    email,
    phone,
    experienceYears,
    currentLocation,
    linkedinUrl,
    consentToCall: consent,
  });

  const storedName = `${candidate.id}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  try {
    fs.writeFileSync(path.join(db.resumesDir(), storedName), buffer);
  } catch (err) {
    db.deleteCandidate(candidate.id);
    return json({ error: 'Could not save your resume. Please try again.' }, 500);
  }
  db.setCandidateResume(candidate.id, {
    originalName: safeFileName(file.name),
    storedName,
    size: buffer.length,
    mimeType: RESUME_TYPES[ext].mime,
    uploadedAt: new Date().toISOString(),
  });

  return json(
    {
      ok: true,
      candidateId: candidate.id,
      reference: db.candidateRef(candidate.id),
      jobTitle: job.title,
    },
    201,
  );
}
