/**
 * Policy engine (spec §22–§23).
 *
 * Amazon reimbursement deadlines differ by claim category and can change, so
 * deadlines are never hard-coded into the detection/eligibility logic. Every
 * rule carries policy_version, effective_date and source_reference, and lives
 * in the `claimPolicies` table (seeded with documented defaults). If no
 * applicable policy exists the engine says POLICY_REVIEW_REQUIRED — it never
 * guesses.
 */

import { CANDIDATE_TYPES, ClaimPolicy, ClaimPolicySeed, type CandidateType } from "./types";
import { DEFAULT_CLAIM_WINDOW_MONTHS } from "./config";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Default policies — seeded once per marketplace. These are documented,
 *  configurable defaults (not application logic): Amazon's Seller Central
 *  claims guidance is that FBA lost/damaged inventory and inbound receiving
 *  claims should be filed within 18 months of the event date. Update via the
 *  claimPolicies table (or env-driven seeding) without touching the engine.
 */
export const DEFAULT_POLICY_SEEDS: ClaimPolicySeed[] = [
  {
    policy_id: "pol-fba-loss-18m",
    marketplace: "*",
    claim_type: CANDIDATE_TYPES.FBA_LOSS,
    effective_date: "2020-01-01",
    eligibility_offset_days: 0,
    deadline_offset_days: 30 * DEFAULT_CLAIM_WINDOW_MONTHS,
    eligibility_rule: "Eligible once the loss is confirmed (trigger event date).",
    deadline_rule: `Deadline is trigger event date + ${DEFAULT_CLAIM_WINDOW_MONTHS} months (${DEFAULT_CLAIM_WINDOW_MONTHS}-month filing window).`,
    policy_version: "2025.1",
    source_reference:
      "Amazon Seller Central — FBA claims policy: lost inventory claims are accepted within 18 months of the reported loss date.",
  },
  {
    policy_id: "pol-fba-damage-18m",
    marketplace: "*",
    claim_type: CANDIDATE_TYPES.FBA_DAMAGE,
    effective_date: "2020-01-01",
    eligibility_offset_days: 0,
    deadline_offset_days: 30 * DEFAULT_CLAIM_WINDOW_MONTHS,
    eligibility_rule: "Eligible once the damage is confirmed (trigger event date).",
    deadline_rule: `Deadline is trigger event date + ${DEFAULT_CLAIM_WINDOW_MONTHS} months (${DEFAULT_CLAIM_WINDOW_MONTHS}-month filing window).`,
    policy_version: "2025.1",
    source_reference:
      "Amazon Seller Central — FBA claims policy: damaged inventory claims are accepted within 18 months of the reported damage date.",
  },
  {
    policy_id: "pol-fba-receiving-18m",
    marketplace: "*",
    claim_type: CANDIDATE_TYPES.FBA_RECEIVING_DISCREPANCY,
    effective_date: "2020-01-01",
    eligibility_offset_days: 0,
    deadline_offset_days: 30 * DEFAULT_CLAIM_WINDOW_MONTHS,
    eligibility_rule: "Eligible once the receiving discrepancy is confirmed (receiving date).",
    deadline_rule: `Deadline is shipment receiving date + ${DEFAULT_CLAIM_WINDOW_MONTHS} months (${DEFAULT_CLAIM_WINDOW_MONTHS}-month filing window).`,
    policy_version: "2025.1",
    source_reference:
      "Amazon Seller Central — FBA claims policy: claims for lost/damaged inbound shipments are accepted within 18 months of the shipment's received date.",
  },
];

/** Convert a seed into a concrete policy. */
export function policyFromSeed(seed: ClaimPolicySeed): ClaimPolicy {
  return {
    ...seed,
    active: seed.active ?? true,
    effective_date: Date.parse(`${seed.effective_date}T00:00:00Z`),
  };
}

/** Pick the applicable active policy for a claim type + marketplace + event
 *  date (most recent effective_date wins). Returns null when none applies —
 *  callers must map that to POLICY_REVIEW_REQUIRED. */
export function findApplicablePolicy(
  policies: ClaimPolicy[],
  claimType: CandidateType,
  marketplace: string,
  eventDate: number,
): ClaimPolicy | null {
  const candidates = policies.filter(
    (p) =>
      p.active &&
      p.claim_type === claimType &&
      (p.marketplace === marketplace || p.marketplace === "*") &&
      p.effective_date <= eventDate,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.effective_date - a.effective_date);
  return candidates[0]!;
}

export interface PolicyDates {
  eligibilityDate: number;
  deadlineDate: number;
}

/** Compute eligibility + deadline dates from a policy and the trigger event
 *  date. The frontend NEVER computes these — this is the only source of truth. */
export function applyPolicy(policy: ClaimPolicy, triggerDate: number): PolicyDates {
  return {
    eligibilityDate: triggerDate + policy.eligibility_offset_days * DAY_MS,
    deadlineDate: triggerDate + policy.deadline_offset_days * DAY_MS,
  };
}

/** Days remaining until the deadline (rounded down; negative = past). */
export function daysRemaining(deadlineDate: number, now: number): number {
  return Math.floor((deadlineDate - now) / DAY_MS);
}
