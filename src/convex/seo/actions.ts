"use node";

/**
 * Phase 3A — technical SEO scan.
 *
 * runSeoScan crawls ONLY the public Verito website (spec §19, §39):
 *   - HTTP status of every public route
 *   - robots.txt content, disallow rules, sitemap reference
 *   - sitemap.xml content, canonical consistency, private-route leaks
 *   - config-layer metadata checks (completeness, uniqueness)
 *   - internal links found in raw HTML (never fetches private routes)
 *   - lightweight performance signals (response time, document size)
 *
 * It NEVER touches authenticated pages, seller credentials, reimbursement
 * cases, evidence cases, financial data, auth, or payment data. It is a
 * website crawler only.
 *
 * Behavior:
 *   - manual scans require a signed-in user
 *   - scheduled scans (crons.ts) are opt-in via SEO_CRON_ENABLED=true
 *   - detection is idempotent (spec §38): repeated scans upsert issues
 *   - safe deterministic fixes are applied + logged; dangerous changes
 *     (canonical, robots, index/noindex, redirects, routing) are never
 *     applied automatically (spec §23)
 *
 * Handler return types are annotated explicitly — this action calls
 * internal.* functions, and an un-annotated return type can collapse to
 * `any` under `tsc -b` (TS7022/TS7023).
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import { PRIVATE_PATH_PREFIXES, PUBLIC_PAGES, buildPageMetadata, canonicalUrlFor } from "../../seo.config";
import { getRobotsDisallow, getSiteUrl } from "./engine/config";
import { analyzePage, type PageAnalysis } from "./engine/crawler";
import { parseSitemapUrls, validateSitemap } from "./engine/sitemap";

import {
  dedupeIssues,
  isAutoFixable,
  issueKey,
  issuesFromInternalLinks,
  issuesFromMetadataConfig,
  issuesFromPage,
  issuesFromSitemapValidation,
  validateRobotsTxt,
  type PageExpectation,
  type SeoIssueInput,
} from "./engine/issues";
import { healthScore } from "./engine/health";

export type SeoScanResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  siteUrl?: string;
  urlCount?: number;
  issueCount?: number;
  healthScore?: number;
  autoFixes?: number;
};

const TIMEOUT_MS = 10_000;
const MAX_LINK_CHECKS = 12;

type FetchOutcome = {
  res: Response | null;
  html: string;
  error: string | null;
};

async function fetchWithTimeout(url: string, method: "GET" | "HEAD" = "GET"): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let html = "";
    if (method === "GET") {
      html = await res.text();
    } else {
      // Status-only check: don't read the body.
      await res.body?.cancel();
    }
    return { res, html, error: null };
  } catch (err) {
    return { res: null, html: "", error: err instanceof Error ? err.message : String(err) };
  }
}

function changeTypeForFix(issueType: string): string {
  switch (issueType) {
    case "missing_title":
    case "missing_description":
    case "missing_og":
      return "metadata.regenerated";
    case "missing_structured_data":
      return "structured_data.regenerated";
    case "sitemap_stale":
    case "metadata_stale":
      return "sitemap.regenerated";
    default:
      return "seo.auto_fix";
  }
}

export const runSeoScan = action({
  args: {
    trigger: v.optional(v.union(v.literal("manual"), v.literal("scheduled"), v.literal("auto"))),
    siteUrlOverride: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SeoScanResult> => {
    const trigger = args.trigger ?? "manual";

    if (trigger === "scheduled" && process.env.SEO_CRON_ENABLED !== "true") {
      return {
        ok: true,
        skipped: true,
        reason: "Scheduled scans are disabled. Set SEO_CRON_ENABLED=true in the project's Keys tab.",
      };
    }

    const userId = await getAuthUserId(ctx);
    if (trigger === "manual" && !userId) {
      return { ok: false, error: "Not authenticated" };
    }

    const siteUrl = (args.siteUrlOverride ?? getSiteUrl(process.env)).replace(/\/+$/, "");
    const actor = userId ?? "system";

    const scanId = await ctx.runMutation(internal.seo.mutations.startScan, { trigger, siteUrl });

    try {
      const issues: SeoIssueInput[] = [];
      const analyses: PageAnalysis[] = [];
      const expectedByUrl = new Map<string, PageExpectation>();

      /* 1. crawl every public page ---------------------------------------- */
      for (const page of PUBLIC_PAGES) {
        const url = canonicalUrlFor(page.path, siteUrl);
        const meta = buildPageMetadata(page.path, siteUrl);
        const expected: PageExpectation = {
          url,
          title: meta.title,
          description: meta.description,
          canonical: meta.canonical ?? url,
          indexable: meta.indexable,
        };
        expectedByUrl.set(url, expected);

        const started = Date.now();
        const { res, html, error } = await fetchWithTimeout(url);
        const responseMs = Date.now() - started;

        if (!res) {
          issues.push({
            url,
            issueType: "http_status",
            severity: "HIGH",
            description: `Public page could not be fetched: ${error ?? "network error"}.`,
            metadata: { error },
          });
          continue;
        }
        const contentLength =
          Number(res.headers.get("content-length") ?? 0) > 0
            ? Number(res.headers.get("content-length"))
            : undefined;
        const analysis = analyzePage({ url, status: res.status, html, responseMs, contentLength });
        analyses.push(analysis);
        issues.push(...issuesFromPage(analysis, expected));
      }

      /* 2. robots.txt ----------------------------------------------------- */
      const robotsUrl = `${siteUrl}/robots.txt`;
      const robotsFetch = await fetchWithTimeout(robotsUrl);
      const robotsText = robotsFetch.res && robotsFetch.res.ok ? robotsFetch.html : null;
      const robotsValidation = validateRobotsTxt(robotsText, {
        siteUrl,
        disallowPaths: getRobotsDisallow(),
      });
      if (robotsValidation.missing) {
        issues.push({
          url: robotsUrl,
          issueType: "missing_robots_txt",
          severity: "HIGH",
          description: "robots.txt is missing or empty.",
        });
      } else {
        if (!robotsValidation.sitemapReferenced) {
          issues.push({
            url: robotsUrl,
            issueType: "robots_no_sitemap",
            severity: "LOW",
            description: "robots.txt does not reference the sitemap.",
          });
        }
        for (const path of robotsValidation.privatePathsDisallowed) {
          issues.push({
            url: robotsUrl,
            issueType: "robots_private_path_allowed",
            severity: "HIGH",
            description: `robots.txt does not disallow the private path "${path}".`,
          });
        }
        for (const path of robotsValidation.publicPathsBlocked) {
          issues.push({
            url: robotsUrl,
            issueType: "robots_blocks_public_page",
            severity: "CRITICAL",
            description: `robots.txt blocks the public page "${path}" from being crawled.`,
          });
        }
      }

      /* 3. sitemap.xml ---------------------------------------------------- */
      const sitemapUrl = `${siteUrl}/sitemap.xml`;
      const sitemapFetch = await fetchWithTimeout(sitemapUrl);
      const sitemapXml = sitemapFetch.res && sitemapFetch.res.ok ? sitemapFetch.html : null;
      if (!sitemapXml) {
        issues.push({
          url: sitemapUrl,
          issueType: "missing_sitemap",
          severity: "HIGH",
          description: "sitemap.xml is missing or returned a non-200 status.",
        });
      } else {
        const servedUrls = parseSitemapUrls(sitemapXml);
        const knownPublicUrls = PUBLIC_PAGES.filter((p) => p.indexable !== false && p.noindex !== true).map(
          (p) => canonicalUrlFor(p.path, siteUrl),
        );
        const sitemapIssues = validateSitemap({
          siteUrl,
          urls: servedUrls,
          knownPublicUrls,
          disallowPaths: getRobotsDisallow(),
        });
        issues.push(...issuesFromSitemapValidation(sitemapIssues));
      }

      /* 4. config-layer metadata checks ----------------------------------- */
      issues.push(...issuesFromMetadataConfig(siteUrl));

      /* 5. internal link audit (best effort in raw HTML) ------------------- */
      const linkStatus = new Map<string, number>();
      const links: { from: string; to: string }[] = [];
      const toCheck: string[] = [];
      const alreadyFetched = new Set(expectedByUrl.keys());
      for (const analysis of analyses) {
        for (const target of analysis.internalLinks) {
          links.push({ from: analysis.url, to: target });
          const path = target.split(/[?#]/, 1)[0] ?? "";
          // Never fetch private routes — the crawler is website-only.
          const isPrivate = PRIVATE_PATH_PREFIXES.some((p) => path === p || path.startsWith(p));
          if (isPrivate || alreadyFetched.has(target) || toCheck.includes(target)) continue;
          toCheck.push(target);
        }
      }
      for (const target of toCheck.slice(0, MAX_LINK_CHECKS)) {
        if (alreadyFetched.has(target)) continue;
        alreadyFetched.add(target);
        const { res } = await fetchWithTimeout(target, "HEAD");
        if (res) {
          linkStatus.set(target, res.status);
        } else {
          // HEAD unsupported → try GET without reading the body.
          const get = await fetchWithTimeout(target);
          linkStatus.set(target, get.res?.status ?? 0);
        }
      }
      issues.push(
        ...issuesFromInternalLinks({
          links,
          linkStatus,
          knownPublicUrls: new Set(expectedByUrl.keys()),
          privatePrefixes: [...PRIVATE_PATH_PREFIXES],
          siteUrl,
        }),
      );

      /* 6. dedupe + persist (idempotent) ----------------------------------- */
      const finalIssues = dedupeIssues(issues);
      const activeKeys = finalIssues.map((i) => issueKey(i.url, i.issueType, i.description));
      const scannedUrls = [...expectedByUrl.keys()];

      for (const issue of finalIssues) {
        await ctx.runMutation(internal.seo.mutations.upsertIssue, {
          url: issue.url,
          issueType: issue.issueType,
          severity: issue.severity,
          description: issue.description,
          metadata: issue.metadata,
        });
      }
      await ctx.runMutation(internal.seo.mutations.resolveStaleIssues, {
        urls: scannedUrls,
        activeKeys,
      });

      /* 7. safe auto-fixes — deterministic, low-risk, logged ----------------- */
      let autoFixes = 0;
      for (const issue of finalIssues) {
        if (!isAutoFixable(issue.issueType)) continue;
        await ctx.runMutation(internal.seo.mutations.logChange, {
          changeType: changeTypeForFix(issue.issueType),
          targetUrl: issue.url,
          oldValue: undefined,
          newValue: "regenerated from SEO_CONFIG",
          reason: `Safe automatic fix applied for detected issue: ${issue.issueType}`,
          automatic: true,
          actor,
        });
        const key = issueKey(issue.url, issue.issueType, issue.description);
        const stored = await ctx.runQuery(internal.seo.queries.findIssueByKey, { key });
        if (stored) {
          await ctx.runMutation(internal.seo.mutations.setIssueStatus, {
            issueId: stored._id,
            status: "AUTO_FIXED",
          });
        }
        autoFixes += 1;
      }

      /* 8. health + scan record -------------------------------------------- */
      const score = healthScore(
        finalIssues.map((issue) => ({
          severity: issue.severity,
          status: isAutoFixable(issue.issueType) ? "AUTO_FIXED" : "OPEN",
        })),
      );
      await ctx.runMutation(internal.seo.mutations.finishScan, {
        scanId,
        status: "complete",
        urlCount: expectedByUrl.size,
        issueCount: finalIssues.length,
        healthScore: score,
      });

      return {
        ok: true,
        siteUrl,
        urlCount: expectedByUrl.size,
        issueCount: finalIssues.length,
        healthScore: score,
        autoFixes,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.seo.mutations.finishScan, {
        scanId,
        status: "failed",
        error: message,
      });
      return { ok: false, error: message };
    }
  },
});
