/**
 * Pure SEO engine — environment/config resolution.
 * Framework-free so the test suite can import it directly.
 */

import { PRIVATE_PATH_PREFIXES, ROBOTS_DISALLOW, SEO_CONFIG } from "../../../seo.config";

export type SeoEnv = Record<string, string | undefined>;

/**
 * Resolve the canonical site URL for generated assets (robots.txt, sitemap,
 * crawler). Priority: SEO_SITE_URL (explicit SEO override) -> SITE_URL
 * (already used for auth) -> the approved default (verito.online).
 */
export function getSiteUrl(env?: SeoEnv): string {
  const raw = env?.SEO_SITE_URL ?? env?.SITE_URL ?? SEO_CONFIG.siteUrl;
  return raw.replace(/\/+$/, "");
}

/** Paths robots.txt should disallow: private app routes + internal SEO admin. */
export function getRobotsDisallow(): string[] {
  const disallow = new Set<string>();
  for (const prefix of [...PRIVATE_PATH_PREFIXES, ...ROBOTS_DISALLOW]) {
    // "/case/" -> "/case" (a prefix rule covers every path below it)
    const normalized = prefix.length > 1 && prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    disallow.add(normalized);
  }
  return [...disallow];
}

/** Paths robots.txt should always allow (public indexable pages). */
export function getRobotsAllow(): string[] {
  return ["/"];
}
