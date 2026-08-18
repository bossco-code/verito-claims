import type { CaseDetail } from "@/convex/evidence/queries";

/**
 * Phase 2 — Claim Evidence Package PDF generator.
 *
 * The structured EvidenceCase (evidence graph + deterministic verification +
 * AI analysis + decision) is the real product; this document is ONE output of
 * it (spec §29–§33). It is styled like an enterprise audit / insurance claim
 * dossier — white, black & dark-gray, minimal green reserved for verification
 * status, no cards, no gradients, no web-app styling.
 *
 *  - Stable Evidence IDs (E-001 …) trace every claim statement to a source
 *    record (spec §30).
 *  - FACTS, CALCULATIONS, SOURCE REFERENCES and AI-GENERATED TEXT are clearly
 *    distinguished (spec §27).
 *  - The AI narrative is explicitly labeled
 *    "AI-GENERATED DRAFT — SELLER REVIEW REQUIRED" (spec §23, §29).
 *  - The VERITO PACKAGE FINGERPRINT detects post-creation changes; it is
 *    never presented as proof that Amazon verified anything (spec §33).
 */

export const PHASE2_PACKAGE_VERSION = "2.0";
export const DOCUMENT_CLASSIFICATION = "CONFIDENTIAL";

/* ------------------------------- formatting ------------------------------- */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtUSD(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
    }).format(n);
  } catch {
    return usd.format(n);
  }
}

function fmtDate(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function labelCaseType(t: string): string {
  return t.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------------------------------- styles --------------------------------- */

const STYLES = `
  @page {
    size: A4;
    margin: 17mm 15mm 20mm 15mm;
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      font-family: "Courier New", Courier, monospace;
      font-size: 7.5pt;
      color: #8A8A8A;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.5;
    color: #141414;
    background: #FFFFFF;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .mono { font-family: "Courier New", Courier, monospace; }
  .pagefoot {
    position: fixed;
    bottom: 0; left: 15mm; right: 15mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8mm;
    padding: 4pt 0 0;
    border-top: 0.6pt solid #C9C9C9;
    font-family: "Courier New", Courier, monospace;
    font-size: 6.8pt;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #8A8A8A;
  }
  .sheet { max-width: 178mm; margin: 0 auto; }
  h1, h2, h3, p { margin: 0; }

  /* cover */
  .cover { height: 257mm; display: flex; flex-direction: column; break-after: page; }
  .cover-mid {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding-bottom: 26mm;
  }
  .cover h1 {
    margin-top: 9mm;
    font-size: 27pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #101010;
  }
  .cover-sub {
    margin-top: 3mm;
    font-family: "Courier New", Courier, monospace;
    font-size: 10.5pt;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #555555;
  }
  .cover-rule { width: 62mm; height: 1pt; background: #101010; margin: 12mm auto 10mm; }
  .cover-meta { width: 100%; border-collapse: collapse; margin-top: 4mm; }
  .cover-meta td { padding: 3.4pt 0; border-bottom: 0.5pt solid #DDDDDD; font-size: 8.6pt; vertical-align: baseline; }
  .cover-meta td.k {
    width: 42%; text-align: right; padding-right: 6mm;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.6pt; letter-spacing: 0.14em; text-transform: uppercase; color: #8A8A8A;
  }
  .cover-meta td.v { width: 58%; text-align: left; font-weight: 600; color: #141414; }
  .classify {
    display: inline-block;
    margin-top: 10mm;
    padding: 3.4pt 12pt;
    border: 1.2pt solid #101010;
    font-family: "Courier New", Courier, monospace;
    font-size: 8.6pt; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase;
    color: #101010;
  }
  .cover-foot {
    padding: 0 0 14mm;
    text-align: center;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.6pt; letter-spacing: 0.14em; text-transform: uppercase; color: #8A8A8A;
  }
  .cover-foot span { margin: 0 4mm; }

  .logo { display: inline-flex; align-items: center; gap: 3.4mm; }
  .logo-mark {
    width: 11mm; height: 11mm;
    border: 1.6pt solid #101010;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 14pt; font-weight: 700; color: #101010;
  }
  .logo-name { text-align: left; line-height: 1.15; }
  .logo-name b { font-size: 12.5pt; font-weight: 700; letter-spacing: 0.02em; color: #101010; }
  .logo-name span {
    display: block;
    font-family: "Courier New", Courier, monospace;
    font-size: 6.4pt; letter-spacing: 0.24em; text-transform: uppercase; color: #8A8A8A;
  }

  .page { break-before: page; }
  .pagehead {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm;
    padding-bottom: 3.6mm; border-bottom: 1.4pt solid #101010; margin-bottom: 6mm;
  }
  .pagehead .docname {
    font-family: "Courier New", Courier, monospace;
    font-size: 8pt; letter-spacing: 0.22em; text-transform: uppercase;
    color: #101010; font-weight: 700;
  }
  .pagehead .docmeta {
    text-align: right;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.2pt; letter-spacing: 0.04em; color: #555555; line-height: 1.55;
  }

  .exec-head { margin-top: 2mm; margin-bottom: 6mm; }
  .exec-head h1 { font-size: 17pt; font-weight: 700; letter-spacing: 0.02em; color: #101010; }
  .exec-head .sub {
    margin-top: 1.6mm;
    font-family: "Courier New", Courier, monospace;
    font-size: 8pt; letter-spacing: 0.18em; text-transform: uppercase; color: #777777;
  }

  .factgrid { width: 100%; border-collapse: collapse; margin: 4mm 0 6mm; }
  .factgrid td { padding: 3.6pt 0; border-bottom: 0.5pt solid #E2E2E2; font-size: 9pt; }
  .factgrid td.k {
    width: 38%;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.4pt; letter-spacing: 0.12em; text-transform: uppercase; color: #777777;
  }
  .factgrid td.v { font-weight: 600; color: #141414; }

  .recommend-row {
    display: flex; justify-content: space-between; align-items: center; gap: 6mm;
    padding: 4mm 0; border-top: 1.4pt solid #101010; border-bottom: 1.4pt solid #101010;
    margin-bottom: 6mm;
  }
  .badge-ok {
    display: inline-block; padding: 4pt 10pt;
    border: 1.4pt solid #1E7A4F; color: #1E7A4F;
    font-family: "Courier New", Courier, monospace;
    font-size: 9.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  }
  .badge-warn {
    display: inline-block; padding: 4pt 10pt;
    border: 1.4pt solid #B3261E; color: #B3261E;
    font-family: "Courier New", Courier, monospace;
    font-size: 9.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  }

  .sec { margin-bottom: 7.5mm; }
  .sechead {
    display: flex; align-items: baseline; gap: 3mm;
    padding-bottom: 2.2mm; border-bottom: 0.8pt solid #101010; margin-bottom: 4mm;
  }
  .secno {
    font-family: "Courier New", Courier, monospace;
    font-size: 8pt; font-weight: 700; letter-spacing: 0.1em; color: #101010;
  }
  .sectitle {
    font-size: 11pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #101010;
  }
  .secbody { font-size: 9.4pt; color: #222222; }
  .secbody p { margin: 0 0 3mm; line-height: 1.65; }

  table.tbl { width: 100%; border-collapse: collapse; }
  table.tbl th {
    text-align: left; padding: 3.4pt 4pt; border-bottom: 0.9pt solid #101010;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.2pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #555555;
  }
  table.tbl td { padding: 3.6pt 4pt; border-bottom: 0.5pt solid #E2E2E2; font-size: 9pt; vertical-align: top; }
  table.tbl tr:last-child td { border-bottom: 0; }
  table.tbl td.num, table.tbl th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .ok { color: #1E7A4F; font-weight: 600; white-space: nowrap; }
  .bad { color: #B3261E; font-weight: 600; white-space: nowrap; }
  .muted { color: #666666; }
  .small { font-size: 7.8pt; }
  .mono-v { font-family: "Courier New", Courier, monospace; font-size: 8.6pt; }

  .tl { margin: 1mm 0 0 2mm; }
  .tl-item { position: relative; padding: 0 0 5mm 10mm; border-left: 0.9pt solid #C9C9C9; margin-left: 3.2mm; }
  .tl-item:last-child { border-left-color: transparent; }
  .tl-item::before {
    content: ""; position: absolute; left: -2.1mm; top: 1mm; width: 3.2mm; height: 0.9pt; background: #101010;
  }
  .tl-when { font-family: "Courier New", Courier, monospace; font-size: 7.6pt; color: #555555; letter-spacing: 0.04em; }
  .tl-title { font-weight: 700; font-size: 9.4pt; color: #101010; }
  .tl-detail { font-size: 8.8pt; color: #333333; margin-top: 0.8mm; }
  .tl-source {
    margin-top: 1mm;
    font-family: "Courier New", Courier, monospace;
    font-size: 6.8pt; letter-spacing: 0.06em; text-transform: uppercase; color: #8A8A8A;
  }

  .finding { display: flex; gap: 3mm; padding: 2.6mm 0; border-bottom: 0.5pt solid #E2E2E2; font-size: 9.2pt; line-height: 1.55; }
  .finding:last-child { border-bottom: 0; }
  .finding .fno { flex: 0 0 auto; font-family: "Courier New", Courier, monospace; font-size: 8pt; font-weight: 700; color: #101010; padding-top: 0.4mm; }

  .ai-block {
    border: 1pt solid #101010;
    padding: 5mm;
    margin-top: 3mm;
  }
  .ai-label {
    display: inline-block;
    padding: 2.2pt 6pt;
    background: #101010;
    color: #FFFFFF;
    font-family: "Courier New", Courier, monospace;
    font-size: 7pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  }
  .ai-block .ai-body { margin-top: 4mm; font-size: 9pt; line-height: 1.7; color: #222222; }
  .ai-block .ai-body .h { font-weight: 700; display: block; margin-top: 3mm; letter-spacing: 0.06em; text-transform: uppercase; font-size: 7.8pt; color: #444444; }
  .ai-block .ai-body ul { margin: 1.5mm 0 0 5mm; padding: 0; }
  .ai-block .ai-body li { margin-bottom: 1.6mm; }

  .fingerprint { font-family: "Courier New", Courier, monospace; font-size: 7.8pt; letter-spacing: 0.05em; word-break: break-all; color: #141414; }
  .note { font-size: 7.6pt; color: #666666; line-height: 1.6; }
  .eid { font-family: "Courier New", Courier, monospace; font-weight: 700; font-size: 8.6pt; color: #101010; white-space: nowrap; }
`;

/* ------------------------------ document shell ----------------------------- */

interface PackageFacts {
  caseNumber: string;
  case_type: string;
  status: string;
  decision: string;
  estimatedRecovery: number | null | undefined;
  currency?: string | null;
  generatedAt: string;
  version: string;
  fingerprint: string;
}

function documentShell(title: string, body: string, facts: PackageFacts): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — ${esc(facts.caseNumber)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="sheet">
${body}
</div>
<div class="pagefoot">
  <span>Generated by Verito · Powered by VTPlatform</span>
  <span>${esc(facts.caseNumber)} · v${esc(facts.version)} · ${esc(facts.generatedAt)}</span>
  <span>Fingerprint ${facts.fingerprint ? facts.fingerprint.slice(0, 14) : "—"}</span>
</div>
</body>
</html>`;
}

function pageHead(facts: PackageFacts): string {
  return `
  <div class="pagehead">
    <div>
      <div class="logo">
        <span class="logo-mark">V</span>
        <span class="logo-name"><b>Verito</b><span>Claims · Prepared</span></span>
      </div>
      <div class="docname" style="margin-top:3.4mm">Claim Evidence Package</div>
    </div>
    <div class="docmeta">
      Case ${esc(facts.caseNumber)}<br />
      Package v${esc(facts.version)}<br />
      ${DOCUMENT_CLASSIFICATION}
    </div>
  </div>`;
}

/* -------------------------------- cover page ------------------------------- */

function renderCover(facts: PackageFacts, detail: CaseDetail): string {
  return `
  <div class="cover">
    <div class="cover-mid">
      <div class="logo" style="justify-content:center">
        <span class="logo-mark">V</span>
        <span class="logo-name"><b>Verito</b><span>Claims · Prepared</span></span>
      </div>
      <h1>Claim Evidence Package</h1>
      <div class="cover-sub">Prepared automatically by Verito</div>
      <div class="cover-rule"></div>
      <table class="cover-meta">
        <tr><td class="k">Case ID</td><td class="v">${esc(facts.caseNumber)}</td></tr>
        <tr><td class="k">Claim Type</td><td class="v">${esc(labelCaseType(facts.case_type))}</td></tr>
        <tr><td class="k">Marketplace</td><td class="v">Amazon — Seller Central</td></tr>
        <tr><td class="k">Generated Date</td><td class="v">${esc(facts.generatedAt)}</td></tr>
        <tr><td class="k">Potential Recovery</td><td class="v">${fmtUSD(facts.estimatedRecovery, facts.currency)}</td></tr>
        <tr><td class="k">Status</td><td class="v">${esc(facts.status.replaceAll("_", " "))}</td></tr>
        <tr><td class="k">Package Version</td><td class="v">v${esc(facts.version)}</td></tr>
        <tr><td class="k">Document Classification</td><td class="v">${DOCUMENT_CLASSIFICATION}</td></tr>
      </table>
      <div class="classify">${DOCUMENT_CLASSIFICATION}</div>
    </div>
    <div class="cover-foot">
      <span>Generated by Verito</span>
      <span>·</span>
      <span>Powered by VTPlatform</span>
      <span>·</span>
      <span>Fingerprint ${facts.fingerprint ? facts.fingerprint.slice(0, 16) : "—"}</span>
    </div>
  </div>`;
}

/* ----------------------------- executive summary --------------------------- */

function decisionBadge(status: string): { text: string; warn: boolean } {
  const s = status.toUpperCase();
  if (s.includes("READY") || s.includes("APPROVED") || s.includes("SUBMISSION")) {
    return { text: "READY FOR SUBMISSION", warn: false };
  }
  if (s.includes("CONFLICT")) return { text: "EVIDENCE CONFLICT", warn: true };
  if (s.includes("INCOMPLETE")) return { text: "EVIDENCE INCOMPLETE", warn: true };
  if (s.includes("CLOSED")) return { text: "CLOSED — NOT ACTIONABLE", warn: true };
  return { text: "REVIEW REQUIRED", warn: true };
}

function renderExecutiveSummary(detail: CaseDetail, facts: PackageFacts): string {
  const c = detail.candidate;
  const rows: Array<[string, string]> = [
    ["Claim Type", labelCaseType(c.candidate_type)],
    ["SKU", c.sku ?? "—"],
    ["Shipment", c.shipment_id ?? "—"],
    ["Units Missing", c.quantity != null ? String(c.quantity) : "—"],
    ["Potential Recovery", fmtUSD(detail.estimated_recovery, detail.currency)],
    ["Reimbursement Status", c.reimbursement_status.replaceAll("_", " ")],
    ["Deadline", c.deadline_date ? fmtDate(c.deadline_date) : "—"],
  ];
  const badge = decisionBadge(detail.decision);

  const summaryText =
    detail.aiAnalysis?.summary && detail.aiAnalysis.status === "generated"
      ? detail.aiAnalysis.summary
      : `${labelCaseType(c.candidate_type)} case ${facts.caseNumber}: ${c.quantity ?? 0} units with an estimated value of ${fmtUSD(c.estimated_value, c.currency)}. Reimbursement status is ${c.reimbursement_status.replaceAll("_", " ").toLowerCase()}. See the verified evidence below.`;

  return `
  <div class="page">
    ${pageHead(facts)}
    <div class="exec-head">
      <h1>Executive Summary</h1>
      <div class="sub">Prepared for review by the reimbursement analyst</div>
    </div>
    <table class="factgrid">
      ${rows
        .map(
          ([k, v]) => `
      <tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`,
        )
        .join("")}
    </table>
    <div class="recommend-row">
      <span class="mono small muted" style="text-transform:uppercase;letter-spacing:0.14em">Case Decision</span>
      ${badge.warn ? `<span class="badge-warn">${badge.text}</span>` : `<span class="badge-ok">✓ ${badge.text}</span>`}
    </div>
    <p class="secbody" style="font-size:9.8pt;line-height:1.7">
      ${esc(summaryText)}
    </p>
  </div>`;
}

/* -------------------------------- claim basis ------------------------------ */

function renderClaimBasis(detail: CaseDetail, facts: PackageFacts): string {
  const findings = detail.verification.checks.map((chk, i) => ({
    n: i + 1,
    text: `${chk.check}: ${chk.status} — ${chk.detail}`,
  }));
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 01</span><span class="sectitle">Claim Basis</span></div>
    <div class="secbody">
      <p>
        ${esc(labelCaseType(facts.case_type))} case ${esc(facts.caseNumber)} was
        detected by the Verito opportunity engine from synchronized Amazon records.
        The discrepancy is ${esc(String(detail.candidate.quantity ?? 0))} unit(s) of
        SKU ${esc(detail.candidate.sku ?? "—")} (shipment
        ${esc(detail.candidate.shipment_id ?? "—")}). The following numbered
        findings summarize the deterministic verification performed on the
        evidence.
      </p>
      ${findings
        .map(
          (f) => `
      <div class="finding">
        <span class="fno">Finding ${f.n}</span>
        <span>${esc(f.text)}</span>
      </div>`,
        )
        .join("")}
    </div>
  </div>`;
}

/* ------------------------------ evidence timeline --------------------------- */

function renderTimeline(detail: CaseDetail): string {
  const items = detail.items
    .filter((i) => i.event_date != null)
    .sort((a, b) => (a.event_date ?? 0) - (b.event_date ?? 0));
  const body =
    items.length > 0
      ? items
          .map(
            (i) => `
      <div class="tl-item">
        <div class="tl-when">${esc(fmtDateTime(i.event_date))} · ${esc(i.evidenceNo)}</div>
        <div class="tl-title">${esc(i.title)}</div>
        ${i.description ? `<div class="tl-detail">${esc(i.description)}</div>` : ""}
        <div class="tl-source">Source — ${esc(i.source)}${i.source_record_id ? ` · record ${esc(i.source_record_id)}` : ""}</div>
      </div>`,
          )
          .join("")
      : `<p class="small muted">No dated evidence events are available for this case.</p>`;
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 02</span><span class="sectitle">Evidence Timeline</span></div>
    <div class="secbody"><div class="tl">${body}</div></div>
  </div>`;
}

/* ---------------------------------- evidence -------------------------------- */

function verificationCell(status: string): string {
  switch (status) {
    case "CONSISTENT":
      return `<span class="ok">✓ Consistent</span>`;
    case "INCONSISTENT":
      return `<span class="bad">✕ Inconsistent</span>`;
    case "MISSING":
      return `<span class="muted">Missing</span>`;
    case "AMBIGUOUS":
      return `<span class="muted">Ambiguous</span>`;
    case "NOT_APPLICABLE":
      return `<span class="muted">Not applicable</span>`;
    default:
      return `<span class="muted">Pending</span>`;
  }
}

function renderEvidence(detail: CaseDetail): string {
  const rows = detail.items
    .map(
      (i) => `
      <tr>
        <td class="eid" style="width:9%">${esc(i.evidenceNo)}</td>
        <td style="width:31%;font-weight:600">${esc(i.title)}</td>
        <td style="width:14%">${esc(fmtDate(i.event_date))}</td>
        <td style="width:20%">${esc(i.source)}</td>
        <td class="mono small muted" style="width:14%">${esc(i.source_record_id ?? "—")}</td>
        <td style="width:12%">${verificationCell(i.verification_status)}</td>
      </tr>`,
    )
    .join("");
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 03</span><span class="sectitle">Evidence</span></div>
    <div class="secbody">
      <table class="tbl">
        <tr>
          <th style="width:9%">ID</th>
          <th style="width:31%">Description</th>
          <th style="width:14%">Date</th>
          <th style="width:20%">Source</th>
          <th style="width:14%">Source Record</th>
          <th style="width:12%">Verification</th>
        </tr>
        ${rows}
      </table>
      <p class="note" style="margin-top:3mm">
        Every evidence item retains its stable Evidence ID and source reference
        through the case lifecycle. Source Record IDs refer to the original
        normalized Amazon records.
      </p>
    </div>
  </div>`;
}

/* ------------------------------- reconciliation ----------------------------- */

function renderReconciliation(detail: CaseDetail): string {
  const c = detail.candidate;
  const recon = detail.candidate.reimbursement_status;
  const existing =
    recon === "ALREADY_REIMBURSED" || recon === "PARTIALLY_REIMBURSED"
      ? detail.estimated_recovery ?? 0
      : 0;
  const remaining =
    recon === "ALREADY_REIMBURSED"
      ? 0
      : (detail.estimated_recovery ?? 0) - existing;
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 04</span><span class="sectitle">Reconciliation</span></div>
    <div class="secbody">
      <table class="tbl">
        <tr><th style="width:46%">Item</th><th class="num" style="width:27%">Amount</th><th>Status</th></tr>
        <tr>
          <td style="font-weight:600">Potential reimbursement</td>
          <td class="num mono-v">${fmtUSD(detail.estimated_recovery, detail.currency)}</td>
          <td class="small muted">Per deterministic calculation</td>
        </tr>
        <tr>
          <td style="font-weight:600">Existing reimbursement found</td>
          <td class="num mono-v">${fmtUSD(existing, detail.currency)}</td>
          <td class="small muted">${recon === "NOT_REIMBURSED" ? "None found — consistent" : recon.replaceAll("_", " ")}</td>
        </tr>
        <tr>
          <td style="font-weight:700;border-top:0.9pt solid #101010">Remaining amount</td>
          <td class="num mono-v" style="font-weight:700;border-top:0.9pt solid #101010">${fmtUSD(remaining, detail.currency)}</td>
          <td class="small muted" style="border-top:0.9pt solid #101010">Requested for reimbursement</td>
        </tr>
      </table>
    </div>
  </div>`;
}

/* -------------------------------- calculation ------------------------------- */

function renderCalculation(detail: CaseDetail): string {
  const calc = detail.items.find((i) => i.evidence_type === "CALCULATION");
  const quantity = detail.candidate.quantity ?? 0;
  const unitValue =
    calc && calc.quantity != null && calc.quantity > 0 && calc.amount != null
      ? calc.amount / calc.quantity
      : null;
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 05</span><span class="sectitle">Calculation</span></div>
    <div class="secbody">
      <table class="tbl">
        <tr><th style="width:40%">Input</th><th class="num" style="width:30%">Value</th><th>Notes</th></tr>
        <tr>
          <td style="font-weight:600">Units missing</td>
          <td class="num mono-v">${quantity}</td>
          <td class="small muted">Per verified source records</td>
        </tr>
        <tr>
          <td style="font-weight:600">Unit value</td>
          <td class="num mono-v">${unitValue != null ? fmtUSD(unitValue, detail.currency) : "—"}</td>
          <td class="small muted">Derived from candidate estimate / records</td>
        </tr>
        <tr>
          <td style="font-weight:600">Formula</td>
          <td class="num mono-v small">${quantity} × ${unitValue != null ? unitValue.toFixed(2) : "unit_value"}</td>
          <td class="small muted">Deterministic — reproducible</td>
        </tr>
        <tr>
          <td style="font-weight:700;border-top:0.9pt solid #101010">Estimated recovery</td>
          <td class="num mono-v" style="font-weight:700;border-top:0.9pt solid #101010">${fmtUSD(detail.estimated_recovery, detail.currency)}</td>
          <td class="small muted" style="border-top:0.9pt solid #101010">${calc ? `Evidence ${esc(calc.evidenceNo)}` : "No calculation evidence recorded"}</td>
        </tr>
      </table>
    </div>
  </div>`;
}

/* ------------------------------- AI narrative ------------------------------- */

function renderAiNarrative(detail: CaseDetail): string {
  const ai = detail.aiAnalysis;
  if (!ai || ai.status !== "generated") {
    return `
    <div class="sec">
      <div class="sechead"><span class="secno">SECTION 06</span><span class="sectitle">AI-Generated Narrative</span></div>
      <div class="secbody">
        <p class="small muted">No AI-assisted analysis was generated for this case. The deterministic evidence workflow is unaffected.</p>
      </div>
    </div>`;
  }
  const keyFacts = (ai.keyFacts ?? []).map((f) => `<li>${esc(f)}</li>`).join("");
  const gaps = (ai.missingInformation ?? []).map((g) => `<li>${esc(g)}</li>`).join("");
  const conflicts = (ai.potentialConflicts ?? []).map((c) => `<li>${esc(c)}</li>`).join("");
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 06</span><span class="sectitle">AI-Generated Narrative</span></div>
    <div class="secbody">
      <div class="ai-block">
        <span class="ai-label">AI-Generated Draft — Seller Review Required</span>
        <div class="ai-body">
          ${ai.draftNarrative
            ? `<p style="white-space:pre-wrap">${esc(ai.draftNarrative)}</p>`
            : `<p>${esc(ai.summary ?? "")}</p>`}
          <span class="h">Key facts</span>
          <ul>${keyFacts || "<li>None recorded.</li>"}</ul>
          ${ai.missingInformation && ai.missingInformation.length > 0 ? `<span class="h">Missing information</span><ul>${gaps}</ul>` : ""}
          ${ai.potentialConflicts && ai.potentialConflicts.length > 0 ? `<span class="h">Potential conflicts</span><ul>${conflicts}</ul>` : ""}
          ${ai.evidenceReferences && ai.evidenceReferences.length > 0 ? `<p class="note" style="margin-top:3mm">Evidence references: ${esc(ai.evidenceReferences.join(", "))}</p>` : ""}
        </div>
      </div>
      <p class="note" style="margin-top:3mm">
        AI text is a draft. Every statement must be traceable to the Evidence
        IDs listed. The seller reviews and may edit this narrative before
        submission; AI never overrides the deterministic verification.
      </p>
    </div>
  </div>`;
}

/* -------------------------------- verification ------------------------------ */

function renderVerification(detail: CaseDetail): string {
  const missing = detail.completeness.missing
    .map((m) => `<li>${esc(m.label)} — ${esc(m.description)}</li>`)
    .join("");
  const conflicts = detail.verification.conflicts
    .map((c) => `<li>${esc(c.detail)}</li>`)
    .join("");
  const required = detail.completeness.required
    .map(
      (r) => `
      <tr>
        <td style="width:44%;font-weight:600">${esc(r.label)}</td>
        <td style="width:20%">${r.satisfied ? '<span class="ok">✓ Satisfied</span>' : '<span class="bad">Missing</span>'}</td>
        <td class="small muted">${esc(r.description)}</td>
      </tr>`,
    )
    .join("");
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 07</span><span class="sectitle">Verification</span></div>
    <div class="secbody">
      <table class="tbl">
        <tr><th style="width:44%">Required Evidence</th><th style="width:20%">Status</th><th>Description</th></tr>
        ${required}
      </table>
      <table class="tbl" style="margin-top:5mm">
        <tr><th style="width:30%">Check</th><th style="width:22%">Result</th><th>Detail</th></tr>
        ${detail.verification.checks
          .map(
            (c) => `
        <tr>
          <td class="mono small" style="text-transform:uppercase;letter-spacing:0.08em">${esc(c.check)}</td>
          <td>${verificationCell(c.status)}</td>
          <td class="small">${esc(c.detail)}</td>
        </tr>`,
          )
          .join("")}
      </table>
      <p class="note" style="margin-top:3mm">
        Completeness: <b>${esc(detail.completeness.status)}</b>.
        ${missing ? `Missing: ${missing}` : "All required evidence categories are satisfied."}
        ${conflicts ? `Conflicts: ${conflicts}` : "No unresolved evidence conflicts."}
      </p>
    </div>
  </div>`;
}

/* -------------------------------- traceability ------------------------------ */

function renderTraceability(detail: CaseDetail): string {
  const rows = detail.items
    .map(
      (i) => `
      <tr>
        <td class="eid" style="width:10%">${esc(i.evidenceNo)}</td>
        <td style="width:26%;font-weight:600">${esc(i.title)}</td>
        <td style="width:22%">${esc(i.source)}</td>
        <td class="mono small muted" style="width:22%">${esc(i.source_record_id ?? "—")}</td>
        <td class="mono small muted" style="width:20%">${esc(i.event_date ? fmtDate(i.event_date) : "—")}</td>
      </tr>`,
    )
    .join("");
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 08</span><span class="sectitle">Traceability — Evidence Index</span></div>
    <div class="secbody">
      <p>Every statement in this package references the Evidence IDs below. The index maps each ID to its source, source record identifier, and event date, so a reviewer can trace the claim back to the original Amazon records.</p>
      <table class="tbl" style="margin-top:3mm">
        <tr>
          <th style="width:10%">ID</th>
          <th style="width:26%">Evidence</th>
          <th style="width:22%">Source</th>
          <th style="width:22%">Source Record ID</th>
          <th style="width:20%">Event Date</th>
        </tr>
        ${rows}
      </table>
      <p class="note" style="margin-top:3mm">
        This package records that Verito captured the source reference and the
        analysis performed on it. It is not a cryptographic proof of Amazon's
        records.
      </p>
    </div>
  </div>`;
}

/* ----------------------------- package metadata ----------------------------- */

function renderPackageMetadata(facts: PackageFacts, detail: CaseDetail): string {
  const version = detail.packages[detail.packages.length - 1];
  return `
  <div class="page">
    ${pageHead(facts)}
    <div class="exec-head">
      <h1>Package Metadata</h1>
      <div class="sub">Document integrity record for ${esc(facts.caseNumber)}</div>
    </div>
    <div class="secbody">
      <table class="tbl" style="max-width:120mm">
        <tr><td class="k" style="width:46%;text-transform:uppercase;letter-spacing:0.08em" class="mono small muted">Verito Case ID</td><td class="mono-v" style="font-weight:600">${esc(facts.caseNumber)}</td></tr>
        <tr><td style="width:46%;text-transform:uppercase;letter-spacing:0.08em" class="mono small muted">Package ID</td><td class="mono-v" style="font-weight:600">${esc(version?.packageId ?? `${facts.caseNumber}-v${facts.version}`)}</td></tr>
        <tr><td style="width:46%;text-transform:uppercase;letter-spacing:0.08em" class="mono small muted">Generated Timestamp</td><td class="mono-v" style="font-weight:600">${esc(facts.generatedAt)}</td></tr>
        <tr><td style="width:46%;text-transform:uppercase;letter-spacing:0.08em" class="mono small muted">Package Version</td><td class="mono-v" style="font-weight:600">v${esc(facts.version)}</td></tr>
        <tr><td style="width:46%;text-transform:uppercase;letter-spacing:0.08em" class="mono small muted">Status</td><td class="mono-v" style="font-weight:600">${esc(facts.status.replaceAll("_", " "))}</td></tr>
        <tr><td style="width:46%;text-transform:uppercase;letter-spacing:0.08em" class="mono small muted">Verito Package Fingerprint</td><td class="fingerprint">${esc(facts.fingerprint || "—")}</td></tr>
      </table>
      <p class="note" style="margin-top:4mm;max-width:150mm">
        The fingerprint above is computed deterministically over the exact
        evidence snapshot used to generate this package version. Recomputing
        it detects changes to the generated package after creation. It does
        not certify Amazon's data; it certifies the recorded source references
        and the analysis performed on them. If the evidence changes, Verito
        creates a new package version rather than altering this one.
      </p>
    </div>
  </div>`;
}

/* ------------------------------- public builder ----------------------------- */

export interface EvidencePackageOptions {
  version?: string;
  fingerprint?: string;
  generatedAt?: string;
}

/**
 * Build the complete Claim Evidence Package document (self-contained HTML)
 * from a real EvidenceCase detail.
 */
export function buildEvidencePackageHtml(
  detail: CaseDetail,
  options: EvidencePackageOptions = {},
): string {
  const facts: PackageFacts = {
    caseNumber: detail.caseNumber,
    case_type: detail.case_type,
    status: detail.status,
    decision: detail.decision,
    estimatedRecovery: detail.estimated_recovery,
    currency: detail.currency,
    generatedAt: options.generatedAt ?? new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    version: options.version ?? PHASE2_PACKAGE_VERSION,
    fingerprint: options.fingerprint ?? "",
  };

  const body = [
    renderCover(facts, detail),
    renderExecutiveSummary(detail, facts),
    renderClaimBasis(detail, facts),
    renderTimeline(detail),
    renderEvidence(detail),
    renderReconciliation(detail),
    renderCalculation(detail),
    renderAiNarrative(detail),
    renderVerification(detail),
    renderTraceability(detail),
    renderPackageMetadata(facts, detail),
  ].join("");

  return documentShell("Claim Evidence Package", body, facts);
}
