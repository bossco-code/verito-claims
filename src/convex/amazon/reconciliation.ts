/**
 * Deterministic reimbursement reconciliation + evidence completeness engines
 * (spec §20, §17–§18).
 *
 * This module intentionally contains BOTH engines and is fully self-contained
 * (no relative imports) so the exact same file compiles in both the Phase 1
 * (`amazon/`) and Phase 2 (`evidence/`) trees. Importers use the function
 * that belongs to their side:
 *
 *   - amazon/engine.ts    → reconcileCandidate  (Phase 1 reconciliation)
 *   - evidence/actions.ts → checkCompleteness   (Phase 2 completeness)
 *
 * Core product rule (spec §2): a discrepancy is NOT automatically a claim.
 * The reconciliation step exists to distinguish already-reimbursed, partially
 * reimbursed, not reimbursed, and unknown cases; completeness lists exactly
 * which required evidence categories are missing. Everything is fully
 * deterministic and the AI is never involved.
 */

/* =========================================================================
 * Phase 1 — Reimbursement reconciliation (spec §20)
 * ========================================================================= */

export interface ReconciliationInput {
  candidate: {
    shipment_id?: string;
    sku?: string;
    asin?: string;
    fnsku?: string;
    quantity?: number;
    estimated_value?: number;
    trigger_date?: number;
  };
  /** Normalized REIMBURSEMENT events from the finances domain. */
  reimbursementEvents: Array<{
    event_type?: string;
    shipment_id?: string;
    sku?: string;
    asin?: string;
    fnsku?: string;
    amount?: number;
    quantity?: number;
    event_date: number;
    source: string;
    source_record_id: string;
    event_id: string;
    order_id?: string;
  }>;
  /** Whether the finances domain actually synced for this user. */
  financesAvailable: boolean;
}

export type ReimbursementStatusLiteral =
  | "NOT_REIMBURSED"
  | "ALREADY_REIMBURSED"
  | "PARTIALLY_REIMBURSED"
  | "UNKNOWN";

export interface ReimbursementMatchShape {
  source: string;
  source_record_id: string;
  event_id: string;
  sku?: string;
  shipment_id?: string;
  order_id?: string;
  amount: number;
  quantity?: number;
  posted_date: number;
  signal: string;
}

export interface ReconciliationResultShape {
  status: ReimbursementStatusLiteral;
  matched: ReimbursementMatchShape[];
  matchedAmount: number;
  matchedQuantity: number;
  confidence: "high" | "medium" | "low";
  note: string;
}

/**
 * A reimbursement posted within this window of the discrepancy trigger is
 * treated as plausibly related; anything older is not counted as a match
 * (avoids attaching stale, unrelated payouts for the same SKU).
 */
const MATCH_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

function matchingSignals(
  candidate: ReconciliationInput["candidate"],
  event: ReconciliationInput["reimbursementEvents"][number],
): string[] {
  const signals: string[] = [];
  if (candidate.shipment_id && event.shipment_id === candidate.shipment_id) {
    signals.push("shipment_id");
  }
  if (candidate.sku && event.sku === candidate.sku) {
    signals.push("sku");
  }
  if (candidate.asin && event.asin === candidate.asin) {
    signals.push("asin");
  }
  if (candidate.fnsku && event.fnsku === candidate.fnsku) {
    signals.push("fnsku");
  }
  return signals;
}

function withinWindow(
  candidate: ReconciliationInput["candidate"],
  event: ReconciliationInput["reimbursementEvents"][number],
): boolean {
  if (candidate.trigger_date == null) return true;
  const delta = Math.abs(event.event_date - candidate.trigger_date);
  return delta <= MATCH_WINDOW_MS;
}

/**
 * Reconcile a candidate against the seller's reimbursement events.
 *
 * A reimbursement counts as a match when it shares at least one identifier
 * with the candidate. A shipment_id match is decisive on its own; weaker
 * product-level identifiers (SKU/ASIN/FNSKU) also require the event to fall
 * inside the match window.
 */
export function reconcileCandidate({
  candidate,
  reimbursementEvents,
  financesAvailable,
}: ReconciliationInput): ReconciliationResultShape {
  // No financial data synced → we cannot claim "not reimbursed". Never guess.
  if (!financesAvailable) {
    return {
      status: "UNKNOWN",
      matched: [],
      matchedAmount: 0,
      matchedQuantity: 0,
      confidence: "low",
      note: "Financial records are not synced yet — reimbursement status could not be confirmed.",
    };
  }

  const matched: ReimbursementMatchShape[] = [];
  for (const event of reimbursementEvents) {
    if (event.event_type !== "REIMBURSEMENT") continue;
    const signals = matchingSignals(candidate, event);
    if (signals.length === 0) continue;

    const decisive = signals.includes("shipment_id");
    if (!decisive && !withinWindow(candidate, event)) continue;

    matched.push({
      source: event.source,
      source_record_id: event.source_record_id,
      event_id: event.event_id,
      sku: event.sku,
      shipment_id: event.shipment_id,
      order_id: event.order_id,
      amount: event.amount ?? 0,
      quantity: event.quantity,
      posted_date: event.event_date,
      signal: signals.join("+"),
    });
  }

  const matchedAmount = matched.reduce((sum, m) => sum + m.amount, 0);
  const matchedQuantity = matched.reduce((sum, m) => sum + (m.quantity ?? 0), 0);

  let status: ReimbursementStatusLiteral;
  let confidence: ReconciliationResultShape["confidence"];
  let note: string;

  if (matched.length === 0) {
    status = "NOT_REIMBURSED";
    confidence = "high";
    note = "No matching reimbursement found in the financial records.";
  } else {
    const expectedQuantity = candidate.quantity ?? 0;
    const expectedValue = candidate.estimated_value ?? 0;

    if (expectedQuantity > 0 && matchedQuantity > 0) {
      if (matchedQuantity >= expectedQuantity) {
        status = "ALREADY_REIMBURSED";
        confidence = "high";
        note = `Reimbursement of ${matchedQuantity}/${expectedQuantity} units covers the full discrepancy.`;
      } else {
        status = "PARTIALLY_REIMBURSED";
        confidence = "high";
        note = `Partial reimbursement of ${matchedQuantity}/${expectedQuantity} units (${formatMoney(matchedAmount)}).`;
      }
    } else if (expectedValue > 0 && matchedAmount > 0) {
      if (matchedAmount >= expectedValue) {
        status = "ALREADY_REIMBURSED";
        confidence = "medium";
        note = `Reimbursement of ${formatMoney(matchedAmount)} covers the estimated value of ${formatMoney(expectedValue)}.`;
      } else {
        status = "PARTIALLY_REIMBURSED";
        confidence = "medium";
        note = `Partial reimbursement of ${formatMoney(matchedAmount)} found; ${formatMoney(expectedValue - matchedAmount)} remains outstanding.`;
      }
    } else {
      // A reimbursement record exists but cannot be sized against the case.
      status = "UNKNOWN";
      confidence = "low";
      note = "A reimbursement record was found, but its coverage could not be confirmed from the available data.";
    }
  }

  return { status, matched, matchedAmount, matchedQuantity, confidence, note };
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/* =========================================================================
 * Phase 2 — Evidence completeness (spec §17–§18)
 * ========================================================================= */

export type CompletenessStatusLiteral = "COMPLETE" | "INCOMPLETE" | "UNKNOWN";

export interface RequiredEvidenceCategoryShape {
  id: string;
  label: string;
  description: string;
  satisfied: boolean;
  evidenceRefs: string[];
}

export interface CompletenessResultShape {
  status: CompletenessStatusLiteral;
  required: RequiredEvidenceCategoryShape[];
  missing: RequiredEvidenceCategoryShape[];
  ranAt: number;
}

export interface CompletenessInput {
  candidate: { candidate_type: string };
  items: Array<{
    evidenceKey: string;
    evidence_type: string;
    title?: string;
  }>;
  now?: number;
}

/** Evidence type constants (mirrors evidence/types.ts). */
const EVIDENCE_TYPE_VALUES = {
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

type CategoryRule = {
  id: string;
  label: string;
  description: string;
  matches: (item: CompletenessInput["items"][number]) => boolean;
};

function typeIs(...types: string[]): (item: CompletenessInput["items"][number]) => boolean {
  const set = new Set(types);
  return (item) => set.has(item.evidence_type);
}

function titleIncludes(text: string): (item: CompletenessInput["items"][number]) => boolean {
  const needle = text.toLowerCase();
  return (item) => (item.title ?? "").toLowerCase().includes(needle);
}

/** Required categories for each supported claim type (spec §17). */
const REQUIRED_BY_TYPE: Record<string, CategoryRule[]> = {
  FBA_RECEIVING_DISCREPANCY: [
    {
      id: "shipment_record",
      label: "Shipment record",
      description: "Original shipment manifest from Amazon inbound records",
      matches: typeIs(EVIDENCE_TYPE_VALUES.SHIPMENT_RECORD),
    },
    {
      id: "discrepancy_record",
      label: "Discrepancy record",
      description: "The receiving / loss / damage record proving the shortage",
      matches: typeIs(EVIDENCE_TYPE_VALUES.INBOUND_EVENT),
    },
    {
      id: "adjustment_evidence",
      label: "Inventory adjustment",
      description: "An inventory adjustment confirming the missing units",
      matches: typeIs(EVIDENCE_TYPE_VALUES.ADJUSTMENT_EVENT),
    },
    {
      id: "financial_review",
      label: "Financial review",
      description: "Financial records confirming the reimbursement status",
      matches: (item) =>
        item.evidence_type === EVIDENCE_TYPE_VALUES.FINANCIAL_TRANSACTION ||
        (item.evidence_type === EVIDENCE_TYPE_VALUES.SYSTEM_RECORD &&
          titleIncludes("reimbursement reconciliation")(item)),
    },
    {
      id: "recovery_calculation",
      label: "Recovery calculation",
      description: "Reproducible recovery calculation for the missing units",
      matches: typeIs(EVIDENCE_TYPE_VALUES.CALCULATION),
    },
    {
      id: "policy_deadline",
      label: "Claim policy & deadline",
      description: "Applicable claim policy and submission deadline",
      matches: (item) =>
        item.evidence_type === EVIDENCE_TYPE_VALUES.SYSTEM_RECORD &&
        titleIncludes("policy")(item),
    },
  ],
  FBA_LOSS: [
    {
      id: "shipment_record",
      label: "Shipment record",
      description: "Original shipment manifest from Amazon inbound records",
      matches: typeIs(EVIDENCE_TYPE_VALUES.SHIPMENT_RECORD),
    },
    {
      id: "discrepancy_record",
      label: "Loss record",
      description: "The FBA loss record proving the shortage",
      matches: typeIs(EVIDENCE_TYPE_VALUES.INBOUND_EVENT),
    },
    {
      id: "adjustment_evidence",
      label: "Inventory adjustment",
      description: "An inventory adjustment confirming the lost units",
      matches: typeIs(EVIDENCE_TYPE_VALUES.ADJUSTMENT_EVENT),
    },
    {
      id: "financial_review",
      label: "Financial review",
      description: "Financial records confirming the reimbursement status",
      matches: (item) =>
        item.evidence_type === EVIDENCE_TYPE_VALUES.FINANCIAL_TRANSACTION ||
        (item.evidence_type === EVIDENCE_TYPE_VALUES.SYSTEM_RECORD &&
          titleIncludes("reimbursement reconciliation")(item)),
    },
    {
      id: "recovery_calculation",
      label: "Recovery calculation",
      description: "Reproducible recovery calculation for the lost units",
      matches: typeIs(EVIDENCE_TYPE_VALUES.CALCULATION),
    },
    {
      id: "policy_deadline",
      label: "Claim policy & deadline",
      description: "Applicable claim policy and submission deadline",
      matches: (item) =>
        item.evidence_type === EVIDENCE_TYPE_VALUES.SYSTEM_RECORD &&
        titleIncludes("policy")(item),
    },
  ],
  FBA_DAMAGE: [
    {
      id: "shipment_record",
      label: "Shipment record",
      description: "Original shipment manifest from Amazon inbound records",
      matches: typeIs(EVIDENCE_TYPE_VALUES.SHIPMENT_RECORD),
    },
    {
      id: "discrepancy_record",
      label: "Damage record",
      description: "The FBA damage record proving the damaged units",
      matches: typeIs(EVIDENCE_TYPE_VALUES.INBOUND_EVENT),
    },
    {
      id: "adjustment_evidence",
      label: "Inventory adjustment",
      description: "An inventory adjustment confirming the damaged units",
      matches: typeIs(EVIDENCE_TYPE_VALUES.ADJUSTMENT_EVENT),
    },
    {
      id: "financial_review",
      label: "Financial review",
      description: "Financial records confirming the reimbursement status",
      matches: (item) =>
        item.evidence_type === EVIDENCE_TYPE_VALUES.FINANCIAL_TRANSACTION ||
        (item.evidence_type === EVIDENCE_TYPE_VALUES.SYSTEM_RECORD &&
          titleIncludes("reimbursement reconciliation")(item)),
    },
    {
      id: "recovery_calculation",
      label: "Recovery calculation",
      description: "Reproducible recovery calculation for the damaged units",
      matches: typeIs(EVIDENCE_TYPE_VALUES.CALCULATION),
    },
    {
      id: "policy_deadline",
      label: "Claim policy & deadline",
      description: "Applicable claim policy and submission deadline",
      matches: (item) =>
        item.evidence_type === EVIDENCE_TYPE_VALUES.SYSTEM_RECORD &&
        titleIncludes("policy")(item),
    },
  ],
};

/**
 * Evaluate completeness for a case.
 *
 * - Supported claim type: every required category must be satisfied by the
 *   collected evidence → COMPLETE. Any missing category → INCOMPLETE, and the
 *   missing categories are listed explicitly (the decision engine and the
 *   package both read this).
 * - Unsupported case type: UNKNOWN — the engine never guesses.
 */
export function checkCompleteness({
  candidate,
  items,
  now = Date.now(),
}: CompletenessInput): CompletenessResultShape {
  const rules = REQUIRED_BY_TYPE[candidate.candidate_type];
  if (!rules) {
    return {
      status: "UNKNOWN",
      required: [],
      missing: [],
      ranAt: now,
    };
  }

  const required: RequiredEvidenceCategoryShape[] = rules.map((rule) => {
    const refs = items.filter(rule.matches).map((i) => i.evidenceKey);
    return {
      id: rule.id,
      label: rule.label,
      description: rule.description,
      satisfied: refs.length > 0,
      evidenceRefs: refs,
    };
  });

  const missing = required.filter((c) => !c.satisfied);

  return {
    status: missing.length === 0 ? "COMPLETE" : "INCOMPLETE",
    required,
    missing,
    ranAt: now,
  };
}
