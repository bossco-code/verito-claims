import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

/**
 * INTERNAL — called only by the Creem webhook handler (src/convex/webhooks.ts).
 * Upserts a subscription record (keyed by the Creem subscription id) and links
 * it to the Convex user who started the checkout (metadata.userId first, the
 * buyer's customer email as fallback). Idempotent — webhook replays simply
 * patch the existing row.
 *
 * Marked internal so clients cannot forge their own plan state.
 */
export const upsertSubscriptionFromWebhook = internalMutation({
  args: {
    subId: v.string(),
    eventType: v.string(),
    status: v.string(),
    plan: v.optional(v.string()),
    eventTime: v.optional(v.number()),
    metadataUserId: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerId: v.optional(v.string()),
    productId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Link to the Convex user: checkout metadata wins, email as fallback.
    let userId: string | undefined;
    if (args.metadataUserId) {
      // db.get throws on malformed ids, so only trust valid-looking ones.
      try {
        const user = await ctx.db.get(args.metadataUserId as Id<"users">);
        if (user) userId = user._id;
      } catch {
        // fall through to the email lookup below
      }
    }
    if (!userId && args.customerEmail) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", args.customerEmail!))
        .first();
      if (user) userId = user._id;
    }

    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_creem_id", (q) => q.eq("creemSubscriptionId", args.subId))
      .first();

    // Shared fields for patch/insert. Optional fields are spread conditionally
    // so undefined values are never written (Convex rejects them at runtime).
    const shared = {
      status: args.status,
      plan: args.plan ?? "pro",
      cancelAtPeriodEnd: args.cancelAtPeriodEnd ?? false,
      lastEvent: args.eventType,
      lastEventAt: args.eventTime ?? now,
      updatedAt: now,
    };
    const userIdValue = userId as Id<"users"> | undefined;
    const optional = {
      ...(userIdValue !== undefined && { userId: userIdValue }),
      ...(args.customerEmail !== undefined && { email: args.customerEmail }),
      ...(args.productId !== undefined && { productId: args.productId }),
      ...(args.customerId !== undefined && { customerId: args.customerId }),
      ...(args.currentPeriodEnd !== undefined && {
        currentPeriodEnd: args.currentPeriodEnd,
      }),
    };

    if (existing) {
      await ctx.db.patch(existing._id, { ...shared, ...optional });
    } else {
      await ctx.db.insert("subscriptions", {
        creemSubscriptionId: args.subId,
        ...shared,
        ...optional,
        createdAt: now,
      });
    }
  },
});

/**
 * The signed-in user's Creem subscription (null if none / not signed in).
 * The `subscriptions` table is kept in sync by the Creem webhook handler.
 * Use `status === "active"` to gate Pro features.
 */
export const getMySubscription = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * INTERNAL - log a webhook delivery outcome (debugging aid).
 */
export const recordWebhookEvent = internalMutation({
  args: {
    eventType: v.string(),
    outcome: v.string(),
    receivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("webhookEvents", args);
  },
});
