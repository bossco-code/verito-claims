/**
 * Eligibility engine (spec §24, §32).
 *
 * Pure, deterministic state machine. AI is never allowed to override it.
 * Incomplete/ambiguous data routes to REQUIRES_MANUAL_REVIEW; a missing
 * policy routes to POLICY_REVIEW_REQUIRED. Never guesses.
 */

import type {
  CandidateStatus,
  ClaimCandidateDraft,
  ClaimPolicy,
  ReimbursementStatus,
} from "./types";
import { CANDIDATE_STATUS } from "./types";

export const REQUIRED_COMPLETENESS = 0.5;

export interface EligibilityInput {
  candidate: ClaimCandidateDraft;
  reimbursementStatus: ReimbursementStatus;
  policy: ClaimPolicy | null;
  eligibilityDate?: number;
  deadlineDate?: number;
  now: number;
}

/** The single source of truth for candidate status. */
export function evaluateEligibility(input: EligibilityInput): CandidateStatus {
  const { candidate, reimbursementStatus, policy } = input;

  // Reconciliation short-circuits (spec §24).
  if (reimbursementStatus === "ALREADY_REIMBURSED") {
    return CANDIDATE_STATUS.ALREADY_REIMBURSED;
  }
  if (reimbursementStatus === "PARTIALLY_REIMBURSED") {
    return CANDIDATE_STATUS.PARTIALLY_REIMBURSED;
  }

  // Required data — a candidate with no quantity or no traceable identifiers
  // cannot be safely assessed.
  if (
    candidate.quantity === undefined ||
    candidate.quantity <= 0 ||
    (!candidate.sku && !candidate.shipment_id && !candidate.asin)
  ) {
    return CANDIDATE_STATUS.REQUIRES_MANUAL_REVIEW;
  }

  // Reimbursement status unknown (ambiguous / financial data unavailable).
  if (reimbursementStatus === "UNKNOWN") {
    return CANDIDATE_STATUS.REQUIRES_MANUAL_REVIEW;
  }

  // No applicable policy → never guess a deadline.
  if (policy === null) {
    return CANDIDATE_STATUS.POLICY_REVIEW_REQUIRED;
  }
  if (input.deadlineDate === undefined || input.eligibilityDate === undefined) {
    return CANDIDATE_STATUS.POLICY_REVIEW_REQUIRED;
  }

  // Deadline passed.
  if (input.deadlineDate < input.now) {
    return CANDIDATE_STATUS.EXPIRED;
  }

  // Not eligible yet.
  if (input.now < input.eligibilityDate) {
    return CANDIDATE_STATUS.NOT_YET_ELIGIBLE;
  }

  // Insufficient data completeness (e.g. unit value or supporting domains
  // missing) → manual review rather than a fabricated estimate.
  if (candidate.data_completeness < REQUIRED_COMPLETENESS) {
    return CANDIDATE_STATUS.REQUIRES_MANUAL_REVIEW;
  }

  return CANDIDATE_STATUS.ELIGIBLE;
}
