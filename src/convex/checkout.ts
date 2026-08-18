"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Verito Pro product id in Creem — the recurring $49/mo subscription product.
 * Used as the default so checkout works immediately; override it via the
 * CREEM_PRO_PRODUCT_ID env var (Keys tab) to point at a different plan.
 */
const DEFAULT_PRO_PRODUCT_ID = "prod_3oZHGcgeUE6lY4vn5ou2w8";

/**
 * Create a hosted Creem (creem.io) checkout session for the Verito Pro plan.
 * Returns the checkout URL to redirect the seller to.
 *
 * SUBSCRIPTIONS: Creem starts a recurring subscription when the linked
 * product is configured as a subscription (recurring) product in the Creem
 * dashboard — the same `POST /v1/checkouts` endpoint handles both one-time
 * payments and subscriptions. The Pro product is set to recurring, so this
 * checkout starts a $49/mo subscription; the response is checked for
 * `order.type === "recurring"` and a `subscription` id, and that state is
 * returned so the UI can confirm.
 *
 * NOTE: Creem's create-checkout API only accepts `success_url` (there is no
 * `cancel_url` field — sending it returns 400 "property cancel_url should
 * not exist"). Abandoned checkouts simply expire on Creem's side.
 *
 * Environment variables (set in the project's Keys tab):
 *  - CREEM_API_KEY        — your Creem API key (creem_...). REQUIRED.
 *  - CREEM_PRO_PRODUCT_ID — optional override; defaults to the Pro product
 *                           (prod_3oZHGcgeUE6lY4vn5ou2w8)
 *
 * TEST MODE: keys that start with `creem_test_` automatically target
 * https://test-api.creem.io/v1; live keys use https://api.creem.io/v1.
 * Set CREEM_API_BASE_URL to override either way.
 *
 * Returns { ok: false } with a message when configuration is missing or the
 * API errors, so the UI can degrade gracefully.
 */
export const createCheckoutSession = action({
  args: {
    successUrl: v.string(),
  },
  handler: async (
    ctx,
    { successUrl },
  ): Promise<
    | { ok: true; url: string; recurring: boolean; subscriptionId: string | null }
    | { ok: false; error: string }
  > => {
    const apiKey = process.env.CREEM_API_KEY;
    const productId = process.env.CREEM_PRO_PRODUCT_ID ?? DEFAULT_PRO_PRODUCT_ID;
    if (!apiKey) {
      return { ok: false as const, error: "CREEM_API_KEY is not configured" };
    }

    // Test keys (creem_test_...) hit the test API automatically.
    const baseUrl =
      process.env.CREEM_API_BASE_URL ??
      (apiKey.startsWith("creem_test_")
        ? "https://test-api.creem.io/v1"
        : "https://api.creem.io/v1");

    // Link the checkout to the signed-in Convex user. Creem passes metadata
    // through to webhook events, so the webhook handler uses this to attach
    // the subscription to the right user (email is the fallback).
    const userId = await getAuthUserId(ctx);
    // Also pass the buyer email explicitly so Creem records it on the
    // subscription - the webhook then links via email even if metadata is dropped.
    const customerEmail: string | null =
      userId === null
        ? null
        : await ctx.runQuery(internal.billing.getUserEmail, { userId });

    try {
      const res = await fetch(`${baseUrl}/checkouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          product_id: productId,
          request_id: crypto.randomUUID(),
          units: 1,
          success_url: successUrl,
          ...(customerEmail !== null ? { customer: { email: customerEmail } } : {}),
          metadata: {
            plan: "pro",
            recurring: "monthly",
            source: "pro-upsell",
            ...(userId !== null && { userId }),
          },
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        checkout_url?: string;
        subscription?: string | null;
        order?: { type?: string };
        error?: { message?: string } | string;
      } | null;

      if (!res.ok || !data?.checkout_url) {
        const message =
          (typeof data?.error === "string"
            ? data.error
            : data?.error?.message) ?? `Creem checkout failed (HTTP ${res.status})`;
        return { ok: false as const, error: message };
      }

      // Confirm the checkout actually started a recurring subscription.
      const recurring =
        data.order?.type === "recurring" || Boolean(data.subscription);

      return {
        ok: true as const,
        url: data.checkout_url,
        recurring,
        subscriptionId: data.subscription ?? null,
      };
    } catch (error) {
      console.error("[checkout] Creem session creation failed:", error);
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Creem checkout unavailable",
      };
    }
  },
});

