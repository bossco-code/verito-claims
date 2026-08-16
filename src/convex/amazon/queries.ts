/**
 * Public queries for the Opportunities UI. Every query is scoped to the
 * authenticated user (spec §36–§37) — one seller can never read another
 * seller's Amazon data.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "../_generated/server";
import { v } from "convex/values";
import { summarize } from "./engine";
import type { EvaluatedCandidate } from "./types";

/** Safe connection info for the current user (never includes the token). */
export const getConnection = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const conn = await ctx.db
      .query("amazonConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!conn) return null;
    return {
      status: conn.status,
      sellerId: conn.sellerId ?? null,
      marketplaceId: conn.marketplaceId,
      region: conn.region,
      connectedAt: conn.connectedAt ?? null,
      lastSyncAt: conn.lastSyncAt ?? null,
      lastSyncStatus: conn.lastSyncStatus ?? null,
      lastError: conn.lastError ?? null,
      dataFrom: conn.dataFrom ?? null,
      dataTo: conn.dataTo ?? null,
    };
  },
});

/** Latest sync run for the current user (real stage progress). */
export const getSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const run = await ctx.db
      .query("syncRuns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (!run) return null;
    return {
      status: run.status,
      stage: run.stage,
      message: run.message,
      error: run.error ?? null,
      errorCode: run.errorCode ?? null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? null,
      stages: run.stages ?? null,
      stats: run.stats ?? null,
      dataFrom: run.dataFrom ?? null,
      dataTo: run.dataTo ?? null,
    };
  },
});

/** All opportunities for the current user, sorted, with a summary. */
export const listOpportunities = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { candidates: [], summary: null };
    const rows = await ctx.db
      .query("claimCandidates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const candidates = rows as unknown as EvaluatedCandidate[];
    return { candidates, summary: summarize(candidates) };
  },
});

/** A single opportunity (scoped to the current user). */
export const getOpportunity = query({
  args: { candidateId: v.id("claimCandidates") },
  handler: async (ctx, { candidateId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const candidate = await ctx.db.get(candidateId);
    if (!candidate || candidate.userId !== userId) return null;
    return candidate;
  },
});

/**
 * The normalized Amazon events behind an opportunity — used by the claim
 * package so every statement is traceable to a real synced record. Scoped to
 * the current user: an event that is not the user's own is never returned.
 */
export const getOpportunityEvidence = query({
  args: { candidateId: v.id("claimCandidates") },
  handler: async (ctx, { candidateId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const candidate = await ctx.db.get(candidateId);
    if (!candidate || candidate.userId !== userId) return null;

    const events = await ctx.db
      .query("normalizedEvents")
      .withIndex("by_user_type", (q) => q.eq("userId", userId))
      .collect();

    const related = events.filter((e) =>
      e.event_id === candidate.trigger_event_id ||
      (candidate.shipment_id != null && e.shipment_id === candidate.shipment_id) ||
      (candidate.sku != null && e.sku === candidate.sku),
    );

    return { candidate, events: related };
  },
});
