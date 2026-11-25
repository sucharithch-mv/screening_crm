/**
 * Resume ↔ job match, computed before any call is placed.
 *
 * Reads the resume (PDF / DOCX), finds known skills in it, and compares them with
 * the skills the job asks for (the job's "Key skills" field, or skills spotted in
 * its title + description). Experience is compared with the job's range
 * ("2–5 years"). The result is a 0–100 score plus the matched / missing skills,
 * so recruiters can see *why* a candidate is or isn't worth a call.
 *
 * It is a suggestion only — recruiters can still call anyone.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as db from './db.js';

/* Skill vocabulary: canonical name → aliases (lower-case, matched on word boundaries). */
const SKILLS = {
  Python: ['python'],
  Java: ['java'],
  JavaScript: ['javascript', 'js', 'es6'],
  TypeScript: ['typescript'],
  'Node.js': ['node.js', 'nodejs', 'node'],
  React: ['react', 'react.js', 'reactjs'],
  'Next.js': ['next.js', 'nextjs'],
  Angular: ['angular'],
  'Vue.js': ['vue', 'vue.js', 'vuejs'],
  HTML: ['html', 'html5'],
  CSS: ['css', 'css3', 'tailwind', 'sass'],
  Go: ['golang'],
  'C#': ['c#', '.net', 'dotnet', 'asp.net'],
  'C++': ['c++'],
  Scala: ['scala'],
  Kotlin: ['kotlin'],
  Swift: ['swift'],
  PHP: ['php', 'laravel'],
  Ruby: ['ruby', 'rails'],
  Django: ['django'],
  Flask: ['flask'],
  FastAPI: ['fastapi'],
  'Spring Boot': ['spring boot', 'spring'],
  Express: ['express', 'express.js'],
  'REST APIs': ['rest api', 'rest apis', 'restful', 'api', 'apis'],
  GraphQL: ['graphql'],
  SQL: ['sql', 'mysql', 'postgresql', 'postgres', 'sql server', 'oracle', 't-sql', 'pl/sql'],
  PostgreSQL: ['postgresql', 'postgres'],
  MongoDB: ['mongodb', 'mongo'],
  Redis: ['redis'],
  Spark: ['spark', 'pyspark', 'apache spark'],
  Airflow: ['airflow'],
  Kafka: ['kafka'],
  Hadoop: ['hadoop', 'hive', 'hdfs'],
  dbt: ['dbt'],
  Snowflake: ['snowflake'],
  Databricks: ['databricks'],
  'ETL / ELT': ['etl', 'elt', 'data pipeline', 'data pipelines', 'pipelines'],
  'Data modelling': ['data modelling', 'data modeling', 'dimensional modelling', 'dimensional modeling', 'star schema'],
  'Data quality': ['data quality', 'data validation', 'great expectations'],
  Streaming: ['streaming', 'real-time', 'kinesis', 'flink'],
  'Power BI': ['power bi', 'powerbi'],
  Tableau: ['tableau'],
  Excel: ['excel'],
  Pandas: ['pandas', 'numpy'],
  'Machine learning': ['machine learning', 'ml', 'scikit-learn', 'sklearn'],
  'Deep learning': ['deep learning', 'pytorch', 'tensorflow', 'keras'],
  NLP: ['nlp', 'natural language processing'],
  'LLMs / GenAI': ['llm', 'llms', 'generative ai', 'genai', 'gpt', 'openai', 'langchain', 'rag', 'prompt engineering', 'prompting'],
  'Voice AI': ['voice ai', 'voice agent', 'voice agents', 'speech', 'asr', 'tts', 'text-to-speech', 'speech-to-text', 'ivr', 'telephony'],
  AWS: ['aws', 'amazon web services', 'ec2', 's3', 'lambda'],
  Azure: ['azure'],
  GCP: ['gcp', 'google cloud', 'bigquery'],
  Docker: ['docker', 'containers'],
  Kubernetes: ['kubernetes', 'k8s'],
  'CI/CD': ['ci/cd', 'cicd', 'jenkins', 'github actions', 'gitlab ci', 'continuous integration'],
  Git: ['git', 'github', 'gitlab'],
  Linux: ['linux', 'bash', 'shell scripting'],
  Testing: ['testing', 'unit testing', 'jest', 'pytest', 'tdd', 'selenium', 'cypress'],
  Microservices: ['microservices', 'microservice'],
  'System design': ['system design', 'distributed systems', 'scalability'],
  Agile: ['agile', 'scrum', 'jira'],
  Integrations: ['integrations', 'integration', 'webhooks', 'webhook'],
  'Client delivery': ['client delivery', 'customer facing', 'customer-facing', 'stakeholder', 'stakeholders', 'client facing', 'pre-sales', 'presales'],
  Communication: ['communication', 'presentation skills'],
  Salesforce: ['salesforce'],
  SAP: ['sap'],
  Figma: ['figma'],
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/#]/g, '\\$&');
const MATCHERS = Object.entries(SKILLS).map(([name, aliases]) => ({
  name,
  re: new RegExp(`(^|[^a-z0-9+#.])(${aliases.map(escapeRe).join('|')})(?=$|[^a-z0-9+#])`, 'i'),
}));
// Very generic aliases count for the resume but are too vague to be a job "requirement" on their own.
const WEAK_REQUIREMENTS = new Set(['REST APIs', 'Integrations', 'Communication', 'Git', 'Excel']);

export function findSkills(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  return MATCHERS.filter((m) => m.re.test(t)).map((m) => m.name);
}

/** Skills a job asks for: explicit "skills" list first, otherwise detected from title + description. */
export function jobSkills(job) {
  if (job?.skills && String(job.skills).trim()) {
    const listed = String(job.skills)
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const canon = new Set();
    for (const item of listed) {
      const found = findSkills(item);
      if (found.length) found.forEach((f) => canon.add(f));
      else canon.add(item); // a skill we don't know — matched as plain text
    }
    return [...canon];
  }
  return findSkills(`${job?.title || ''}\n${job?.description || ''}`).filter(
    (s, _i, all) => !(WEAK_REQUIREMENTS.has(s) && all.length > 3),
  );
}

/** "2–5 years" → {min:2,max:5}; "3+ years" → {min:3,max:null}; otherwise null. */
export function parseExperienceRange(text) {
  const t = String(text || '').replace(/[–—]/g, '-');
  let m = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/.exec(t);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  m = /(\d+(?:\.\d+)?)\s*\+/.exec(t);
  if (m) return { min: Number(m[1]), max: null };
  m = /(\d+(?:\.\d+)?)/.exec(t);
  if (m) return { min: Number(m[1]), max: null };
  return null;
}

/** Best-effort years of experience written in a resume ("4+ years of experience"). */
export function experienceFromText(text) {
  const re = /(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:\w+\s+){0,3}experience/gi;
  let best = null;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const n = Number(m[1]);
    if (n <= 45 && (best == null || n > best)) best = n;
  }
  return best;
}

function experienceFit(years, range) {
  if (years == null || !range) return null;
  if (years >= range.min && (range.max == null || years <= range.max + 1)) return 1;
  if (years < range.min) return Math.max(0, 1 - (range.min - years) / Math.max(1, range.min));
  return 0.8; // more experienced than asked — usually still worth a call
}

export const MATCH_LEVELS = {
  strong: { label: 'Strong match', tone: 'success', hint: 'Worth calling' },
  possible: { label: 'Possible match', tone: 'warning', hint: 'Call if the pipeline is thin' },
  weak: { label: 'Weak match', tone: 'danger', hint: 'Likely mismatch — saves call minutes to skip' },
  unknown: { label: 'No match data', tone: 'neutral', hint: 'Resume could not be read' },
};

export function scoreMatch({ job, resumeText, experienceYears }) {
  const required = jobSkills(job);
  const lowerText = String(resumeText || '').toLowerCase();
  const found = new Set(findSkills(resumeText));
  const matched = [];
  const missing = [];
  for (const s of required) {
    const hit = found.has(s) || (!SKILLS[s] && lowerText.includes(s.toLowerCase()));
    (hit ? matched : missing).push(s);
  }
  const range = parseExperienceRange(job?.experience);
  const textYears = experienceFromText(resumeText);
  const years = experienceYears != null && experienceYears !== '' ? Number(experienceYears) : textYears;
  const expFit = experienceFit(years, range);

  const skillPart = required.length ? matched.length / required.length : null;
  let score;
  if (skillPart == null && expFit == null) score = null;
  else if (skillPart == null) score = expFit * 100;
  else if (expFit == null) score = skillPart * 100;
  else score = skillPart * 75 + expFit * 25;
  score = score == null ? null : Math.round(score);

  const level = score == null ? 'unknown' : score >= 65 ? 'strong' : score >= 40 ? 'possible' : 'weak';
  const reasons = [];
  if (required.length) reasons.push(`${matched.length} of ${required.length} key skills found in resume`);
  if (years != null && range) {
    reasons.push(
      `${years} yrs experience vs ${range.min}${range.max != null ? `–${range.max}` : '+'} asked` +
        (expFit === 1 ? ' (fits)' : years < range.min ? ' (below range)' : ' (above range)'),
    );
  }
  return {
    score,
    level,
    matched,
    missing,
    extraSkills: [...found].filter((s) => !required.includes(s)).slice(0, 12),
    experienceYears: years ?? null,
    experienceSource: experienceYears != null && experienceYears !== '' ? 'form' : textYears != null ? 'resume' : null,
    reasons,
  };
}

/* ───────────────────── Resume text extraction ───────────────────── */

export async function extractResumeText(resume) {
  if (!resume?.storedName) return '';
  const file = path.join(db.resumesDir(), resume.storedName);
  const cache = `${file}.txt`;
  try {
    if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8');
  } catch {
    /* ignore cache errors */
  }
  if (!fs.existsSync(file)) return '';
  const buf = fs.readFileSync(file);
  let text = '';
  try {
    if (resume.mimeType === 'application/pdf' || /\.pdf$/i.test(resume.storedName)) {
      const { extractText } = await import('unpdf');
      const out = await extractText(new Uint8Array(buf), { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join('\n') : out.text || '';
    } else if (/\.docx$/i.test(resume.storedName)) {
      const mammoth = (await import('mammoth')).default;
      text = (await mammoth.extractRawText({ buffer: buf })).value || '';
    } else {
      // Legacy .doc: pull printable runs out of the binary — rough but usually enough for skills.
      text = (buf.toString('latin1').match(/[\x20-\x7e]{4,}/g) || []).join(' ');
    }
  } catch (err) {
    console.warn('[resume-match] could not read resume', resume.storedName, err.message);
    text = '';
  }
  try {
    fs.writeFileSync(cache, text);
  } catch {
    /* ignore */
  }
  return text;
}

const NOT_AVAILABLE = 'Not available';
const MAX_KEYWORDS = 15;

/**
 * Resume keywords for the AI screening agent's prompt variables.
 * Skills the job asks for come first, then other skills found in the resume.
 * Values are always strings so the call script never sees an empty placeholder.
 */
export async function resumePromptVariables(candidate) {
  const text = candidate?.resume ? await extractResumeText(candidate.resume) : '';
  if (!text.trim()) {
    return {
      resume_keywords: NOT_AVAILABLE,
      missing_skills: candidate?.job ? jobSkills(candidate.job).join(', ') || NOT_AVAILABLE : NOT_AVAILABLE,
      experience_years: candidate?.experienceYears != null && candidate.experienceYears !== '' ? String(candidate.experienceYears) : NOT_AVAILABLE,
    };
  }
  const m = scoreMatch({ job: candidate.job, resumeText: text, experienceYears: candidate.experienceYears });
  const all = [...new Set([...m.matched, ...findSkills(text)])].slice(0, MAX_KEYWORDS);
  return {
    resume_keywords: all.join(', ') || NOT_AVAILABLE,
    missing_skills: m.missing.join(', ') || 'None',
    experience_years: m.experienceYears != null ? String(m.experienceYears) : NOT_AVAILABLE,
  };
}

/** Computes and stores the match for one candidate. Returns the stored match (or null). */
export async function computeCandidateMatch(candidateId) {
  const c = db.getCandidate(candidateId);
  if (!c || !c.job) return null;
  const text = c.resume ? await extractResumeText(c.resume) : '';
  const result = text.trim()
    ? scoreMatch({ job: c.job, resumeText: text, experienceYears: c.experienceYears })
    : { score: null, level: 'unknown', matched: [], missing: jobSkills(c.job), extraSkills: [], reasons: ['Resume text could not be read'] };
  const match = { ...result, computedAt: new Date().toISOString(), jobUpdatedAt: c.job.updatedAt };
  db.updateCandidate(c.id, { resumeMatch: match });
  return match;
}

/** Fills in missing / stale matches (runs in the background scheduler). */
export async function refreshStaleMatches(limit = 25) {
  const pending = db.listCandidatesNeedingMatch().slice(0, limit);
  for (const c of pending) {
    try {
      await computeCandidateMatch(c.id);
    } catch (err) {
      console.warn('[resume-match] failed for candidate', c.id, err.message);
    }
  }
  return pending.length;
}
