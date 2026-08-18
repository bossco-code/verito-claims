/**
 * Pure SEO engine — issue detection rules, idempotency and deduplication.
 * Framework-free so it runs in the test suite.
 *
 * Detection is layered:
 *   1. CONFIG-layer checks (deterministic, always authoritative): metadata
 *      completeness/uniqueness, sitemap integrity, robots rules.
 *   2. FETCH-layer checks (crawler results): HTTP status, response time,
 *      document size, served-vs-expected metadata, robots.txt/sitemap content,
 *      internal links.
 *
 * This app is a client-rendered SPA, so title/description/canonical/JSON-LD
 * are applied client-side (src/components/verito/SeoManager.tsx). The crawler
 * records INFO issues for metadata it cannot verify in raw HTML rather than
 * inventing "missing" CRITICALs — JS-capable crawlers (Google, Bing) execute
 * the page and do see the config metadata.
 */

import { PUBLIC_PAGES, SEO_CONFIG, canonicalUrlFor } from "../../../seo.config";
import type { PageAnalysis } from "./crawler";
import type { SitemapIssue } from "./sitemap";

export const SEVERITY = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INFO: "INFO",
} as const;

export type Severity = (typeof SEVERITY)[keyof typeof SEVERITY];

export type SeoIssueInput = {
  url: string;
  issueType: string;
  severity: Severity;
  description: string;
  /** Extra structured context (expected values, status codes, ...). */
  metadata?: Record<string, unknown>;
};

/**
 * Stable idempotency key: same URL + same issue type + same underlying
 * problem → same key. Repeated scans update the existing issue instead of
 * creating duplicates (spec §38).
 */
export function issueKey(url: string, issueType: string, description: string): string {
  return `${normalizeUrlForKey(url)}|${issueType}|${description.trim().toLowerCase().slice(0, 240)}`;
}

function normalizeUrlForKey(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

/** Remove duplicate issues by key, keeping the first occurrence. */
export function dedupeIssues(issues: SeoIssueInput[]): SeoIssueInput[] {
  const seen = new Set<string>();
  const out: SeoIssueInput[] = [];
  for (const issue of issues) {
    const key = issueKey(issue.url, issue.issueType, issue.description);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

/* ------------------------- config-layer: metadata ------------------------- */

export type MetadataConfigCheck = {
  /** Titles shared by more than one public indexable page. */
  duplicateTitles: { title: string; pages: string[] }[];
  /** Descriptions shared by more than one public indexable page. */
  duplicateDescriptions: { description: string; pages: string[] }[];
  /** Indexable pages missing a canonical (should never happen). */
  missingCanonical: string[];
};

export function checkMetadataConfig(siteUrl: string = SEO_CONFIG.siteUrl): MetadataConfigCheck {
  const indexable = PUBLIC_PAGES.filter((p) => p.indexable !== false && p.noindex !== true);
  const titleMap = new Map<string, string[]>();
  const descriptionMap = new Map<string, string[]>();
  const missingCanonical: string[] = [];

  for (const page of indexable) {
    const url = canonicalUrlFor(page.path, siteUrl);
    if (!page.title || !page.title.trim()) missingCanonical.push(url);
    if (!page.description || !page.description.trim()) missingCanonical.push(url);
    const t = titleMap.get(page.title) ?? [];
    t.push(url);
    titleMap.set(page.title, t);
    const d = descriptionMap.get(page.description) ?? [];
    d.push(url);
    descriptionMap.set(page.description, d);
  }

  return {
    duplicateTitles: [...titleMap.entries()]
      .filter(([, pages]) => pages.length > 1)
      .map(([title, pages]) => ({ title, pages })),
    duplicateDescriptions: [...descriptionMap.entries()]
      .filter(([, pages]) => pages.length > 1)
      .map(([description, pages]) => ({ description, pages })),
    missingCanonical,
  };
}

export function issuesFromMetadataConfig(siteUrl: string = SEO_CONFIG.siteUrl): SeoIssueInput[] {
  const check = checkMetadataConfig(siteUrl);
  const issues: SeoIssueInput[] = [];
  for (const dup of check.duplicateTitles) {
    issues.push({
      url: dup.pages[0],
      issueType: "duplicate_title",
      severity: SEVERITY.MEDIUM,
      description: `Duplicate title "${dup.title}" is configured on ${dup.pages.length} public pages. Titles must be unique.`,
      metadata: { pages: dup.pages, title: dup.title },
    });
  }
  for (const dup of check.duplicateDescriptions) {
    issues.push({
      url: dup.pages[0],
      issueType: "duplicate_description",
      severity: SEVERITY.MEDIUM,
      description: `Duplicate meta description configured on ${dup.pages.length} public pages. Descriptions should be unique where practical.`,
      metadata: { pages: dup.pages },
    });
  }
  return issues;
}

/* -------------------------- fetch-layer: pages ---------------------------- */

export type PageExpectation = {
  url: string;
  title: string;
  description: string;
  canonical: string;
  indexable: boolean;
};

/** Compare a crawled page against the expected config metadata. */
export function issuesFromPage(
  analysis: PageAnalysis,
  expected: PageExpectation,
): SeoIssueInput[] {
  const issues: SeoIssueInput[] = [];
  const isSpa = analysis.isSpaShell;

  // HTTP status.
  if (!analysis.ok) {
    issues.push({
      url: analysis.url,
      issueType: "http_status",
      severity: analysis.status >= 500 ? SEVERITY.HIGH : SEVERITY.HIGH,
      description: `Public page returned HTTP ${analysis.status} — expected 200.`,
      metadata: { status: analysis.status },
    });
  }

  // Response time / document size (lightweight performance signals, spec §30).
  if (analysis.responseMs != null && analysis.responseMs > 2000) {
    issues.push({
      url: analysis.url,
      issueType: "slow_page",
      severity: SEVERITY.LOW,
      description: `Page responded in ${analysis.responseMs}ms (threshold 2000ms).`,
      metadata: { responseMs: analysis.responseMs },
    });
  }
  if (analysis.contentLength != null && analysis.contentLength > 1_000_000) {
    issues.push({
      url: analysis.url,
      issueType: "large_document",
      severity: SEVERITY.LOW,
      description: `Document is ${Math.round(analysis.contentLength / 1024)}KB — larger than the 1MB threshold.`,
      metadata: { contentLength: analysis.contentLength },
    });
  }

  // SPA: metadata is applied client-side; record INFO when raw HTML cannot
  // confirm the expected values (honest, actionable, never a false CRITICAL).
  if (isSpa) {
    issues.push({
      url: analysis.url,
      issueType: "metadata_client_rendered",
      severity: SEVERITY.INFO,
      description:
        "Route metadata (title/description/canonical/JSON-LD) is applied client-side by the SEO manager. JS-capable crawlers see it; raw HTML serves the shell defaults.",
      metadata: { expectedTitle: expected.title },
    });
    return issues;
  }

  // Static-HTML checks (accurate when the page is server-rendered).
  if (!analysis.title || !analysis.title.trim()) {
    issues.push({
      url: analysis.url,
      issueType: "missing_title",
      severity: SEVERITY.MEDIUM,
      description: "Page has no <title>.",
      metadata: { expectedTitle: expected.title },
    });
  } else if (analysis.title.trim() !== expected.title) {
    issues.push({
      url: analysis.url,
      issueType: "title_mismatch",
      severity: SEVERITY.LOW,
      description: `Served <title> ("${analysis.title.trim()}") differs from the configured title.`,
      metadata: { expectedTitle: expected.title, servedTitle: analysis.title.trim() },
    });
  }

  if (!analysis.description || !analysis.description.trim()) {
    issues.push({
      url: analysis.url,
      issueType: "missing_description",
      severity: SEVERITY.MEDIUM,
      description: "Page has no meta description.",
      metadata: { expectedDescription: expected.description },
    });
  }

  if (!analysis.canonical) {
    issues.push({
      url: analysis.url,
      issueType: "missing_canonical",
      severity: SEVERITY.MEDIUM,
      description: "Page has no <link rel=\"canonical\">.",
      metadata: { expectedCanonical: expected.canonical },
    });
  } else if (analysis.canonical !== expected.canonical) {
    issues.push({
      url: analysis.url,
      issueType: "canonical_mismatch",
      severity: SEVERITY.HIGH,
      description: `Page canonical is "${analysis.canonical}" but the configured canonical is "${expected.canonical}".`,
      metadata: { expectedCanonical: expected.canonical, servedCanonical: analysis.canonical },
    });
  }

  if (analysis.jsonLd.length === 0) {
    issues.push({
      url: analysis.url,
      issueType: "missing_structured_data",
      severity: SEVERITY.LOW,
      description: "No JSON-LD structured data found on the page.",
    });
  }

  return issues;
}

/* ------------------------- fetch-layer: sitemap --------------------------- */

export function issuesFromSitemapValidation(issues: SitemapIssue[]): SeoIssueInput[] {
  return issues.map((issue) => ({
    url: issue.url,
    issueType: issue.type,
    severity: issue.severity,
    description: issue.description,
  }));
}

/* -------------------------- fetch-layer: robots --------------------------- */

export type RobotsValidation = {
  missing: boolean;
  sitemapReferenced: boolean;
  privatePathsDisallowed: string[];
  /** Public indexable paths accidentally blocked by robots rules. */
  publicPathsBlocked: string[];
};

export function validateRobotsTxt(
  text: string | null,
  options: { siteUrl?: string; disallowPaths?: string[] },
): RobotsValidation {
  const siteUrl = (options.siteUrl ?? SEO_CONFIG.siteUrl).replace(/\/+$/, "");
  const disallow = options.disallowPaths ?? [];
  const result: RobotsValidation = {
    missing: text == null || text.trim() === "",
    sitemapReferenced: false,
    privatePathsDisallowed: [],
    publicPathsBlocked: [],
  };
  if (text == null) return result;

  const parsed = parseRobots(text);
  result.sitemapReferenced = parsed.sitemaps.some((s) => s.startsWith(`${siteUrl}/sitemap`));

  for (const rule of disallow) {
    if (parsed.disallow.some((d) => d !== "" && (rule === d || rule.startsWith(d)))) {
      result.privatePathsDisallowed.push(rule);
    }
  }

  // Public indexable pages must never be blocked (unless explicitly noindex).
  for (const page of PUBLIC_PAGES) {
    if (page.indexable === false) continue;
    const path = page.path === "/" ? "/" : page.path.replace(/\/$/, "");
    if (parsed.disallow.some((d) => d !== "" && path.startsWith(d))) {
      result.publicPathsBlocked.push(page.path);
    }
  }
  return result;
}

function parseRobots(text: string): { disallow: string[]; sitemaps: string[] } {
  const disallow: string[] = [];
  const sitemaps: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "disallow") disallow.push(value);
    if (key === "sitemap") sitemaps.push(value);
  }
  return { disallow, sitemaps };
}

/* ------------------------- fetch-layer: internal links -------------------- */

export function issuesFromInternalLinks(options: {
  /** Links found on crawled pages (absolute). */
  links: { from: string; to: string }[];
  /** Status of linked URLs we actually fetched. */
  linkStatus: Map<string, number>;
  /** Known public pages (absolute canonical URLs). */
  knownPublicUrls: Set<string>;
  /** Private path prefixes that links must never point to. */
  privatePrefixes: string[];
  siteUrl: string;
}): SeoIssueInput[] {
  const issues: SeoIssueInput[] = [];
  const linkedPaths = new Set<string>();

  for (const { from, to } of options.links) {
    const path = to.split(/[?#]/, 1)[0] ?? "";
    linkedPaths.add(path);

    for (const prefix of options.privatePrefixes) {
      if (path === prefix || path.startsWith(prefix)) {
        issues.push({
          url: to,
          issueType: "link_to_private_route",
          severity: SEVERITY.HIGH,
          description: `Public page ${from} links to a private application route: ${to}.`,
          metadata: { from },
        });
      }
    }

    const status = options.linkStatus.get(to);
    if (status != null && (status === 404 || status === 410 || status >= 500)) {
      issues.push({
        url: to,
        issueType: "broken_link",
        severity: SEVERITY.HIGH,
        description: `Broken link from ${from}: HTTP ${status}.`,
        metadata: { from, status },
      });
    } else if (status != null && status >= 300 && status < 400) {
      issues.push({
        url: to,
        issueType: "redirect",
        severity: SEVERITY.INFO,
        description: `Link from ${from} redirects (HTTP ${status}). Prefer direct canonical links.`,
        metadata: { from, status },
      });
    }
  }

  // Orphan public pages: never linked from any other public page.
  const publicPaths = new Set<string>();
  for (const page of PUBLIC_PAGES) {
    if (page.indexable === false || page.noindex === true) continue;
    publicPaths.add(page.path);
  }
  for (const path of publicPaths) {
    if (path === "/") continue; // homepage is always reachable
    if (!linkedPaths.has(path) && !options.knownPublicUrls.has(canonicalUrlFor(path, options.siteUrl))) {
      issues.push({
        url: canonicalUrlFor(path, options.siteUrl),
        issueType: "orphan_public_page",
        severity: SEVERITY.LOW,
        description: `Public page ${path} is not linked from any other public page.`,
      });
    }
  }

  return issues;
}

/* ---------------------------- safe auto-fixes ----------------------------- */

/**
 * Issues that the engine may fix automatically (deterministic, low-risk).
 * Everything else (canonical changes, robots rules, index/noindex, redirects,
 * routing, deleting pages, removing structured data) is RECOMMENDED ACTION
 * only — never applied automatically (spec §23).
 */
export const AUTO_FIXABLE_ISSUE_TYPES = new Set([
  "missing_title",
  "missing_description",
  "missing_og",
  "missing_structured_data",
  "sitemap_stale",
  "metadata_stale",
]);

export const RECOMMENDED_ACTION_ISSUE_TYPES = new Set([
  "canonical_mismatch",
  "missing_canonical",
  "noindex_public_page",
  "sitemap_noindex_conflict",
  "private_url_in_sitemap",
  "sitemap_private_path",
  "http_status",
  "broken_link",
  "redirect",
  "missing_robots_txt",
  "missing_sitemap",
  "sitemap_http_url",
  "sitemap_hostname_mismatch",
  "sitemap_missing_page",
  "sitemap_invalid_url",
]);

export function isAutoFixable(issueType: string): boolean {
  return AUTO_FIXABLE_ISSUE_TYPES.has(issueType);
}

export function requiresApproval(issueType: string): boolean {
  return RECOMMENDED_ACTION_ISSUE_TYPES.has(issueType);
}
