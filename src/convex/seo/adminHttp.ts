import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Verito — internal technical-SEO admin endpoint (spec §37 admin surface).
 *
 * GET /internal/seo
 *
 * Returns the same dashboard data as the authenticated `getSeoAdminDashboard`
 * query (health score, open issues, change log, recent scans, sitemap and
 * robots previews, public/private route registry) as JSON — but for automation
 * and headless inspection (CI, monitoring, manual curl), not the seller app.
 *
 * SECURITY: protected with a bearer token. Set `SEO_ADMIN_TOKEN` in the
 * project's Keys tab (Convex env var). Requests without the correct
 * `Authorization: Bearer <token>` header are rejected with 401. When the
 * token is not configured the endpoint answers 503 so misconfiguration is
 * visible instead of silently returning data.
 *
 * The endpoint only ever reads the seoIssues/seoChangeLogs/seoScans tables
 * and the SEO config — it never touches seller data, credentials, auth, or
 * payment data.
 */

/** Constant-time comparison — no early exit on mismatch. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const seoAdmin = httpAction(async (ctx, request) => {
  const token = process.env.SEO_ADMIN_TOKEN;

  if (!token) {
    console.error(
      "[seo-admin] SEO_ADMIN_TOKEN is not configured — set it in the Keys tab to enable the /internal/seo endpoint",
    );
    return json(
      { error: "SEO admin endpoint not configured (SEO_ADMIN_TOKEN missing)" },
      503,
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!provided || !constantTimeEqual(provided, token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const dashboard = await ctx.runQuery(internal.seo.queries.getSeoAdminDashboardData, {});
    return json({ ok: true, ...dashboard }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[seo-admin] failed to load dashboard:", err);
    return json({ ok: false, error: message }, 500);
  }
});
