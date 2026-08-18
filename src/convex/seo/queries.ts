/**
 * Phase 3A — SEO admin queries.
 *
 * The dashboard data (health, issues, change log, last scans, sitemap/robots
 * status) is computed by a shared helper so it can be served both:
 *   - to authenticated internal users via getSeoAdminDashboard
 *   - to the HTTP admin endpoint (/internal/seo, bearer-token protected)
 *
 * No seller-facing UI consumes these — the seller app is unchanged.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, query, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { healthBreakdown, type IssueLike } from "./engine/health";
import { sitemapEntries } from "./engine/sitemap";
import { buildRobotsTxt } from "./engine/robots";
import { getRobotsDisallow, getSiteUrl } from "./engine/config";
import { PUBLIC_PAGES, PRIVATE_PATH_PREFIXES } from "../../seo.config";

async function loadAdminDashboard(ctx: QueryCtx) {
  const [issues, changeLogs, scans] = await Promise.all([
    ctx.db.query("seoIssues").collect(),
    ctx.db.query("seoChangeLogs").withIndex("by_time", (q) => q.gt("createdAt", 0)).order("desc").take(50),
    ctx.db.query("seoScans").withIndex("by_time", (q) => q.gt("startedAt", 0)).order("desc").take(10),
  ]);

  const siteUrl = getSiteUrl(process.env);
  const entries = sitemapEntries(siteUrl);

  return {
    generatedAt: Date.now(),
    siteUrl,
    health: healthBreakdown(issues as IssueLike[]),
    issues: issues.map((issue) => ({
      id: issue._id,
      url: issue.url,
      issueType: issue.issueType,
      severity: issue.severity,
      status: issue.status,
      description: issue.description,
      detectedAt: issue.detectedAt,
      resolvedAt: issue.resolvedAt ?? null,
    })),
    changeLog: changeLogs.map((log) => ({
      id: log._id,
      changeType: log.changeType,
      targetUrl: log.targetUrl,
      oldValue: log.oldValue ?? null,
      newValue: log.newValue ?? null,
      reason: log.reason,
      automatic: log.automatic,
      actor: log.actor,
      createdAt: log.createdAt,
    })),
    scans: scans.map((scan) => ({
      id: scan._id,
      trigger: scan.trigger,
      status: scan.status,
      startedAt: scan.startedAt,
      finishedAt: scan.finishedAt ?? null,
      urlCount: scan.urlCount ?? null,
      issueCount: scan.issueCount ?? null,
      healthScore: scan.healthScore ?? null,
      error: scan.error ?? null,
    })),
    sitemap: {
      urlCount: entries.length,
      urls: entries.map((entry) => entry.url),
      // Reference build output so operators can diff against what is served.
      xmlPreview: null,
    },
    robots: {
      disallow: getRobotsDisallow(),
      preview: buildRobotsTxt({ siteUrl }),
    },
    routes: {
      public: PUBLIC_PAGES.map((page) => ({ path: page.path, indexable: page.indexable !== false && page.noindex !== true })),
      privatePrefixes: [...PRIVATE_PATH_PREFIXES],
    },
  };
}

export type SeoAdminDashboard = Awaited<ReturnType<typeof loadAdminDashboard>>;

/** Internal (no auth) — consumed by the /internal/seo HTTP endpoint. */
export const getSeoAdminDashboardData = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await loadAdminDashboard(ctx);
  },
});

/** Authenticated — for internal operators. Never used by the seller app. */
export const getSeoAdminDashboard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await loadAdminDashboard(ctx);
  },
});

export const getSeoIssue = query({
  args: { issueId: v.id("seoIssues") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.db.get(args.issueId);
  },
});

/** Internal - lookup an issue by its stable idempotency key (scan action). */
export const findIssueByKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("seoIssues")
      .withIndex("by_key", (q) => q.eq("issueKey", args.key))
      .first();
  },
});
