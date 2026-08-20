"use node";

/**
 * Provider AI Agent — automates the full reimbursement pipeline for a client.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { EvaluatedCandidate, NormalizedEvent } from "./types";
import type { EvidenceItemDraft, EvidenceCandidate, EvidenceSourceEvent, VerificationResult, CompletenessResult, CaseStatus } from "../evidence/types";
import { CASE_DECISION, CASE_STATUS, VERIFICATION_STATUS } from "../evidence/types";
import { collectEvidenceForCandidate } from "../evidence/collection";
import { verifyEvidence } from "../evidence/verification";
import { checkCompleteness } from "../evidence/completeness";
import { caseNumberFromClaimId, evidenceNoFor } from "../evidence/calculation";
import {
  buildEvidenceContext,
  buildSystemPrompt,
  buildUserPrompt,
  parseAiAnalysis,
} from "../evidence/ai";
import { vly } from "../../lib/vly-integrations";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ─────────────────────────────── Mappers ─────────────────────────────── */

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

/* ───────────────────────── Deterministic Decision ────────────────────── */

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

/* ───────────────────────── Single-Candidate Pipeline ─────────────────── */

interface CandidateOutcome {
  candidateId: string;
  claimId: string;
  action: "created" | "updated" | "skipped" | "analyzed" | "error";
  decision?: string;
  status?: string;
  aiRun?: boolean;
  error?: string;
}

async function processCandidate(
  ctx: any,
  userId: Id<"users">,
  candidate: Doc<"claimCandidates">,
  events: EvidenceSourceEvent[],
): Promise<CandidateOutcome> {
  const candidateSlice = toEvidenceCandidate(candidate);
  const now = Date.now();

  // Check if case already exists
  const existingCase = await ctx.runQuery(internal.evidence.db.getCaseByCandidate, {
    userId,
    claimCandidateId: candidate._id,
  });

  let caseRow: Doc<"evidenceCases">;
  let created = false;

  if (existingCase) {
    caseRow = existingCase;
  } else {
    const caseId = await ctx.runMutation(internal.evidence.db.insertCase, {
      case: {
        userId,
        claimCandidateId: candidate._id,
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
        actor: "agent",
        action: "case.created",
        objectId: candidate.claimId,
        createdAt: now,
      },
    });
    caseRow = (await ctx.runQuery(internal.evidence.db.getCaseForUser, {
      caseId,
      userId,
    })) as Doc<"evidenceCases">;
    created = true;
  }

  if (caseRow.status === CASE_STATUS.CLOSED) {
    return { candidateId: candidate._id, claimId: candidate.claimId, action: "skipped" };
  }

  // Get existing evidence items
  const existingItems: Doc<"evidenceItems">[] = await ctx.runQuery(
    internal.evidence.db.getEvidenceItemsByCase,
    { caseId: caseRow._id },
  );

  // Run deterministic pipeline
  const collected = collectEvidenceForCandidate({ candidate: candidateSlice, events });
  const verification = verifyEvidence({ candidate: candidateSlice, items: collected.items, events });
  const completeness = checkCompleteness({
    candidate: { candidate_type: candidate.candidate_type },
    items: collected.items,
  });
  const decision = decide(verification, completeness);

  // Upsert evidence items with stable evidenceNos
  const noByKey = new Map<string, string>(
    existingItems.map((i: any) => [i.evidenceKey, i.evidenceNo] as [string, string]),
  );
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
      actor: "agent",
      action: "evidence.collected",
      details: {
        items: collected.included.length,
        excluded: collected.excluded,
        decision: decision.decision,
      },
      createdAt: now,
    },
  });

  // Run AI analysis if evidence is collected and VLY key is available
  let aiRun = false;
  if (
    decision.status === CASE_STATUS.READY_FOR_REVIEW &&
    collected.included.length > 0 &&
    process.env.VLY_INTEGRATION_KEY
  ) {
    try {
      const itemRows: Doc<"evidenceItems">[] = await ctx.runQuery(
        internal.evidence.db.getEvidenceItemsByCase,
        { caseId: caseRow._id },
      );
      const evidenceNoByKey = new Map<string, string>(
        itemRows.map((i: any) => [i.evidenceKey, i.evidenceNo] as [string, string]),
      );
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
        verification,
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

      if (completion.success && completion.data) {
        const content = completion.data.choices[0]?.message?.content ?? "";
        const parsed = parseAiAnalysis(content, itemRows.map((i: any) => i.evidenceNo));
        const aiFields = {
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
          analysis: { caseId: caseRow._id, row: { ...aiFields, userId }, fields: aiFields },
        });
        await ctx.runMutation(internal.evidence.db.insertAuditEvent, {
          event: {
            userId,
            caseId: caseRow._id,
            actor: "agent",
            action: "ai.analysis.generated",
            details: { droppedRefs: parsed.droppedRefs },
            createdAt: now,
          },
        });
        aiRun = true;
      }
    } catch {
      // AI failure is non-fatal
    }
  }

  return {
    candidateId: candidate._id,
    claimId: candidate.claimId,
    action: created ? "created" : "updated",
    decision: decision.decision,
    status: decision.status,
    aiRun,
  };
}

/* ─────────────────────────────── Main Action ─────────────────────────── */

interface AgentResult {
  ok: true;
  clientId: string | null;
  candidatesProcessed: number;
  casesCreated: number;
  casesUpdated: number;
  aiAnalysesRun: number;
  errors: string[];
  summary: string;
  outcomes: CandidateOutcome[];
}

export const runClientPipeline = action({
  args: {
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, { clientId }): Promise<AgentResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    // Auth verified via getAuthUserId; provider role enforced by downstream queries.
    const errors: string[] = [];
    const outcomes: CandidateOutcome[] = [];

    const allCandidates = await ctx.runQuery(internal.amazon.db.getCandidatesByUser, { userId });

    const candidates = clientId
      ? allCandidates.filter((c: any) => c.metadata?.providerClientId === clientId)
      : allCandidates;

    if (candidates.length === 0) {
      return {
        ok: true,
        clientId: clientId ?? null,
        candidatesProcessed: 0,
        casesCreated: 0,
        casesUpdated: 0,
        aiAnalysesRun: 0,
        errors: [],
        summary: "No candidates found to process.",
        outcomes: [],
      };
    }

    const allEvents = await ctx.runQuery(internal.amazon.db.getEventsByUser, { userId });
    const events = allEvents.map(toEvent);

    for (const candidate of candidates) {
      try {
        const outcome = await processCandidate(ctx, userId, candidate, events);
        outcomes.push(outcome);
      } catch (err) {
        const msg = `Failed to process ${candidate.claimId}: ${err instanceof Error ? err.message : "unknown error"}`;
        errors.push(msg);
        outcomes.push({ candidateId: candidate._id, claimId: candidate.claimId, action: "error", error: msg });
      }
    }

    const casesCreated = outcomes.filter((o) => o.action === "created").length;
    const casesUpdated = outcomes.filter((o) => o.action === "updated").length;
    const aiAnalysesRun = outcomes.filter((o) => o.aiRun).length;

    return {
      ok: true,
      clientId: clientId ?? null,
      candidatesProcessed: outcomes.length,
      casesCreated,
      casesUpdated,
      aiAnalysesRun,
      errors,
      summary: `Processed ${outcomes.length} candidate(s): ${casesCreated} cases created, ${casesUpdated} updated, ${aiAnalysesRun} AI analyses run.`,
      outcomes,
    };
  },
});
