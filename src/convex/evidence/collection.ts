/**
 * Evidence collection engine (spec §9–§11).
 *
 * Given a Phase 1 ClaimCandidate and the normalized Amazon events already in
 * Verito's database, produce a stable, idempotent set of EvidenceItemDrafts.
 *
 *  - Only records relevant to the case are collected (spec §10) — no
 *    downloading or attaching unrelated Amazon records.
 *  - Every item gets a stable evidenceKey so repeated collection updates
 *    rather than duplicates (spec §39).
 *  - Relevance is classified deterministically from the case facts
 *    (trigger event, shipment, SKU, event type) — never by the AI (spec §11).
 *  - Source traceability is preserved on every item (spec §8).
 */

import type {
  EvidenceCandidate,
  EvidenceItemDraft,
  EvidenceSourceEvent,
  EvidenceType,
  Relevance,
} from "./types";
import { EVIDENCE_TYPES, RELEVANCE } from "./types";
import { buildCalculation } from "./calculation";

/* ------------------------- event type → evidence type ------------------------ */

function evidenceTypeForEvent(event: EvidenceSourceEvent): EvidenceType {
  switch (event.event_type) {
    case "SHIPMENT":
      return EVIDENCE_TYPES.SHIPMENT_RECORD;
    case "FBA_RECEIVING_DISCREPANCY":
    case "FBA_LOSS":
    case "FBA_DAMAGE":
      return EVIDENCE_TYPES.INBOUND_EVENT;
    case "INVENTORY_ADJUSTMENT":
      return EVIDENCE_TYPES.ADJUSTMENT_EVENT;
    case "REIMBURSEMENT":
      return EVIDENCE_TYPES.REIMBURSEMENT_RECORD;
    case "FINANCIAL_EVENT":
      return EVIDENCE_TYPES.FINANCIAL_TRANSACTION;
    case "CUSTOMER_RETURN":
      return EVIDENCE_TYPES.RETURN_EVENT;
    default:
      return EVIDENCE_TYPES.OTHER;
  }
}

/* ------------------------------ relevance rules ------------------------------ */

/** Direct evidence: the discrepancy trigger + the records that prove it. */
const DIRECT_EVENT_TYPES = new Set([
  "FBA_LOSS",
  "FBA_DAMAGE",
  "FBA_RECEIVING_DISCREPANCY",
  "SHIPMENT",
  "REIMBURSEMENT",
  "INVENTORY_ADJUSTMENT",
]);

/** Supporting evidence: financial context that corroborates but does not prove. */
const SUPPORTING_EVENT_TYPES = new Set(["FINANCIAL_EVENT", "CUSTOMER_RETURN"]);

/**
 * Deterministic relevance for an event given the candidate.
 * Only events tied to the case identifiers (shipment, SKU, ASIN, FNSKU) or the
 * trigger event are considered; everything else is skipped (IRRELEVANT).
 */
export function classifyEventRelevance(
  event: EvidenceSourceEvent,
  candidate: EvidenceCandidate,
): Relevance {
  const isTrigger = event.event_id === candidate.trigger_event_id;
  const touchesShipment =
    candidate.shipment_id != null && event.shipment_id === candidate.shipment_id;
  const touchesSku =
    candidate.sku != null && event.sku === candidate.sku;
  const touchesAsin =
    candidate.asin != null && event.asin === candidate.asin;
  const touchesFnsku =
    candidate.fnsku != null && event.fnsku === candidate.fnsku;

  if (!isTrigger && !touchesShipment && !touchesSku && !touchesAsin && !touchesFnsku) {
    return RELEVANCE.IRRELEVANT;
  }
  if (isTrigger || touchesShipment) {
    return DIRECT_EVENT_TYPES.has(event.event_type)
      ? RELEVANCE.DIRECT
      : RELEVANCE.SUPPORTING;
  }
  // Touches SKU/ASIN only — related but less decisive.
  if (DIRECT_EVENT_TYPES.has(event.event_type)) {
    return RELEVANCE.SUPPORTING;
  }
  if (SUPPORTING_EVENT_TYPES.has(event.event_type)) {
    return RELEVANCE.SUPPORTING;
  }
  return RELEVANCE.CONTEXTUAL;
}

/* ------------------------------ item factories ------------------------------ */

function eventToItem(
  event: EvidenceSourceEvent,
  candidate: EvidenceCandidate,
  relevance: Relevance,
): EvidenceItemDraft {
  const source = event.source;
  const sourceRecordId = event.source_record_id;
  const title =
    relevance === RELEVANCE.DIRECT
      ? `${event.event_type.replaceAll("_", " ")} — direct source record`
      : `${event.event_type.replaceAll("_", " ")} — related record`;
  const description = [
    event.quantity != null ? `${event.quantity} units` : null,
    event.amount != null ? `${event.amount} ${event.currency ?? "USD"}` : null,
    event.shipment_id ? `Shipment ${event.shipment_id}` : null,
    event.order_id ? `Order ${event.order_id}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "Synced Amazon record";

  return {
    evidenceKey: `ev:${source}:${sourceRecordId}`,
    evidence_type: evidenceTypeForEvent(event),
    source,
    source_record_id: sourceRecordId,
    event_id: event.event_id,
    shipment_id: event.shipment_id,
    order_id: event.order_id,
    sku: event.sku,
    asin: event.asin,
    fnsku: event.fnsku,
    marketplace_id: event.marketplace_id,
    title,
    description,
    event_date: event.event_date,
    retrieved_at: event.retrieved_at,
    quantity: event.quantity,
    amount: event.amount,
    currency: event.currency,
    relevance,
    metadata: event.metadata ?? {},
  };
}

/** SYSTEM_RECORD item proving the Phase 1 reimbursement reconciliation. */
function reconciliationItem(candidate: EvidenceCandidate): EvidenceItemDraft {
  const recon = candidate.reconciliation as
    | { status?: string; matchedAmount?: number; matchedQuantity?: number; note?: string }
    | null
    | undefined;
  const matchedAmount = recon?.matchedAmount ?? 0;
  const status = candidate.reimbursement_status;
  const description =
    status === "NOT_REIMBURSED"
      ? "Financial records contain no reimbursement for this case."
      : status === "ALREADY_REIMBURSED"
        ? `A matching reimbursement of ${matchedAmount} ${candidate.currency ?? "USD"} was found in the financial records.`
        : status === "PARTIALLY_REIMBURSED"
          ? `A partial reimbursement of ${matchedAmount} ${candidate.currency ?? "USD"} was found; ${candidate.quantity ?? 0} units remain outstanding.`
          : "Reimbursement status could not be confirmed from the available records.";

  return {
    evidenceKey: `recon:${candidate.candidateKey}`,
    evidence_type: EVIDENCE_TYPES.SYSTEM_RECORD,
    source: "Amazon SP-API — Financial Events",
    title: `Reimbursement reconciliation — ${status.replaceAll("_", " ")}`,
    description,
    event_date: candidate.detected_at,
    retrieved_at: candidate.detected_at,
    amount: matchedAmount > 0 ? matchedAmount : undefined,
    currency: candidate.currency,
    relevance: RELEVANCE.DIRECT,
    metadata: { reimbursement_status: status, reconciliation: recon ?? null },
  };
}

/** SYSTEM_RECORD item proving the applicable policy / deadline (spec §17). */
function policyItem(candidate: EvidenceCandidate): EvidenceItemDraft {
  const policy = candidate.policy as
    | { policy_version?: string; source_reference?: string; eligibility_rule?: string; deadline_rule?: string }
    | null
    | undefined;
  const deadline = candidate.deadline_date
    ? new Date(candidate.deadline_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return {
    evidenceKey: `policy:${candidate.candidateKey}`,
    evidence_type: EVIDENCE_TYPES.SYSTEM_RECORD,
    source: "Claim Policy Engine",
    title: "Applicable claim policy & deadline",
    description: [
      policy?.policy_version ? `Policy v${policy.policy_version}` : null,
      deadline ? `Submission deadline ${deadline}` : "No deadline could be applied",
      policy?.source_reference ?? null,
    ]
      .filter(Boolean)
      .join(" · "),
    event_date: candidate.deadline_date ?? candidate.detected_at,
    retrieved_at: candidate.detected_at,
    relevance: RELEVANCE.SUPPORTING,
    metadata: { policy: policy ?? null },
  };
}

/* ------------------------------ collection entry ----------------------------- */

export interface CollectionInput {
  candidate: EvidenceCandidate;
  events: EvidenceSourceEvent[];
  /** Passed-in unit price (from settlement report) when available. */
  unitValue?: number;
}

export interface CollectionResult {
  items: EvidenceItemDraft[];
  /** Direct + supporting items count (what appears in the package). */
  included: EvidenceItemDraft[];
  /** Items skipped as irrelevant to the case. */
  excluded: number;
  collectedAt: number;
}

/**
 * Collect evidence for a case from already-synced normalized data.
 * Deterministic + idempotent: the same input always yields the same item set
 * (same evidenceKeys). Only DIRECT and SUPPORTING items are included in the
 * package; CONTEXTUAL items are kept for the workspace; IRRELEVANT are dropped.
 */
export function collectEvidenceForCandidate({
  candidate,
  events,
  unitValue,
}: CollectionInput): CollectionResult {
  const collectedAt = Date.now();

  const drafts: EvidenceItemDraft[] = [];
  let excluded = 0;

  for (const event of events) {
    const relevance = classifyEventRelevance(event, candidate);
    if (relevance === RELEVANCE.IRRELEVANT) {
      excluded++;
      continue;
    }
    drafts.push(eventToItem(event, candidate, relevance));
  }

  // Deterministic calculation evidence (spec §16).
  const calc = buildCalculation({ candidate, unitValue });
  if (calc.reproducible) {
    drafts.push({
      evidenceKey: calc.evidenceKey,
      evidence_type: EVIDENCE_TYPES.CALCULATION,
      source: "Verito — deterministic calculation",
      title: `Recovery calculation — ${calc.formula}`,
      description: `${calc.unitsMissing} missing units × ${calc.unitValue.toFixed(2)} ${calc.currency} = ${calc.result.toFixed(2)} ${calc.currency}`,
      event_date: candidate.detected_at,
      retrieved_at: collectedAt,
      quantity: calc.unitsMissing,
      amount: calc.result,
      currency: calc.currency,
      relevance: RELEVANCE.DIRECT,
      metadata: {
        formula: calc.formula,
        unitsMissing: calc.unitsMissing,
        unitValue: calc.unitValue,
        result: calc.result,
        reproducible: calc.reproducible,
      },
    });
  }

  // Reimbursement reconciliation + policy/deadline system records.
  drafts.push(reconciliationItem(candidate));
  drafts.push(policyItem(candidate));

  const included = drafts.filter(
    (d) => d.relevance === RELEVANCE.DIRECT || d.relevance === RELEVANCE.SUPPORTING,
  );

  return { items: drafts, included, excluded, collectedAt };
}
