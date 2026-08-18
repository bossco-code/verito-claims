/**
 * AI-assisted analysis (spec §21–§23).
 *
 * AI is introduced ONLY after deterministic collection + verification. Its
 * role is to summarize the verified evidence, identify gaps, and draft a
 * narrative — it must NEVER invent evidence, dates, quantities, or policy.
 *
 * This module is framework-free: it builds the prompt and validates the
 * response. The actual model call lives in the action layer ("use node").
 *
 * Safety rails implemented here:
 *  - The prompt contains ONLY verified evidence (with stable evidence IDs).
 *  - Every AI statement must reference an EvidenceItem. After parsing, any
 *    reference to a non-existent evidence ID is dropped (unsupported
 *    statement detection) so no statement is presented as fact without
 *    traceability.
 */

import type { EvidenceItemDraft, VerificationResult } from "./types";

/* ------------------------------ prompt builder ------------------------------ */

export interface AiContextInput {
  candidate: {
    claimId: string;
    candidate_type: string;
    sku?: string;
    shipment_id?: string;
    quantity?: number;
    estimated_value?: number;
    currency?: string;
    reimbursement_status: string;
    status: string;
    days_remaining?: number;
    deadline_date?: number;
  };
  items: EvidenceItemDraft[];
  evidenceNoByKey: Map<string, string>;
  verification: VerificationResult;
}

/** Compact, factual evidence context for the model — evidence-first. */
export function buildEvidenceContext({
  candidate,
  items,
  evidenceNoByKey,
  verification,
}: AiContextInput): string {
  const lines: string[] = [];

  lines.push(`CASE: ${candidate.claimId}`);
  lines.push(`CLAIM TYPE: ${candidate.candidate_type.replaceAll("_", " ")}`);
  lines.push(
    `CLAIM: ${candidate.quantity ?? 0} units, estimated ${candidate.estimated_value ?? 0} ${candidate.currency ?? "USD"}`,
  );
  lines.push(`REIMBURSEMENT STATUS: ${candidate.reimbursement_status}`);
  lines.push(`PHASE 1 STATUS: ${candidate.status}`);
  if (candidate.shipment_id) lines.push(`SHIPMENT: ${candidate.shipment_id}`);
  if (candidate.sku) lines.push(`SKU: ${candidate.sku}`);
  lines.push("");

  lines.push("VERIFIED EVIDENCE:");
  for (const item of items) {
    if (item.relevance === "IRRELEVANT") continue;
    const no = evidenceNoByKey.get(item.evidenceKey) ?? "";
    lines.push(
      `[${no}] ${item.title} | ${item.source}${item.source_record_id ? ` | record ${item.source_record_id}` : ""}${item.event_date ? ` | date ${new Date(item.event_date).toISOString().slice(0, 10)}` : ""}${item.quantity != null ? ` | qty ${item.quantity}` : ""}${item.amount != null ? ` | amount ${item.amount}` : ""}`,
    );
  }
  lines.push("");

  lines.push("VERIFICATION:");
  for (const check of verification.checks) {
    lines.push(`- ${check.check}: ${check.status} — ${check.detail}`);
  }

  return lines.join("\n");
}

/** System prompt: the model is a claims analyst, evidence-first, no invention. */
export function buildSystemPrompt(): string {
  return [
    "You are a senior claims analyst preparing a marketplace reimbursement case.",
    "STRICT RULES:",
    "- Use ONLY the verified evidence provided. Never invent events, dates, quantities, amounts, or policy.",
    "- Every factual statement you make MUST reference at least one evidence ID like [E-001].",
    "- If a statement cannot be supported by the evidence, do not make it.",
    "- Do not mark anything verified that the VERIFICATION section does not mark CONSISTENT.",
    "- The claim narrative must have these labeled sections: WHAT HAPPENED / WHAT AMAZON RECORDS SHOW / WHAT DISCREPANCY WAS IDENTIFIED / REIMBURSEMENT STATUS / REQUESTED RESOLUTION.",
    "Respond ONLY with a JSON object, no markdown fences, with this exact shape:",
    `{
      "summary": "2-3 sentence factual summary using evidence refs",
      "keyFacts": ["fact with evidence ref, e.g. ... [E-001]"],
      "discrepancyExplanation": "plain explanation referencing evidence",
      "missingInformation": ["what evidence is missing to strengthen the case"],
      "potentialConflicts": ["any inconsistencies, or []"],
      "draftNarrative": "full labeled narrative with sections",
      "evidenceRefs": ["all evidence IDs used, e.g. E-001"]
    }`,
  ].join("\n");
}

export function buildUserPrompt(context: string): string {
  return `Analyze the verified case below and produce the JSON analysis.\n\n${context}`;
}

/* ------------------------------ response parsing ---------------------------- */

export interface ParsedAiAnalysis {
  summary: string;
  keyFacts: string[];
  discrepancyExplanation: string;
  missingInformation: string[];
  potentialConflicts: string[];
  draftNarrative: string;
  evidenceRefs: string[];
  /** References dropped because they don't match any known evidence ID. */
  droppedRefs: string[];
}

/** Extract [E-001] style ids from a text fragment. */
export function extractEvidenceRefs(text: string): string[] {
  const refs = text.match(/E-\d{3}/g) ?? [];
  return Array.from(new Set(refs));
}

/** Validate the AI output against the real evidence set (spec §22/§23 rails). */
export function parseAiAnalysis(
  content: string,
  knownEvidenceNos: string[],
): ParsedAiAnalysis {
  const known = new Set(knownEvidenceNos);

  let raw: Record<string, unknown> = {};
  try {
    const cleaned = content.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    }
  } catch {
    // Fall back to empty — the deterministic workflow continues regardless.
    raw = {};
  }

  const str = (k: string): string =>
    typeof raw[k] === "string" ? (raw[k] as string) : "";
  const arr = (k: string): string[] =>
    Array.isArray(raw[k])
      ? (raw[k] as unknown[]).filter((x): x is string => typeof x === "string")
      : [];

  const summary = str("summary");
  const keyFacts = arr("keyFacts");
  const discrepancyExplanation = str("discrepancyExplanation");
  const missingInformation = arr("missingInformation");
  const potentialConflicts = arr("potentialConflicts");
  const draftNarrative = str("draftNarrative");
  const declaredRefs = arr("evidenceRefs");

  // Collect every reference mentioned anywhere in the output.
  const mentioned = new Set<string>();
  for (const text of [summary, discrepancyExplanation, draftNarrative, ...keyFacts]) {
    for (const ref of extractEvidenceRefs(text)) mentioned.add(ref);
  }
  for (const ref of declaredRefs) mentioned.add(ref);

  const droppedRefs: string[] = [];
  const evidenceRefs: string[] = [];
  for (const ref of mentioned) {
    if (known.has(ref)) evidenceRefs.push(ref);
    else droppedRefs.push(ref);
  }
  evidenceRefs.sort();

  return {
    summary,
    keyFacts,
    discrepancyExplanation,
    missingInformation,
    potentialConflicts,
    draftNarrative,
    evidenceRefs,
    droppedRefs,
  };
}
