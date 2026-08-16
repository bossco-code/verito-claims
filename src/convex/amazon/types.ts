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
  FBA_RECEIVING_DISCREPANCY: "FBA_RECEIVING_DISCREPAN

[FILE_TOO_LARGE]: The combined read_files output exceeded the 100,000 character hard limit. This file was truncated after 943 characters. Read it separately or use code_search for the relevant section.