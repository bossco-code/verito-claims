/**
 * Reimbursement opportunity engine — deterministic pipeline orchestrator.
 *
 *   AmazonDataProvider (node) → NormalizedEvent[] (this module)
 *     → detectCandidates → reconcileCandidate → policy engine
 *     → evaluateEligibility → computePriority → EvaluatedCandidate[]
 *
 * No AI anywhere in this pipeline (spec §38). Every candidate is traceable to
 * its trigger event (spec §39) and carries a stable candidateKey for
 * idempotent upserts (spec §35).
 */

import { detectCandidates } from "./detection";
import { evaluateEligibility } from "./eligibility";
import { findApplicablePolicy, applyPolicy, daysRemaining } from "./policyEngine";
import { computePriority, sortOpportunities } from "./priority";
import { reconcileCandidate } from "./reconciliation";
import { CANDIDATE_STATUS, hashString } from "./types";
import type {
  CandidateStatus,
  ClaimCandidateDraft,
  ClaimPolicy,
  EvaluatedCandidate,
  NormalizedEvent,
  OpportunitySummary,
} from "./types";

export interface DomainAvailability {
  finances: boolean;
  inbound: boolean;
  inventory: boolean;
  reports: boolean;
}

export interface EngineInput {
  events: NormalizedEvent[];
  unitPrices?: Record<string, number>;
  policies: ClaimPolicy[];
  userId: string;
  marketplaceId: string;
  now: number;
  availability: DomainAvailability;
}

/** 0..1 completeness from which domains actually synced. */
export function completenessFromAvailability(a: DomainAvailability): number {
  let score = 0;
  if (a.finances) score += 0.4;
  if (a.inbound) score += 0.3;
  if (a.inventory) score += 0.2;
  if (a.reports) score += 0.1;
  return score;
}

/**
 * Run the full pipeline. Returns evaluated candidates (pre-sorted for the
 * dashboard) plus a summary. Safe to run repeatedly — candidates carry stable
 * keys so the persistence layer updates rather than duplicates.
 */
export function runEngine(input: EngineInput): {
  candidates: EvaluatedCandidate[];
  summary: OpportunitySummary;
} {
  const { events, userId, marketplaceId, now, availability } = input;
  const reimbursementEvents = events.filter((e) => e.event_type === "REIMBURSEMENT");

  const drafts = detectCandidates({
    events,
    unitPrices: input.unitPrices,
    marketplaceId,
    userId,
    now,
  });

  const completeness = completenessFromAvailability(availability);

  const evaluated: EvaluatedCandidate[] = drafts.map((draft) => {
    const reconciliation = reconcileCandidate({
      candidate: draft,
      reimbursementEvents,
      financesAvailable: availability.finances,
    });

    const policy = findApplicablePolicy(
      input.policies,
      draft.candidate_type,
      draft.marketplace_id,
      draft.trigger_date,
    );
    const dates = policy
      ? applyPolicy(policy, draft.trigger_date)
      : { eligibilityDate: undefined, deadlineDate: undefined };
    const days = dates.deadlineDate !== undefined ? daysRemaining(dates.deadlineDate, now) : undefined;

    const candidate: ClaimCandidateDraft & {
      data_completeness: number;
    } = {
      ...draft,
      data_completeness: draft.data_completeness * completeness,
    };

    const status = evaluateEligibility({
      candidate,
      reimbursementStatus: reconciliation.status,
      policy,
      eligibilityDate: dates.eligibilityDate,
      deadlineDate: dates.deadlineDate,
      now,
    });

    return {
      ...draft,
      data_completeness: candidate.data_completeness,
      eligibility_date: dates.eligibilityDate,
      deadline_date: dates.deadlineDate,
      days_remaining: days,
      reimbursement_status: reconciliation.status,
      status,
      priority: computePriority(status, days),
      policy,
      reconciliation,
      created_at: now,
      updated_at: now,
    };
  });

  const candidates = sortOpportunities(evaluated);
  return { candidates, summary: summarize(candidates) };
}

export function summarize(candidates: EvaluatedCandidate[]): OpportunitySummary {
  const byStatus: Partial<Record<CandidateStatus, number>> = {};
  for (const c of candidates) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  }

  const actionable = candidates.filter(
    (c) => c.status === CANDIDATE_STATUS.ELIGIBLE || c.status === CANDIDATE_STATUS.NOT_YET_ELIGIBLE,
  );
  const potentialRecovery = actionable.reduce(
    (s, c) => s + (c.estimated_value ?? 0),
    0,
  );

  return {
    total: candidates.length,
    potentialRecovery,
    actionable: actionable.length,
    urgent: candidates.filter((c) => c.priority === "HIGH").length,
    alreadyReimbursed: byStatus[CANDIDATE_STATUS.ALREADY_REIMBURSED] ?? 0,
    expired: byStatus[CANDIDATE_STATUS.EXPIRED] ?? 0,
    manualReview:
      (byStatus[CANDIDATE_STATUS.REQUIRES_MANUAL_REVIEW] ?? 0) +
      (byStatus[CANDIDATE_STATUS.POLICY_REVIEW_REQUIRED] ?? 0),
    byStatus,
  };
}

/** Multi-tenant isolation guard used by the query layer (spec §37): returns
 *  only the given user's candidates. Tested directly. */
export function filterByUser<T extends { userId: string }>(
  rows: T[],
  userId: string,
): T[] {
  return rows.filter((r) => r.userId === userId);
}

export { hashString };
