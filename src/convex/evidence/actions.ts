"use node";

/**
 * Phase 2 — evidence-case public actions (Case Workspace entry points).
 *
 *  - openCase:          create or open the single EvidenceCase per candidate
 *  - reCollectEvidence: re-run collect → verify → completeness → decide
 *  - runAIAnalysis:     AI-assisted analysis over VERIFIED evidence only
 *  - saveNarrative:     persist the seller-edited narrative
 *  - sellerApprove / sellerReject: the seller's explicit decision (spec §34)
 *  - generatePackage:   emit a new versioned claim evidence package (spec §31)
 *
 * All reasoning is deterministic (collection, verification, completeness,
 * decision, calculation); AI is used only for assisted analysis and can never
 * override the deterministic decision. Every action is ownership-scoped
 * (spec §42) and returns an explicit { ok } shape consumed by the UI.
 *
 * Handlers annotate their return types explicitly: these actions call
 * `internal.evidence.db.*`, and the generated `internal` type derives from
 * fullApi, which includes these actions' own types — an un-annotated return
 * type can collapse to `any` under `tsc -b` (TS7022/TS7023).
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { action, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  CaseStatus,
  CompletenessResult,
  EvidenceCandidate,
  EvidenceItemDraft,
  EvidenceSourceEvent,
  VerificationResult,
} from "./types";
import { CASE_DECISION, CASE_STATUS, VERIFICATION_STATUS } from "./types";
import { collectEvidenceForCandidate } from "./collection";
import { verifyEvidence } from "./verification";
import { checkCompleteness } from "./completeness";
import {
  caseNumberFromClaimId,
  evidenceNoFor,
  packageFingerprint,
  packageIdFor,
} from "./calculation";
import {
  buildEvidenceContext,
  buildSystemPrompt,
  buildUserPrompt,
  parseAiAnalysis,
} from "./ai";
import { vly } from "../../lib/vly-integrations";

/* ------------------------------ mappers ------------------------------ */

function toEvidenceCandidate(c: Doc<"claimCandidates">): EvidenceCandidate {
  return {
    candidateKey: c.candidateKey,
    claimId: c.claimId,
    candidate_type: c.candidate_type,
    marketplace_id: c.marketplace_id,
    sku: c.sku,
    asin: c.asin,
    fnsku: c.fnsku,
    shipment_id: c.shipment_id,
    quantity: c.quantity,
    estimated_value: c.estimated_value,
    currency: c.currency,
    trigger_event_id: c.trigger_event_id,
    detected_at: c.detected_at,
    eligibility_date: c.eligibility_date,
    deadline_date: c.deadline_date,
    days_remaining: c.days_remaining,
    reimbursement_status: c.reimbursement_status,
    status: c.status,
    priority: c.priority,
    data_completeness: c.data_completeness,
    policy: (c.policy ?? null) as Record<string, unknown> | null,
    reconciliation: (c.reconciliation ?? null) as Record<string, unknown> | null,
  };
}

function toEvent(e: Doc<"normalizedEvents">): EvidenceSourceEvent {
  return {
    event_id: e.event_id,
    event_type: e.event_type,
    marketplace_id: e.marketplace_id,
    sku: e.sku,
    asin: e.asin,
    fnsku: e.fnsku,
    quantity: e.quantity,
    amount: e.amount,
    currency: e.currency,
    event_date: e.event_date,
    shipment_id: e.shipment_id,
    order_id: e.order_id,
    source: e.source,
    source_record_id: e.source_record_id,
    retrieved_at: e.retrieved_at,
    metadata: e.metadata,
  };
}

function itemFromRow(i: Doc<"evidenceItems">): EvidenceItemDraft {
  return {
    evidenceKey: i.evidenceKey,
    evidence_type: i.evidence_type as EvidenceItemDraft["evidence_type"],
    source: i.source,
    source_record_id: i.source_record_id,
    event_id: i.event_id,
    shipment_id: i.shipment_id,
    order_id: i.order_id,
    sku: i.sku,
    asin: i.asin,
    fnsku: i.fnsku,
    marketplace_id: i.marketplace_id,
    title: i.title,
    description: i.description,
    event_date: i.event_date,
    retrieved_at: i.retrieved_at,
    quantity: i.quantity,
    amount: i.amount,
    currency: i.currency,
    relevance: i.relevance as EvidenceItemDraft["relevance"],
    metadata: i.metadata,
  };
}

/* --------------------------- deterministic logic --------------------------- */

/** Deterministic decision from verification + completeness (spec §24). */
function decide(
  verification: VerificationResult,
  completeness: CompletenessResult,
): { decision: string; status: CaseStatus } {
  if (verification.conflicts.length > 0) {
    return { decision: CASE_DECISION.EVIDENCE_CONFLICT, status: CASE_STATUS.EVIDENCE_CONFLICT };
  }
  if (completeness.missing.length > 0 || completeness.status === "INCOMPLETE") {
    return { decision: CASE_DECISION.EVIDENCE_INCOMPLETE, status: CASE_STATUS.EVIDENCE_INCOMPLETE };
  }
  if (completeness.status === "COMPLETE") {
    return { decision: CASE_DECISION.READY_FOR_REVIEW, status: CASE_STATUS.READY_FOR_REVIEW };
  }
  return { decision: CASE_DECISION.NOT_READY, status: CASE_STATUS.OPEN };
}

const STATUS_RANK: Record<string, number> = {
  INCONSISTENT: 0,
  AMBIGUOUS: 1,
  MISSING: 2,
  CONSISTENT: 3,
  NOT_APPLICABLE: 4,
  PENDING: 5,
};

/** Worst verification status per referenced evidenceKey (spec §13). */
function statusByKey(verification: VerificationResult): Map<string, string> {
  const map = new Map<string, string>();
  for (const check of verification.checks) {
    for (const ref of check.evidenceRefs) {
      const current = map.get(ref);
      const rank = STATUS_RANK[check.status] ?? STATUS_RANK.PENDING;
      if (current === undefined || rank < (STATUS_RANK[current] ?? STATUS_RANK.PENDING)) {
        map.set(ref, check.status);
      }
    }
  }
  return map;
}

interface PipelineOutcome {
  items: number;
  decision: string;
  status: string;
}

/**
 * Run collect → verify → completeness → decide, persist evidence with stable
 * evidenceNos (idempotent upserts), refresh the case decision, audit.
 */
async function runEvidencePipeline(
  ctx: ActionCtx,
  userId: Id<"users">,
  caseRow: Doc<"evidenceCases">,
  candidate: Doc<"claimCandidates">,
  existingItems: Doc<"evidenceItems">[],
  auditAction: string,
): Promise<PipelineOutcome> {
  const now = Date.now();
  const candidateSlice = toEvidenceCandidate(candidate);
  const rawEvents = await ctx.runQuery(internal.evidence.db.getNormalizedEventsByUser, { userId });
  const events = rawEvents.map(toEvent);

  const collected = collectEvidenceForCandidate({ candidate: candidateSlice, events });
  const verification = verifyEvidence({ candidate: candidateSlice, items: collected.items, events });
  const completeness = checkCompleteness({
    candidate: { candidate_type: candidate.candidate_type },
    items: collected.items,
  });
  const decision = decide(verification, completeness);

  const noByKey = new Map(existingItems.map((i) => [i.evidenceKey, i.evidenceNo]));
  let nextNo = existingItems.length;
  const perKey = statusByKey(verification);

  for (const draft of collected.items) {
    const evidenceNo = noByKey.get(draft.evidenceKey) ?? evidenceNoFor(nextNo++);
    await ctx.runMutation(internal.evidence.db.upsertEvidenceItem, {
      item: {
        userId,
        caseId: caseRow._id,
        evidenceNo,
        evidenceKey: draft.evidenceKey,
        evidence_type: draft.evidence_type,
        source: draft.source,
        source_record_id: draft.source_record_id,
        event_id: draft.event_id,
        shipment_id: draft.shipment_id,
        order_id: draft.order_id,
        sku: draft.sku,
        asin: draft.asin,
        fnsku: draft.fnsku,
        marketplace_id: draft.marketplace_id,
        title: draft.title,
        description: draft.description,
        event_date: draft.event_date,
        retrieved_at: draft.retrieved_at,
        quantity: draft.quantity,
        amount: draft.amount,
        currency: draft.currency,
        relevance: draft.relevance,
        verification_status: perKey.get(draft.evidenceKey) ?? VERIFICATION_STATUS.PENDING,
        metadata: draft.metadata,
        created_at: now,
        updated_at: now,
      },
    });
  }

  const calc = collected.items.find((i) => i.evidence_type === "CALCULATION");
  const estimated_recovery = calc?.amount ?? candidate.estimated_value;
  const currency = calc?.currency ?? candidate.currency ?? "USD";

  await ctx.runMutation(internal.evidence.db.patchCase, {
    caseId: caseRow._id,
    patch: {
      verification,
      completeness,
      decision: decision.decision,
      status: decision.status,
      estimated_recovery,
      currency,
      last_collected_at: now,
      updated_at: now,
    },
  });
  await ctx.runMutation(internal.evidence.db.insertAuditEvent, {
    event: {
      userId,
      caseId: caseRow._id,
      actor: "system",
      action: auditAction,
      details: {
        items: collected.included.length,
        excluded: collected.excluded,
        decision: decision.decision,
      },
      createdAt: now,
    },
  });

  return { items: collected.included.length, decision: decision.decision, status: decision.status };
}

/* ------------------------------ openCase ------------------------------ */

type OpenCaseResult =
  | { ok: true; caseId: Id<"evidenceCases">; created: boolean }
  | { ok: false; error: string };

/** Create (or open) the single EvidenceCase for a Phase 1 candidate (spec §6). */
export const openCase = action({
  args: { claimCandidateId: v.id("claimCandidates") },
  handler: async (ctx, { claimCandidateId }): Promise<OpenCaseResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false, error: "Please sign in first." };

    const candidate = await ctx.runQuery(internal.evidence.db.getCandidateForUser, {
      candidateId: claimCandidateId,
      userId,
    });
    if (!candidate) return { ok: false, error: "Opportunity not found." };

    // Dedup gate (spec §6): never create a second case for the same candidate.
    const existing = await ctx.runQuery(internal.evidence.db.getCaseByCandidate, {
      userId,
      claimCandidateId,
    });
    if (existing) return { ok: true, caseId: existing._id, created: false };

    const now = Date.now();
    const caseId = await ctx.runMutation(internal.evidence.db.insertCase, {
      case: {
        userId,
        claimCandidateId,
        caseNumber: caseNumberFromClaimId(candidate.claimId),
        case_type: candidate.candidate_type,
        status: CASE_STATUS.OPEN,
        decision: CASE_DECISION.NOT_READY,
        estimated_recovery: candidate.estimated_value,
        currency: candidate.currency ?? "USD",
        created_at: now,
        updated_at: now,
        verification: { checks: [], conflicts: [], ranAt: now },
        completeness: { status: "UNKNOWN", required: [], missing: [], ranAt: now },
      },
    });
    await ctx.runMutation(internal.evidence.db.insertAuditEvent, {
      event: {
        userId,
        caseId,
        actor: "system",
        action: "case.created",
        objectId: candidate.claimId,
        createdAt: now,
      },
    });

    // Populate the workspace immediately: collect → verify → decide.
    const caseRow = await ctx.runQuery(internal.evidence.db.getCaseForUser, { caseId, userId });
    if (!caseRow) return { ok: false, error: "Case could not be loaded." };
    const items = await ctx.runQuery(internal.evidence.db.getEvidenceItemsByCase, { caseId });
    await runEvidencePipeline(ctx, userId, caseRow, candidate, items, "evidence.collected");
    return { ok: true, caseId, created: true };
  },
});

/* --------------------------- reCollectEvidence --------------------------- */

type RecollectResult =
  | { ok: true; items: number; decision: string; status: string }
  | { ok: false; error: string };

/** Re-run the evidence pipeline after new Amazon records post (spec §38). */
export const reCollectEvidence = action({
  args: { caseId: v.id("evidenceCases") },
  handler: async (ctx, { caseId }): Promise<RecollectResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false, error: "Please sign in first." };

    const caseRow = await ctx.runQuery(internal.evidence.db.getCaseForUser, { caseId, userId });
    if (!caseRow) return { ok: false, error: "Case not found." };
    if (caseRow.status === CASE_STATUS.CLOSED) return { ok: false, error: "This case is closed." };

    const candidate = await ctx.runQuery(internal.evidence.db.getCandidateForUser, {
      candidateId: caseRow.claimCandidateId,
      userId,
    });
    if (!candidate) return { ok: false, error: "Source opportunity not found." };

    const items = await ctx.runQuery(internal.evidence.db.getEvidenceItemsByCase, { caseId });
    const outcome = await runEvidencePipeline(
      ctx,
      userId,
      caseRow,
      candidate,
      items,
      "evidence.recollected",
    );
    return { ok: true, items: outcome.items, decision: outcome.decision, status: outcome.status };
  },
});

/* ------------------------------ runAIAnalysis ------------------------------ */

type AiResult =
  | { ok: true; regenerated: boolean; droppedRefs: string[] }
  | { ok: false; error: string };

function aiFailurePayload(
  caseId: Id<"evidenceCases">,
  error: string,
): { caseId: Id<"evidenceCases">; row: Record<string, unknown>; fields: Record<string, unknown> } {
  const now = Date.now();
  return {
    caseId,
    row: { status: "failed", error, generated_at: now },
    fields: { status: "failed", error, generated_at: now },
  };
}

/** AI-assisted analysis over VERIFIED evidence only (spec §21–§23). */
export const runAIAnalysis = action({
  args: { caseId: v.id("evidenceCases") },
  handler: async (ctx, { caseId }): Promise<AiResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false, error: "Please sign in first." };

    const caseRow = await ctx.runQuery(internal.evidence.db.getCaseForUser, { caseId, userId });
    if (!caseRow) return { ok: false, error: "Case not found." };

    const candidate = await ctx.runQuery(internal.evidence.db.getCandidateForUser, {
      candidateId: caseRow.claimCandidateId,
      userId,
    });
    if (!candidate) return { ok: false, error: "Source opportunity not found." };

    const itemRows = await ctx.runQuery(internal.evidence.db.getEvidenceItemsByCase, { caseId });
    if (itemRows.length === 0) {
      return { ok: false, error: "Collect evidence before running the AI analysis." };
    }

    const existing = await ctx.runQuery(internal.evidence.db.getAIAnalysisByCase, { caseId });
    const regenerated = existing != null;

    if (!process.env.VLY_INTEGRATION_KEY) {
      await ctx.runMutation(internal.evidence.db.upsertAIAnalysis, {
        analysis: aiFailurePayload(caseId, "VLY_INTEGRATION_KEY is not configured."),
      });
      return { ok: false, error: "VLY_INTEGRATION_KEY is not configured." };
    }

    const evidenceNoByKey = new Map(itemRows.map((i) => [i.evidenceKey, i.evidenceNo]));
    const context = buildEvidenceContext({
      candidate: {
        claimId: candidate.claimId,
        candidate_type: candidate.candidate_type,
        sku: candidate.sku,
        shipment_id: candidate.shipment_id,
        quantity: candidate.quantity,
        estimated_value: candidate.estimated_value,
        currency: candidate.currency,
        reimbursement_status: candidate.reimbursement_status,
        status: candidate.status,
        days_remaining: candidate.days_remaining,
        deadline_date: candidate.deadline_date,
      },
      items: itemRows.map(itemFromRow),
      evidenceNoByKey,
      verification: (caseRow.verification ?? {
        checks: [],
        conflicts: [],
        ranAt: 0,
      }) as VerificationResult,
    });

    const completion = await vly.ai.completion({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(context) },
      ],
      temperature: 0.2,
      maxTokens: 1400,
    });

    if (!completion.success || !completion.data) {
      const error = completion.error ?? "AI request failed.";
      await ctx.runMutation(internal.evidence.db.upsertAIAnalysis, {
        analysis: aiFailurePayload(caseId, error),
      });
      return { ok: false, error };
    }

    const content = completion.data.choices[0]?.message?.content ?? "";
    const parsed = parseAiAnalysis(content, itemRows.map((i) => i.evidenceNo));
    const now = Date.now();
    const fields = {
      status: "generated",
      summary: parsed.summary,
      key_facts: parsed.keyFacts,
      discrepancy_explanation: parsed.discrepancyExplanation,
      missing_information: parsed.missingInformation,
      potential_conflicts: parsed.potentialConflicts,
      draft_narrative: parsed.draftNarrative,
      generated_at: now,
      model_identifier: "gpt-4o-mini",
      evidence_references: parsed.evidenceRefs,
      error: undefined,
    };
    await ctx.runMutation(internal.evidence.db.upsertAIAnalysis, {
      analysis: { caseId, row: { ...fields, userId }, fields },
    });
    await ctx.runMutation(internal.evidence.db.insertAuditEvent, {
      event: {
        userId,
        caseId,
        actor: "ai",
        action: regenerated ? "ai.analysis.regenerated" : "ai.analysis.generated",
        details: { droppedRefs: parsed.droppedRefs },
        createdAt: now,
      },
    });
    return { ok: true, regenerated, droppedRefs: parsed.droppedRefs };
  },
});

/* ------------------------------ saveNarrative ------------------------------ */

type NarrativeResult = { ok: true } | { ok: false; error: string };

/** Persist the seller-edited narrative for the package (spec §34). */
export const saveNarrative = action({
  args: { caseId: v.id("evidenceCases"), narrative: v.string() },
  handler: async (ctx, { caseId, narrative }): Promise<NarrativeResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false, error: "Please sign in first." };

    const caseRow = await ctx.runQuery(internal.evidence.db.getCaseForUser, { caseId, userId });
    if (!caseRow) return { ok: false, error: "Case not found." };

    const existing = await ctx.runQuery(internal.evidence.db.getAIAnalysisByCase, { caseId });
    if (!existing) return { ok: false, error: "Run the AI analysis first, then edit the narrative." };

    const now = Date.now();
    await ctx.runMutation(internal.evidence.db.upsertAIAnalysis, {
      analysis: {
        caseId,
        row: { status: existing.status, draft_narrative: narrative, generated_at: now },
        fields: { draft_narrative: narrative },
      },
    });
    await ctx.runMutation(internal.evidence.db.insertAuditEvent, {
      event: { userId, caseId, actor: "seller", action: "narrative.edited", createdAt: now },
    });
    return { ok: true };
  },
});

/* ------------------------------ sellerApprove ------------------------------ */

type ApproveResult =
  | { ok: true; reasons: string[] }
  | { ok: false; error: string; reasons?: string[] };

/** Seller explicitly approves the verified case (spec §34). */
export const sellerApprove = action({
  args: { caseId: v.id("evidenceCases") },
  handler: async (ctx, { caseId }): Promise<ApproveResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false, error: "Please sign in first." };

    const caseRow = await ctx.runQuery(internal.evidence.db.getCaseForUser, { caseId, userId });
    if (!caseRow) return { ok: false, error: "Case not found." };
    if (caseRow.status === CASE_STATUS.CLOSED) return { ok: false, error: "This case is closed." };

    const reasons: string[] = [];
    const verification = caseRow.verification as VerificationResult | undefined;
    const completeness = caseRow.completeness as CompletenessResult | undefined;
    if (verification?.conflicts?.length) {
      reasons.push(`${verification.conflicts.length} evidence conflict(s) must be resolved first.`);
    }
    if (completeness?.missing?.length) {
      reasons.push(`${completeness.missing.length} required evidence categor(y/ies) are missing.`);
    }
    if (caseRow.decision !== CASE_DECISION.READY_FOR_REVIEW) {
      reasons.push("The deterministic decision is not READY_FOR_REVIEW.");
    }
    if (reasons.length > 0) {
      return { ok: false, error: "Case is not ready for approval.", reasons };
    }

    const now = Date.now();
    await ctx.runMutation(internal.evidence.db.patchCase, {
      caseId,
      patch: {
        decision: CASE_DECISION.SELLER_APPROVED,
        status: CASE_STATUS.APPROVED_BY_SELLER,
        reviewed_at: now,
        reviewed_by: "seller",
        rejection: null,
        updated_at: now,
      },
    });
    await ctx.runMutation(internal.evidence.db.insertAuditEvent, {
      event: { userId, caseId, actor: "seller", action: "seller.approved", createdAt: now },
    });
    return { ok: true, reasons: [] };
  },
});

/* ------------------------------- sellerReject ------------------------------- */

type RejectResult = { ok: true } | { ok: false; error: string };

/** Seller rejects the case with a recorded reason (audit-friendly, spec §35). */
export const sellerReject = action({
  args: { caseId: v.id("evidenceCases"), reason: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { caseId, reason, note }): Promise<RejectResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false, error: "Please sign in first." };

    const caseRow = await ctx.runQuery(internal.evidence.db.getCaseForUser, { caseId, userId });
    if (!caseRow) return { ok: false, error: "Case not found." };

    const now = Date.now();
    await ctx.runMutation(internal.evidence.db.patchCase, {
      caseId,
      patch: {
        rejection: { reason, note: note ?? null, at: now },
        decision: CASE_DECISION.NOT_READY,
        status: CASE_STATUS.CLOSED,
        reviewed_at: now,
        reviewed_by: "seller",
        updated_at: now,
      },
    });
    await ctx.runMutation(internal.evidence.db.insertAuditEvent, {
      event: {
        userId,
        caseId,
        actor: "seller",
        action: "seller.rejected",
        details: { reason, note: note ?? null },
        createdAt: now,
      },
    });
    return { ok: true };
  },
});

/* ------------------------------ generatePackage ------------------------------ */

type PackageResult =
  | { ok: true; packageId: string; version: number }
  | { ok: false; error: string };

/** Emit a NEW versioned claim evidence package (spec §31–§32). */
export const generatePackage = action({
  args: { caseId: v.id("evidenceCases") },
  handler: async (ctx, { caseId }): Promise<PackageResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false, error: "Please sign in first." };

    const caseRow = await ctx.runQuery(internal.evidence.db.getCaseForUser, { caseId, userId });
    if (!caseRow) return { ok: false, error: "Case not found." };
    if (caseRow.decision !== CASE_DECISION.SELLER_APPROVED) {
      return { ok: false, error: "Approve the case before generating a package." };
    }

    const [items, candidate, aiAnalysis, latest] = await Promise.all([
      ctx.runQuery(internal.evidence.db.getEvidenceItemsByCase, { caseId }),
      ctx.runQuery(internal.evidence.db.getCandidateForUser, {
        candidateId: caseRow.claimCandidateId,
        userId,
      }),
      ctx.runQuery(internal.evidence.db.getAIAnalysisByCase, { caseId }),
      ctx.runQuery(internal.evidence.db.getLatestPackageByCase, { caseId }),
    ]);

    const version = latest ? latest.version + 1 : 1;
    const packageId = packageIdFor(caseRow.caseNumber, version);
    const now = Date.now();

    const snapshot = {
      caseNumber: caseRow.caseNumber,
      case_type: caseRow.case_type,
      version,
      decision: caseRow.decision,
      generatedAt: now,
      candidate: candidate
        ? {
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
            trigger_event_id: candidate.trigger_event_id,
          }
        : null,
      verification: caseRow.verification,
      completeness: caseRow.completeness,
      narrative: aiAnalysis?.draft_narrative ?? null,
      items: items.map((i) => ({
        evidenceNo: i.evidenceNo,
        evidenceKey: i.evidenceKey,
        evidence_type: i.evidence_type,
        title: i.title,
        description: i.description,
        event_date: i.event_date,
        quantity: i.quantity,
        amount: i.amount,
        currency: i.currency,
        relevance: i.relevance,
        verification_status: i.verification_status,
        source: i.source,
        source_record_id: i.source_record_id,
      })),
    };
    const fingerprint = packageFingerprint(JSON.stringify(snapshot));

    await ctx.runMutation(internal.evidence.db.insertPackage, {
      pkg: {
        userId,
        caseId,
        packageId,
        version,
        status: "SUBMISSION_READY",
        generated_at: now,
        generated_by: "seller",
        evidence_snapshot: snapshot,
        ai_analysis_id: aiAnalysis?._id,
        fingerprint,
      },
    });
    await ctx.runMutation(internal.evidence.db.patchCase, {
      caseId,
      patch: {
        decision: CASE_DECISION.PACKAGE_READY,
        status: CASE_STATUS.PACKAGE_GENERATED,
        updated_at: now,
      },
    });
    await ctx.runMutation(internal.evidence.db.insertAuditEvent, {
      event: {
        userId,
        caseId,
        actor: "system",
        action: "package.generated",
        objectId: packageId,
        details: { version, fingerprint },
        createdAt: now,
      },
    });
    return { ok: true, packageId, version };
  },
});
