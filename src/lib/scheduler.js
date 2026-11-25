/**
 * Background jobs, started once per server process from src/instrumentation.js:
 *   • places automatic call retries that are due (busy / no answer → retry later)
 *   • polls MagickVoice for calls that have been quiet for a while (covers missed webhooks)
 *   • computes resume ↔ job match scores for new or edited applications
 */
import { getConfig, missingMagickVoiceSettings } from './config.js';
import * as db from './db.js';
import { processDueRetries, syncCall } from './calls.js';
import { refreshStaleMatches } from './resume-match.js';

const QUIET_MS = 45000;

async function tick() {
  try {
    await refreshStaleMatches();
  } catch (err) {
    console.warn('[scheduler] resume match', err.message);
  }
  if (missingMagickVoiceSettings().length) return;
  try {
    const retries = await processDueRetries();
    if (retries.length) console.log(`[scheduler] placed ${retries.filter((r) => r?.ok).length} automatic retry call(s)`);
  } catch (err) {
    console.warn('[scheduler] retries', err.message);
  }
  const cutoff = Date.now() - QUIET_MS;
  for (const call of db.listActiveCalls()) {
    if (new Date(call.updatedAt).getTime() > cutoff) continue;
    try {
      await syncCall(call.id);
    } catch (err) {
      console.warn('[scheduler] sync', call.id, err.message);
    }
  }
}

export function startScheduler() {
  if (globalThis.__crmScheduler) return;
  const every = getConfig().calls.schedulerSeconds * 1000;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } finally {
      running = false;
    }
  };
  globalThis.__crmScheduler = setInterval(run, every);
  globalThis.__crmScheduler.unref?.();
  setTimeout(run, 3000).unref?.();
  console.log(`[scheduler] started (every ${every / 1000}s)`);
}
