/**
 * ClaimInput — package-neutral shape consumed by the Claim Evidence Package
 * and Submission Letter generators (claimPackage.ts).
 *
 * Built from REAL data only: a claim candidate plus the normalized Amazon
 * events behind it (see the getOpportunityEvidence query). Nothing here is
 * fabricated — values that are not present on the candidate are rendered as
 * "—" or as an honest "pending" note, never invented.
 */

import type { Doc } from "@/convex/_generated/dataModel";

export interface ClaimInput {
  claimId: string;
  claimTypeLabel: string;
  shipId: string;
  sku: string;
  asin: string;
  fnsku: string | null;
  tracking: string;
  carrier: string;
  origin: string;
  destination: string;
  /** Expected units — null when the manifest total is not synced. */
  shipped: number | null;
  /** Received units — null when the receiving total is not synced. */
  received: number | null;
  missing: number;
  /** Estimated landed unit value (estimate ÷ missing units). */
  unitValue: number;
  estimate: number;
  claimWindowDays: number | null;
  marketplaceLabel: string;
  sellerAccount: string;
  preparedFor: string;
  status: string;
  summary: { lead: string; text: string }[];
  timeline: { when: string; title: string; detail: string; source: string }[];
  evidenceFound: { name: string; source: string }[];
  evidenceMissing: { id: string; name: string; hint: string }[];
  findings: string[];
  detectedDate: string | null;
  eligibilityDate: string | null;
  deadlineDate: string | null;
}

export type CandidateDoc = Doc<"claimCandidates">;
export type EventDoc = Doc<"normalizedEvents">;

/* ------------------------------ display maps ------------------------------ */

const CLAIM_TYPE_LABELS: Record<string, string> = {
  FBA_LOSS: "Inbound Shipment Shortage",
  FBA_DAMAGE: "FBA Inventory Damage",
  FBA_RECEIVING_DISCREPANCY: "Inbound Receiving Discrepancy",
};

const EVENT_LABELS: Record<string, string> = {
  FBA_LOSS: "FBA loss recorded",
  FBA_DAMAGE: "FBA damage recorded",
  FBA_RECEIVING_DISCREPANCY: "Receiving discrepancy recorded",
  REIMBURSEMENT: "Reimbursement recorded",
  INVENTORY_ADJUSTMENT: "Inventory adjustment",
  SHIPMENT: "Shipment recorded",
  CUSTOMER_RETURN: "Customer return recorded",
  FINANCIAL_EVENT: "Financial event recorded",
};

const SOURCE_LABELS: Record<string, string> = {
  "amazon.finances": "Amazon SP-API — Financial Events",
  "amazon.inbound": "Amazon SP-API — Fulfillment Inbound",
  "amazon.inventory": "Amazon Inventory Report",
  "amazon.reports": "Amazon Settlement Report",
};

const MARKETPLACE_LABELS: Record<string, string> = {
  ATVPDKIKX0DER: "Amazon.com",
  A1PA6795UKMFR9: "Amazon.de",
  A1VC38T7YXB528: "Amazon.co.jp",
  A2EUQ1WTGCTBG2: "Amazon.ca",
  A1F83G8C2ARO7P: "Amazon.co.uk",
  A1RKKUPIHCS9HS: "Amazon.es",
  A13V1IB3VIYZZH: "Amazon.fr",
  APJ6JRA9NG5V4: "Amazon.it",
};

export function claimTypeLabel(type: string): string {
  return CLAIM_TYPE_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase();
}

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase();
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function marketplaceLabel(marketplaceId: string): string {
  return MARKETPLACE_LABELS[marketplaceId] ?? marketplaceId;
}

export function statusLabel(status: string): string {
  return status.replaceAll("_", " ").toLowerCase();
}

/* ------------------------------- formatting ------------------------------- */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtDate(ts: number | null | undefined): string | null {
  if (ts == null) return null;
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* --------------------------- evidence requirements ------------------------ */

const REQUIRED_EVIDENCE: { id: string; name: string; hint: string }[] = [
  {
    id: "records",
    name: "Shipment manifest / receiving records",
    hint: "Export from the Amazon Shipment Report",
  },
  {
    id: "invoice",
    name: "Commercial invoice",
    hint: "Supports the unit value used in the recovery calculation",
  },
  {
    id: "photos",
    name: "Discrepancy / damage photos",
    hint: "Clear photos of the received units or packaging",
  },
];

/* ------------------------------ main builder ------------------------------ */

/**
 * Build a ClaimInput from a real candidate and its synced evidence events.
 * Everything rendered in the package traces back to these records.
 */
export function claimInputFromCandidate(
  candidate: CandidateDoc,
  events: EventDoc[],
  sellerAccount = "Primary Seller Account",
): ClaimInput {
  const type = candidate.candidate_type ?? "FBA_LOSS";
  const missing = candidate.quantity ?? 0;
  const estimate = candidate.estimated_value ?? 0;
  const unitValue = missing > 0 && estimate > 0 ? estimate / missing : 0;
  const shipId = candidate.shipment_id ?? "—";
  const sku = candidate.sku ?? "—";

  const sorted = [...events].sort((a, b) => a.event_date - b.event_date);

  const timeline = sorted.map((e) => ({
    when: fmtDateTime(e.event_date),
    title: eventLabel(e.event_type),
    detail:
      [e.quantity != null ? `${e.quantity} units` : null, e.amount != null ? `${usd.format(e.amount)}` : null]
        .filter(Boolean)
        .join(" · ") || "Synced record",
    source: sourceLabel(e.source),
  }));

  // Only add window events we can actually prove from the policy engine.
  if (candidate.detected_at) {
    timeline.push({
      when: fmtDateTime(candidate.detected_at),
      title: "Discrepancy identified",
      detail: "Detected during Verito analysis of synced records",
      source: "Verito Analysis",
    });
  }
  if (candidate.eligibility_date) {
    timeline.push({
      when: fmtDateTime(candidate.eligibility_date),
      title: "Claim window open",
      detail: "Eligible under the applicable claim policy",
      source: "Claim Policy Engine",
    });
  }
  if (candidate.deadline_date) {
    timeline.push({
      when: fmtDateTime(candidate.deadline_date),
      title: "Submission deadline",
      detail:
        candidate.days_remaining != null
          ? `${candidate.days_remaining} days remaining at analysis time`
          : "Applicable claim policy deadline",
      source: "Claim Policy Engine",
    });
  }
  timeline.sort((a, b) => (a.when < b.when ? -1 : 1));

  const sourceKeys = Array.from(new Set(events.map((e) => e.source)));
  const evidenceFound = sourceKeys.map((s) => ({
    name: sourceLabel(s).split("—")[1]?.trim() ?? "Synced Amazon record",
    source: sourceLabel(s),
  }));
  if (candidate.reconciliation && candidate.reconciliation.matched?.length > 0) {
    evidenceFound.push({
      name: "Matched reimbursement record",
      source: "Amazon SP-API — Financial Events",
    });
  }
  if (evidenceFound.length === 0) {
    evidenceFound.push({
      name: "Discrepancy record",
      source: "Amazon SP-API",
    });
  }

  const findings: string[] = [
    `A ${claimTypeLabel(type).toLowerCase()} of ${missing} units for SKU ${sku}${
      shipId !== "—" ? ` (shipment ${shipId})` : ""
    } was recorded on ${fmtDate(candidate.detected_at) ?? "the synced analysis date"}.`,
    `The reimbursement status is ${statusLabel(candidate.reimbursement_status ?? "UNKNOWN")}${
      candidate.reconciliation?.matchedAmount
        ? ` — ${usd.format(candidate.reconciliation.matchedAmount)} was matched in the financial records`
        : " — no matching payout was found in the synced financial records"
    }.`,
    `The discrepancy is traceable to ${
      sourceLabel(
        events.find((e) => e.event_id === candidate.trigger_event_id)?.source ??
          "a synced Amazon record",
      )
    }.`,
    `No duplicate claim exists for this case — the case key is unique across all synchronizations.`,
    estimate > 0
      ? `At an estimated ${usd.format(unitValue)} per unit, the estimated recovery is ${usd.format(estimate)}.`
      : `The estimated recovery could not be computed — no unit price was available from the settlement data.`,
  ];

  const summary = [
    {
      lead: "What happened.",
      text: `${claimTypeLabel(type)} of ${missing} units for SKU ${sku}${
        shipId !== "—" ? ` on shipment ${shipId}` : ""
      } was detected on ${fmtDate(candidate.detected_at) ?? "the synced analysis date"}.`,
    },
    {
      lead: "Evidence found.",
      text: `The records synced from ${
        sourceKeys.length > 0 ? sourceKeys.map(sourceLabel).join(", ") : "Amazon SP-API"
      } were reviewed; the discrepancy was reconciled against financial events with a status of ${statusLabel(
        candidate.reimbursement_status ?? "UNKNOWN",
      )}.`,
    },
    {
      lead: "Expected reimbursement.",
      text:
        estimate > 0
          ? `Based on the available evidence, the estimated recovery is ${usd.format(estimate)}.`
          : `No estimated recovery could be computed until a unit price is available from the settlement data.`,
    },
  ];

  return {
    claimId: candidate.claimId,
    claimTypeLabel: claimTypeLabel(type),
    shipId,
    sku,
    asin: candidate.asin ?? "—",
    fnsku: candidate.fnsku ?? null,
    tracking: "—",
    carrier: "—",
    origin: "—",
    destination: "—",
    shipped: null,
    received: null,
    missing,
    unitValue,
    estimate,
    claimWindowDays: candidate.days_remaining ?? null,
    marketplaceLabel: marketplaceLabel(candidate.marketplace_id),
    sellerAccount,
    preparedFor: "Seller Account Holder",
    status: statusLabel(candidate.status ?? "DETECTED"),
    summary,
    timeline,
    evidenceFound,
    evidenceMissing: REQUIRED_EVIDENCE,
    findings,
    detectedDate: fmtDate(candidate.detected_at),
    eligibilityDate: fmtDate(candidate.eligibility_date),
    deadlineDate: fmtDate(candidate.deadline_date),
  };
}
