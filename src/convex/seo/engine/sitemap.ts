/**
 * Pure SEO engine — sitemap.xml generation, parsing and validation.
 * Framework-free (no Convex imports) so it runs in the test suite.
 */

import { PUBLIC_PAGES, SEO_CONFIG, canonicalUrlFor, normalizePath } from "../../../seo.config";
import { getRobotsDisallow } from "./config";

export type SitemapEntry = {
  url: string;
  lastmod?: string;
};

export type SitemapBuildOptions = {
  siteUrl?: string;
  lastmod?: string;
  /** Override the default (config-derived) entry list. */
  entries?: SitemapEntry[];
};

/** Public, indexable, canonical URLs only — never private/noindex pages. */
export function sitemapEntries(siteUrl: string = SEO_CONFIG.siteUrl): SitemapEntry[] {
  const seen = new Set<string>();
  const entries: SitemapEntry[] = [];
  for (const page of PUBLIC_PAGES) {
    if (page.indexable === false || page.noindex === true) continue;
    const url = canonicalUrlFor(page.path, siteUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    entries.push({ url });
  }
  return entries;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSitemapXml(options: SitemapBuildOptions = {}): string {
  const siteUrl = (options.siteUrl ?? SEO_CONFIG.siteUrl).replace(/\/+$/, "");
  const entries = options.entries ?? sitemapEntries(siteUrl);
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod ?? options.lastmod;
      const lastmodTag = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeXml(entry.url)}</loc>${lastmodTag}\n  </url>`;
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));
}

/** Extract every <loc> URL from a sitemap document. */
export function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const url = decodeEntities(match[1].trim());
    if (url) urls.push(url);
  }
  return urls;
}

/* ------------------------------ validation -------------------------------- */

export type SitemapIssue = {
  url: string;
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  description: string;
};

export type SitemapValidationOptions = {
  siteUrl?: string;
  /** Sitemap URLs actually found (served or parsed). */
  urls: string[];
  /** Pages known to be indexable public routes (absolute canonical URLs). */
  knownPublicUrls?: string[];
  /** Paths robots.txt disallows (private routes etc.). */
  disallowPaths?: string[];
};

const SEVERITY = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INFO: "INFO",
} as const;

/**
 * Validate a sitemap: HTTPS, hostname consistency, duplicates, noindex
 * conflicts, private-route leaks, unknown pages, non-canonical URLs.
 */
export function validateSitemap(options: SitemapValidationOptions): SitemapIssue[] {
  const siteUrl = (options.siteUrl ?? SEO_CONFIG.siteUrl).replace(/\/+$/, "");
  const host = new URL(siteUrl).host;
  const disallow = options.disallowPaths ?? getRobotsDisallow();
  const issues: SitemapIssue[] = [];
  const seen = new Set<string>();

  for (const raw of options.urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      issues.push({
        url: raw,
        type: "sitemap_invalid_url",
        severity: SEVERITY.HIGH,
        description: `Sitemap contains an invalid URL: "${raw}".`,
      });
      continue;
    }

    if (url.protocol !== "https:") {
      issues.push({
        url: raw,
        type: "sitemap_http_url",
        severity: SEVERITY.HIGH,
        description: `Sitemap URL is not HTTPS: "${raw}". Canonical URLs must use HTTPS.`,
      });
    }

    if (url.host !== host) {
      issues.push({
        url: raw,
        type: "sitemap_hostname_mismatch",
        severity: SEVERITY.HIGH,
        description: `Sitemap URL uses host "${url.host}" but the canonical site is "${host}".`,
      });
    }

    if (seen.has(raw)) {
      issues.push({
        url: raw,
        type: "sitemap_duplicate",
        severity: SEVERITY.LOW,
        description: `Duplicate URL in sitemap: "${raw}".`,
      });
    }
    seen.add(raw);

    const path = normalizePath(url.pathname);
    for (const rule of disallow) {
      if (path === rule || path.startsWith(rule)) {
        issues.push({
          url: raw,
          type: "sitemap_private_path",
          severity: SEVERITY.CRITICAL,
          description: `Sitemap leaks a private/robots-disallowed path ("${rule}"): "${raw}".`,
        });
      }
    }

    if (options.knownPublicUrls && !options.knownPublicUrls.includes(raw)) {
      issues.push({
        url: raw,
        type: "sitemap_unknown_page",
        severity: SEVERITY.MEDIUM,
        description: `Sitemap contains a URL that is not a configured public page: "${raw}".`,
      });
    }
  }

  // Canonical consistency: every configured public page should be present.
  if (options.knownPublicUrls) {
    const present = new Set(options.urls);
    for (const expected of options.knownPublicUrls) {
      if (!present.has(expected)) {
        issues.push({
          url: expected,
          type: "sitemap_missing_page",
          severity: SEVERITY.HIGH,
          description: `Indexable public page missing from sitemap: "${expected}".`,
        });
      }
    }
  }

  return issues;
}
