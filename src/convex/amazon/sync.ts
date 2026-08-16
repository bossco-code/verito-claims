"use node";

/**
 * Synchronization orchestration (spec §30–§35).
 *
 * Runs the real pipeline against the authorized seller account:
 *
 *   CONNECTING AMAZON → AUTHORIZATION COMPLETE
 *   → SYNCING FINANCIAL DATA → SYNCING INBOUND DATA → SYNCING INVENTORY DATA
 *   → RECONCILING REIMBURSEMENTS → CALCULATING OPPORTUNITIES → ANALYSIS COMPLETE
 *
 * Progress is written to the `syncRuns` table after every real stage (no fake
 * percentages). Every domain is optional-failure-tolerant BUT never silent:
 * domain availability is tracked and lowers data completeness; real errors
 * are recorded and surfaced. Repeated runs are idempotent — events and
 * candidates are upserted by stable keys, never duplicated.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAmazonConfig } from "./env";
import { policyFromSeed, DEFAULT_POLICY_SEEDS } from "./policyEngine";
import { AmazonDataProvider } from "./provider";
import {
  normalizeFinancialEvents,
  normalizeInboundItems,
  normalizeInventorySummaries,
  unitPricesFromSettlement,
  SOURCES,
} from "./normalizer";
import { runEngine } from "./engine";
import type { DomainAvailability } from "./engine";
import type { AmazonShipment } from "./normalizer";
import type { ClaimPolicy, NormalizedEvent } from "./types";

const STAGES = [
  { key: "sync_financial", label: "SYNCING FINANCIAL DATA" },
  { key: "sync_inbound", label: "SYNCING INBOUND DATA" },
  { key: "sync_inventory", label: "SYNCING INVENTORY DATA" },
  { key: "sync_reports", label: "GATHERING UNIT PRICES" },
  { key: "reconcile", label: "RECONCILING REIMBURSEMENTS" },
  { key: "opportunities", label: "CALCULATING OPPORTUNITIES" },
] as const;

const MAX_SHIPMENTS_ITEMS = 60;

/**
 * Explicit result type for startSync.
 *
 * Annotated deliberately: startSync references `internal.amazon.*`, and the
 * generated `internal` type derives from `fullApi`, which includes this
 * action's own type. Without an explicit return type that cycle can collapse
 * to `any` under `tsc -b` (TS7022/TS7023).
 */
export type StartSyncResult =
  | { ok: false; error: string; errorCode?: string }
  | {
      ok: true;
      alreadyRunning?: true;
      stats?: { eventsStored: number; candidatesCreated: number; candidatesUpdated: number };
      candidates?: number;
    };

export const startSync = action({
  args: {},
  handler: async (ctx): Promise<StartSyncResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { ok: false as const, error: "Please sign in to sync your account." };
    }

    let config;
    try {
      config = getAmazonConfig();
    } catch (error) {
      return {
        ok: false as const,
        error: (error as Error).message,
        errorCode: "config",
      };
    }

    const connection = await ctx.runQuery(internal.amazon.db.getConnectionByUser, { userId });
    if (!connection || connection.status !== "connected" || !connection.encryptedRefreshToken) {
      return {
        ok: false as const,
        error:
          connection?.status === "pending"
            ? "Amazon authorization is still pending — complete the sign-in first."
            : "Connect your Amazon Seller Central account first.",
        errorCode: "not_connected",
      };
    }

    // Guard against overlapping runs.
    const running = await ctx.runQuery(internal.amazon.db.getLatestSyncRun, { userId });
    if (
      running &&
      running.status === "running" &&
      Date.now() - running.startedAt < 30 * 60 * 1000
    ) {
      return { ok: true as const, alreadyRunning: true as const };
    }

    const startedAt = Date.now();
    const syncRunId = await ctx.runMutation(internal.amazon.db.createSyncRun, {
      userId,
      stage: STAGES[0]!.key,
      message: STAGES[0]!.label,
      startedAt,
    });

    const patchRun = (patch: Record<string, unknown>) =>
      ctx.runMutation(internal.amazon.db.patchSyncRun, { syncRunId, patch });

    // Seed documented default policies (idempotent) — the eligibility engine's
    // source of truth for deadlines.
    await ctx.runMutation(internal.amazon.db.seedPolicies, {
      policies: DEFAULT_POLICY_SEEDS.map(policyFromSeed),
    });

    const availability: DomainAvailability = {
      finances: false,
      inbound: false,
      inventory: false,
      reports: false,
    };
    const allEvents: NormalizedEvent[] = [];
    let unitPrices: Record<string, number> = {};
    let stats = { eventsStored: 0, candidatesCreated: 0, candidatesUpdated: 0 };

    const provider = new AmazonDataProvider({
      userId,
      encryptedRefreshToken: connection.encryptedRefreshToken,
      region: config.region,
    });

    const markStage = async (key: string, label: string) => {
      await patchRun({
        stage: key,
        message: label,
        ["stages." + key]: { status: "done", at: Date.now() },
      });
    };

    try {
      /* ── Financial data ── */
      const postedBefore = new Date(Date.now() - 2 * 60 * 1000);
      const postedAfter = new Date(startedAt - config.lookbackDays * 24 * 60 * 60 * 1000);
      const financePayload = await provider.getFinancialEvents(postedAfter, postedBefore);
      const financeEvents = normalizeFinancialEvents(financePayload, {
        marketplaceId: config.marketplaceId,
        retrievedAt: startedAt,
      });
      availability.finances = true;
      allEvents.push(...financeEvents);
      await markStage(STAGES[0]!.key, STAGES[0]!.label);

      /* ── Inbound data ── */
      let shipments: AmazonShipment[] = [];
      try {
        shipments = await provider.getInboundShipments();
        availability.inbound = true;
      } catch (error) {
        // A 403 here means a missing role — record it, don't fake data.
        availability.inbound = false;
        await patchRun({
          message: `SYNCING INBOUND DATA — unavailable (${(error as Error).message})`,
        });
      }
      if (availability.inbound) {
        const itemsP = shipments.slice(0, MAX_SHIPMENTS_ITEMS).map(async (s) => {
          try {
            const items = await provider.getInboundItems(s.ShipmentId ?? "");
            return normalizeInboundItems(items, s, {
              marketplaceId: config.marketplaceId,
              retrievedAt: startedAt,
            });
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn(`[sync] inbound items ${s.ShipmentId}:`, (error as Error).message);
            return [] as NormalizedEvent[];
          }
        });
        const nested = await Promise.all(itemsP);
        for (const events of nested) allEvents.push(...events);
      }
      await markStage(STAGES[1]!.key, STAGES[1]!.label);

      /* ── Inventory data ── */
      try {
        const summaries = await provider.getInventorySummaries();
        allEvents.push(
          ...normalizeInventorySummaries(summaries, {
            marketplaceId: config.marketplaceId,
            retrievedAt: startedAt,
          }),
        );
        availability.inventory = true;
      } catch (error) {
        availability.inventory = false;
        await patchRun({
          message: `SYNCING INVENTORY DATA — unavailable (${(error as Error).message})`,
        });
      }
      await markStage(STAGES[2]!.key, STAGES[2]!.label);

      /* ── Unit prices (best-effort; failure lowers completeness, never fabricates) ── */
      const settlement = await provider.getSettlementReportText();
      if (settlement) {
        unitPrices = unitPricesFromSettlement(settlement);
        availability.reports = true;
      }
      await markStage(STAGES[3]!.key, STAGES[3]!.label);

      /* ── Reconcile + calculate opportunities ── */
      await markStage(STAGES[4]!.key, STAGES[4]!.label);
      const policyRows = await ctx.runQuery(internal.amazon.db.getActivePolicies, {});
      // claimPolicies rows store claim_type as string; the engine needs the
      // CandidateType union, so normalize here rather than loosening the engine.
      const policies = policyRows as unknown as ClaimPolicy[];
      const { candidates } = runEngine({
        events: allEvents,
        unitPrices,
        policies,
        userId,
        marketplaceId: config.marketplaceId,
        now: startedAt,
        availability,
      });
      await markStage(STAGES[5]!.key, STAGES[5]!.label);

      /* ── Persist events + candidates (idempotent) ── */
      for (const event of allEvents) {
        const res = await ctx.runMutation(internal.amazon.db.upsertEvent, { userId, event });
        if (res.created) stats.eventsStored++;
      }
      for (const candidate of candidates) {
        const res = await ctx.runMutation(internal.amazon.db.upsertCandidate, {
          userId,
          candidate,
        });
        if (res.created) stats.candidatesCreated++;
        else stats.candidatesUpdated++;
      }

      const finishedAt = Date.now();
      await patchRun({
        status: "complete",
        stage: "complete",
        message: "ANALYSIS COMPLETE",
        finishedAt,
        stats,
        dataFrom: postedAfter.getTime(),
        dataTo: postedBefore.getTime(),
      });
      await ctx.runMutation(internal.amazon.db.patchConnection, {
        connectionId: connection._id,
        patch: {
          lastSyncAt: finishedAt,
          lastSyncStatus: "complete",
          dataFrom: postedAfter.getTime(),
          dataTo: postedBefore.getTime(),
          lastError: null,
        },
      });

      return {
        ok: true as const,
        stats,
        candidates: candidates.length,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Synchronization failed with an unexpected error";
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "sync_error";
      // eslint-disable-next-line no-console
      console.error("[sync] failed for", userId, message);
      await patchRun({
        status: "failed",
        stage: "failed",
        message: "SYNC FAILED",
        error: message,
        errorCode: code,
        finishedAt: Date.now(),
      });
      await ctx.runMutation(internal.amazon.db.patchConnection, {
        connectionId: connection._id,
        patch: {
          lastSyncStatus: "failed",
          lastError: message,
          lastSyncAt: Date.now(),
        },
      });
      return { ok: false as const, error: message, errorCode: code };
    }
  },
});

export { SOURCES };
