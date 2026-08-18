/**
 * Verito — Technical SEO configuration (Phase 3A).
 *
 * SINGLE SOURCE OF TRUTH for all technical SEO assets. This module is pure
 * (no React, no Convex, no DOM) so it can be imported by:
 *
 *   - the frontend  (src/lib/seo.ts applies per-route metadata in the browser)
 *   - the Convex SEO engine (sitemap, robots.txt, structured data, crawler)
 *   - the test suite (tests/seo/seo.test.ts)
 *
 * Do NOT duplicate this configuration anywhere else.
 *
 * Scope: technical SEO automation only. No content generation, no blog, no
 * SEO navigation, no seller-facing SEO UI.
 */

export const SEO_CONFIG = {
  siteName: "Verito",
  siteUrl: "https://verito.online",
  defaultTitle: "Verito — Amazon FBA Reimbursement",
  // Existing approved Verito positioning (matches index.html).
  defaultDescription:
    "Verito — the AI operations assistant that finds reimbursement opportunities in your Amazon Seller Central account and prepares marketplace-ready claim packages.",
  defaultLocale: "en",
  defaultRobots: "index, follow",
  // Real asset served from /public/assets/Verito-logo.png.
  logoPath: "/assets/Verito-logo.png",
  contactEmail: "support@verito.online",
} as const;

/* ------------------------------ route registry ---------------------------- */

export type SeoPage = {
  /** Route path, e.g. "/" or "/terms". Must start with "/". */
  path: string;
  /** Unique, natural page title (no keyword stuffing). */
  title: string;
  /** Accurate, human-readable description of the page. */
  description: string;
  /** Public + indexable. Default true; set false for /auth etc. */
  indexable?: boolean;
  /** Explicit noindex for public pages that must not be indexed (e.g. /auth). */
  noindex?: boolean;
};

export const PUBLIC_PAGES: SeoPage[] = [
  {
    path: "/",
    title: SEO_CONFIG.defaultTitle,
    description: SEO_CONFIG.defaultDescription,
  },
  {
    path: "/auth",
    title: "Verito — Sign in",
    description:
      "Sign in to Verito to review your Amazon Seller Central reimbursement opportunities and prepare claim evidence packages.",
    indexable: false,
    noindex: true,
  },
  {
    path: "/terms",
    title: "Verito — Terms of Service",
    description:
      "Terms of Service for Verito — read-only Amazon reimbursement analysis and claim preparation, never automatic claim submission.",
  },
  {
    path: "/privacy",
    title: "Verito — Privacy Policy",
    description:
      "Privacy Policy for Verito — how we handle your account, Amazon Seller Central data, and payment information.",
  },
];

/**
 * Private application routes. Anything under these prefixes is authenticated,
 * must never be indexed, and must never appear in the sitemap.
 */
export const PRIVATE_PATH_PREFIXES = ["/dashboard", "/case/", "/amazon/callback"] as const;

/** Additional paths robots.txt must always disallow. */
export const ROBOTS_DISALLOW = ["/internal"] as const;

/* ------------------------------- canonicalize ------------------------------ */

/** Normalize a path: leading "/", no trailing slash (except root), no query/hash. */
export function normalizePath(path: string): string {
  let p = path.split(/[?#]/, 1)[0] ?? "";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/** Canonical absolute URL for a route path. */
export function canonicalUrlFor(path: string, siteUrl: string = SEO_CONFIG.siteUrl): string {
  return `${siteUrl.replace(/\/+$/, "")}${normalizePath(path)}`;
}

/* ------------------------------- classification ---------------------------- */

export type RouteKind = "public" | "private" | "unknown";

export type RouteClassification = {
  kind: RouteKind;
  page: SeoPage | null;
  /** True when the path is one of the private application prefixes. */
  privatePrefix: string | null;
};

export function classifyPath(pathname: string): RouteClassification {
  const p = normalizePath(pathname);
  for (const prefix of PRIVATE_PATH_PREFIXES) {
    if (p === prefix || p.startsWith(prefix)) {
      return { kind: "private", page: null, privatePrefix: prefix };
    }
  }
  const page = PUBLIC_PAGES.find((candidate) => candidate.path === p) ?? null;
  return { kind: page ? "public" : "unknown", page, privatePrefix: null };
}

/* ------------------------------ page metadata ------------------------------ */

export type OpenGraphMetadata = {
  title: string;
  description: string;
  url: string;
  type: string;
  image: string;
  siteName: string;
  locale: string;
};

export type TwitterMetadata = {
  card: string;
  title: string;
  description: string;
  image: string;
};

export type PageMetadata = {
  /** Whether this route is indexable at all (private/404 → false). */
  indexable: boolean;
  title: string;
  description: string;
  canonical: string | null;
  robots: string;
  og: OpenGraphMetadata;
  twitter: TwitterMetadata;
  /** JSON-LD objects to inject (plain, already-correct Schema.org). */
  jsonLd: Record<string, unknown>[];
  purpose: string;
};

const PRIVATE_TITLES: Record<string, string> = {
  "/dashboard": "Verito — Dashboard",
  "/case/": "Verito — Claim Case",
  "/amazon/callback": "Verito — Amazon Connection",
};

export function buildPageMetadata(
  pathname: string,
  siteUrl: string = SEO_CONFIG.siteUrl,
): PageMetadata {
  const base = siteUrl.replace(/\/+$/, "");
  const { kind, page } = classifyPath(pathname);

  if (kind === "private") {
    const prefix = classifyPath(pathname).privatePrefix ?? "/";
    const title = PRIVATE_TITLES[prefix] ?? "Verito — Account";
    const description =
      "Your private Verito workspace. This page requires sign-in and is excluded from search engine indexing.";
    return {
      indexable: false,
      title,
      description,
      canonical: null,
      robots: "noindex, nofollow",
      og: { title, description, url: `${base}${prefix}`, type: "website", image: `${base}${SEO_CONFIG.logoPath}`, siteName: SEO_CONFIG.siteName, locale: SEO_CONFIG.defaultLocale },
      twitter: { card: "summary", title, description, image: `${base}${SEO_CONFIG.logoPath}` },
      jsonLd: [organizationSchema(base)],
      purpose: "private",
    };
  }

  if (kind === "unknown" || !page) {
    const title = "Verito — Page Not Found";
    const description = "The page you are looking for could not be found.";
    return {
      indexable: false,
      title,
      description,
      canonical: null,
      robots: "noindex, nofollow",
      og: { title, description, url: `${base}${normalizePath(pathname)}`, type: "website", image: `${base}${SEO_CONFIG.logoPath}`, siteName: SEO_CONFIG.siteName, locale: SEO_CONFIG.defaultLocale },
      twitter: { card: "summary", title, description, image: `${base}${SEO_CONFIG.logoPath}` },
      jsonLd: [organizationSchema(base)],
      purpose: "unknown",
    };
  }

  const robots = page.noindex ? "noindex, follow" : SEO_CONFIG.defaultRobots;
  const canonical = canonicalUrlFor(page.path, base);
  const og: OpenGraphMetadata = {
    title: page.title,
    description: page.description,
    url: canonical,
    type: "website",
    image: `${base}${SEO_CONFIG.logoPath}`,
    siteName: SEO_CONFIG.siteName,
    locale: SEO_CONFIG.defaultLocale,
  };
  const twitter: TwitterMetadata = { card: "summary", ...og };

  return {
    indexable: page.indexable !== false && page.noindex !== true,
    title: page.title,
    description: page.description,
    canonical,
    robots,
    og,
    twitter,
    jsonLd: structuredDataForPage(page.path, base),
    purpose: page.path,
  };
}

/* ---------------------------- structured data ------------------------------ */

/** Organization schema — only verified Verito facts. No invented social profiles. */
export function organizationSchema(siteUrl: string = SEO_CONFIG.siteUrl): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SEO_CONFIG.siteName,
    url: siteUrl,
    logo: `${siteUrl.replace(/\/+$/, "")}${SEO_CONFIG.logoPath}`,
    email: SEO_CONFIG.contactEmail,
    description: SEO_CONFIG.defaultDescription,
  };
}

/** WebSite schema for the main website. */
export function websiteSchema(siteUrl: string = SEO_CONFIG.siteUrl): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SEO_CONFIG.siteName,
    url: siteUrl,
    description: SEO_CONFIG.defaultDescription,
    inLanguage: SEO_CONFIG.defaultLocale,
  };
}

/**
 * SoftwareApplication schema. Pricing reflects the real, current Pro offer
 * ($49/month, recurring — the Creem product this deployment checks out
 * against). Do not change price without updating it here and in checkout.
 */
export function softwareApplicationSchema(siteUrl: string = SEO_CONFIG.siteUrl): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SEO_CONFIG.siteName,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description: SEO_CONFIG.defaultDescription,
    inLanguage: SEO_CONFIG.defaultLocale,
    offers: {
      "@type": "Offer",
      price: "49",
      priceCurrency: "USD",
      description: "Verito Pro — unlimited prepared claims per month.",
    },
  };
}

/** BreadcrumbList for hierarchical public pages (Home › page). */
export function breadcrumbSchema(
  items: { name: string; path: string }[],
  siteUrl: string = SEO_CONFIG.siteUrl,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: canonicalUrlFor(item.path, siteUrl),
    })),
  };
}

function structuredDataForPage(path: string, siteUrl: string): Record<string, unknown>[] {
  const org = organizationSchema(siteUrl);
  if (path === "/") {
    return [org, websiteSchema(siteUrl), softwareApplicationSchema(siteUrl)];
  }
  if (path === "/terms") {
    return [org, breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Terms of Service", path: "/terms" }], siteUrl)];
  }
  if (path === "/privacy") {
    return [org, breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Privacy Policy", path: "/privacy" }], siteUrl)];
  }
  return [org];
}
