/**
 * Priority engine (spec §25, §27).
 *
 * Deterministic scoring rules (configurable thresholds), mapping candidate
 * state + urgency to HIGH / MEDIUM / LOW / MONITOR / REQUIRES REVIEW /
 * NO ACTION / EXPIRED, plus the dashboard sort order.
 */

import type { CandidateStatus, EvaluatedCandidate, Priority } from "./types";
import { CANDIDATE_STATUS, PRIORITY } from "./types";

export interface PriorityRuleSet {
  highWithinDays: number; // eligible & <= this many days → HIGH
  mediumWithinDays: number; // eligible & <= this many days → MEDIUM
}

export const DEFAULT_RULES: PriorityRuleSet = {
  highWithinDays: 7,
  mediumWithinDays: 30,
};

export function computePriority(
  status: CandidateStatus,
  daysRemaining: number | undefined,
  rules: PriorityRuleSet = DEFAULT_RULES,
): Priority {
  switch (status) {
    case CANDIDATE_STATUS.ALREADY_REIMBURSED:
      return PRIORITY.NO_ACTION;
    case CANDIDATE_STATUS.EXPIRED:
      return PRIORITY.EXPIRED;
    case CANDIDATE_STATUS.NOT_YET_ELIGIBLE:
      return PRIORITY.MONITOR;
    case CANDIDATE_STATUS.REQUIRES_MANUAL_REVIEW:
    case CANDIDATE_STATUS.PARTIALLY_REIMBURSED:
    case CANDIDATE_STATUS.POLICY_REVIEW_REQUIRED:
    case CANDIDATE_STATUS.RECONCILING:
    case CANDIDATE_STATUS.DETECTED:
    case CANDIDATE_STATUS.NOT_REIMBURSED:
      return PRIORITY.REQUIRES_REVIEW;
    case CANDIDATE_STATUS.DUPLICATE:
      return PRIORITY.NO_ACTION;
    case CANDIDATE_STATUS.ELIGIBLE: {
      if (daysRemaining === undefined) return PRIORITY.REQUIRES_REVIEW;
      if (daysRemaining <= rules.highWithinDays) return PRIORITY.HIGH;
      if (daysRemaining <= rules.mediumWithinDays) return PRIORITY.MEDIUM;
      return PRIORITY.LOW;
    }
    default:
      return PRIORITY.REQUIRES_REVIEW;
  }
}

/** Dashboard sort order (spec §27): actionable urgency first, reimbursed
 *  cases never look like opportunities. */
export const SORT_ORDER: Record<Priority, number> = {
  [PRIORITY.HIGH]: 0,
  [PRIORITY.MEDIUM]: 1,
  [PRIORITY.LOW]: 2,
  [PRIORITY.MONITOR]: 3,
  [PRIORITY.REQUIRES_REVIEW]: 4,
  [PRIORITY.NO_ACTION]: 5,
  [PRIORITY.EXPIRED]: 6,
};

export function sortOpportunities(
  candidates: EvaluatedCandidate[],
): EvaluatedCandidate[] {
  return [...candidates].sort((a, b) => {
    const byPriority = SORT_ORDER[a.priority] - SORT_ORDER[b.priority];
    if (byPriority !== 0) return byPriority;
    // Ties: more urgent deadline first, then higher value.
    const aDays = a.days_remaining ?? Number.MAX_SAFE_INTEGER;
    const bDays = b.days_remaining ?? Number.MAX_SAFE_INTEGER;
    if (aDays !== bDays) return aDays - bDays;
    return (b.estimated_value ?? 0) - (a.estimated_value ?? 0);
  });
}
