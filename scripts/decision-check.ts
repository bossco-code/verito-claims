/**
 * Standalone contract check for the Phase 2 decision engine — mirrors
 * tests/evidence/evidence.test.ts ("computeCaseDecision (spec §20, §28)")
 * without Vitest, so it runs inside the Freebuff WebContainer.
 *
 * Run:
 *   npx tsc scripts/decision-check.ts --outDir /tmp/seo-check --module commonjs \
 *     --target es2022 --moduleResolution node --skipLibCheck --esModuleInterop \
 *     --types node && node /tmp/seo-check/scripts/decision-check.js
 */
import {
  caseStatusForDecision,
  computeCaseDecision,
} from "../src/convex/evidence/decision";
import { CASE_DECISION, CASE_STATUS } from "../src/convex/evidence/types";
import type {
  CompletenessResult,
  EvidenceCandidate,
  VerificationResult,
} from "../src/convex/evidence/types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) {
    failures += 1;
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

const baseCandidate: EvidenceCandidate = {
  candidateKey: "cand:ATVPDKIKX0DER:FBA_RECEIVING_DISCREPANCY:SHIP-2026-0001",
  claimId: "CLM-2026-0001",
  candidate_type: "FBA_RECEIVING_DISCREPANCY",
  marketplace_id: "ATVPDKIKX0DER",
  sku: "SKU-100",
  asin: "B0TEST123",
  shipment_id: "SHIP-2026-0001",
  quantity: 18,
  estimated_value: 415.98,
  currency: "USD",
  trigger_event_id: "evt-rec-1",
  detected_at: Date.now(),
  reimbursement_status: "NOT_REIMBURSED",
  status: "ELIGIBLE",
  priority: "HIGH",
  data_completeness: 0.9,
};

const okVerification: VerificationResult = { checks: [], conflicts: [], ranAt: Date.now() };
const okCompleteness: CompletenessResult = {
  status: "COMPLETE",
  required: [],
  missing: [],
  ranAt: Date.now(),
};

const allPass = {
  candidate: baseCandidate,
  verification: okVerification,
  completeness: okCompleteness,
};

// 1. READY_FOR_REVIEW when all gates pass (no seller approval).
check("ready when gates pass", computeCaseDecision(allPass).decision, CASE_DECISION.READY_FOR_REVIEW);
check(
  "status mapping READY_FOR_REVIEW",
  caseStatusForDecision(computeCaseDecision(allPass).decision),
  "READY_FOR_REVIEW",
);

// 2. SELLER_APPROVED only after explicit approval.
check(
  "sellerApproved:false stays READY_FOR_REVIEW",
  computeCaseDecision({ ...allPass, sellerApproved: false }).decision,
  CASE_DECISION.READY_FOR_REVIEW,
);
check(
  "sellerApproved:true -> SELLER_APPROVED",
  computeCaseDecision({ ...allPass, sellerApproved: true }).decision,
  CASE_DECISION.SELLER_APPROVED,
);

// 3. Never proceeds when Phase 1 says the opportunity is not actionable.
check(
  "EXPIRED candidate -> NOT_READY",
  computeCaseDecision({
    ...allPass,
    candidate: { ...baseCandidate, status: "EXPIRED" },
    sellerApproved: true,
  }).decision,
  CASE_DECISION.NOT_READY,
);

// 4. Never proceeds when Amazon already reimbursed.
check(
  "ALREADY_REIMBURSED -> NOT_READY",
  computeCaseDecision({
    ...allPass,
    candidate: { ...baseCandidate, status: "ALREADY_REIMBURSED", reimbursement_status: "ALREADY_REIMBURSED" },
    sellerApproved: true,
  }).decision,
  CASE_DECISION.NOT_READY,
);

// 5. EVIDENCE_CONFLICT when verification found a conflict.
check(
  "conflict -> EVIDENCE_CONFLICT",
  computeCaseDecision({
    ...allPass,
    verification: {
      checks: [],
      conflicts: [{ check: "reimbursement", detail: "Payout record contradicts NOT_REIMBURSED", evidenceRefs: [] }],
      ranAt: Date.now(),
    } satisfies VerificationResult,
    sellerApproved: true,
  }).decision,
  CASE_DECISION.EVIDENCE_CONFLICT,
);

// 6. EVIDENCE_INCOMPLETE when required evidence is missing.
check(
  "incomplete -> EVIDENCE_INCOMPLETE",
  computeCaseDecision({
    ...allPass,
    completeness: {
      status: "INCOMPLETE",
      required: [],
      missing: [{ id: "adjustment_evidence", label: "Adjustment evidence", description: "", satisfied: false, evidenceRefs: [] }],
      ranAt: Date.now(),
    } satisfies CompletenessResult,
    sellerApproved: true,
  }).decision,
  CASE_DECISION.EVIDENCE_INCOMPLETE,
);

// 7. Remaining status mappings.
check("NOT_READY -> OPEN", caseStatusForDecision(CASE_DECISION.NOT_READY), CASE_STATUS.OPEN);
check("EVIDENCE_INCOMPLETE -> EVIDENCE_INCOMPLETE", caseStatusForDecision(CASE_DECISION.EVIDENCE_INCOMPLETE), CASE_STATUS.EVIDENCE_INCOMPLETE);
check("EVIDENCE_CONFLICT -> EVIDENCE_CONFLICT", caseStatusForDecision(CASE_DECISION.EVIDENCE_CONFLICT), CASE_STATUS.EVIDENCE_CONFLICT);
check("SELLER_APPROVED -> APPROVED_BY_SELLER", caseStatusForDecision(CASE_DECISION.SELLER_APPROVED), CASE_STATUS.APPROVED_BY_SELLER);
check("PACKAGE_READY -> PACKAGE_GENERATED", caseStatusForDecision(CASE_DECISION.PACKAGE_READY), CASE_STATUS.PACKAGE_GENERATED);

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll decision-engine contract checks passed.");
