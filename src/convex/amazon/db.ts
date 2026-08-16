/**
 * Internal Convex DB access for the Amazon integration. These functions are
 * only callable from actions (never from the client) — they power OAuth
 * persistence, idempotent event/candidate upserts, sync-run progress and
 * multi-tenant-scoped reads.
 *
 * NOTE: Convex patch values must never be `undefined`; clearing optional
 * fields is done with `null` (runtime-accepted since schemaValidation=false),
 * which requires a cast because the generated PatchValue type only allows
 * `string | undefined` for optional string fields.
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { ClaimPolicy, EvaluatedCandidate, NormalizedEvent } from "./types";

/* ─────────────────────────────── Queries ─────────────────────────────── */

export const getConnectionByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("amazonConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const getConnectionByState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    return await ctx.db
      .query("amazonConnections")
      .withIndex("by_state", (q) => q.eq("state", state))
      .first();
  },
});

export const getActivePolicies = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("claimPolicies").collect();
  },
});

export const getLatestSyncRun = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("syncRuns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
  },
});

export const getCandidatesByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("claimCandidates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const getEventsByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("normalizedEvents")
      .withIndex("by_user_type", (q) => q.eq("userId", userId))
      .collect();
  },
});

/* ─────────────────────────────── Mutations ─────────────────────────────── */

export const createPendingConnection = internalMutation({
  args: {
    userId: v.id("users"),
    state: v.string(),
    marketplaceId: v.string(),
    region: v.string(),
  },
  handler: async (ctx, { userId, state, marketplaceId, region }) => {
    const existing = await ctx.db
      .query("amazonConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        state,
        status: "pending",
        marketplaceId,
        region,
      });
      return existing._id;
    }
    return await ctx.db.insert("amazonConnections", {
      userId,
      state,
      status: "pending",
      marketplaceId,
      region,
    });
  },
});

export const completeConnection = internalMutation({
  args: {
    connectionId: v.id("amazonConnections"),
    encryptedRefreshToken: v.string(),
    sellerId: v.optional(v.string()),
    connectedAt: v.number(),
  },
  handler: async (ctx, { connectionId, encryptedRefreshToken, sellerId, connectedAt }) => {
    await ctx.db.patch(
      connectionId,
      {
        status: "connected",
        encryptedRefreshToken,
        ...(sellerId !== undefined ? { sellerId } : {}),
        connectedAt,
        state: null,
        lastError: null,
      } as any,
    );
  },
});

export const patchConnection = internalMutation({
  args: {
    connectionId: v.id("amazonConnections"),
    patch: v.any(),
  },
  handler: async (ctx, { connectionId, patch }) => {
    await ctx.db.patch(connectionId, patch);
  },
});

export const revokeConnection = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const conn = await ctx.db
      .query("amazonConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (conn) {
      await ctx.db.patch(
        conn._id,
        {
          status: "revoked",
          encryptedRefreshToken: null,
          sellerId: null,
        } as any,
      );
    }
  },
});

export const createSyncRun = internalMutation({
  args: {
    userId: v.id("users"),
    stage: v.string(),
    message: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, { userId, stage, message, startedAt }) => {
    return await ctx.db.insert("syncRuns", {
      userId,
      status: "running",
      stage,
      message,
      startedAt,
      stages: { [stage]: { status: "running", at: startedAt } },
    });
  },
});

export const patchSyncRun = internalMutation({
  args: { syncRunId: v.id("syncRuns"), patch: v.any() },
  handler: async (ctx, { syncRunId, patch }) => {
    await ctx.db.patch(syncRunId, patch);
  },
});

/** Idempotent event upsert (spec §35) — keyed on (userId, source, source_record_id). */
export const upsertEvent = internalMutation({
  args: { userId: v.id("users"), event: v.any() },
  handler: async (ctx, { userId, event }) => {
    const ev = event as NormalizedEvent;
    const existing = await ctx.db
      .query("normalizedEvents")
      .withIndex("by_user_source", (q) =>
        q.eq("userId", userId).eq("source", ev.source).eq("source_record_id", ev.source_record_id),
      )
      .first();
    if (existing) {
      const patch: Record<string, unknown> = {
        event_type: ev.event_type,
        event_date: ev.event_date,
        retrieved_at: ev.retrieved_at,
      };
      if (ev.quantity !== undefined) patch.quantity = ev.quantity;
      if (ev.amount !== undefined) patch.amount = ev.amount;
      if (ev.metadata !== undefined) patch.metadata = ev.metadata;
      await ctx.db.patch(existing._id, patch as any);
      return { created: false };
    }
    await ctx.db.insert("normalizedEvents", {
      userId,
      event_id: ev.event_id,
      event_type: ev.event_type,
      marketplace_id: ev.marketplace_id,
      sku: ev.sku,
      asin: ev.asin,
      fnsku: ev.fnsku,
      quantity: ev.quantity,
      amount: ev.amount,
      currency: ev.currency,
      event_date: ev.event_date,
      shipment_id: ev.shipment_id,
      order_id: ev.order_id,
      source: ev.source,
      source_record_id: ev.source_record_id,
      retrieved_at: ev.retrieved_at,
      metadata: ev.metadata,
    });
    return { created: true };
  },
});

/** Idempotent candidate upsert (spec §35) — keyed on (userId, candidateKey). */
export const upsertCandidate = internalMutation({
  args: { userId: v.id("users"), candidate: v.any() },
  handler: async (ctx, { userId, candidate }) => {
    const c = candidate as EvaluatedCandidate;
    const existing = await ctx.db
      .query("claimCandidates")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("candidateKey", c.candidateKey))
      .first();
    const fields = {
      candidate_type: c.candidate_type,
      marketplace_id: c.marketplace_id,
      sku: c.sku,
      asin: c.asin,
      fnsku: c.fnsku,
      shipment_id: c.shipment_id,
      quantity: c.quantity,
      estimated_value: c.estimated_value,
      currency: c.currency,
      trigger_event_id: c.trigger_event_id,
      detected_at: c.detected_at,
      eligibility_date: c.eligibility_date,
      deadline_date: c.deadline_date,
      days_remaining: c.days_remaining,
      reimbursement_status: c.reimbursement_status,
      status: c.status,
      priority: c.priority,
      data_completeness: c.data_completeness,
      policy: c.policy,
      reconciliation: c.reconciliation,
      updated_at: c.updated_at,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields as any);
      return { created: false };
    }
    await ctx.db.insert("claimCandidates", {
      userId,
      candidateKey: c.candidateKey,
      claimId: c.claimId,
      created_at: c.created_at,
      ...fields,
    });
    return { created: true };
  },
});

/** Seed default policies (idempotent by policy_id). */
export const seedPolicies = internalMutation({
  args: { policies: v.array(v.any()) },
  handler: async (ctx, { policies }) => {
    let inserted = 0;
    for (const p of policies as ClaimPolicy[]) {
      const existing = await ctx.db
        .query("claimPolicies")
        .filter((q) => q.eq(q.field("policy_id"), p.policy_id))
        .first();
      if (!existing) {
        await ctx.db.insert("claimPolicies", p);
        inserted++;
      }
    }
    return { inserted };
  },
});

/** Delete one page of a user's Amazon data (events, candidates, sync runs). */
export const deleteUserDataPage = internalMutation({
  args: { userId: v.id("users"), limit: v.number() },
  handler: async (ctx, { userId, limit }) => {
    let deleted = 0;
    const events = await ctx.db
      .query("normalizedEvents")
      .withIndex("by_user_type", (q) => q.eq("userId", userId))
      .take(limit);
    for (const e of events) {
      await ctx.db.delete(e._id);
      deleted++;
    }
    const candidates = await ctx.db
      .query("claimCandidates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(limit);
    for (const c of candidates) {
      await ctx.db.delete(c._id);
      deleted++;
    }
    const runs = await ctx.db
      .query("syncRuns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(limit);
    for (const r of runs) {
      await ctx.db.delete(r._id);
      deleted++;
    }
    return { deleted };
  },
});
