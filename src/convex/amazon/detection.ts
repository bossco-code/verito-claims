/**
 * Discrepancy detection engine (spec §16–§17, §21).
 *
 * Deterministic: turns normalized events into ClaimCandidateDrafts for the
 * three Phase 1 scenarios (FBA fulfillment-center loss, FBA damage, inbound
 * receiving discrepancy). Detection identifies a POTENTIAL opportunity — it
 * never decides Amazon owes the seller money (that's reconciliation +
 * eligibility).
 */

import { hashString } from "./types";
import { CLAIM_ID_PREFIX } from "./config";
import type {
  CandidateType,
  ClaimCandidateDraft,
  NormalizedEvent,
} from "./types";

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface DetectionInput {
  events: NormalizedEvent[];
  unitPrices?: Record<string, number>; // sku → avg item price
  marketplaceId: string;
  userId: string;
  now: number;
}

/** Stable key that identifies "the same underlying event" (spec §21): a
 *  candidate is a duplicate if the same type + shipment + SKU + event-day
 *  already has a candidate. */
export function candidateKeyFor(input: {
  userId: string;
  candidateType: CandidateType;
  shipmentId?: string;
  sku?: string;
  triggerDate: number;
}): string {
  const day = new Date(input.triggerDate).toISOString().slice(0, 10);
  return [
    input.userId,
    input.candidateType,
    input.shipmentId ?? "na",
    input.sku ?? "na",
    day,
  ].join("::");
}

/** Human-facing claim id, stable per candidate key. */
export function claimIdFor(candidateKey: string, now: number): string {
  const year = new Date(now).getUTCFullYear();
  const seq = (hashString(candidateKey) % 9000) + 1000;
  return `${CLAIM_ID_PREFIX}-${year}-${seq}`;
}

function currencyFor(events: NormalizedEvent[]): string | undefined {
  for (const e of events) {
    if (e.currency) return e.currency;
  }
  return undefined;
}

/**
 * Detect candidates from normalized events. Deduplicates within the same run
 * (same event → one candidate) and emits a stable candidateKey so the
 * persistence layer can upsert (idempotent syncs, spec §35).
 */
export function detectCandidates(input: DetectionInput): ClaimCandidateDraft[] {
  const { events, marketplaceId, userId, now } = input;
  const prices = input.unitPrices ?? {};
  const currency = currencyFor(events);
  const drafts: ClaimCandidateDraft[] = [];
  const seen = new Set<string>();

  for (const e of events) {
    const type = e.event_type;
    if (type !== "FBA_RECEIVING_DISCREPANCY" && type !== "FBA_DAMAGE" && type !== "FBA_LOSS") {
      continue;
    }
    // A loss documented with compensation is a reimbursement record, not a
    // new opportunity — reconciliation will match it anyway; don't also
    // create a candidate from the same finance record.
    if (type === "FBA_LOSS" && e.amount !== undefined && e.amount > 0) {
      continue;
    }
    if (e.quantity === undefined || e.quantity <= 0) continue;

    const candidateKey = candidateKeyFor({
      userId,
      candidateType: type,
      shipmentId: e.shipment_id,
      sku: e.sku,
      triggerDate: e.event_date,
    });
    if (seen.has(candidateKey)) continue;
    seen.add(candidateKey);

    const unitPrice = e.sku ? prices[e.sku] : undefined;
    const estimated_value =
      unitPrice !== undefined ? Math.round(unitPrice * e.quantity * 100) / 100 : undefined;

    drafts.push({
      candidateKey,
      claimId: claimIdFor(candidateKey, now),
      candidate_type: type,
      marketplace_id: e.marketplace_id ?? marketplaceId,
      sku: e.sku,
      asin: e.asin,
      fnsku: e.fnsku,
      shipment_id: e.shipment_id,
      quantity: e.quantity,
      estimated_value,
      currency,
      trigger_event_id: e.event_id,
      detected_at: now,
      trigger_date: e.event_date,
      data_completeness: 1,
    });
  }

  return drafts;
}

/** All-time duplicate guard (spec §21): when a candidate with the same key
 *  already exists and is actionable, the re-detected one is a DUPLICATE. */
export function isDuplicate(
  existingKey: string | undefined,
  candidateKey: string,
): boolean {
  return existingKey !== undefined && existingKey === candidateKey;
}
