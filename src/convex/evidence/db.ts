/**
 * Internal Convex DB access for Phase 2 — the Evidence Case workspace.
 *
 * These functions are only callable from actions (never from the client).
 * Every query and mutation is multi-tenant-scoped: ownership is checked via
 * the userId passed by the action, which is itself derived from the
 * authenticated session (spec §42).
 *
 * Idempotency: evidence items upsert on (caseId, evidenceKey) — repeated
 * collections update, never duplicate (spec §39). AI analyses upsert one-per
 * case (regeneration replaces). Packages append new versions — an existing
 * package is never silently mutated (spec §31).
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

/* ─────────────────────────────── Queries ─────────────────────────────── */

/** Find the (single) case for a candidate — dedup gate for openCase. */
export const getCaseByCandidate = internalQuery({
  args: { userId: v.id("users"), claimCandidateId: v.id("claimCandidates") },
  handler: async (ctx, { userId, claimCandidateId }) => {
    return await ctx.db
      .query("evidenceCases")
      .withIndex("by_user_candidate", (q) =>
        q.eq("userId", userId).eq("claimCandidateId", claimCandidateId),
      )
      .first();
  },
});

/** Load a case, verifying ownership. */
export const getCaseForUser = internalQuery({
  args: { caseId: v.id("evidenceCases"), userId: v.id("users") },
  handler: async (ctx, { caseId, userId }) => {
    const row = await ctx.db.get(caseId);
    if (!row || row.userId !== userId) return null;
    return row;
  },
});

/** Load the candidate behind a case, verifying ownership. */
export const getCandidateForUser = internalQuery({
  args: { candidateId: v.id("claimCandidates"), userId: v.id("users") },
  handler: async (ctx, { candidateId, userId }) => {
    const row = await ctx.db.get(candidateId);
    if (!row || row.userId !== userId) return null;
    return row;
  },
});

/** All evidence items for a case (ownership checked by caller). */
export const getEvidenceItemsByCase = internalQuery({
  args: { caseId: v.id("evidenceCases") },
  handler: async (ctx, { caseId }) => {
    return await ctx.db
      .query("evidenceItems")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .order("asc")
      .collect();
  },
});

/** The AI analysis for a case, if any. */
export const getAIAnalysisByCase = internalQuery({
  args: { caseId: v.id("evidenceCases") },
  handler: async (ctx, { caseId }) => {
    return await ctx.db
      .query("aiAnalyses")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .first();
  },
});

/** Latest package version for a case (for versioning, spec §31). */
export const getLatestPackageByCase = internalQuery({
  args: { caseId: v.id("evidenceCases") },
  handler: async (ctx, { caseId }) => {
    return await ctx.db
      .query("claimEvidencePackages")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .order("desc")
      .first();
  },
});

/** Every package version for a case. */
export const getPackagesByCase = internalQuery({
  args: { caseId: v.id("evidenceCases") },
  handler: async (ctx, { caseId }) => {
    return await ctx.db
      .query("claimEvidencePackages")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .order("asc")
      .collect();
  },
});

/** Audit trail for a case, newest first. */
export const getAuditEventsByCase = internalQuery({
  args: { caseId: v.id("evidenceCases") },
  handler: async (ctx, { caseId }) => {
    return await ctx.db
      .query("auditEvents")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .order("desc")
      .collect();
  },
});

/** All cases for a user (list view). */
export const getCasesByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("evidenceCases")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/* ─────────────────────────────── Mutations ─────────────────────────────── */

export const insertCase = internalMutation({
  args: { case: v.any() },
  handler: async (ctx, { case: row }) => {
    return await ctx.db.insert("evidenceCases", row);
  },
});

export const patchCase = internalMutation({
  args: { caseId: v.id("evidenceCases"), patch: v.any() },
  handler: async (ctx, { caseId, patch }) => {
    await ctx.db.patch(caseId, patch);
  },
});

/**
 * Idempotent evidence item upsert (spec §39). Existing items are updated by
 * their stable (caseId, evidenceKey); their evidenceNo is preserved so the
 * E-IDs stay stable across collections.
 */
export const upsertEvidenceItem = internalMutation({
  args: { item: v.any() },
  handler: async (ctx, { item }) => {
    const existing = await ctx.db
      .query("evidenceItems")
      .withIndex("by_case_key", (q) =>
        q.eq("caseId", item.caseId).eq("evidenceKey", item.evidenceKey),
      )
      .first();
    if (existing) {
      const patch: Record<string, unknown> = {
        title: item.title,
        description: item.description,
        event_date: item.event_date,
        retrieved_at: item.retrieved_at,
        quantity: item.quantity,
        amount: item.amount,
        currency: item.currency,
        relevance: item.relevance,
        verification_status: item.verification_status,
        metadata: item.metadata,
        updated_at: item.updated_at,
      };
      await ctx.db.patch(existing._id, patch as any);
      return { created: false, id: existing._id, evidenceNo: existing.evidenceNo };
    }
    const id = await ctx.db.insert("evidenceItems", item);
    return { created: true, id, evidenceNo: item.evidenceNo };
  },
});

/** One AI analysis per case — regeneration replaces (spec §22). */
export const upsertAIAnalysis = internalMutation({
  args: { analysis: v.any() },
  handler: async (ctx, { analysis }) => {
    const existing = await ctx.db
      .query("aiAnalyses")
      .withIndex("by_case", (q) => q.eq("caseId", analysis.caseId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, analysis.fields as any);
      return { created: false, id: existing._id };
    }
    const id = await ctx.db.insert("aiAnalyses", analysis.row);
    return { created: true, id };
  },
});

/** Append a new package version — never mutate an existing one (spec §31). */
export const insertPackage = internalMutation({
  args: { pkg: v.any() },
  handler: async (ctx, { pkg }) => {
    return await ctx.db.insert("claimEvidencePackages", pkg);
  },
});

/** All Phase 1 normalized events for a user - raw source records (spec §12). */
export const getNormalizedEventsByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("normalizedEvents")
      .withIndex("by_user_type", (qq) => qq.eq("userId", userId))
      .collect();
  },
});

export const insertAuditEvent = internalMutation({
  args: { event: v.any() },
  handler: async (ctx, { event }) => {
    await ctx.db.insert("auditEvents", event);
  },
});
