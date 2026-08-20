import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});

/**
 * Claim the provider role for the current user.
 * Protected by a one-time setup key stored in PROVIDER_SETUP_KEY env var.
 * This is a one-way action — once set, the role cannot be removed via the UI.
 */
export const claimProviderRole = mutation({
  args: { setupKey: v.string() },
  handler: async (ctx, { setupKey }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const expectedKey = process.env.PROVIDER_SETUP_KEY;
    if (!expectedKey) {
      throw new Error(
        "Provider setup is not configured. Set PROVIDER_SETUP_KEY in the Convex dashboard.",
      );
    }
    if (setupKey !== expectedKey) {
      throw new Error("Invalid setup key.");
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found.");
    if ((user as any).role === "provider") {
      return { ok: true, message: "Already a provider." };
    }

    await ctx.db.patch(userId, { role: "provider" as any });
    return { ok: true, message: "Provider role activated." };
  },
});
