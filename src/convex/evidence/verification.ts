/**
 * Evidence Verification Engine (spec §13–§15).
 *
 * Compares relevant evidence items against the candidate and against each
 * other to determine whether they are consistent. Checks quantities, dates,
 * identifiers, reimbursement state and currency. Fully deterministic.
 *
 * Results per check: CONSISTENT | INCONSISTENT | MISSING | AMBIGUOUS | NOT_APPLICABLE.
 * Any INCONSISTENT result becomes an EvidenceConflict the case decision
 * engine must respect — the system never silently accepts a claim.
 */

import type {
  EvidenceCandidate,
  EvidenceItemDraft,
  EvidenceSourceEvent,
  EvidenceConflict,
  VerificationCheck,
  VerificationResult,
  VerificationStatus,
} from "./types";
import { VERIFICATION_STATUS } from "./types";

const DAY = 24 * 60 * 60 * 1000;

function result(
  check: string,
  status: VerificationStatus,
  detail: string,
  evidenceRefs: string[] = [],
): VerificationCheck {
  return { check, status, detail, evidenceRefs };
}

/* ------------------------------ quantity check ------------------------------ */

/**
 * Verify the discrepancy quantity (spec §14).
 *
 * Expected (shipment) − received (inbound receiving) must equal the
 * candidate.quantity. If the received quantity cannot be derived from the
 * records, the result is MISSING (never silently accept).
 */
export function verifyQuantity(
  candidate: EvidenceCandidate,
  items: EvidenceItemDraft[],
  events: EvidenceSourceEvent[],
): VerificationCheck {
  const shipment = events.find((e) => e.event_type === "SHIPMENT");
  const receiving = events.find((e) =>
    ["FBA_RECEIVING_DISCREPANCY", "FBA_LOSS", "FBA_DAMAGE"].includes(e.event_type),
  );

  const refs = items.map((i) => i.evidenceKey);
  const expected = shipment?.quantity ?? null;
  const received = receiving?.quantity ?? null;
  const missing = candidate.quantity ?? null;

  if (expected == null && received == null) {
    return result(
      "quantity",
      VERIFICATION_STATUS.MISSING,
      "Shipment and receiving quantities could not be verified from the available Amazon records.",
      refs,
    );
  }

  const shipmentRef =
    shipment != null
      ? `ev:${shipment.source}:${shipment.source_record_id}`
      : null;
  const receivingRef =
    receiving != null
      ? `ev:${receiving.source}:${receiving.source_record_id}`
      : null;

  if (expected != null && received != null) {
    const discrepancy = expected - received;
    if (missing != null && discrepancy === missing) {
      return result(
        "quantity",
        VERIFICATION_STATUS.CONSISTENT,
        `${expected} expected − ${received} received = ${discrepancy} missing, matching the candidate quantity.`,
        [shipmentRef, receivingRef].filter(Boolean) as string[],
      );
    }
    return result(
      "quantity",
      VERIFICATION_STATUS.INCONSISTENT,
      missing != null
        ? `Candidate quantity (${missing}) does not match the source records (${expected} expected − ${received} received = ${discrepancy}).`
        : `Source records show ${expected} expected − ${received} received = ${discrepancy} missing, but the candidate has no quantity.`,
      [shipmentRef, receivingRef].filter(Boolean) as string[],
    );
  }

  // One side missing — verify what we can, flag the gap.
  if (expected != null && received == null) {
    return result(
      "quantity",
      VERIFICATION_STATUS.MISSING,
      `Shipment quantity is ${expected}, but receiving quantity could not be verified from available Amazon records.`,
      [shipmentRef].filter(Boolean) as string[],
    );
  }
  return result(
    "quantity",
    VERIFICATION_STATUS.MISSING,
    `Receiving quantity is ${received}, but the original shipment quantity could not be verified from available Amazon records.`,
    [receivingRef].filter(Boolean) as string[],
  );
}

/* -------------------------------- date check -------------------------------- */

/** Verify event ordering and the candidate's window (spec §13 dates). */
export function verifyDates(
  candidate: EvidenceCandidate,
  events: EvidenceSourceEvent[],
): VerificationCheck {
  const trigger = events.find((e) => e.event_id === candidate.trigger_event_id);
  if (!trigger) {
    return result(
      "dates",
      VERIFICATION_STATUS.MISSING,
      "The trigger event referenced by the candidate was not found in the synced records.",
    );
  }

  const triggerDate = trigger.event_date;
  const detected = candidate.detected_at;
  const eligibility = candidate.eligibility_date;
  const deadline = candidate.deadline_date;

  // Detection must not precede the trigger event (same-day is fine).
  if (detected + 12 * 60 * 60 * 1000 < triggerDate) {
    return result(
      "dates",
      VERIFICATION_STATUS.INCONSISTENT,
      "Detection date precedes the trigger event date — timeline is inconsistent.",
      [trigger.source_record_id],
    );
  }

  // Window sanity: eligibility <= deadline when both present.
  if (eligibility != null && deadline != null && eligibility > deadline) {
    return result(
      "dates",
      VERIFICATION_STATUS.INCONSISTENT,
      "Eligibility date is after the deadline — the policy window is inconsistent.",
      [],
    );
  }

  const detail = [
    `Trigger ${new Date(triggerDate).toLocaleDateString("en-US")}`,
    eligibility
      ? `Eligible ${new Date(eligibility).toLocaleDateString("en-US")}`
      : null,
    deadline
      ? `Deadline ${new Date(deadline).toLocaleDateString("en-US")}${
          candidate.days_remaining != null
            ? ` (${candidate.days_remaining}d remaining)`
            : ""
        }`
      : "No deadline applied",
  ]
    .filter(Boolean)
    .join(" · ");
  return result("dates", VERIFICATION_STATUS.CONSISTENT, detail, [trigger.source_record_id]);
}

/* ----------------------------- identifier check ----------------------------- */

/** Verify SKU / ASIN / shipment identifiers agree across evidence (spec §13). */
export function verifyIdentifiers(
  candidate: EvidenceCandidate,
  items: EvidenceItemDraft[],
  events: EvidenceSourceEvent[],
): VerificationCheck {
  const relevant = events.filter((e) => e.event_id === candidate.trigger_event_id);
  if (relevant.length === 0) {
    return result(
      "identifiers",
      VERIFICATION_STATUS.NOT_APPLICABLE,
      "No source events to cross-check identifiers against.",
    );
  }

  const refs = items.map((i) => i.evidenceKey);
  const mismatches: string[] = [];

  for (const e of relevant) {
    if (candidate.sku != null && e.sku != null && e.sku !== candidate.sku) {
      mismatches.push(`SKU ${e.sku} vs candidate ${candidate.sku}`);
    }
    if (candidate.asin != null && e.asin != null && e.asin !== candidate.asin) {
      mismatches.push(`ASIN ${e.asin} vs candidate ${candidate.asin}`);
    }
    if (
      candidate.shipment_id != null &&
      e.shipment_id != null &&
      e.shipment_id !== candidate.shipment_id
    ) {
      mismatches.push(`Shipment ${e.shipment_id} vs candidate ${candidate.shipment_id}`);
    }
  }

  if (mismatches.length > 0) {
    return result(
      "identifiers",
      VERIFICATION_STATUS.INCONSISTENT,
      `Identifier mismatch against source records: ${mismatches.join("; ")}.`,
      refs,
    );
  }
  return result(
    "identifiers",
    VERIFICATION_STATUS.CONSISTENT,
    "SKU / ASIN / shipment identifiers agree across the source records.",
    refs,
  );
}

/* --------------------------- reimbursement check --------------------------- */

/**
 * Verify the Phase 1 reimbursement result (spec §15). The case must not
 * become submission-ready if the reimbursement state is contradictory.
 */
export function verifyReimbursement(
  candidate: EvidenceCandidate,
  events: EvidenceSourceEvent[],
): VerificationCheck {
  const recon = candidate.reconciliation as
    | { status?: string; matchedAmount?: number }
    | null
    | undefined;
  const reimbursementEvents = events.filter((e) => e.event_type === "REIMBURSEMENT");
  const candidateStatus = candidate.reimbursement_status;

  // Case says not reimbursed, but a matching payout record exists → conflict.
  if (
    candidateStatus === "NOT_REIMBURSED" &&
    reimbursementEvents.length > 0
  ) {
    const refs = reimbursementEvents.map((e) => `ev:${e.source}:${e.source_record_id}`);
    return result(
      "reimbursement",
      VERIFICATION_STATUS.INCONSISTENT,
      `Candidate is NOT_REIMBURSED but ${reimbursementEvents.length} reimbursement record(s) were found in the synced data.`,
      refs,
    );
  }

  // Case says already reimbursed, but no payout record found → ambiguous.
  if (
    candidateStatus === "ALREADY_REIMBURSED" &&
    reimbursementEvents.length === 0 &&
    (recon?.matchedAmount ?? 0) <= 0
  ) {
    return result(
      "reimbursement",
      VERIFICATION_STATUS.AMBIGUOUS,
      "Candidate is ALREADY_REIMBURSED but no matching payout record was found to verify it.",
      [],
    );
  }

  const refs = reimbursementEvents.map((e) => `ev:${e.source}:${e.source_record_id}`);
  const detail =
    candidateStatus === "NOT_REIMBURSED"
      ? "No reimbursement found — consistent with candidate state."
      : candidateStatus === "ALREADY_REIMBURSED"
        ? `Reimbursement verified: ${recon?.matchedAmount ?? 0} ${candidate.currency ?? "USD"} matched in financial records.`
        : candidateStatus === "PARTIALLY_REIMBURSED"
          ? `Partial reimbursement verified: ${recon?.matchedAmount ?? 0} ${candidate.currency ?? "USD"} matched; ${candidate.quantity ?? 0} units outstanding.`
          : "Reimbursement status is UNKNOWN — cannot verify.";
  const status: VerificationStatus =
    candidateStatus === "UNKNOWN"
      ? VERIFICATION_STATUS.AMBIGUOUS
      : VERIFICATION_STATUS.CONSISTENT;

  return result("reimbursement", status, detail, refs);
}

/* ------------------------------ currency check ------------------------------ */

/** Verify all amounts share one currency (spec §13). */
export function verifyCurrency(events: EvidenceSourceEvent[]): VerificationCheck {
  const currencies = Array.from(
    new Set(
      events
        .filter((e) => e.amount != null)
        .map((e) => e.currency)
        .filter((c): c is string => c != null),
    ),
  );
  if (currencies.length <= 1) {
    return result(
      "currency",
      VERIFICATION_STATUS.CONSISTENT,
      currencies.length === 0
        ? "No currency-bearing records to verify."
        : `All amounts are in ${currencies[0]}.`,
      [],
    );
  }
  return result(
    "currency",
    VERIFICATION_STATUS.INCONSISTENT,
    `Amounts span multiple currencies: ${currencies.join(", ")}.`,
    [],
  );
}

/* ------------------------------ full verification --------------------------- */

export interface VerificationInput {
  candidate: EvidenceCandidate;
  items: EvidenceItemDraft[];
  events: EvidenceSourceEvent[];
  now?: number;
}

/**
 * Run every check and aggregate conflicts. Deterministic — the same inputs
 * always produce the same result. Conflicts are never AI-decided.
 */
export function verifyEvidence({
  candidate,
  items,
  events,
  now = Date.now(),
}: VerificationInput): VerificationResult {
  const checks: VerificationCheck[] = [
    verifyQuantity(candidate, items, events),
    verifyDates(candidate, events),
    verifyIdentifiers(candidate, items, events),
    verifyReimbursement(candidate, events),
    verifyCurrency(events),
  ];

  const conflicts: EvidenceConflict[] = checks
    .filter((c) => c.status === VERIFICATION_STATUS.INCONSISTENT)
    .map((c) => ({ check: c.check, detail: c.detail, evidenceRefs: c.evidenceRefs }));

  return { checks, conflicts, ranAt: now };
}

export { VERIFICATION_STATUS };
