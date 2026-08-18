/**
 * Phase 3A — standalone technical SEO engine checks.
 *
 * Mirrors tests/seo/seo.test.ts (spec §43) WITHOUT Vitest, so it runs inside
 * the Freebuff WebContainer (Vitest cannot spawn its worker processes there).
 * The engines under src/convex/seo and src/seo.config.ts are framework-free,
 * so they compile with plain tsc and run under plain node.
 *
 * Run:
 *   npx tsc scripts/seo-check.ts --outDir /tmp/seo-check --module commonjs \
 *     --target es2022 --moduleResolution node --skipLibCheck --esModuleInterop \
 *     --types node && node /tmp/seo-check/scripts/seo-check.js
 */

import {
  SEO_CONFIG,
  PUBLIC_PAGES,
  PRIVATE_PATH_PREFIXES,
  buildPageMetadata,
  canonicalUrlFor,
  classifyPath,
  normalizePath,
} from "../src/seo.config";
import {
  getRobotsAllow,
  getRobotsDisallow,
  getSiteUrl,
} from "../src/convex/seo/engine/config";
import {
  buildSitemapXml,
  parseSitemapUrls,
  sitemapEntries,
  validateSitemap,
} from "../src/convex/seo/engine/sitemap";
import {
  buildRobotsTxt,
  isPathDisallowed,
  parseRobotsTxt,
  robotsMetaIsNoindex,
} from "../src/convex/seo/engine/robots";
import { healthBreakdown, healthScore } from "../src/convex/seo/engine/health";
import {
  analyzePage,
  countHeadings,
  extractCanonical,
  extractJsonLdScripts,
  extractLinks,
  extractMetaContent,
  extractRobots,
  extractTitle,
  isSpaShell,
} from "../src/convex/seo/engine/crawler";
import {
  checkMetadataConfig,
  dedupeIssues,
  issueKey,
  issuesFromMetadataConfig,
  issuesFromPage,
  validateRobotsTxt,
} from "../src/convex/seo/engine/issues";

const SITE = "https://verito.online";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`,
  );
}
function ok(name: string, cond: boolean) {
  check(name, cond === true);
}
function includes(name: string, arr: readonly unknown[], item: unknown) {
  check(
    name,
    arr.some((x) => JSON.stringify(x) === JSON.stringify(item)),
    `expected ${JSON.stringify(item)} in ${JSON.stringify(arr)}`,
  );
}
function hasSubstring(name: string, haystack: string, needle: string) {
  check(name, haystack.includes(needle), `expected "${needle}" in "${haystack.slice(0, 120)}..."`);
}
function anyIssue(name: string, issues: { issueType?: string; type?: string; severity?: string; url?: string }[], issueType: string) {
  check(name, issues.some((i) => (i.issueType ?? i.type) === issueType));
}

/* ------------------------------ config (spec §5) --------------------------- */

// Single source of truth holds the approved Verito positioning.
eq("SEO_CONFIG.siteName", SEO_CONFIG.siteName, "Verito");
eq("SEO_CONFIG.siteUrl", SEO_CONFIG.siteUrl, "https://verito.online");
eq("SEO_CONFIG.defaultLocale", SEO_CONFIG.defaultLocale, "en");
eq("SEO_CONFIG.defaultRobots", SEO_CONFIG.defaultRobots, "index, follow");
ok("defaultDescription mentions Amazon Seller Central", SEO_CONFIG.defaultDescription.includes("Amazon Seller Central"));

// Path normalization + canonical URLs.
eq("normalizePath trailing slash", normalizePath("/terms/"), "/terms");
eq("normalizePath query string", normalizePath("terms?x=1"), "/terms");
eq("canonicalUrlFor /terms", canonicalUrlFor("/terms", SITE), `${SITE}/terms`);
eq("canonicalUrlFor /", canonicalUrlFor("/", SITE), `${SITE}/`);

// Public vs private classification (spec §4).
eq("classify / -> public", classifyPath("/").kind, "public");
eq("classify /terms -> public", classifyPath("/terms").kind, "public");
eq("classify /privacy -> public", classifyPath("/privacy").kind, "public");
eq("classify /auth -> public", classifyPath("/auth").kind, "public");
eq("classify /dashboard -> private", classifyPath("/dashboard").kind, "private");
eq("classify /case/abc123 -> private", classifyPath("/case/abc123").kind, "private");
eq("classify /amazon/callback -> private", classifyPath("/amazon/callback").kind, "private");
eq("classify /pricing -> unknown", classifyPath("/pricing").kind, "unknown");

// Site URL env resolution (explicit SEO override wins).
eq("getSiteUrl SEO_SITE_URL override", getSiteUrl({ SEO_SITE_URL: "https://seo.example.com/" }), "https://seo.example.com");
eq("getSiteUrl SITE_URL", getSiteUrl({ SITE_URL: "https://app.example.com" }), "https://app.example.com");
eq("getSiteUrl default", getSiteUrl({}), SEO_CONFIG.siteUrl);

// Robots allow/disallow derive from the private route registry.
eq("getRobotsAllow", getRobotsAllow(), ["/"]);
for (const prefix of PRIVATE_PATH_PREFIXES) {
  const normalized = prefix.length > 1 && prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  includes(`robots disallows ${normalized}`, getRobotsDisallow(), normalized);
}
includes("robots disallows /internal", getRobotsDisallow(), "/internal");

/* --------------------------- page metadata (spec §6) ----------------------- */

{
  const meta = buildPageMetadata("/", SITE);
  ok("homepage indexable", meta.indexable === true);
  eq("homepage title", meta.title, SEO_CONFIG.defaultTitle);
  ok("homepage description length", meta.description.length > 50);
  eq("homepage canonical", meta.canonical, `${SITE}/`);
  eq("homepage robots", meta.robots, "index, follow");
  eq("homepage og.url", meta.og.url, `${SITE}/`);
  eq("homepage og.type", meta.og.type, "website");
  eq("homepage twitter.card", meta.twitter.card, "summary");
  eq(
    "homepage JSON-LD types",
    meta.jsonLd.map((b) => b["@type"]),
    ["Organization", "WebSite", "SoftwareApplication"],
  );
}

{
  const meta = buildPageMetadata("/auth", SITE);
  ok("/auth not indexable", meta.indexable === false);
  eq("/auth robots", meta.robots, "noindex, follow");
  eq("/auth canonical", meta.canonical, `${SITE}/auth`);
}

for (const path of ["/dashboard", "/case/abc123", "/amazon/callback"]) {
  const meta = buildPageMetadata(path, SITE);
  ok(`${path} not indexable`, meta.indexable === false);
  eq(`${path} robots`, meta.robots, "noindex, nofollow");
  ok(`${path} no canonical`, meta.canonical === null);
}

{
  const meta = buildPageMetadata("/definitely-not-a-page", SITE);
  ok("unknown route not indexable", meta.indexable === false);
  eq("unknown route robots", meta.robots, "noindex, nofollow");
}

{
  const meta = buildPageMetadata("/terms", SITE);
  ok("/terms indexable", meta.indexable === true);
  const types = meta.jsonLd.map((b) => b["@type"]);
  includes("/terms JSON-LD has BreadcrumbList", types, "BreadcrumbList");
  const breadcrumb = meta.jsonLd.find((b) => b["@type"] === "BreadcrumbList");
  ok(
    "/terms BreadcrumbList schema.org context",
    breadcrumb != null && breadcrumb["@context"] === "https://schema.org",
  );
}

/* --------------------------------- sitemap --------------------------------- */

{
  const entries = sitemapEntries(SITE);
  const urls = entries.map((e) => e.url);
  eq("sitemap lists only public indexable pages", urls, [`${SITE}/`, `${SITE}/terms`, `${SITE}/privacy`]);
  ok("sitemap omits /auth", !urls.includes(`${SITE}/auth`));
  ok("sitemap omits /dashboard", !urls.some((u) => u.includes("/dashboard")));
  ok("sitemap URLs unique", new Set(urls).size === urls.length);
}

{
  const xml = buildSitemapXml({ siteUrl: SITE });
  ok("sitemap XML declaration", xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  hasSubstring("sitemap urlset namespace", xml, '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  eq("sitemap XML round-trips", parseSitemapUrls(xml), sitemapEntries(SITE).map((e) => e.url));
}

{
  const known = PUBLIC_PAGES.filter((p) => p.indexable !== false && p.noindex !== true).map((p) =>
    canonicalUrlFor(p.path, SITE),
  );
  const issues = validateSitemap({
    siteUrl: SITE,
    urls: ["http://verito.online/", "https://evil.example/x", `${SITE}/dashboard`, `${SITE}/terms`, `${SITE}/terms`],
    knownPublicUrls: known,
    disallowPaths: getRobotsDisallow(),
  });
  anyIssue("sitemap flags http URL", issues, "sitemap_http_url");
  anyIssue("sitemap flags hostname mismatch", issues, "sitemap_hostname_mismatch");
  anyIssue("sitemap flags private path", issues, "sitemap_private_path");
  anyIssue("sitemap flags duplicate", issues, "sitemap_duplicate");
  check(
    "sitemap flags missing privacy page",
    issues.some((i) => i.type === "sitemap_missing_page" && i.url === `${SITE}/privacy`),
  );
}

{
  const issues = validateSitemap({
    siteUrl: SITE,
    urls: [`${SITE}/dashboard`],
    disallowPaths: getRobotsDisallow(),
  });
  const leak = issues.find((i) => i.type === "sitemap_private_path");
  ok("private path leak is CRITICAL", leak?.severity === "CRITICAL");
}

/* --------------------------------- robots ---------------------------------- */

{
  const txt = buildRobotsTxt({ siteUrl: SITE });
  hasSubstring("robots user-agent", txt, "User-agent: *");
  hasSubstring("robots allow all", txt, "Allow: /");
  hasSubstring("robots disallow dashboard", txt, "Disallow: /dashboard");
  hasSubstring("robots disallow internal", txt, "Disallow: /internal");
  hasSubstring("robots references sitemap", txt, `Sitemap: ${SITE}/sitemap.xml`);
}

{
  const parsed = parseRobotsTxt(buildRobotsTxt({ siteUrl: SITE }));
  eq("robots parsed sitemaps", parsed.sitemaps, [`${SITE}/sitemap.xml`]);
  includes("robots group user-agent *", parsed.groups[0].userAgents, "*");
  includes("robots group disallows /dashboard", parsed.groups[0].disallow, "/dashboard");
  // Longest matching rule wins: private path is disallowed, public path is not.
  ok("robots disallows /dashboard/x", isPathDisallowed(parsed.groups, "/dashboard/x") === true);
  ok("robots disallows /case/abc", isPathDisallowed(parsed.groups, "/case/abc") === true);
  ok("robots allows /terms", isPathDisallowed(parsed.groups, "/terms") === false);
  ok("robots allows /", isPathDisallowed(parsed.groups, "/") === false);
}

ok("robotsMetaIsNoindex noindex, follow", robotsMetaIsNoindex("noindex, follow") === true);
ok("robotsMetaIsNoindex index, follow", robotsMetaIsNoindex("index, follow") === false);
ok("robotsMetaIsNoindex undefined", robotsMetaIsNoindex(undefined) === false);

{
  ok("validateRobotsTxt missing", validateRobotsTxt(null, { siteUrl: SITE }).missing === true);
  const noSitemap = validateRobotsTxt("User-agent: *\nDisallow: /dashboard", { siteUrl: SITE });
  ok("robots missing sitemap reference", noSitemap.sitemapReferenced === false);
  const blocksPublic = validateRobotsTxt(`User-agent: *\nDisallow: /terms\nSitemap: ${SITE}/sitemap.xml`, {
    siteUrl: SITE,
  });
  includes("robots flags blocked public page", blocksPublic.publicPathsBlocked, "/terms");
  const good = validateRobotsTxt(buildRobotsTxt({ siteUrl: SITE }), {
    siteUrl: SITE,
    disallowPaths: getRobotsDisallow(),
  });
  ok("valid robots not missing", good.missing === false);
  ok("valid robots references sitemap", good.sitemapReferenced === true);
  eq("valid robots blocks no public pages", good.publicPathsBlocked, []);
}

/* ------------------------------ health score ------------------------------- */

eq("health score clean", healthScore([]), 100);
eq(
  "health score critical+high",
  healthScore([{ severity: "CRITICAL", status: "OPEN" }, { severity: "HIGH", status: "OPEN" }]),
  100 - 20 - 10,
);
eq(
  "health score medium+low",
  healthScore([{ severity: "MEDIUM", status: "OPEN" }, { severity: "LOW", status: "OPEN" }]),
  100 - 4 - 1,
);
eq("health score ignores RESOLVED", healthScore([{ severity: "CRITICAL", status: "RESOLVED" }]), 100);
eq("health score ignores IGNORED", healthScore([{ severity: "CRITICAL", status: "IGNORED" }]), 100);
eq(
  "health score never negative",
  healthScore(Array.from({ length: 10 }, () => ({ severity: "CRITICAL" as const, status: "OPEN" as const }))),
  0,
);

{
  const breakdown = healthBreakdown([
    { severity: "CRITICAL", status: "OPEN" },
    { severity: "HIGH", status: "OPEN" },
    { severity: "LOW", status: "RESOLVED" },
  ]);
  eq("health breakdown total", breakdown.total, 3);
  eq("health breakdown open", breakdown.open, 2);
  eq("health breakdown CRITICAL count", breakdown.bySeverity.CRITICAL, 1);
  eq("health breakdown HIGH count", breakdown.bySeverity.HIGH, 1);
  eq("health breakdown score", breakdown.score, 100 - 20 - 10);
}

/* --------------------------------- crawler --------------------------------- */

{
  const html =
    '<html><head><title>Verito — Terms</title>' +
    '<meta name="description" content="Terms of Service for Verito">' +
    '<meta name="robots" content="index, follow">' +
    '<link rel="canonical" href="https://verito.online/terms"></head><body></body></html>';
  eq("crawler title", extractTitle(html), "Verito — Terms");
  eq("crawler meta description", extractMetaContent(html, "description"), "Terms of Service for Verito");
  eq("crawler robots meta", extractRobots(html), "index, follow");
  eq("crawler canonical", extractCanonical(html), "https://verito.online/terms");
  eq("crawler heading count", countHeadings("<h1>a</h1><h2>b</h2><h3>c</h3>"), 3);
}

{
  const html =
    '<a href="/terms">Terms</a>' +
    '<a href="https://verito.online/privacy">Privacy</a>' +
    '<a href="https://other.example/">External</a>' +
    '<a href="mailto:support@verito.online">Mail</a>' +
    '<a href="javascript:void(0)">JS</a>';
  const { internal, external } = extractLinks(html, `${SITE}/`);
  eq("crawler internal links", internal, [`${SITE}/terms`, `${SITE}/privacy`]);
  eq("crawler external links", external, ["https://other.example/"]);
  ok("crawler skips mailto links", !internal.some((u) => u.startsWith("mailto:")));
}

{
  const html =
    '<div id="root"></div>' +
    '<script type="application/ld+json">{"@type":"Organization"}</script>';
  const ld = extractJsonLdScripts(html);
  eq("crawler JSON-LD count", ld.length, 1);
  eq("crawler JSON-LD content", JSON.parse(ld[0])["@type"], "Organization");
  ok("crawler detects SPA shell", isSpaShell(html) === true);
  ok("crawler plain page not SPA", isSpaShell("<p>plain</p>") === false);
}

{
  const analysis = analyzePage({
    url: `${SITE}/`,
    status: 200,
    html: '<div id="root"></div><a href="/terms">T</a>',
    responseMs: 120,
    contentLength: 512,
  });
  ok("analyzePage ok", analysis.ok === true);
  ok("analyzePage SPA shell", analysis.isSpaShell === true);
  eq("analyzePage internal links", analysis.internalLinks, [`${SITE}/terms`]);
  eq("analyzePage responseMs", analysis.responseMs, 120);
}

/* ------------------------------ issue rules -------------------------------- */

eq(
  "issueKey idempotent across trailing slash and case",
  issueKey(`${SITE}/`, "x", "Same problem."),
  issueKey(`${SITE}`, "x", "same problem."),
);
ok("issueKey differs by URL", issueKey(`${SITE}/terms`, "x", "a") !== issueKey(`${SITE}/privacy`, "x", "a"));

{
  const dup = { url: `${SITE}/`, issueType: "missing_title", severity: "MEDIUM" as const, description: "no title" };
  eq("dedupeIssues collapses duplicates", dedupeIssues([dup, dup]).length, 1);
}

{
  const checkResult = checkMetadataConfig(SITE);
  eq("metadata config duplicate titles", checkResult.duplicateTitles, []);
  eq("metadata config duplicate descriptions", checkResult.duplicateDescriptions, []);
  eq("metadata config missing canonical", checkResult.missingCanonical, []);
  eq("metadata config issues", issuesFromMetadataConfig(SITE), []);
}

{
  const analysis = analyzePage({ url: `${SITE}/`, status: 200, html: '<div id="root"></div>' });
  const issues = issuesFromPage(analysis, {
    url: `${SITE}/`,
    title: SEO_CONFIG.defaultTitle,
    description: SEO_CONFIG.defaultDescription,
    canonical: `${SITE}/`,
    indexable: true,
  });
  check(
    "SPA shell records metadata_client_rendered INFO",
    issues.some((i) => i.issueType === "metadata_client_rendered" && i.severity === "INFO"),
  );
  ok("SPA shell does not fabricate missing title", !issues.some((i) => i.issueType === "missing_title"));
}

{
  const analysis = analyzePage({ url: `${SITE}/x`, status: 404, html: "<p>nope</p>" });
  const issues = issuesFromPage(analysis, {
    url: `${SITE}/x`,
    title: "Expected",
    description: "Expected description",
    canonical: `${SITE}/x`,
    indexable: true,
  });
  anyIssue("broken page flags http_status", issues, "http_status");
  anyIssue("broken page flags missing_title", issues, "missing_title");
  anyIssue("broken page flags missing_canonical", issues, "missing_canonical");
  anyIssue("broken page flags missing_structured_data", issues, "missing_structured_data");
}

/* --------------------------------- summary --------------------------------- */

if (failures > 0) {
  console.log(`\n${failures} SEO check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll SEO engine contract checks passed.");
