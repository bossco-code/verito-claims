/**
 * Pure SEO engine — robots.txt generation and parsing.
 * Framework-free so it runs in the test suite.
 */

import { SEO_CONFIG } from "../../../seo.config";
import { getRobotsAllow, getRobotsDisallow } from "./config";

export type RobotsBuildOptions = {
  siteUrl?: string;
  userAgent?: string;
  allow?: string[];
  disallow?: string[];
  sitemap?: string;
};

/**
 * Build robots.txt:
 *   - allow crawling of public pages
 *   - disallow private application routes and internal SEO admin
 *   - reference the sitemap
 * Never blocks the whole website.
 */
export function buildRobotsTxt(options: RobotsBuildOptions = {}): string {
  const siteUrl = (options.siteUrl ?? SEO_CONFIG.siteUrl).replace(/\/+$/, "");
  const allow = options.allow ?? getRobotsAllow();
  const disallow = options.disallow ?? getRobotsDisallow();
  const sitemap = options.sitemap ?? `${siteUrl}/sitemap.xml`;

  const lines: string[] = [];
  lines.push(`User-agent: ${options.userAgent ?? "*"}`);
  for (const path of allow) lines.push(`Allow: ${path}`);
  for (const path of disallow) lines.push(`Disallow: ${path}`);
  lines.push("");
  lines.push(`Sitemap: ${sitemap}`);
  return `${lines.join("\n")}\n`;
}

export type RobotsGroup = {
  userAgents: string[];
  allow: string[];
  disallow: string[];
};

export type ParsedRobotsTxt = {
  groups: RobotsGroup[];
  sitemaps: string[];
};

/** Parse a robots.txt document (basic, standard-syntax). */
export function parseRobotsTxt(text: string): ParsedRobotsTxt {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;

  const pushGroup = () => {
    if (current && (current.userAgents.length > 0 || current.allow.length > 0 || current.disallow.length > 0)) {
      groups.push(current);
    }
    current = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (current && (current.allow.length > 0 || current.disallow.length > 0 || current.userAgents.length > 0)) {
        pushGroup();
      }
      if (!current) current = { userAgents: [], allow: [], disallow: [] };
      current.userAgents.push(value);
    } else if (key === "allow") {
      if (!current) current = { userAgents: ["*"], allow: [], disallow: [] };
      current.allow.push(value);
    } else if (key === "disallow") {
      if (!current) current = { userAgents: ["*"], allow: [], disallow: [] };
      current.disallow.push(value);
    } else if (key === "sitemap") {
      sitemaps.push(value);
    }
  }
  pushGroup();
  return { groups, sitemaps };
}

/**
 * Robots matching: longest matching rule wins (per the original spec). A path
 * is disallowed when a Disallow rule matches it with no longer Allow rule.
 */
export function isPathDisallowed(groups: RobotsGroup[], path: string, userAgent = "*"): boolean {
  const group =
    groups.find((g) => g.userAgents.some((ua) => ua === userAgent || ua === "*")) ?? null;
  if (!group) return false;

  let matchedLength = -1;
  let matchedIsAllow = false;
  const consider = (rule: string, isAllow: boolean) => {
    // Prefix match, with empty Disallow meaning "allow everything".
    if (rule === "" && !isAllow) return;
    if (path.startsWith(rule) && rule.length > matchedLength) {
      matchedLength = rule.length;
      matchedIsAllow = isAllow;
    }
  };
  for (const rule of group.disallow) consider(rule, false);
  for (const rule of group.allow) consider(rule, true);
  if (matchedLength === -1) return false;
  return !matchedIsAllow;
}

/** Does a page-level robots meta value tell crawlers not to index? */
export function robotsMetaIsNoindex(robots: string | undefined): boolean {
  if (!robots) return false;
  return /(^|,|\s)noindex(,|\s|$)/i.test(robots);
}

export function robotsMetaIsNofollow(robots: string | undefined): boolean {
  if (!robots) return false;
  return /(^|,|\s)nofollow(,|\s|$)/i.test(robots);
}
