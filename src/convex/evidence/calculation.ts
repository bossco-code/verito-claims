/**
 * Deterministic recovery calculation (spec §16).
 *
 * The estimated recovery is computed by application logic, never by an AI
 * model:  units_missing × unit_value. The unit value comes from the Phase 1
 * candidate estimate (landed cost), falling back to a passed-in unit price.
 * The calculation is fully reproducible and stored as a CALCULATION
 * EvidenceItem.
 */

import type { CalculationEvidence, EvidenceCandidate } from "./types";
import { hashString } from "./types";

export interface CalculationInput {
  candidate: EvidenceCandidate;
  unitValue?: number;
}

/**
 * Compute the deterministic recovery calculation for a candidate.
 *
 * - unitsMissing: candidate.quantity (the discrepancy size)
 * - unitValue: passed-in price, else estimate / quantity (Phase 1 landed cost)
 * - result: unitsMissing × unitValue
 *
 * When the unit value cannot be derived, result is 0 and `reproducible` is
 * false — the UI must show the calculation as missing, never fabricate a number.
 */
export function buildCalculation({
  candidate,
  unitValue,
}: CalculationInput): CalculationEvidence {
  const unitsMissing = candidate.quantity ?? 0;

  let derivedUnitValue = 0;
  if (unitValue !== undefined && unitValue > 0) {
    derivedUnitValue = unitValue;
  } else if (candidate.estimated_value != null && unitsMissing > 0) {
    derivedUnitValue = candidate.estimated_value / unitsMissing;
  }

  const result = unitsMissing > 0 ? unitsMissing * derivedUnitValue : 0;
  const currency = candidate.currency ?? "USD";
  const reproducible = unitsMissing > 0 && derivedUnitValue > 0;

  const sourceRefs = [
    ...(candidate.shipment_id ? [`shipment:${candidate.shipment_id}`] : []),
    ...(candidate.sku ? [`sku:${candidate.sku}`] : []),
  ];

  return {
    evidenceKey: `calc:${candidate.candidateKey}`,
    unitsMissing,
    unitValue: derivedUnitValue,
    formula: reproducible
      ? `${unitsMissing} × ${derivedUnitValue.toFixed(2)}`
      : "units_missing × unit_value (unit value unavailable)",
    result,
    currency,
    sourceRefs,
    reproducible,
  };
}

/** Deterministic claim-case number from a claimId, e.g. "CLM-2026-0001" → "EV-2026-0001". */
export function caseNumberFromClaimId(claimId: string): string {
  return claimId.replace(/^CLM/i, "EV");
}

/** Deterministic package id for a case/version, e.g. "PKG-2026-0001-v1". */
export function packageIdFor(caseNumber: string, version: number): string {
  return `${caseNumber.replace(/^EV/i, "PKG")}-v${version}`;
}

/** Stable evidenceNo, "E-001" style, from an index. */
export function evidenceNoFor(index: number): string {
  return `E-${String(index + 1).padStart(3, "0")}`;
}

/** Deterministic package fingerprint over a canonical snapshot string. */
export function packageFingerprint(canonical: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < canonical.length; i++) {
    h1 = ((h1 << 5) + h1 + canonical.charCodeAt(i)) >>> 0;
    h2 = ((h2 << 5) + h2 + i * 7) >>> 0;
  }
  const p1 = h1.toString(16).padStart(8, "0");
  const p2 = h2.toString(16).padStart(8, "0");
  return (p1 + p2).repeat(4).slice(0, 64);
}

/** Export hashString for callers that build stable keys. */
export { hashString };
