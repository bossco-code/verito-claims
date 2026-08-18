/**
 * Scheduled jobs — Phase 3A technical SEO scan.
 *
 * Convex supports crons natively, so the daily scan is scheduled here.
 * The scan action itself is a no-op unless SEO_CRON_ENABLED=true is set in
 * the project's Keys tab — this keeps a fresh deployment from scanning an
 * unreachable/unknown site until the operator opts in (spec §37).
 */

import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Daily lightweight SEO scan at 03:00 UTC.
crons.cron("daily-seo-scan", "0 3 * * *", api.seo.actions.runSeoScan, {
  trigger: "scheduled",
});

export default crons;
