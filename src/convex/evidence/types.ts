/**
 * Phase 2 — Evidence engine shared types & constants.
 *
 * Framework-free (no Convex, no Node) so the entire evidence pipeline —
 * collection, verification, completeness, decision, calculation, timeline —
 * is deterministic and unit-testable, exactly like Phase 1's
 * src/convex/amazon/types.ts.
 */

/* ------------------- Phase 1 candidate types (re-exported) ------------------ */
/*
 * The eligibility decision engine operates on Phase 1 candidate data. Its
 * statuses and shapes are defined once in src/convex/amazon/types.ts; this
 * file re-exports them so the evidence pipeline can import everything from
 * "./types" without duplicating definitions.
 */
export {
  CANDIDATE_STATUS,
  REIMBURSEMENT_STATUS,
} from "../amazon/types";
export type {
  CandidateStatus,
  ClaimCandidateDraft,
  ClaimPolicy,
  ReimbursementStatus,
} from "../amazon/types";

/* ------------------------------ Evidence types ------------------------------ */

export const EVIDENCE_TYPES = {
  SHIPMENT_RECORD: "SHIPMENT_RECORD",
  INBOUND_EVENT: "INBOUND_EVENT",
  INVENTORY_EVENT: "INVENTORY_EVENT",
  REIMBURSEMENT_RECORD: "REIMBURSEMENT_RECORD",
  FINANCIAL_TRANSACTION: "FINANCIAL_TRANSACTION",
  ORDER_RECORD: "ORDER_RECORD",
  RETURN_EVENT: "RETURN_EVENT",
  ADJUSTMENT_EVENT: "ADJUSTMENT_EVENT",
  CALCULATION: "CALCULATION",
  SYSTEM_RECORD: "SYSTEM_RECORD",
  OTHER: "OTHER",
} as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[keyof typeof EVIDENCE_TYPES];

/** Relevance classification (spec §11). */
export const RELEVANCE = {
  DIRECT: "DIRECT",
  SUPPORTING: "SUPPORTING",
  CONTEXTUAL: "CONTEXTUAL",
  IRRELEVANT: "IRRELEVANT",
} as const;
export type Relevance = (typeof RELEVANCE)[keyof typeof RELEVANCE];

/** Verification engine results (spec §13). */
export const VERIFICATION_STATUS = {
  CONSISTENT: "CONSISTENT",
  INCONSISTENT: "INCONSISTENT",
  MISSING: "MISSING",
  AMBIGUOUS: "AMBIGUOUS",
  NOT_APPLICABLE: "NOT_APPLICABLE",
  PENDING: "PENDING",
} as const;
export type VerificationStatus =
  (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS];

/** EvidenceCase lifecycle (spec §5). */
export const CASE_STATUS = {
  OPEN: "OPEN",
  COLLECTING_EVIDENCE: "COLLECTING_EVIDENCE",
  VERIFYING: "VERIFYING",
  EVIDENCE_INCOMPLETE: "EVIDENCE_INCOMPLETE",
  EVIDENCE_CONFLICT: "EVIDENCE_CONFLICT",
  READY_FOR_REVIEW: "READY_FOR_REVIEW",
  APPROVED_BY_SELLER: "APPROVED_BY_SELLER",
  PACKAGE_GENERATED: "PACKAGE_GENERATED",
  SUBMISSION_READY: "SUBMISSION_READY",
  CLOSED: "CLOSED",
} as const;
export type CaseStatus = (typeof CASE_STATUS)[keyof typeof CASE_STATUS];

/** Case decision states (spec §20) — deterministic, never AI-decided. */
export const CASE_DECISION = {
  NOT_READY: "NOT_READY",
  EVIDENCE_INCOMPLETE: "EVIDENCE_INCOMPLETE",
  EVIDENCE_CONFLICT: "EVIDENCE_CONFLICT",
  READY_FOR_REVIEW: "READY_FOR_REVIEW",
  SELLER_APPROVED: "SELLER_APPROVED",
  PACKAGE_READY: "PACKAGE_READY",
} as const;
export type CaseDecision = (typeof CASE_DECISION)[keyof typeof CASE_DECISION];

/** Completeness engine results (spec §17). */
export const COMPLETENESS_STATUS = {
  COMPLETE: "COMPLETE",
  INCOMPLETE: "INCOMPLETE",
  UNKNOWN: "UNKNOWN",
} as const;
export type CompletenessStatus =
  (typeof COMPLETENESS_STATUS)[keyof typeof COMPLETENESS_STATUS];

/** Package statuses (spec §28). */
export const PACKAGE_STATUS = {
  NOT_READY: "NOT_READY",
  INCOMPLETE: "INCOMPLETE",
  READY_FOR_REVIEW: "READY_FOR_REVIEW",
  APPROVED: "APPROVED",
  GENERATED: "GENERATED",
  SUBMISSION_READY: "SUBMISSION_READY",
} as const;
export type PackageStatus = (typeof PACKAGE_STATUS)[keyof typeof PACKAGE_STATUS];

/** Seller rejection reasons (spec §35). */
export const REJECTION_REASONS = {
  INCORRECT_DISCREPANCY: "Incorrect discrepancy",
  ALREADY_RESOLVED: "Already resolved",
  WRONG_QUANTITY: "Wrong quantity",
  WRONG_SHIPMENT: "Wrong shipment",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  OTHER: "Other",
} as const;
export type RejectionReason = (typeof REJECTION_REASONS)[keyof typeof REJECTION_REASONS];

/* --------------------------- Evidence item shape --------------------------- */

/** Minimal event shape the collection engine consumes (a slice of the
 *  normalizedEvents doc — kept structural so the engine stays framework-free). */
export interface EvidenceSourceEvent {
  event_id: string;
  event_type: string;
  marketplace_id: string;
  sku?: string;
  asin?: string;
  fnsku?: string;
  quantity?: number;
  amount?: number;
  currency?: string;
  event_date: number;
  shipment_id?: string;
  order_id?: string;
  source: string;
  source_record_id: string;
  retrieved_at: number;
  metadata?: Record<string, unknown>;
}

/** What the collection engine produces for one evidence item. */
export interface EvidenceItemDraft {
  evidenceKey: string; // stable idempotency key
  evidence_type: EvidenceType;
  source: string;
  source_record_id?: string;
  event_id?: string;
  shipment_id?: string;
  order_id?: string;
  sku?: string;
  asin?: string;
  fnsku?: string;
  marketplace_id?: string;
  title: string;
  description?: string;
  event_date?: number;
  retrieved_at?: number;
  quantity?: number;
  amount?: number;
  currency?: string;
  relevance: Relevance;
  metadata?: Record<string, unknown>;
}

/** A candidate slice consumed by the engines (structural — no Convex types). */
export interface EvidenceCandidate {
  candidateKey: string;
  claimId: string;
  candidate_type: string;
  marketplace_id: string;
  sku?: string;
  asin?: string;
  fnsku?: string;
  shipment_id?: string;
  quantity?: number;
  estimated_value?: number;
  currency?: string;
  trigger_event_id: string;
  detected_at: number;
  eligibility_date?: number;
  deadline_date?: number;
  days_remaining?: number;
  reimbursement_status: string;
  status: string;
  priority: string;
  data_completeness: number;
  policy?: Record<string, unknown> | null;
  reconciliation?: Record<string, unknown> | null;
}

/* ------------------------------ Engine results ------------------------------ */

export interface VerificationCheck {
  check: string; // quantity | dates | identifiers | reimbursement | currency | ...
  status: VerificationStatus;
  detail: string;
  evidenceRefs: string[]; // evidenceKeys / evidenceNos involved
}

export interface EvidenceConflict {
  check: string;
  detail: string;
  evidenceRefs: string[];
}

export interface VerificationResult {
  checks: VerificationCheck[];
  conflicts: EvidenceConflict[];
  ranAt: number;
}

export interface RequiredEvidenceCategory {
  id: string;
  label: string;
  description: string;
  satisfied: boolean;
  evidenceRefs: string[];
}

export interface CompletenessResult {
  status: CompletenessStatus;
  required: RequiredEvidenceCategory[];
  missing: RequiredEvidenceCategory[];
  ranAt: number;
}

export interface CaseDecisionResult {
  decision: CaseDecision;
  reasons: string[];
}

export interface CalculationEvidence {
  evidenceKey: string;
  unitsMissing: number;
  unitValue: number;
  formula: string;
  result: number;
  currency: string;
  sourceRefs: string[];
  reproducible: boolean;
}

export interface TimelineEvent {
  when: string; // locale date-time
  title: string;
  detail: string;
  source: string;
  evidenceNo: string; // stable Evidence ID (E-001)
}

/* ------------------------------- Deterministic ------------------------------ */

/** Deterministic hash — stable evidenceKeys / ids (same algorithm as Phase 1). */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
