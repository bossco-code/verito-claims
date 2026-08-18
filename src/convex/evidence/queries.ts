/**
 * Public Phase 2 queries — the Case Workspace data layer.
 *
 * Every query is ownership-scoped (spec §42): a seller can only ever read
 * their own cases and evidence. `getEvidenceSource` is the traceability view
 * (spec §25): it returns the original normalized Amazon record behind an
 * EvidenceItem — never secrets, never unrelated data.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";

/* ─────────────────────────────── getCaseDetail ─────────────────────────── */

export interface CaseDetailItem {
  evidenceId: Id<"evidenceItems">;
  evidenceNo: string;
  evidenceKey: string;
  evidence_type: string;
  source: string;
  source_record_id?: string;
  event_id?: string;
  shipment_id?: string;
  order_id?: string;
  sku?: string;
  asin?: string;
  fnsku?: string;
  title: string;
  description?: string;
  event_date?: number;
  quantity?: number;
  amount?: number;
  currency?: string;
  relevance: string;
  verification_status: string;
  confidence?: number;
}

export interface CaseDetail {
  caseId: Id<"evidenceCases">;
  caseNumber: string;
  case_type: string;
  status: string;
  decision: string;
  estimated_recovery?: number;
  currency?: string;
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
  rejection?: { reason: string; note?: string; at: number } | null;
  candidate: {
    claimId: string;
    candidate_type: string;
    sku?: string;
    asin?: string;
    fnsku?: string;
    shipment_id?: string;
    quantity?: number;
    estimated_value?: number;
    currency?: string;
    reimbursement_status: string;
    status: string;
    priority: string;
    eligibility_date?: number;
    deadline_date?: number;
    days_remaining?: number;
    trigger_event_id: string;
  };
  items: CaseDetailItem[];
  verification: {
    checks: Array<{ check: string; status: string; detail: string; evidenceRefs: string[] }>;
    conflicts: Array<{ check: string; detail: string; evidenceRefs: string[] }>;
    ranAt: number;
  };
  completeness: {
    status: string;
    required: Array<{ id: string; label: string; description: string; satisfied: boolean }>;
    missing: Array<{ id: string; label: string; description: string }>;
    ranAt: number;
  };
  aiAnalysis: {
    status: string;
    summary?: string;
    keyFacts?: string[];
    discrepancyExplanation?: string;
    missingInformation?: string[];
    potentialConflicts?: string[];
    draftNarrative?: string;
    generatedAt?: number;
    modelIdentifier?: string;
    evidenceReferences?: string[];
    error?: string;
  } | null;
  packages: Array<{
    packageId: string;
    version: number;
    status: string;
    generatedAt: number;
    fingerprint?: string;
  }>;
  auditTrail: Array<{ actor: string; action: string; objectId?: string; details?: unknown; createdAt: number }>;
}

export const getCaseDetail = query({
  args: { caseId: v.id("evidenceCases") },
  handler: async (ctx, { caseId }): Promise<CaseDetail | null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const caseRow = await ctx.db.get(caseId);
    if (!caseRow || caseRow.userId !== userId) return null;

    const candidate = await ctx.db.get(caseRow.claimCandidateId);
    if (!candidate) return null;

    const items = await ctx.db
      .query("evidenceItems")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .order("asc")
      .collect();
    const aiAnalysis = await ctx.db
      .query("aiAnalyses")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .first();
    const packages = await ctx.db
      .query("claimEvidencePackages")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .order("asc")
      .collect();
    const auditTrail = await ctx.db
      .query("auditEvents")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .order("desc")
      .take(50);

    const verification = (caseRow.verification ?? {
      checks: [],
      conflicts: [],
      ranAt: 0,
    }) as CaseDetail["verification"];
    const completeness = (caseRow.completeness ?? {
      status: "UNKNOWN",
      required: [],
      missing: [],
      ranAt: 0,
    }) as CaseDetail["completeness"];

    return {
      caseId: caseRow._id,
      caseNumber: caseRow.caseNumber,
      case_type: caseRow.case_type,
      status: caseRow.status,
      decision: caseRow.decision,
      estimated_recovery: caseRow.estimated_recovery,
      currency: caseRow.currency,
      createdAt: caseRow.created_at,
      updatedAt: caseRow.updated_at,
      reviewedAt: caseRow.reviewed_at,
      rejection: (caseRow.rejection ?? null) as CaseDetail["rejection"],
      candidate: {
        claimId: candidate.claimId,
        candidate_type: candidate.candidate_type,
        sku: candidate.sku,
        asin: candidate.asin,
        fnsku: candidate.fnsku,
        shipment_id: candidate.shipment_id,
        quantity: candidate.quantity,
        estimated_value: candidate.estimated_value,
        currency: candidate.currency,
        reimbursement_status: candidate.reimbursement_status,
        status: candidate.status,
        priority: candidate.priority,
        eligibility_date: candidate.eligibility_date,
        deadline_date: candidate.deadline_date,
        days_remaining: candidate.days_remaining,
        trigger_event_id: candidate.trigger_event_id,
      },
      items: items.map((i) => ({
        evidenceId: i._id,
        evidenceNo: i.evidenceNo,
        evidenceKey: i.evidenceKey,
        evidence_type: i.evidence_type,
        source: i.source,
        source_record_id: i.source_record_id,
        event_id: i.event_id,
        shipment_id: i.shipment_id,
        order_id: i.order_id,
        sku: i.sku,
        asin: i.asin,
        fnsku: i.fnsku,
        title: i.title,
        description: i.description,
        event_date: i.event_date,
        quantity: i.quantity,
        amount: i.amount,
        currency: i.currency,
        relevance: i.relevance,
        verification_status: i.verification_status,
        confidence: i.confidence,
      })),
      verification,
      completeness,
      aiAnalysis: aiAnalysis
        ? {
            status: aiAnalysis.status,
            summary: aiAnalysis.summary,
            keyFacts: aiAnalysis.key_facts,
            discrepancyExplanation: aiAnalysis.discrepancy_explanation,
            missingInformation: aiAnalysis.missing_information,
            potentialConflicts: aiAnalysis.potential_conflicts,
            draftNarrative: aiAnalysis.draft_narrative,
            generatedAt: aiAnalysis.generated_at,
            modelIdentifier: aiAnalysis.model_identifier,
            evidenceReferences: aiAnalysis.evidence_references,
            error: aiAnalysis.error,
          }
        : null,
      packages: packages.map((p) => ({
        packageId: p.packageId,
        version: p.version,
        status: p.status,
        generatedAt: p.generated_at,
        fingerprint: p.fingerprint,
      })),
      auditTrail: auditTrail.map((a) => ({
        actor: a.actor,
        action: a.action,
        objectId: a.objectId,
        details: a.details,
        createdAt: a.createdAt,
      })),
    };
  },
});

/* ─────────────────────────────── listCases ─────────────────────────────── */

export interface CaseSummary {
  caseId: Id<"evidenceCases">;
  caseNumber: string;
  case_type: string;
  status: string;
  decision: string;
  estimated_recovery?: number;
  currency?: string;
  createdAt: number;
  updatedAt: number;
  deadline_date?: number;
  days_remaining?: number;
  claimId: string;
  priority: string;
}

export const listCases = query({
  args: {},
  handler: async (ctx): Promise<CaseSummary[]> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const cases = await ctx.db
      .query("evidenceCases")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const summaries: CaseSummary[] = [];
    for (const c of cases) {
      const candidate = await ctx.db.get(c.claimCandidateId);
      summaries.push({
        caseId: c._id,
        caseNumber: c.caseNumber,
        case_type: c.case_type,
        status: c.status,
        decision: c.decision,
        estimated_recovery: c.estimated_recovery,
        currency: c.currency,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        deadline_date: candidate?.deadline_date,
        days_remaining: candidate?.days_remaining,
        claimId: candidate?.claimId ?? "",
        priority: candidate?.priority ?? "",
      });
    }
    return summaries;
  },
});

/* ────────────────────────────── getEvidenceSource ────────────────────────── */

export interface EvidenceSourceView {
  evidenceId: Id<"evidenceItems">;
  evidenceNo: string;
  title: string;
  relevance: string;
  verification_status: string;
  source: string;
  source_record_id?: string;
  event_id?: string;
  event_date?: number;
  marketplace_id?: string;
  sku?: string;
  asin?: string;
  fnsku?: string;
  shipment_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  original_metadata: unknown;
  raw_event: {
    event_type: string;
    event_date: number;
    source: string;
    source_record_id: string;
    retrieved_at: number;
  } | null;
}

export const getEvidenceSource = query({
  args: { evidenceId: v.id("evidenceItems") },
  handler: async (ctx, { evidenceId }): Promise<EvidenceSourceView | null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const item = await ctx.db.get(evidenceId);
    if (!item || item.userId !== userId) return null;

    // The original normalized Amazon record behind this evidence item.
    const raw = await ctx.db
      .query("normalizedEvents")
      .withIndex("by_user_source", (q) =>
        q.eq("userId", userId).eq("source", item.source).eq("source_record_id", item.source_record_id ?? ""),
      )
      .first();

    return {
      evidenceId: item._id,
      evidenceNo: item.evidenceNo,
      title: item.title,
      relevance: item.relevance,
      verification_status: item.verification_status,
      source: item.source,
      source_record_id: item.source_record_id,
      event_id: item.event_id,
      event_date: item.event_date,
      marketplace_id: item.marketplace_id,
      sku: item.sku,
      asin: item.asin,
      fnsku: item.fnsku,
      shipment_id: item.shipment_id,
      order_id: item.order_id,
      amount: item.amount,
      currency: item.currency,
      original_metadata: item.metadata ?? null,
      raw_event: raw
        ? {
            event_type: raw.event_type,
            event_date: raw.event_date,
            source: raw.source,
            source_record_id: raw.source_record_id,
            retrieved_at: raw.retrieved_at,
          }
        : null,
    };
  },
});
