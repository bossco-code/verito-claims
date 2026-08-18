/**
 * Shared types for the Phase 1 reimbursement opportunity engine.
 *
 * These modules are deliberately framework-free (no Convex, no Node) so the
 * entire decision pipeline — normalization, detection, reconciliation,
 * eligibility, priority — is deterministic and unit-testable.
 */

/** Initial normalized event types (spec §14). */
export const EVENT_TYPES = {
  FBA_LOSS: "FBA_LOSS",
  FBA_DAMAGE: "FBA_DAMAGE",
  FBA_RECEIVING_DISCREPANCY: "FBA_RECEIVING_DISCREPANCY",
  CUSTOMER_RETURN: "CUSTOMER_RETURN",
  REIMBURSEMENT: "REIMBURSEMENT",
  INVENTORY_ADJUSTMENT: "INVENTORY_ADJUSTMENT",
  SHIPMENT: "SHIPMENT",
  FINANCIAL_EVENT: "FINANCIAL_EVENT",
} as const;
export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Initial supported discrepancy scenarios (spec §16). */
export const CANDIDATE_TYPES = {
  FBA_LOSS: "FBA_LOSS",
  FBA_DAMAGE: "FBA_DAMAGE",
  FBA_RECEIVING_DISCREPANCY: "FBA_RECEIVING_DISCREPANCY",
} as const;
export type CandidateType = (typeof CANDIDATE_TYPES)[keyof typeof CANDIDATE_TYPES];

/** Reconciliation results (spec §20). */
export const REIMBURSEMENT_STATUS = {
  NOT_REIMBURSED: "NOT_REIMBURSED",
  ALREADY_REIMBURSED: "ALREADY_REIMBURSED",
  PARTIALLY_REIMBURSED: "PARTIALLY_REIMBURSED",
  UNKNOWN: "UNKNOWN",
} as const;
export type ReimbursementStatus =
  (typeof REIMBURSEMENT_STATUS)[keyof typeof REIMBURSEMENT_STATUS];

/** Candidate states (spec §18) — deterministic, never AI-decided. */
export const CANDIDATE_STATUS = {
  DETECTED: "DETECTED",
  RECONCILING: "RECONCILING",
  ALREADY_REIMBURSED: "ALREADY_REIMBURSED",
  PARTIALLY_REIMBURSED: "PARTIALLY_REIMBURSED",
  NOT_REIMBURSED: "NOT_REIMBURSED",
  NOT_YET_ELIGIBLE: "NOT_YET_ELIGIBLE",
  ELIGIBLE: "ELIGIBLE",
  EXPIRED: "EXPIRED",
  DUPLICATE: "DUPLICATE",
  REQUIRES_MANUAL_REVIEW: "REQUIRES_MANUAL_REVIEW",
  POLICY_REVIEW_REQUIRED: "POLICY_REVIEW_REQUIRED",
} as const;
export type CandidateStatus =
  (typeof CANDIDATE_STATUS)[keyof typeof CANDIDATE_STATUS];

/** Priorities (spec §25). */
export const PRIORITY = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  MONITOR: "MONITOR",
  REQUIRES_REVIEW: "REQUIRES REVIEW",
  NO_ACTION: "NO ACTION",
  EXPIRED: "EXPIRED",
} as const;
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

/** Normalized event — every field traces back to a source Amazon record. */
export interface NormalizedEvent {
  event_id: string;
  event_type: EventType;
  marketplace_id: string;
  sku?: string;
  asin?: string;
  fnsku?: string;
  quantity?: number;
  amount?: number;
  currency?: string;
  event_date: number; // epoch ms
  shipment_id?: string;
  order_id?: string;
  source: string; // amazon.finances | amazon.inbound | amazon.inventory | amazon.reports
  source_record_id: string;
  retrieved_at: number; // epoch ms
  metadata?: Record<string, unknown>;
}

/** Configurable claim policy (spec §22). */
export interface ClaimPolicy {
  policy_id: string;
  marketplace: string;
  claim_type: CandidateType;
  effective_date: number; // epoch ms
  eligibility_offset_days: number;
  deadline_offset_days: number;
  eligibility_rule: string;
  deadline_rule: string;
  policy_version: string;
  source_reference: string;
  active: boolean;
}

/** Seed shape for default policies. */
export interface ClaimPolicySeed
  extends Omit<ClaimPolicy, "effective_date" | "active"> {
  effective_date: string; // ISO date
  active?: boolean;
}

/** A matched reimbursement found during reconciliation. */
export interface ReimbursementMatch {
  source: string;
  source_record_id: string;
  event_id: string;
  sku?: string;
  shipment_id?: string;
  order_id?: string;
  amount: number;
  quantity?: number;
  posted_date: number; // epoch ms
  signal: string; // which matching signal fired
}

/** Snapshot persisted on the candidate for traceability. */
export interface ReconciliationResult {
  status: ReimbursementStatus;
  matched: ReimbursementMatch[];
  matchedAmount: number;
  matchedQuantity: number;
  confidence: "high" | "medium" | "low";
  note: string;
}

/** In-progress candidate produced by the detection engine. */
export interface ClaimCandidateDraft {
  candidateKey: string;
  claimId: string;
  candidate_type: CandidateType;
  marketplace_id: string;
  sku?: string;
  asin?: string;
  fnsku?: string;
  shipment_id?: string;
  quantity?: number;
  estimated_value?: number;
  currency?: string;
  trigger_event_id: string;
  detected_at: number; // epoch ms
  trigger_date: number; // epoch ms — event date the discrepancy is based on
  data_completeness: number; // 0..1
}

/** Fully evaluated candidate. */
export interface EvaluatedCandidate extends ClaimCandidateDraft {
  eligibility_date?: number;
  deadline_date?: number;
  days_remaining?: number;
  reimbursement_status: ReimbursementStatus;
  status: CandidateStatus;
  priority: Priority;
  policy?: ClaimPolicy | null;
  reconciliation?: ReconciliationResult;
  created_at: number;
  updated_at: number;
}

/** Summary used by the Opportunities dashboard. */
export interface OpportunitySummary {
  total: number;
  potentialRecovery: number; // sum of estimated value for actionable candidates
  actionable: number; // ELIGIBLE + NOT_YET_ELIGIBLE
  urgent: number; // priority HIGH
  alreadyReimbursed: number;
  expired: number;
  manualReview: number;
  byStatus: Partial<Record<CandidateStatus, number>>;
}

/** Deterministic hash — stable candidateKeys / claim ids. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
