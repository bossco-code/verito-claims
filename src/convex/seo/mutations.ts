/**
 * Phase 3A — SEO issue persistence.
 *
 * Internal mutations are called by the scan action (src/convex/seo/actions.ts)
 * and the HTTP admin endpoint. The authenticated mutations (ignoreIssue,
 * resolveIssue) let an internal operator change issue status — every change
 * is written to seoChangeLogs.
 *
 * Idempotency (spec §38): upsertIssue keys on url + issueType + description,
 * so repeated scans update existing rows instead of duplicating them.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { issueKey, type Severity } from "./engine/issues";

const NOW = () => Date.now();

function assertSeverity(severity: string): Severity {
  const allowed = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);
  return (allowed.has(severity) ? severity : "INFO") as Severity;
}

/* ------------------------------ internal ---------------------------------- */

export const upsertIssue = internalMutation({
  args: {
    url: v.string(),
    issueType: v.string(),
    severity: v.string(),
    description: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const key = issueKey(args.url, args.issueType, args.description);
    const existing = await ctx.db
      .query("seoIssues")
      .withIndex("by_key", (q) => q.eq("issueKey", key))
      .first();
    const now = NOW();
    if (existing) {
      await ctx.db.patch(existing._id, {
        severity: assertSeverity(args.severity),
        description: args.description,
        metadata: args.metadata,
        detectedAt: now,
        // A previously resolved problem that reappears is OPEN again.
        status: existing.status === "RESOLVED" ? "OPEN" : existing.status,
        resolvedAt: undefined,
      });
      return { upserted: false, id: existing._id };
    }
    const id = await ctx.db.insert("seoIssues", {
      url: args.url,
      issueType: args.issueType,
      severity: assertSeverity(args.severity),
      description: args.description,
      status: "OPEN",
      detectedAt: now,
      issueKey: key,
      metadata: args.metadata,
    });
    return { upserted: true, id };
  },
});

/** Mark OPEN issues (for scanned URLs) RESOLVED when this scan no longer detects them. */
export const resolveStaleIssues = internalMutation({
  args: { urls: v.array(v.string()), activeKeys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const active = new Set(args.activeKeys);
    const now = NOW();
    let resolved = 0;
    for (const url of args.urls) {
      const issues = await ctx.db.query("seoIssues").withIndex("by_url", (q) => q.eq("url", url)).collect();
      for (const issue of issues) {
        if (issue.status !== "OPEN") continue;
        if (active.has(issue.issueKey)) continue;
        await ctx.db.patch(issue._id, { status: "RESOLVED", resolvedAt: now });
        resolved += 1;
      }
    }
    return { resolved };
  },
});

export const setIssueStatus = internalMutation({
  args: { issueId: v.id("seoIssues"), status: v.string() },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) return { ok: false };
    await ctx.db.patch(args.issueId, {
      status: args.status,
      resolvedAt: args.status === "OPEN" ? undefined : NOW(),
    });
    return { ok: true };
  },
});

export const logChange = internalMutation({
  args: {
    changeType: v.string(),
    targetUrl: v.string(),
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
    reason: v.string(),
    automatic: v.boolean(),
    actor: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("seoChangeLogs", {
      changeType: args.changeType,
      targetUrl: args.targetUrl,
      oldValue: args.oldValue,
      newValue: args.newValue,
      reason: args.reason,
      automatic: args.automatic,
      actor: args.actor,
      createdAt: NOW(),
    });
    return { ok: true };
  },
});

export const startScan = internalMutation({
  args: { trigger: v.string(), siteUrl: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("seoScans", {
      trigger: args.trigger,
      status: "running",
      startedAt: NOW(),
      siteUrl: args.siteUrl,
    });
  },
});

export const finishScan = internalMutation({
  args: {
    scanId: v.id("seoScans"),
    status: v.string(),
    urlCount: v.optional(v.number()),
    issueCount: v.optional(v.number()),
    healthScore: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanId, {
      status: args.status,
      finishedAt: NOW(),
      urlCount: args.urlCount,
      issueCount: args.issueCount,
      healthScore: args.healthScore,
      error: args.error,
    });
    return { ok: true };
  },
});

/* ------------------------------ authenticated ----------------------------- */

async function requireUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

async function setIssueStatusWithLog(
  ctx: MutationCtx,
  args: { issueId: Id<"seoIssues">; status: string; changeType: string },
  actor: string,
) {
  const issue = await ctx.db.get(args.issueId);
  if (!issue) return { ok: false, error: "Issue not found" };
  await ctx.db.patch(args.issueId, {
    status: args.status,
    resolvedAt: args.status === "OPEN" ? undefined : NOW(),
  });
  await ctx.db.insert("seoChangeLogs", {
    changeType: args.changeType,
    targetUrl: issue.url,
    oldValue: issue.status,
    newValue: args.status,
    reason: `Manual ${args.status.toLowerCase()} by internal operator`,
    automatic: false,
    actor,
    createdAt: NOW(),
  });
  return { ok: true };
}

/** Internal operator: mark an issue IGNORED (with audit log). */
export const ignoreIssue = mutation({
  args: { issueId: v.id("seoIssues") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    return await setIssueStatusWithLog(ctx, { issueId: args.issueId, status: "IGNORED", changeType: "issue.ignored" }, actor);
  },
});

/** Internal operator: mark an issue RESOLVED (with audit log). */
export const resolveIssue = mutation({
  args: { issueId: v.id("seoIssues") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    return await setIssueStatusWithLog(ctx, { issueId: args.issueId, status: "RESOLVED", changeType: "issue.resolved" }, actor);
  },
});
