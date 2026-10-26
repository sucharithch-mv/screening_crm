/**
 * Tiny JSON-file database (data/db.json).
 *
 * Every operation reads the file, and every write replaces it atomically
 * (write temp file + rename). All work is synchronous, so a read-modify-write
 * can't interleave with another one inside the single Next.js server process.
 * Good enough for a screening CRM with thousands of candidates; swap for
 * Postgres/SQLite if you need multi-instance deployments.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getConfig } from './config.js';

const MAX_WEBHOOK_EVENTS = 1000;

function emptyDb() {
  return {
    version: 1,
    seq: { job: 0, candidate: 0 },
    jobs: [],
    candidates: [],
    calls: [],
    webhookEvents: [],
    processedDeliveries: [],
  };
}

function dbFile() {
  return path.join(getConfig().dataDir, 'db.json');
}

export function resumesDir() {
  const dir = path.join(getConfig().dataDir, 'resumes');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function save(db) {
  const file = dbFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

function load() {
  const file = dbFile();
  if (!fs.existsSync(file)) {
    const db = seed(emptyDb());
    save(db);
    return db;
  }
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...emptyDb(), ...db };
}

function read(fn) {
  return fn(load());
}

function write(fn) {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

const now = () => new Date().toISOString();
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function seed(db) {
  const cfg = getConfig();
  const jobs = [
    {
      title: 'Data Engineer',
      location: 'Hyderabad · Hybrid',
      employmentType: 'Full-time',
      experience: '2–5 years',
      description:
        'Build and run batch and streaming data pipelines (SQL, Spark, Airflow) on Azure/AWS. Strong data modelling and data-quality instincts.',
    },
    {
      title: 'Full Stack Developer (Node.js / React)',
      location: 'Hyderabad · On-site',
      employmentType: 'Full-time',
      experience: '2–4 years',
      description:
        'Ship product features end to end with Node.js, Next.js/React and PostgreSQL. Comfortable with REST APIs, testing and CI/CD.',
    },
    {
      title: 'Forward Deployed Engineer — AI Voice Agents',
      location: 'Hyderabad / Remote',
      employmentType: 'Full-time',
      experience: '1–4 years',
      description:
        'Work with customers to design, prompt and deploy multilingual AI voice agents. Mix of engineering, integrations and client delivery.',
    },
  ];
  for (const j of jobs) {
    db.seq.job += 1;
    db.jobs.push({
      id: db.seq.job,
      ...j,
      companyName: cfg.defaults.companyName,
      agentName: cfg.defaults.agentName,
      isOpen: true,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  return db;
}

/* ───────────────────────── Jobs ───────────────────────── */

export function listJobs({ openOnly = false } = {}) {
  return read((db) => {
    const counts = {};
    for (const c of db.candidates) counts[c.jobId] = (counts[c.jobId] || 0) + 1;
    return db.jobs
      .filter((j) => (openOnly ? j.isOpen : true))
      .map((j) => ({ ...j, applicantCount: counts[j.id] || 0 }))
      .sort((a, b) => b.id - a.id);
  });
}

export function getJob(id) {
  return read((db) => clone(db.jobs.find((j) => j.id === Number(id))) || null);
}

export function createJob(input) {
  const cfg = getConfig();
  return write((db) => {
    db.seq.job += 1;
    const job = {
      id: db.seq.job,
      title: input.title,
      companyName: input.companyName || cfg.defaults.companyName,
      agentName: input.agentName || cfg.defaults.agentName,
      location: input.location || '',
      employmentType: input.employmentType || 'Full-time',
      experience: input.experience || '',
      description: input.description || '',
      isOpen: input.isOpen !== false,
      createdAt: now(),
      updatedAt: now(),
    };
    db.jobs.push(job);
    return clone(job);
  });
}

export function updateJob(id, patch) {
  return write((db) => {
    const job = db.jobs.find((j) => j.id === Number(id));
    if (!job) return null;
    const allowed = ['title', 'companyName', 'agentName', 'location', 'employmentType', 'experience', 'description', 'isOpen'];
    for (const k of allowed) if (patch[k] !== undefined) job[k] = patch[k];
    job.updatedAt = now();
    return clone(job);
  });
}

/* ─────────────────────── Candidates ─────────────────────── */

export const candidateRef = (id) => `C-${String(id).padStart(4, '0')}`;

export function findDuplicateApplication(email, jobId) {
  return read(
    (db) =>
      clone(
        db.candidates.find(
          (c) => c.jobId === Number(jobId) && c.email.toLowerCase() === String(email).toLowerCase(),
        ),
      ) || null,
  );
}

export function createCandidate(input) {
  return write((db) => {
    db.seq.candidate += 1;
    const candidate = {
      id: db.seq.candidate,
      jobId: Number(input.jobId),
      name: input.name,
      email: input.email,
      phone: input.phone,
      experienceYears: input.experienceYears ?? null,
      currentLocation: input.currentLocation || '',
      linkedinUrl: input.linkedinUrl || '',
      resume: input.resume || null,
      consentToCall: !!input.consentToCall,
      stage: 'applied',
      screening: null,
      emailStatus: 'not_sent',
      emailStatusDetail: null,
      emailUpdatedAt: null,
      latestCallId: null,
      createdAt: now(),
      updatedAt: now(),
    };
    db.candidates.push(candidate);
    return clone(candidate);
  });
}

export function setCandidateResume(id, resume) {
  return write((db) => {
    const c = db.candidates.find((x) => x.id === Number(id));
    if (!c) return null;
    c.resume = resume;
    c.updatedAt = now();
    return clone(c);
  });
}

export function deleteCandidate(id) {
  return write((db) => {
    const idx = db.candidates.findIndex((x) => x.id === Number(id));
    if (idx === -1) return null;
    const [removed] = db.candidates.splice(idx, 1);
    return clone(removed);
  });
}

export function getCandidate(id) {
  return read((db) => {
    const c = db.candidates.find((x) => x.id === Number(id));
    if (!c) return null;
    const job = db.jobs.find((j) => j.id === c.jobId) || null;
    const calls = db.calls
      .filter((k) => k.candidateId === c.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const events = db.webhookEvents
      .filter((e) => e.candidateId === c.id)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return clone({ ...c, ref: candidateRef(c.id), job, calls, events });
  });
}

export function listCandidates() {
  return read((db) => {
    const jobs = new Map(db.jobs.map((j) => [j.id, j]));
    const calls = new Map(db.calls.map((k) => [k.id, k]));
    return db.candidates
      .map((c) => {
        const job = jobs.get(c.jobId);
        const call = c.latestCallId ? calls.get(c.latestCallId) : null;
        return clone({
          ...c,
          ref: candidateRef(c.id),
          jobTitle: job?.title || '—',
          latestCall: call
            ? {
                id: call.id,
                mvCallId: call.mvCallId,
                status: call.status,
                error: call.error,
                createdAt: call.createdAt,
                updatedAt: call.updatedAt,
              }
            : null,
        });
      })
      .sort((a, b) => b.id - a.id);
  });
}

/* ───────────────────────── Calls ───────────────────────── */

export function createCall(input) {
  return write((db) => {
    const call = {
      id: crypto.randomUUID(),
      candidateId: input.candidateId,
      jobId: input.jobId,
      externalRefId: input.externalRefId,
      mvCallId: null,
      status: 'triggering',
      stage: 'call_queued',
      variables: input.variables || {},
      request: input.request || null,
      response: null,
      error: null,
      analysis: null,
      recordingUrl: null,
      talkTimeSeconds: null,
      durationSeconds: null,
      emailStatus: 'not_sent',
      emailStatusDetail: null,
      createdAt: now(),
      updatedAt: now(),
    };
    db.calls.push(call);
    const cand = db.candidates.find((c) => c.id === input.candidateId);
    if (cand) {
      cand.latestCallId = call.id;
      cand.stage = 'call_queued';
      cand.screening = null;
      cand.emailStatus = 'not_sent';
      cand.emailStatusDetail = null;
      cand.emailUpdatedAt = null;
      cand.updatedAt = now();
    }
    return clone(call);
  });
}

export function getCall(id) {
  return read((db) => clone(db.calls.find((k) => k.id === id)) || null);
}

/** Returns the CRM call matching any of the identifiers MagickVoice sends back. */
export function findCall({ mvCallId, externalRefId, applicationId, phone } = {}) {
  return read((db) => {
    let call = null;
    if (mvCallId) call = db.calls.find((k) => k.mvCallId && String(k.mvCallId) === String(mvCallId));
    if (!call && externalRefId) call = db.calls.find((k) => k.externalRefId === String(externalRefId));
    if (!call && applicationId) {
      const cand = db.candidates.find((c) => String(c.id) === String(applicationId));
      if (cand?.latestCallId) call = db.calls.find((k) => k.id === cand.latestCallId);
    }
    if (!call && phone) {
      const digits = String(phone).replace(/\D/g, '').slice(-10);
      const cands = db.candidates
        .filter((c) => c.latestCallId && String(c.phone).replace(/\D/g, '').slice(-10) === digits)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (cands[0]) call = db.calls.find((k) => k.id === cands[0].latestCallId);
    }
    return clone(call) || null;
  });
}

export function listActiveCalls() {
  return read((db) =>
    clone(
      db.calls.filter(
        (k) =>
          k.mvCallId &&
          ['call_queued', 'call_in_progress', 'awaiting_analysis'].includes(k.stage) &&
          db.candidates.some((c) => c.latestCallId === k.id),
      ),
    ),
  );
}

/**
 * Updates a call and, if it is the candidate's latest call, mirrors stage /
 * screening / email status onto the candidate.
 */
export function updateCall(id, patch) {
  return write((db) => {
    const call = db.calls.find((k) => k.id === id);
    if (!call) return null;
    Object.assign(call, patch, { updatedAt: now() });
    const cand = db.candidates.find((c) => c.id === call.candidateId);
    if (cand && cand.latestCallId === call.id) {
      cand.stage = call.stage;
      cand.screening = call.analysis
        ? {
            decision: call.analysis.decision,
            score: call.analysis.score,
            summary: call.analysis.summary,
          }
        : cand.screening;
      if (cand.emailStatus !== call.emailStatus) cand.emailUpdatedAt = now();
      cand.emailStatus = call.emailStatus;
      cand.emailStatusDetail = call.emailStatusDetail;
      cand.updatedAt = now();
    }
    return clone(call);
  });
}

/* ───────────────────── Webhook events ───────────────────── */

export function logWebhookEvent(evt) {
  return write((db) => {
    const entry = { id: crypto.randomUUID(), receivedAt: now(), ...evt };
    db.webhookEvents.push(entry);
    if (db.webhookEvents.length > MAX_WEBHOOK_EVENTS) {
      db.webhookEvents.splice(0, db.webhookEvents.length - MAX_WEBHOOK_EVENTS);
    }
    return clone(entry);
  });
}

export function listWebhookEvents(limit = 50) {
  return read((db) => clone(db.webhookEvents.slice(-limit).reverse()));
}

/** Delivery ids (Idempotency-Key) already handled — used to dedupe MagickVoice retries. */
export function isDeliveryProcessed(deliveryId) {
  if (!deliveryId) return false;
  return read((db) => db.processedDeliveries.includes(deliveryId));
}

export function markDeliveryProcessed(deliveryId) {
  if (!deliveryId) return;
  write((db) => {
    if (db.processedDeliveries.includes(deliveryId)) return;
    db.processedDeliveries.push(deliveryId);
    if (db.processedDeliveries.length > 5000) db.processedDeliveries.splice(0, 1000);
  });
}
