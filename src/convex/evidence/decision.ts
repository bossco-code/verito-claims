/**
 * Phase 2 — case decision engine (spec §20, §28).
 *
 * Pure, deterministic state machine. AI is never allowed to override it.
 * The decision is derived ONLY from:
 *   - Phase 1 candidate state (status, reimbursement_status)
 *   - deterministic verification results (conflicts)
 *   - deterministic completeness results (missing categories)
 *   - an explicit, recorded seller approval
 *
 * The engine never guesses: any gate that is not provably satisfied routes
 * to NOT_READY / EVIDENCE_INCOMPLETE / EVIDENCE_CONFLICT instead of
 * fabricating a "ready" state.
 */

import type {
  CaseDecision,
  CaseStatus,
  CompletenessResult,
  EvidenceCandidate,
  VerificationResult,
} from "./types";
import { CASE_DECISION, CASE_STATUS } from "./types";

/**
 * Phase 1 states that are NOT actionable opportunities for a claim case.
 * A case must never move forward while Phase 1 says the opportunity is
 * expired, already reimbursed, unverifiable, or not yet eligible.
 */
const NOT_ACTIONABLE_STATUSES = new Set([
  "EXPIRED",
  "DUPLICATE",
  "REQUIRES_MANUAL_REVIEW",
  "POLICY_REVIEW_REQUIRED",
  "ALREADY_REIMBURSED",
  "PARTIALLY_REIMBURSED",
  "NOT_YET_ELIGIBLE",
]);

export interface CaseDecisionInput {
  candidate: EvidenceCandidate;
  verification: VerificationResult;
  completeness: CompletenessResult;
  /** Explicit, recorded seller approval (spec §34). */
  sellerApproved?: boolean;
}

export interface CaseDecisionResult {
  decision: CaseDecision;
  reasons: string[];
}

/** The single source of truth for a case's deterministic decision. */
export function computeCaseDecision(input: CaseDecisionInput): CaseDecisionResult {
  const { candidate, verification, completeness, sellerApproved } = input;
  const reasons: string[] = [];

  // 1. Phase 1 must consider the opportunity actionable.
  if (NOT_ACTIONABLE_STATUSES.has(candidate.status)) {
    reasons.push(
      `Phase 1 marks the opportunity as ${candidate.status}; it is not an actionable claim.`,
    );
    return { decision: CASE_DECISION.NOT_READY, reasons };
  }

  // 2. Amazon must not already have reimbursed the full amount.
  if (candidate.reimbursement_status === "ALREADY_REIMBURSED") {
    reasons.push("Amazon has already reimbursed this opportunity.");
    return { decision: CASE_DECISION.NOT_READY, reasons };
  }

  // 3. Contradictions between the claim and the source records block the case.
  if (verification.conflicts.length > 0) {
    reasons.push(
      `Verification found ${verification.conflicts.length} conflicting record(s): ` +
        verification.conflicts.map((c) => c.detail).join("; "),
    );
    return { decision: CASE_DECISION.EVIDENCE_CONFLICT, reasons };
  }

  // 4. Every required evidence category must be satisfied.
  if (completeness.status !== "COMPLETE" || completeness.missing.length > 0) {
    const missing = completeness.missing.map((m) => m.label).join(", ");
    reasons.push(
      completeness.status === "UNKNOWN"
        ? "Completeness could not be determined for this case type."
        : `Required evidence is missing: ${missing || "unknown categories"}.`,
    );
    return { decision: CASE_DECISION.EVIDENCE_INCOMPLETE, reasons };
  }

  // 5. All deterministic gates pass — the case awaits the seller's decision.
  if (sellerApproved === true) {
    reasons.push("The seller explicitly approved the verified case.");
    return { decision: CASE_DECISION.SELLER_APPROVED, reasons };
  }
  reasons.push("Evidence is complete and consistent; awaiting seller review.");
  return { decision: CASE_DECISION.READY_FOR_REVIEW, reasons };
}

/** Map a deterministic decision to the EvidenceCase lifecycle status. */
export function caseStatusForDecision(decision: CaseDecision): CaseStatus {
  switch (decision) {
    case CASE_DECISION.EVIDENCE_INCOMPLETE:
      return CASE_STATUS.EVIDENCE_INCOMPLETE;
    case CASE_DECISION.EVIDENCE_CONFLICT:
      return CASE_STATUS.EVIDENCE_CONFLICT;
    case CASE_DECISION.READY_FOR_REVIEW:
      return CASE_STATUS.READY_FOR_REVIEW;
    case CASE_DECISION.SELLER_APPROVED:
      return CASE_STATUS.APPROVED_BY_SELLER;
    case CASE_DECISION.PACKAGE_READY:
      return CASE_STATUS.PACKAGE_GENERATED;
    case CASE_DECISION.NOT_READY:
    default:
      return CASE_STATUS.OPEN;
  }
}
