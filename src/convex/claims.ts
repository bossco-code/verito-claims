import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";

/**
 * Plan-based claim gating.
 *
 * Free plan: 5 prepared claims per calendar month (server-enforced).
 * Pro plan: unlimited (subscription row with status "active", kept in sync
 * by the Creem webhook handler in src/convex/webhooks.ts).
 *
 * Usage counter: one `claimRuns` row per user + "YYYY-MM" bucket, bumped by
 * `startClaimRun`. The bucket rolls over automatically each month.
 */

export const FREE_MONTHLY_LIMIT = 5;

function monthKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}

/** The signed-in user's current plan + monthly usage. */
export const getClaimQuota = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { plan: "signed_out", limit: null, used: null, remaining: null };
    }

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (subscription?.status === "active") {
      return { plan: "pro", limit: null, used: null, remaining: null };
    }

    const run = await ctx.db
      .query("claimRuns")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", userId).eq("month", monthKey()),
      )
      .first();
    const used = run?.count ?? 0;
    return {
      plan: "free",
      limit: FREE_MONTHLY_LIMIT,
      used,
      remaining: Math.max(0, FREE_MONTHLY_LIMIT - used),
    };
  },
});

/**
 * Call before starting a claim preparation run. Server-enforced: Pro users
 * pass through unlimited; Free users are rejected once they hit the monthly
 * limit. Returns { ok: false, reason: "limit" } when blocked so the UI can
 * upsell Pro.
 */
export const startClaimRun = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { ok: false as const, reason: "unauthorized" as const };
    }

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (subscription?.status === "active") {
      return { ok: true as const, plan: "pro" as const, used: null, remaining: null };
    }

    const month = monthKey();
    const run = await ctx.db
      .query("claimRuns")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", userId).eq("month", month),
      )
      .first();
    const used = run?.count ?? 0;
    if (used >= FREE_MONTHLY_LIMIT) {
      return {
        ok: false as const,
        reason: "limit" as const,
        used,
        limit: FREE_MONTHLY_LIMIT,
      };
    }

    if (run) {
      await ctx.db.patch(run._id, { count: used + 1 });
    } else {
      await ctx.db.insert("claimRuns", { userId, month, count: 1 });
    }

    return {
      ok: true as const,
      plan: "free" as const,
      used: used + 1,
      remaining: Math.max(0, FREE_MONTHLY_LIMIT - used - 1),
    };
  },
});
