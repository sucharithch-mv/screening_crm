import { json } from '../../../../lib/http.js';
import { authorizeWebhook, processWebhook } from '../../../../lib/webhook.js';
import { logWebhookEvent } from '../../../../lib/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * MagickVoice → CRM webhook.
 *  • Automation "Webhook" step (trigger: After analysis is ready) — default JSON envelope
 *  • Per-call webhook_url live status updates (started / completed / failed)
 * Auth: ?token=WEBHOOK_TOKEN in the URL, or X-Magick-Signature with MAGICKVOICE_WEBHOOK_SECRET.
 */
export async function POST(request) {
  const url = new URL(request.url);
  const rawBody = await request.text();

  const auth = authorizeWebhook({
    token: url.searchParams.get('token') || request.headers.get('x-webhook-token'),
    rawBody,
    signature: request.headers.get('x-magick-signature'),
    timestamp: request.headers.get('x-magick-timestamp'),
  });
  if (auth !== 'ok') return json({ error: 'Invalid webhook token or signature' }, 401);

  let body;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    logWebhookEvent({ event: 'invalid_json', matched: false, payload: { raw: rawBody.slice(0, 2000) } });
    return json({ error: 'Body must be JSON' }, 400);
  }

  try {
    const result = await processWebhook({
      body,
      eventHeader: request.headers.get('x-magick-event'),
      deliveryId: request.headers.get('idempotency-key') || request.headers.get('x-magick-delivery-id'),
    });
    return json(result, 200);
  } catch (err) {
    console.error('[webhook] processing failed', err);
    // 5xx makes MagickVoice retry the delivery
    return json({ error: 'Webhook processing failed' }, 500);
  }
}

/** Health check so you can open the URL in a browser. */
export async function GET() {
  return json({ ok: true, endpoint: 'MagickVoice webhook receiver', method: 'POST' });
}
