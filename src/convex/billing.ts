import { action, internalQuery, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

/**
 * Billing wiring status - PRESENCE checks only, never the secret values.
 * Lets the UI/terminal verify the Creem integration (Keys tab) without
 * exposing the API key. Plain module (no "use node") because queries
 * cannot be defined in Node-only files.
 */
export const checkoutConfigStatus = query({
  args: {},
  handler: async () => {
    const apiKey = process.env.CREEM_API_KEY;
    const productId = process.env.CREEM_PRO_PRODUCT_ID;
    return {
      apiKeyConfigured: apiKey !== undefined && apiKey !== "",
      apiKeyMode: !apiKey ? "missing" : apiKey.startsWith("creem_test_") ? "test" : "live",
      productIdConfigured: productId !== undefined && productId !== "",
      productId: productId || "prod_3oZHGcgeUE6lY4vn5ou2w8",
      webhookSecretConfigured: (process.env.CREEM_WEBHOOK_SECRET ?? "").length > 0,
      apiBaseUrl: process.env.CREEM_API_BASE_URL ?? null,
    };
  },
});

/**
 * Diagnostics: fetch the Creem product catalog and report the configured
 * Pro product (id, price, billing type). Used to verify the checkout is
 * actually recurring before testing a purchase. Never exposes the API key.
 */
export const creemProductInfo = action({
  args: {},
  handler: async () => {
    const apiKey = process.env.CREEM_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "CREEM_API_KEY is not configured" };
    }
    const baseUrl =
      process.env.CREEM_API_BASE_URL ??
      (apiKey.startsWith("creem_test_")
        ? "https://test-api.creem.io/v1"
        : "https://api.creem.io/v1");
    const productId = process.env.CREEM_PRO_PRODUCT_ID ?? "prod_3oZHGcgeUE6lY4vn5ou2w8";
    try {
      const res = await fetch(baseUrl + "/products/search", {
        headers: { "x-api-key": apiKey },
      });
      const data = (await res.json().catch(() => null)) as {
        items?: Array<{
          id?: string;
          name?: string;
          price?: number;
          currency?: string;
          billing_type?: string;
          billing_period?: string;
          status?: string;
        }>;
      } | null;
      if (!res.ok || !data) {
        return { ok: false as const, status: res.status };
      }
      const match = data.items?.find((p) => p.id === productId) ?? null;
      return {
        ok: true as const,
        configuredProductId: process.env.CREEM_PRO_PRODUCT_ID ?? null,
        productId,
        product: match,
        allProducts: (data.items ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          currency: p.currency,
          billing_type: p.billing_type,
          billing_period: p.billing_period,
          status: p.status,
        })),
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "request failed" };
    }
  },
});

/**
 * Diagnostics: recent subscription rows (webhook processing check).
 * Dev/debugging aid - returns row metadata, never secrets.
 */
export const subscriptionsSummary = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("subscriptions").order("desc").take(10);
    return {
      count: rows.length,
      rows: rows.map((r) => ({
        id: r._id,
        creemSubscriptionId: r.creemSubscriptionId,
        status: r.status,
        plan: r.plan,
        email: r.email ?? null,
        userId: r.userId ?? null,
        productId: r.productId ?? null,
        lastEvent: r.lastEvent ?? null,
        lastEventAt: r.lastEventAt ?? null,
        createdAt: r.createdAt,
      })),
    };
  },
});

/**
 * Diagnostics: recent webhook delivery attempts and outcomes.
 */
export const webhookEventsSummary = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("webhookEvents").order("desc").take(20);
    return {
      count: rows.length,
      rows: rows.map((r) => ({
        eventType: r.eventType,
        outcome: r.outcome,
        receivedAt: r.receivedAt,
      })),
    };
  },
});

/** INTERNAL - email for a user; used by the checkout action to prefill the buyer. */
export const getUserEmail = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    return user?.email ?? null;
  },
});

/** DEV DIAGNOSTIC - list users (id/email/anon) so subscriptions can be linked. */
export const usersSummary = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(50);
    return {
      count: users.length,
      users: users.map((u) => ({
        id: u._id,
        email: u.email ?? null,
        name: u.name ?? null,
        isAnonymous: u.isAnonymous ?? false,
      })),
    };
  },
});

/** DEV DIAGNOSTIC - attach a subscription row to a user (remove before prod). */
/** DEV DIAGNOSTIC - delete an orphaned subscription row (one with no linked user). */
export const deleteSubscription = mutation({
  args: { creemSubscriptionId: v.string() },
  handler: async (ctx, { creemSubscriptionId }) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_creem_id", (q) => q.eq("creemSubscriptionId", creemSubscriptionId))
      .first();
    if (!sub) return { ok: false as const, error: "no subscription row with that id" };
    if (sub.userId !== null && sub.userId !== undefined) {
      return { ok: false as const, error: "refusing: subscription is linked to a user" };
    }
    await ctx.db.delete(sub._id);
    return { ok: true as const, deletedId: sub._id, creemSubscriptionId };
  },
});

export const linkSubscriptionToUser = mutation({
  args: {
    creemSubscriptionId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, { creemSubscriptionId, userId }) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_creem_id", (q) => q.eq("creemSubscriptionId", creemSubscriptionId))
      .first();
    if (!sub) return { ok: false as const, error: "no subscription row with that id" };
    const user = await ctx.db.get(userId);
    if (!user) return { ok: false as const, error: "user not found" };
    await ctx.db.patch(sub._id, {
      userId,
      ...(user.email ? { email: user.email } : {}),
    });
    return { ok: true as const, subscriptionId: sub._id, userId };
  },
});
