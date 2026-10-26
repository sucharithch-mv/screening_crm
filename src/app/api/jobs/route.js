import * as db from '../../../lib/db.js';
import { getRecruiter } from '../../../lib/auth.js';
import { badRequest, json, readJson, requireRecruiterApi } from '../../../lib/http.js';
import { cleanText } from '../../../lib/validation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public: open jobs. Recruiters get all jobs. */
export async function GET(request) {
  const isRecruiter = !!getRecruiter(request);
  const jobs = db.listJobs({ openOnly: !isRecruiter });
  return json({
    jobs: jobs.map((j) =>
      isRecruiter
        ? j
        : {
            id: j.id,
            title: j.title,
            companyName: j.companyName,
            location: j.location,
            employmentType: j.employmentType,
            experience: j.experience,
            description: j.description,
          },
    ),
  });
}

/** Recruiter: create a job. */
export async function POST(request) {
  const denied = requireRecruiterApi(request);
  if (denied) return denied;
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');

  const title = cleanText(body.title, 120);
  if (title.length < 2) return badRequest('Job title is required', { fields: { title: 'Job title is required' } });

  const job = db.createJob({
    title,
    companyName: cleanText(body.companyName, 120),
    agentName: cleanText(body.agentName, 60),
    location: cleanText(body.location, 120),
    employmentType: cleanText(body.employmentType, 60),
    experience: cleanText(body.experience, 60),
    description: cleanText(body.description, 2000),
    isOpen: body.isOpen !== false,
  });
  return json({ job }, 201);
}
