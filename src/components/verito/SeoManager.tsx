import { useEffect } from "react";
import { useLocation } from "react-router";
import { SEO_CONFIG, buildPageMetadata } from "@/seo.config";

/**
 * Verito — client-side SEO metadata manager (Phase 3A, spec §6).
 *
 * This SPA is client-rendered, so the server always delivers the same HTML
 * shell (index.html). The SEO engine (src/convex/seo/actions.ts) crawls the
 * public site, and its crawler treats metadata as client-rendered for the SPA
 * shell. To make the metadata real for JS-capable crawlers (Google, Bing, AI
 * search systems), this component applies the per-route metadata — title,
 * meta description, robots, canonical, Open Graph, Twitter/X and JSON-LD
 * structured data — derived from the SINGLE source of truth
 * (src/seo.config.ts → buildPageMetadata), on every route change.
 *
 * Private application routes (/dashboard, /case/*, /amazon/callback) get
 * noindex, nofollow and no canonical. Unknown routes (404) behave the same.
 * Nothing here creates visible UI and nothing touches the seller app.
 */
const SITE_URL = SEO_CONFIG.siteUrl;
const JSONLD_MARKER = "data-seo-jsonld";

function upsertMeta(attr: "name" | "property", key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string | null): void {
  const selector = 'link[rel="canonical"]';
  const existing = document.head.querySelector<HTMLLinkElement>(selector);
  if (!href) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.setAttribute("href", href);
  } else {
    const link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", href);
    document.head.appendChild(link);
  }
}

function applyJsonLd(blocks: Record<string, unknown>[]): void {
  document.head
    .querySelectorAll<HTMLScriptElement>(`script[${JSONLD_MARKER}="true"]`)
    .forEach((el) => el.remove());
  for (const block of blocks) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute(JSONLD_MARKER, "true");
    script.textContent = JSON.stringify(block);
    document.head.appendChild(script);
  }
}

export function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const meta = buildPageMetadata(location.pathname, SITE_URL);

    document.title = meta.title;
    upsertMeta("name", "description", meta.description);
    upsertMeta("name", "robots", meta.robots);

    setCanonical(meta.canonical);

    // Open Graph.
    upsertMeta("property", "og:title", meta.og.title);
    upsertMeta("property", "og:description", meta.og.description);
    upsertMeta("property", "og:url", meta.og.url);
    upsertMeta("property", "og:type", meta.og.type);
    upsertMeta("property", "og:image", meta.og.image);
    upsertMeta("property", "og:site_name", meta.og.siteName);
    upsertMeta("property", "og:locale", meta.og.locale);

    // Twitter/X.
    upsertMeta("name", "twitter:card", meta.twitter.card);
    upsertMeta("name", "twitter:title", meta.twitter.title);
    upsertMeta("name", "twitter:description", meta.twitter.description);
    upsertMeta("name", "twitter:image", meta.twitter.image);

    // Structured data.
    applyJsonLd(meta.jsonLd);
  }, [location.pathname]);

  return null;
}
