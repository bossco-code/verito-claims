import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { creemWebhook } from "./webhooks";
import { seoAdmin } from "./seo/adminHttp";
import { robotsTxt, sitemapXml } from "./seo/publicHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

// Creem (creem.io) subscription webhook endpoint.
// Register this exact URL in the Creem dashboard (Developers → Webhooks):
//   https://<your-deployment>.convex.site/creem-webhook
// Events: subscription.active, subscription.paid, subscription.update,
// subscription.scheduled_cancel, subscription.past_due, subscription.expired,
// subscription.canceled (+ checkout.completed for order events).
// Then set CREEM_WEBHOOK_SECRET in the project's Keys tab.
http.route({
  path: "/creem-webhook",
  method: "POST",
  handler: creemWebhook,
});

// Public technical-SEO crawl assets (Phase 3A). Generated from the single
// SEO route registry by the pure engines — anonymous, safe, always current:
//   https://<your-deployment>.convex.site/sitemap.xml
//   https://<your-deployment>.convex.site/robots.txt
http.route({
  path: "/sitemap.xml",
  method: "GET",
  handler: sitemapXml,
});
http.route({
  path: "/robots.txt",
  method: "GET",
  handler: robotsTxt,
});

// Internal technical-SEO admin endpoint (Phase 3A). Bearer-token protected:
//   curl -H "Authorization: Bearer $SEO_ADMIN_TOKEN" \
//        https://<your-deployment>.convex.site/internal/seo
// Returns the SEO dashboard JSON (health, issues, change log, scans,
// sitemap/robots previews, route registry). See src/convex/seo/adminHttp.ts.
http.route({
  path: "/internal/seo",
  method: "GET",
  handler: seoAdmin,
});

export default http;
