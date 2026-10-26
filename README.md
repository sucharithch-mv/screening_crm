# Candidate Screening CRM (Next.js + MagickVoice)

One Next.js app (client + server together) that:

1. **Careers page** (`/`): candidates pick a job, enter their details and upload a resume (PDF/DOC/DOCX, max 5 MB).
2. **Recruiter dashboard** (`/recruiter`): recruiters see every applicant, select candidates and click **Trigger AI call**.
3. **MagickVoice** places the screening call with the *Candidate Pre-Screening Agent* script, runs post-call analysis and emails the candidate (qualified / disqualified) through an automation.
4. **Webhook** (`/api/webhooks/magickvoice`): MagickVoice posts the result back. The CRM shows the call status, Qualified / Disqualified, score, summary, per-question results, recording, and whether the result email was sent.

```
Candidate ──apply──► CRM ──POST /proxy/calls──► MagickVoice ──AI call──► Candidate
                      ▲                              │
                      └──── webhook (analysis) ◄─────┘──► Email to candidate
```

## Quick start

```bash
npm install
# 1. paste your MagickVoice API key into .env → MAGICKVOICE_API_KEY=mgkp_...
npm run dev            # http://localhost:3000
```

* Careers page: <http://localhost:3000>
* Recruiter login: <http://localhost:3000/recruiter>. Use `RECRUITER_EMAIL` / `RECRUITER_PASSWORD` from `.env`.
* **MagickVoice** tab in the app: check the configuration, **Test connection**, and copy the webhook URL.

Production: `npm run build && npm start`. Requires Node 20.9+. Data lives in `./data` (`db.json` + `resumes/`), so keep that folder on a persistent disk.

## MagickVoice API (what the app calls)

These details come from the staging workspace (API keys page and Initiate Call screen):

| | |
|---|---|
| Base URL | `https://staging.appi.magickvoice.com` |
| Auth headers | `X-Platform-Key: mgkp_…`, `X-Tenant-Id`, `X-Account-Id` (not `Authorization: Bearer`) |
| Start a call | `POST /proxy/calls` |
| Call detail + analysis | `GET /proxy/calls/:id` |
| Connection test | `GET /credits` |

Body sent for each selected candidate:

```json
{
  "external_ref_id": "crm-12-lx3k9a-1f2e",
  "recipient": {
    "phone": "+919876543210",
    "name": "Asha Rao",
    "metadata": { "candidate_name": "Asha Rao", "candidate_email": "asha@example.com", "job_role": "Data Engineer",
                  "job_id": "1", "company_name": "Bilvantis Technologies", "agent_name": "Priya",
                  "email": "asha@example.com", "application_id": "12", "external_ref_id": "crm-12-…" }
  },
  "config": {
    "ai_pipeline": "platinum",
    "prompt_template_id": "9a046d4e-3910-4061-8eae-1e204be3d302",
    "caller_id": "+919429391386",
    "prompt_variables": {
      "agent_name": "Priya", "company_name": "Bilvantis Technologies", "candidate_name": "Asha Rao",
      "job_role": "Data Engineer", "job_id": "1", "candidate_email": "asha@example.com"
    },
    "enable_recording": true, "machine_detection": false, "hangup_on_machine": false
  },
  "automation_ids": ["<MAGICKVOICE_AUTOMATION_IDS>"],
  "webhook_url": "https://<PUBLIC_BASE_URL>/api/webhooks/magickvoice?token=<WEBHOOK_TOKEN>"
}
```

`webhook_url` is only sent when `PUBLIC_BASE_URL` is a public `https://` URL, and `automation_ids` only when that variable is set. `recipient.metadata` is available inside automations as `{{callee.metadata.*}}`.

### AI quality: Platinum or Custom (set in `.env`)

The CRM sends the same fields as the AI quality section of MagickVoice's Initiate Call screen.

| `.env` | Sent to MagickVoice |
|---|---|
| `MAGICKVOICE_AI_PIPELINE=platinum` | `config.ai_pipeline: "platinum"` |
| `MAGICKVOICE_PLATINUM_VOICE=Kore` (optional) | `config.voice` |
| `MAGICKVOICE_PLATINUM_LANGUAGE=en` (optional) | `recipient.language` |
| `MAGICKVOICE_AI_PIPELINE=custom` | `config.ai_pipeline: "custom"` |
| `MAGICKVOICE_CUSTOM_VOICE_STACK_ID=<id>` (**required** for custom) | `config.voice_stack_id` |
| `MAGICKVOICE_CUSTOM_VOICE=anushka` | `config.voice` (a voice name or a voice id UUID) |
| `MAGICKVOICE_CUSTOM_LANGUAGE=en` | `recipient.language` |

Voice stacks in the staging workspace:

| Voice stack | Id | Languages | Voices |
|---|---|---|---|
| Bronze (system) | `94bd55c6-386d-488b-8171-04701b9809f3` | hi, en, te, ta, mr, kn, bn, gu, ml, pa | anushka, abhilash, manisha, vidya, arya, karun, hitesh |
| Copper (system) | `972f32a1-723d-49cc-a61f-3c855b0f67a1` | same as Bronze | same as Bronze |
| Dimond | `32f86f1a-2824-4b7e-833b-a1de8fad835d` | hi | voice ids (UUIDs), e.g. `f91ab3e6-5071-4e15-b016-cde6f2bcd222` |

Switch tiers by changing `MAGICKVOICE_AI_PIPELINE` and restarting the app. The dashboard shows the active setting (e.g. *Custom · Copper (system) · voice anushka · en*), and so does the confirm dialog before calls are placed. Each call attempt records which settings it used. The **MagickVoice** page warns you if the voice or language doesn't match a known stack.

## MagickVoice automation setup (one time)

MagickVoice → **Automations → New Automation**:

1. **Trigger:** *After analysis is ready*.
2. **Step 1: Email** (qualified). To `{{callee.metadata.candidate_email}}`. Under *Only run if*, set `analysis.dimensions.screening_status` `=` `QUALIFIED`.
3. **Step 2: Email** (disqualified). Same recipient, with *Only run if* `analysis.dimensions.screening_status` `=` `DISQUALIFIED`.
4. **Step 3: Webhook.** URL = the webhook URL from the CRM's **MagickVoice** tab. Method `POST`, body left blank (sends the default JSON envelope). Optionally use **Generate secret** and paste it into `MAGICKVOICE_WEBHOOK_SECRET`.
5. Save, put the automation id in `MAGICKVOICE_AUTOMATION_IDS`, and restart the app.

> Use the automation's **Dry-run → A recent run** to confirm the exact dimension key (e.g. `screening_status`, or `Screening_Status`). The CRM accepts any casing. The email needs a verified sending domain under Messaging connections.

### How the CRM reads the webhook

* It matches the call by MagickVoice call id, then `external_ref_id`, then `callee.metadata.application_id`, then phone number.
* It reads the analysis from `context.analysis.dimensions` (or `call_analysis.custom` from the API): **Screening Status**, **Score Percentage**, **Call Summary**, **Q1–Q10 Result**, **Integrity Flag**, **Confirmed Email**, and so on.
* If the webhook has no analysis, the CRM fetches `GET /proxy/calls/:id`.
* **Email status:** when the automation's webhook carries a Qualified/Disqualified result, the email steps above it have already run, so the CRM marks the email **Sent**. If you'd rather report it explicitly, use a custom body with `"email_status": "sent"`; that always wins. Results pulled with **Sync** (no automation) show **Awaiting confirmation**.
* Retries are deduplicated with `Idempotency-Key`. Auth is `?token=WEBHOOK_TOKEN` in the URL **or** a valid `X-Magick-Signature`.

### Testing locally (no public URL)

MagickVoice only delivers webhooks to public `https://` URLs. While developing on localhost you can:

* run a tunnel (`ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`) and set `PUBLIC_BASE_URL` to it, **or**
* skip webhooks and click **Sync results** (dashboard) or **Sync from MagickVoice** (candidate page) to pull status + analysis via the API, **or**
* fake a result without a real call: `npm run simulate:webhook -- <candidateId> QUALIFIED 85`.

## Candidate statuses

| Status | Meaning |
|---|---|
| Applied | Application received |
| Call queued / On call | Call accepted by MagickVoice / in progress |
| Analysing call | Call completed, waiting for post-call analysis |
| **Qualified** / **Disqualified** | From the `Screening Status` dimension |
| Needs review | Analysis came back with another value (e.g. callback requested) |
| Not connected | No answer, busy, switched off, voicemail, failed… |
| Trigger failed | MagickVoice rejected the call request (the error is shown) |

## Project layout

```
src/app/page.js                         careers page
src/app/recruiter/login                 recruiter sign-in
src/app/recruiter/(app)/…               dashboard, candidate detail, jobs, integration
src/app/api/applications                POST – candidate application + resume upload
src/app/api/calls/trigger               POST – start AI screening calls
src/app/api/calls/sync                  POST – pull status/analysis from MagickVoice
src/app/api/webhooks/magickvoice        POST – MagickVoice → CRM webhook
src/lib/magickvoice.js                  MagickVoice API client + call payload
src/lib/screening.js                    payload parsing, status + email logic
src/lib/db.js                           JSON-file data store (data/db.json)
scripts/test-core.mjs                   end-to-end test against a mock MagickVoice API
```

`npm test` runs the server-side tests (36 checks: apply, auth, trigger, Platinum/Custom voice settings, webhooks, sync, signatures) against a mock MagickVoice server.

## Notes

* The JSON store suits one server instance. For several instances, swap `src/lib/db.js` for Postgres/SQLite. The function signatures stay the same.
* `.env` contains secrets (webhook token, session secret, recruiter password). Don't commit it; `.env.example` is the shareable template.
* For production MagickVoice, change `MAGICKVOICE_API_BASE_URL` / `MAGICKVOICE_APP_URL` and the ids in `.env`.
