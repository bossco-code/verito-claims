import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Verito — Creem (creem.io) webhook endpoint.
 *
 * Receives Creem subscription lifecycle events and keeps the seller's Pro
 * subscription state in the `subscriptions` table (upserted via an internal
 * mutation — http actions cannot touch the DB directly), linked to the Convex
 * user who started the checkout (via checkout metadata.userId, falling back
 * to the buyer's customer email).
 *
 * SECURITY: Creem signs every webhook with HMAC-SHA256 of the raw request
 * body, sent in the `creem-signature` header. We verify it with the
 * CREEM_WEBHOOK_SECRET env var before trusting any payload. Requests without
 * a valid signature are rejected with 401.
 *
 * NOTE: HTTP actions run in Convex's default runtime (not Node), so the
 * signature is computed with Web Crypto (`crypto.subtle`), which is available
 * there.
 *
 * SETUP (in the Creem dashboard — Developers > Webhooks):
 *   URL:    https://<your-deployment>.convex.site/creem-webhook
 *   Events: subscription.active, subscription.paid, subscription.update,
 *           subscription.scheduled_cancel, subscription.past_due,
 *           subscription.expired, subscription.canceled (plus
 *           checkout.completed if you want order events)
 * Then set CREEM_WEBHOOK_SECRET in the project's Keys tab (Convex env var).
 *
 * The endpoint always answers 2xx once a request is verified — even if an
 * event type is unhandled — so Creem does not retry forever. Failures are
 * logged server-side.
 */

const encoder = new TextEncoder();

/** HMAC-SHA256 of `body` keyed with `secret`, hex-encoded (Web Crypto). */
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison (no early exit on mismatch). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

interface CreemSubscription {
  id: string;
  status?: string;
  product?: {
    id?: string;
    name?: string;
    price?: number;
    currency?: string;
    billing_type?: string;
    billing_period?: string;
  };
  customer?: { id?: string; email?: string; name?: string };
  metadata?: Record<string, string>;
  cancel_at_period_end?: boolean;
  canceled_at?: string | number | null;
  current_period_end_date?: string;
  next_transaction_date?: string;
}

interface CreemEvent {
  id?: string;
  eventType?: string;
  created_at?: number;
  object?: CreemSubscription;
}

/** Map a webhook event to the subscription status to persist. */
function statusForEvent(eventType: string, fallback: string | undefined): string {
  switch (eventType) {
    case "subscription.past_due":
    case "subscription.unpaid":
      return "past_due";
    case "subscription.paused":
      return "paused";
    case "subscription.expired":
      return "expired";
    case "subscription.canceled":
      return "canceled";
    case "subscription.active":
    case "subscription.paid":
    case "subscription.update":
    case "subscription.scheduled_cancel":
    default:
      return fallback ?? "active";
  }
}

function toEpochMs(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const ms = Date.parse(dateStr);
  return Number.isNaN(ms) ? undefined : ms;
}

export const creemWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.CREEM_WEBHOOK_SECRET;
  const signature = request.headers.get("creem-signature");

  if (!secret) {
    console.error(
      "[webhook] CREEM_WEBHOOK_SECRET is not configured — set it in the Keys tab",
    );
    await ctx.runMutation(internal.subscriptions.recordWebhookEvent, {
      eventType: "unknown",
      outcome: "no_secret",
      receivedAt: Date.now(),
    });
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!signature) {
    await ctx.runMutation(internal.subscriptions.recordWebhookEvent, {
      eventType: "unknown",
      outcome: "missing_signature",
      receivedAt: Date.now(),
    });
    return new Response(
      JSON.stringify({ error: "Missing creem-signature header" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Read the raw body first — the signature is computed over the exact bytes.
  const rawBody = await request.text();

  const expected = await hmacSha256Hex(secret, rawBody);
  if (!constantTimeEqual(signature.trim(), expected)) {
    await ctx.runMutation(internal.subscriptions.recordWebhookEvent, {
      eventType: "unknown",
      outcome: "invalid_signature",
      receivedAt: Date.now(),
    });
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: CreemEvent;
  try {
    event = JSON.parse(rawBody) as CreemEvent;
  } catch {
    await ctx.runMutation(internal.subscriptions.recordWebhookEvent, {
      eventType: "unknown",
      outcome: "invalid_json",
      receivedAt: Date.now(),
    });
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventType = event.eventType ?? "unknown";
  const sub = event.object;

  // Only subscription.* events carry a real subscription id (sub_...).
  // checkout.completed objects carry a checkout id (ch_...) - upserting
  // those would create a phantom active row that survives cancellation.
  const isSubscriptionEvent = eventType.startsWith("subscription.");

  try {
    if (isSubscriptionEvent && sub?.id) {
      await ctx.runMutation(internal.subscriptions.recordWebhookEvent, {
        eventType,
        outcome: "processed",
        receivedAt: Date.now(),
      });
      await ctx.runMutation(internal.subscriptions.upsertSubscriptionFromWebhook, {
        subId: sub.id,
        eventType,
        status: statusForEvent(eventType, sub.status),
        plan: sub.metadata?.plan,
        eventTime: event.created_at,
        metadataUserId: sub.metadata?.userId,
        customerEmail: sub.customer?.email,
        customerId: sub.customer?.id,
        productId: sub.product?.id,
        currentPeriodEnd: toEpochMs(sub.current_period_end_date),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      });
      console.log(
        `[webhook] ${eventType} → subscription ${sub.id} (${statusForEvent(eventType, sub.status)})`,
      );
    } else {
      await ctx.runMutation(internal.subscriptions.recordWebhookEvent, {
        eventType,
        outcome: "acknowledged",
        receivedAt: Date.now(),
      });
      // checkout.completed and other non-subscription events: acknowledge.
      console.log(
        `[webhook] ${eventType} — acknowledged (non-subscription event)`,
      );
    }
  } catch (err) {
    // Log but still acknowledge, so Creem stops retrying this delivery.
    console.error("[webhook] failed to process event:", err);
  }

  return new Response(JSON.stringify({ received: true, eventType }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
