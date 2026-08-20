import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** List agent runs for the current provider, newest first. */
export const listRuns = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const user = await ctx.db.get(userId);
    if ((user as any)?.role !== "provider") return [];

    return await (ctx.db as any)
      .query("providerAgentRuns")
      .withIndex("by_provider", (q: any) => q.eq("providerUserId", userId))
      .order("desc")
      .take(20);
  },
});

/** Record a new agent run. */
export const insertRun = mutation({
  args: {
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, { clientId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if ((user as any)?.role !== "provider") throw new Error("Not a provider");

    return await (ctx.db as any).insert("providerAgentRuns", {
      providerUserId: userId,
      clientId: clientId ?? null,
      status: "running",
      startedAt: Date.now(),
      candidatesProcessed: 0,
      casesCreated: 0,
      casesUpdated: 0,
      aiAnalysesRun: 0,
    });
  },
});

/** Update an agent run with results. */
export const updateRun = mutation({
  args: {
    runId: v.id("providerAgentRuns" as any),
    patch: v.any(),
  },
  handler: async (ctx, { runId, patch }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const run = await (ctx.db as any).get(runId);
    if (!run || run.providerUserId !== userId) throw new Error("Run not found");

    await (ctx.db as any).patch(runId, patch);
    return { ok: true };
  },
});
