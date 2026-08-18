/**
 * Pure SEO engine — lightweight HTML analysis for the technical crawler.
 * Framework-free so it runs in the test suite.
 *
 * This is a website crawler only (spec §19): it never touches authenticated
 * pages, seller credentials, or anything under the private app routes.
 */

export type PageAnalysis = {
  url: string;
  status: number;
  ok: boolean;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  headingCount: number;
  internalLinks: string[];
  externalLinks: string[];
  jsonLd: string[];
  /** True when the page is the client-rendered SPA shell. */
  isSpaShell: boolean;
  responseMs?: number;
  contentLength?: number;
};

export type AnalyzePageOptions = {
  url: string;
  status: number;
  html: string;
  responseMs?: number;
  contentLength?: number;
};

const TAG_ATTR_RE = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

function attributeValue(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = re.exec(tag);
  if (!match) return null;
  return decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Extract the document <title> content (decoded). */
export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const title = match[1].replace(/\s+/g, " ").trim();
  return title ? decodeHtml(title) : null;
}

/** Extract a meta tag's content by name OR property (e.g. description, robots, og:title). */
export function extractMetaContent(html: string, key: string): string | null {
  TAG_ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_ATTR_RE.exec(html)) !== null) {
    const tag = match[0];
    if (match[1].toLowerCase() !== "meta") continue;
    const name = attributeValue(tag, "name");
    const property = attributeValue(tag, "property");
    const content = attributeValue(tag, "content");
    if (content == null) continue;
    if (name?.toLowerCase() === key.toLowerCase() || property?.toLowerCase() === key.toLowerCase()) {
      return decodeHtml(content.trim());
    }
  }
  return null;
}

/** Extract the <link rel="canonical"> href. */
export function extractCanonical(html: string): string | null {
  TAG_ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_ATTR_RE.exec(html)) !== null) {
    const tag = match[0];
    if (match[1].toLowerCase() !== "link") continue;
    const rel = attributeValue(tag, "rel");
    const href = attributeValue(tag, "href");
    if (rel?.toLowerCase().split(/\s+/).includes("canonical") && href) {
      return decodeHtml(href.trim());
    }
  }
  return null;
}

/** Extract the meta robots value (e.g. "noindex, follow"). */
export function extractRobots(html: string): string | null {
  return extractMetaContent(html, "robots");
}

/** Count h1–h6 heading tags. */
export function countHeadings(html: string): number {
  let count = 0;
  const re = /<h([1-6])\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) count += 1;
  return count;
}

/** Extract JSON-LD script contents (raw, unparsed). */
export function extractJsonLdScripts(html: string): string[] {
  const scripts: string[] = [];
  TAG_ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_ATTR_RE.exec(html)) !== null) {
    const tag = match[0];
    if (match[1].toLowerCase() !== "script") continue;
    const type = attributeValue(tag, "type");
    if (type?.toLowerCase() !== "application/ld+json") continue;
    const endIndex = html.indexOf("</script>", TAG_ATTR_RE.lastIndex);
    if (endIndex === -1) break;
    scripts.push(html.slice(TAG_ATTR_RE.lastIndex, endIndex).trim());
    TAG_ATTR_RE.lastIndex = endIndex + "</script>".length;
  }
  return scripts;
}

/** Resolve a possibly-relative href against a base URL. Returns null when invalid. */
export function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

const SKIP_HREFS = new Set([
  "#",
  "javascript:",
  "mailto:",
  "tel:",
  "data:",
  "about:",
]);

/** Extract internal (same-host) and external links from an HTML document. */
export function extractLinks(
  html: string,
  baseUrl: string,
): { internal: string[]; external: string[] } {
  let baseHost = "";
  try {
    baseHost = new URL(baseUrl).host;
  } catch {
    return { internal: [], external: [] };
  }

  const internal: string[] = [];
  const external: string[] = [];
  TAG_ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_ATTR_RE.exec(html)) !== null) {
    const tag = match[0];
    if (match[1].toLowerCase() !== "a") continue;
    const href = attributeValue(tag, "href");
    if (!href) continue;
    const lower = href.trim().toLowerCase();
    let skip = false;
    for (const prefix of SKIP_HREFS) {
      if (lower.startsWith(prefix)) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    const resolved = resolveUrl(baseUrl, href);
    if (!resolved) continue;
    try {
      const url = new URL(resolved);
      if (url.host === baseHost) internal.push(resolved);
      else external.push(resolved);
    } catch {
      // ignore unparseable
    }
  }
  return { internal: [...new Set(internal)], external: [...new Set(external)] };
}

/** True when the raw HTML looks like the client-rendered SPA shell. */
export function isSpaShell(html: string): boolean {
  return html.includes('<div id="root"');
}

/** Analyze a fetched page. Never follows into private routes. */
export function analyzePage(options: AnalyzePageOptions): PageAnalysis {
  const { url, status, html } = options;
  const ok = status >= 200 && status < 300;
  const links = extractLinks(html, url);
  return {
    url,
    status,
    ok,
    title: extractTitle(html),
    description: extractMetaContent(html, "description"),
    canonical: extractCanonical(html),
    robots: extractRobots(html),
    headingCount: countHeadings(html),
    internalLinks: links.internal,
    externalLinks: links.external,
    jsonLd: extractJsonLdScripts(html),
    isSpaShell: isSpaShell(html),
    responseMs: options.responseMs,
    contentLength: options.contentLength,
  };
}
