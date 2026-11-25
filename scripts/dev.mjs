import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextCli = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

const projectConfigKeys = [
  'MAGICKVOICE_API_BASE_URL',
  'MAGICKVOICE_APP_URL',
  'MAGICKVOICE_API_KEY',
  'MAGICKVOICE_TENANT_ID',
  'MAGICKVOICE_ACCOUNT_ID',
  'MAGICKVOICE_PROMPT_ID',
  'MAGICKVOICE_CALLER_ID',
  'MAGICKVOICE_AI_PIPELINE',
  'MAGICKVOICE_PLATINUM_VOICE',
  'MAGICKVOICE_PLATINUM_LANGUAGE',
  'MAGICKVOICE_VOICE',
  'MAGICKVOICE_LANGUAGE',
  'MAGICKVOICE_CUSTOM_VOICE_STACK_ID',
  'MAGICKVOICE_CUSTOM_VOICE',
  'MAGICKVOICE_CUSTOM_LANGUAGE',
  'MAGICKVOICE_ENABLE_RECORDING',
  'MAGICKVOICE_MACHINE_DETECTION',
  'MAGICKVOICE_AUTOMATION_IDS',
  'MAGICKVOICE_SEND_CALL_WEBHOOK',
  'MAGICKVOICE_WEBHOOK_SECRET',
  'MAGICKVOICE_AUTOMATION_SENDS_EMAIL',
  'PUBLIC_BASE_URL',
  'WEBHOOK_TOKEN',
  'RECRUITER_EMAIL',
  'RECRUITER_PASSWORD',
  'SESSION_SECRET',
  'DEFAULT_COMPANY_NAME',
  'DEFAULT_AGENT_NAME',
  'DEFAULT_COUNTRY_CODE',
  'DATA_DIR',
  'CALL_MAX_ATTEMPTS',
  'CALL_RETRY_DELAY_MINUTES',
  'CALL_AUTO_RETRY',
  'ANALYSIS_TIMEOUT_MINUTES',
  'SCHEDULER_INTERVAL_SECONDS',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'TEAM_MEMBERS',
  'PRIVACY_CONTACT_EMAIL',
  'DATA_RETENTION_DAYS',
];

const env = { ...process.env };
for (const key of projectConfigKeys) delete env[key];

const next = spawn(process.execPath, [nextCli, 'dev', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});

next.on('error', (error) => {
  console.error(`Could not start Next.js: ${error.message}`);
  process.exitCode = 1;
});

next.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
