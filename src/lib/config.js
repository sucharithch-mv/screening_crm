import path from 'node:path';

function env(key, fallback = '') {
  const value = process.env[key];
  return value === undefined || value === null || String(value).trim() === ''
    ? fallback
    : String(value).trim();
}

const bool = (key, fallback) => {
  const v = env(key, fallback ? 'true' : 'false').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
};

const stripSlash = (u) => u.replace(/\/+$/, '');

/** Reads configuration from the environment on every call (no caching, so .env edits apply after restart). */
export function getConfig() {
  return {
    mv: {
      apiBase: stripSlash(env('MAGICKVOICE_API_BASE_URL', 'https://staging.appi.magickvoice.com')),
      appBase: stripSlash(env('MAGICKVOICE_APP_URL', 'https://staging.app.magickvoice.com')),
      apiKey: env('MAGICKVOICE_API_KEY'),
      tenantId: env('MAGICKVOICE_TENANT_ID'),
      accountId: env('MAGICKVOICE_ACCOUNT_ID'),
      promptId: env('MAGICKVOICE_PROMPT_ID'),
      callerId: env('MAGICKVOICE_CALLER_ID'),
      // AI quality: "platinum" or "custom" (custom = your own voice stack)
      pipeline: env('MAGICKVOICE_AI_PIPELINE', 'platinum').toLowerCase(),
      platinum: {
        voice: env('MAGICKVOICE_PLATINUM_VOICE', env('MAGICKVOICE_VOICE')),
        language: env('MAGICKVOICE_PLATINUM_LANGUAGE', env('MAGICKVOICE_LANGUAGE')),
      },
      custom: {
        voiceStackId: env('MAGICKVOICE_CUSTOM_VOICE_STACK_ID'),
        voice: env('MAGICKVOICE_CUSTOM_VOICE'),
        language: env('MAGICKVOICE_CUSTOM_LANGUAGE'),
      },
      enableRecording: bool('MAGICKVOICE_ENABLE_RECORDING', true),
      machineDetection: bool('MAGICKVOICE_MACHINE_DETECTION', false),
      automationIds: env('MAGICKVOICE_AUTOMATION_IDS')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      sendCallWebhook: bool('MAGICKVOICE_SEND_CALL_WEBHOOK', true),
      webhookSecret: env('MAGICKVOICE_WEBHOOK_SECRET'),
      automationSendsEmail: bool('MAGICKVOICE_AUTOMATION_SENDS_EMAIL', true),
    },
    publicBaseUrl: stripSlash(env('PUBLIC_BASE_URL', 'http://localhost:3000')),
    webhookToken: env('WEBHOOK_TOKEN'),
    recruiter: {
      email: env('RECRUITER_EMAIL'),
      password: env('RECRUITER_PASSWORD'),
    },
    sessionSecret: env('SESSION_SECRET'),
    defaults: {
      companyName: env('DEFAULT_COMPANY_NAME', 'Bilvantis Technologies'),
      agentName: env('DEFAULT_AGENT_NAME', 'Priya'),
      countryCode: env('DEFAULT_COUNTRY_CODE', '+91'),
    },
    dataDir: env('DATA_DIR') || path.join(process.cwd(), 'data'),
  };
}

/** The URL MagickVoice should POST to (includes the shared token). */
export function webhookUrl(cfg = getConfig()) {
  const base = `${cfg.publicBaseUrl}/api/webhooks/magickvoice`;
  return cfg.webhookToken ? `${base}?token=${encodeURIComponent(cfg.webhookToken)}` : base;
}

/** MagickVoice only delivers to public https:// endpoints. */
export function isPublicHttps(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)) return false;
    if (host.endsWith('.local') || host.endsWith('.localhost')) return false;
    if (/^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Voice stacks seen in the staging workspace (Initiate Call → AI quality → Custom).
 * Only used for labels and sanity warnings — any stack id from your workspace works.
 */
export const KNOWN_VOICE_STACKS = {
  '94bd55c6-386d-488b-8171-04701b9809f3': {
    name: 'Bronze (system)',
    languages: ['hi', 'en', 'te', 'ta', 'mr', 'kn', 'bn', 'gu', 'ml', 'pa'],
    voices: ['anushka', 'abhilash', 'manisha', 'vidya', 'arya', 'karun', 'hitesh'],
  },
  '972f32a1-723d-49cc-a61f-3c855b0f67a1': {
    name: 'Copper (system)',
    languages: ['hi', 'en', 'te', 'ta', 'mr', 'kn', 'bn', 'gu', 'ml', 'pa'],
    voices: ['anushka', 'abhilash', 'manisha', 'vidya', 'arya', 'karun', 'hitesh'],
  },
  '32f86f1a-2824-4b7e-833b-a1de8fad835d': {
    name: 'Dimond',
    languages: ['hi'],
    voices: null, // voice ids (UUIDs) — see the Voice dropdown in MagickVoice
  },
};

/** Same rule as the MagickVoice app: "custom" (and legacy "cascade") pipelines need a voice stack. */
export const isCustomPipeline = (pipeline) => pipeline === 'custom' || pipeline === 'cascade';

/**
 * The voice settings for the selected AI quality.
 *   platinum → { pipeline, voice?, language? }
 *   custom   → { pipeline, voiceStackId, voice?, language? }
 */
export function activeVoiceSettings(cfg = getConfig()) {
  const pipeline = cfg.mv.pipeline;
  if (isCustomPipeline(pipeline)) {
    return {
      pipeline,
      isCustom: true,
      voiceStackId: cfg.mv.custom.voiceStackId,
      voiceStackName: KNOWN_VOICE_STACKS[cfg.mv.custom.voiceStackId]?.name || null,
      voice: cfg.mv.custom.voice,
      language: cfg.mv.custom.language,
    };
  }
  return { pipeline, isCustom: false, voiceStackId: null, voiceStackName: null, voice: cfg.mv.platinum.voice, language: cfg.mv.platinum.language };
}

/** One-line description, e.g. "Custom · Copper (system) · voice anushka · en". */
export function describeVoiceSettings(v = activeVoiceSettings()) {
  const parts = [v.pipeline ? v.pipeline.charAt(0).toUpperCase() + v.pipeline.slice(1) : '—'];
  if (v.isCustom) parts.push(v.voiceStackName || (v.voiceStackId ? `stack ${v.voiceStackId.slice(0, 8)}` : 'no voice stack'));
  parts.push(v.voice ? `voice ${v.voice}` : 'default voice');
  parts.push(v.language ? v.language : 'default language');
  return parts.join(' · ');
}

/** Non-blocking hints when the voice/language don't look valid for a known voice stack. */
export function voiceSettingsWarnings(v = activeVoiceSettings()) {
  const warnings = [];
  if (!v.isCustom) return warnings;
  const stack = KNOWN_VOICE_STACKS[v.voiceStackId];
  if (!stack) return warnings;
  if (v.language && !stack.languages.includes(v.language)) {
    warnings.push(`${stack.name} supports languages: ${stack.languages.join(', ')} — "${v.language}" may be ignored.`);
  }
  if (v.voice && stack.voices && !stack.voices.includes(v.voice)) {
    warnings.push(`${stack.name} voices: ${stack.voices.join(', ')} — "${v.voice}" may not exist.`);
  }
  return warnings;
}

/** Which required MagickVoice settings are missing. */
export function missingMagickVoiceSettings(cfg = getConfig()) {
  const missing = [];
  if (!cfg.mv.apiKey) missing.push('MAGICKVOICE_API_KEY');
  if (!cfg.mv.tenantId) missing.push('MAGICKVOICE_TENANT_ID');
  if (!cfg.mv.accountId) missing.push('MAGICKVOICE_ACCOUNT_ID');
  if (!cfg.mv.promptId) missing.push('MAGICKVOICE_PROMPT_ID');
  if (!cfg.mv.callerId) missing.push('MAGICKVOICE_CALLER_ID');
  if (!cfg.mv.pipeline) missing.push('MAGICKVOICE_AI_PIPELINE');
  if (isCustomPipeline(cfg.mv.pipeline) && !cfg.mv.custom.voiceStackId) missing.push('MAGICKVOICE_CUSTOM_VOICE_STACK_ID');
  return missing;
}

export function magickVoiceCallUrl(mvCallId, cfg = getConfig()) {
  if (!mvCallId || !cfg.mv.tenantId || !cfg.mv.accountId) return null;
  return `${cfg.mv.appBase}/t/${cfg.mv.tenantId}/a/${cfg.mv.accountId}/app/calls/${mvCallId}`;
}
