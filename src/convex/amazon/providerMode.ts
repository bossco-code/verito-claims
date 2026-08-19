/**
 * Provider mode backend — mutations and queries for the provider dashboard.
 *
 * The provider manages multiple seller clients. All data lives under the
 * provider's userId, with a providerClientId to distinguish between clients.
 * The existing analysis engine runs on the provider's data scoped by clientTag.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { parseAmazonCsv, parseSettlementWithPrices } from "./csvParser";
import { runEngine } from "./engine";
import type { EvaluatedCandidate, NormalizedEvent } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Check if the current user has provider role. */
export const isProvider = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const user = await ctx.db.get(userId);
    return (user as any)?.role === "provider";
  },
});

/** List all clients for the current provider. */
export const listClients = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const user = await ctx.db.get(userId);
    if ((user as any)?.role !== "provider") return [];

    const clients = await (ctx.db as any)
      .query("providerClients")
      .withIndex("by_provider", (q: any) => q.eq("providerUserId", userId))
      .collect();

    const enriched = await Promise.all(
      clients.map(async (client: any) => {
        const candidates = await ctx.db
          .query("claimCandidates")
          .withIndex("by_user", (q: any) => q.eq("userId", userId))
          .collect();

        const clientCandidates = candidates.filter(
          (c: any) => c.metadata?.providerClientId === client._id,
        );

        const uploads = await (ctx.db as any)
          .query("csvUploads")
          .withIndex("by_client", (q: any) => q.eq("clientId", client._id))
          .collect();

        return {
          _id: client._id,
          clientName: client.clientName,
          sellerId: client.sellerId ?? null,
          marketplaceId: client.marketplaceId,
          region: client.region,
          status: client.status,
          notes: client.notes ?? null,
          createdAt: client.createdAt,
          candidateCount: clientCandidates.length,
          uploadCount: uploads.length,
        };
      }),
    );

    return enriched;
  },
});

/** Get a single client's details + candidates. */
export const getClientDetail = query({
  args: { clientId: v.id("providerClients" as any) },
  handler: async (ctx, { clientId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if ((user as any)?.role !== "provider") return null;

    const client = await (ctx.db as any).get(clientId);
    if (!client || client.providerUserId !== userId) return null;

    const candidates = await ctx.db
      .query("claimCandidates")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();

    const clientCandidates = (candidates as unknown as EvaluatedCandidate[]).filter(
      (c: any) => c.metadata?.providerClientId === client._id,
    );

    const uploads = await (ctx.db as any)
      .query("csvUploads")
      .withIndex("by_client", (q: any) => q.eq("clientId", client._id))
      .order("desc")
      .collect();

    return {
      client: {
        _id: client._id,
        clientName: client.clientName,
        sellerId: client.sellerId ?? null,
        marketplaceId: client.marketplaceId,
        region: client.region,
        status: client.status,
        notes: client.notes ?? null,
        createdAt: client.createdAt,
      },
      candidates: clientCandidates,
      uploads,
    };
  },
});

/** Create a new seller client. */
export const createClient = mutation({
  args: {
    clientName: v.string(),
    sellerId: v.optional(v.string()),
    marketplaceId: v.string(),
    region: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if ((user as any)?.role !== "provider") throw new Error("Not a provider account");

    return await (ctx.db as any).insert("providerClients", {
      providerUserId: userId,
      clientName: args.clientName,
      sellerId: args.sellerId,
      marketplaceId: args.marketplaceId,
      region: args.region,
      status: "active",
      notes: args.notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Update a client's details. */
export const updateClient = mutation({
  args: {
    clientId: v.id("providerClients" as any),
    clientName: v.optional(v.string()),
    sellerId: v.optional(v.string()),
    marketplaceId: v.optional(v.string()),
    region: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if ((user as any)?.role !== "provider") throw new Error("Not a provider account");

    const client = await (ctx.db as any).get(args.clientId);
    if (!client || client.providerUserId !== userId) throw new Error("Client not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.clientName !== undefined) patch.clientName = args.clientName;
    if (args.sellerId !== undefined) patch.sellerId = args.sellerId;
    if (args.marketplaceId !== undefined) patch.marketplaceId = args.marketplaceId;
    if (args.region !== undefined) patch.region = args.region;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.status !== undefined) patch.status = args.status;

    await (ctx.db as any).patch(args.clientId, patch);
    return { ok: true };
  },
});

/** Delete a client and all their associated data. */
export const deleteClient = mutation({
  args: { clientId: v.id("providerClients" as any) },
  handler: async (ctx, { clientId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if ((user as any)?.role !== "provider") throw new Error("Not a provider account");

    const client = await (ctx.db as any).get(clientId);
    if (!client || client.providerUserId !== userId) throw new Error("Client not found");

    // Delete CSV uploads
    const uploads = await (ctx.db as any)
      .query("csvUploads")
      .withIndex("by_client", (q: any) => q.eq("clientId", clientId))
      .collect();
    for (const u of uploads) await ctx.db.delete(u._id);

    // Delete candidates belonging to this client
    const candidates = await ctx.db
      .query("claimCandidates")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();
    for (const c of candidates) {
      if ((c as any).metadata?.providerClientId === clientId) {
        await ctx.db.delete(c._id);
      }
    }

    // Delete normalized events belonging to this client
    const events = await ctx.db
      .query("normalizedEvents")
      .withIndex("by_user_source", (q: any) => q.eq("userId", userId).eq("source", "provider"))
      .collect();
    for (const e of events) {
      if ((e as any).metadata?.providerClientId === clientId) {
        await ctx.db.delete(e._id);
      }
    }

    await (ctx.db as any).delete(clientId);
    return { ok: true };
  },
});

/** Ingest a CSV upload for a client and run the analysis engine. */
export const ingestCsv = mutation({
  args: {
    clientId: v.id("providerClients" as any),
    csvText: v.string(),
    fileName: v.string(),
    marketplaceId: v.string(),
    reportType: v.union(
      v.literal("financial_events"),
      v.literal("inventory"),
      v.literal("settlement"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if ((user as any)?.role !== "provider") throw new Error("Not a provider account");

    const client = await (ctx.db as any).get(args.clientId);
    if (!client || client.providerUserId !== userId) throw new Error("Client not found");

    const sellerId = client.sellerId ?? "unknown";

    // Parse the CSV
    const result = parseAmazonCsv(args.csvText, args.marketplaceId, sellerId);

    // Also try to get unit prices from settlement data
    let unitPrices: Record<string, number> = {};
    if (result.reportType === "settlement") {
      const settlementResult = parseSettlementWithPrices(args.csvText, args.marketplaceId, sellerId);
      unitPrices = settlementResult.unitPrices;
    }

    // Store the CSV upload record
    const uploadId = await (ctx.db as any).insert("csvUploads", {
      providerUserId: userId,
      clientId: args.clientId,
      reportType: result.reportType,
      fileName: args.fileName,
      rowCount: result.rowCount,
      parsedCount: result.parsedCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
      unitPrices: Object.keys(unitPrices).length > 0 ? unitPrices : undefined,
      uploadedAt: Date.now(),
    });

    // Store parsed events under the provider's userId with providerClientId metadata
    const events: NormalizedEvent[] = result.events.map((e) => ({
      ...e,
      source: "provider",
      metadata: {
        ...e.metadata,
        providerClientId: args.clientId,
        csvUploadId: uploadId,
      },
    }));

    let eventsStored = 0;
    for (const event of events) {
      await ctx.runMutation(internal.amazon.db.upsertEvent, {
        userId,
        event,
      });
      eventsStored++;
    }

    // Fetch all events for this provider to run the engine
    const allEvents = await ctx.db
      .query("normalizedEvents")
      .withIndex("by_user_type", (q: any) => q.eq("userId", userId))
      .collect();

    const clientEvents = allEvents.filter(
      (e: any) => e.metadata?.providerClientId === args.clientId,
    ) as unknown as NormalizedEvent[];

    // Get active policies
    const policies = await ctx.db.query("claimPolicies").collect();

    // Run the analysis engine
    const engineResult = runEngine({
      events: clientEvents,
      unitPrices: Object.keys(unitPrices).length > 0 ? unitPrices : undefined,
      policies: policies as any,
      userId,
      marketplaceId: args.marketplaceId,
      now: Date.now(),
      availability: {
        finances: result.reportType === "financial_events",
        inbound: false,
        inventory: result.reportType === "inventory",
        reports: result.reportType === "settlement",
      },
    });

    // Upsert candidates with providerClientId metadata
    let candidatesCreated = 0;
    let candidatesUpdated = 0;
    for (const candidate of engineResult.candidates) {
      const res = await ctx.runMutation(internal.amazon.db.upsertCandidate, {
        userId,
        candidate: {
          ...candidate,
          metadata: { providerClientId: args.clientId },
        },
      });
      if (res.created) candidatesCreated++;
      else candidatesUpdated++;
    }

    return {
      ok: true,
      reportType: result.reportType,
      eventsStored,
      candidatesCreated,
      candidatesUpdated,
      errors: result.errors,
      summary: engineResult.summary,
    };
  },
});
