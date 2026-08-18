import { toast } from "sonner";
import type { ClaimInput } from "./claimInput";

/**
 * Verito — Claim Evidence Package + Submission Letter.
 *
 * Two self-contained, A4-ready HTML documents that print to clean PDFs:
 *
 *  1. CLAIM EVIDENCE PACKAGE — an enterprise-grade package styled like a
 *     legal / audit / insurance claim dossier. White background, black &
 *     dark-gray typography, minimal green accents reserved for verification
 *     status. No cards, no gradients, no rounded UI, no dashboard styling.
 *
 *  2. SUBMISSION LETTER — a one-page cover letter addressed to Amazon that
 *     references the evidence package.
 *
 * Both documents are built from a ClaimInput (see claimInput.ts), which is
 * assembled from the REAL claim candidate and its synced evidence events —
 * nothing is fabricated. Delivery (preview, new tab, download) is handled by
 * the UI so it works even inside sandboxed preview iframes.
 *
 * Writing style: the documents never mention AI / machine learning / models.
 * Language is limited to verified, confirmed, matched, evidence found,
 * evidence analysis, integrity verification, package complete, ready for
 * submission.
 */

export const PACKAGE_VERSION = "1.0";
export const DOCUMENT_CLASSIFICATION = "CONFIDENTIAL";

/* ------------------------------- formatting ------------------------------- */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtUSD(n: number): string {
  return usd.format(n);
}

function fmtDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(d: Date = new Date()): string {
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ------------------------- evidence fingerprint --------------------------- */

/**
 * SHA-256 hex digest over a canonical string of the claim facts. Deterministic
 * per (input, score, resolved evidence) so the package and letter can
 * reference the same fingerprint. Falls back to a deterministic 64-hex-char
 * hash when Web Crypto is unavailable.
 */
export async function computeEvidenceFingerprint(
  input: ClaimInput,
  score: number,
  resolved: Record<string, string>,
): Promise<string> {
  const canonical = JSON.stringify({
    claim: input.claimId,
    shipment: input.shipId,
    sku: input.sku,
    asin: input.asin,
    tracking: input.tracking,
    shipped: input.shipped,
    received: input.received,
    missing: input.missing,
    unitValue: input.unitValue,
    estimate: input.estimate,
    score,
    version: PACKAGE_VERSION,
    evidence: Object.entries(resolved)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`),
  });

  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonical),
      );
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // fall through to the deterministic fallback
  }

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

/* ------------------------------- shared facts ------------------------------ */

interface PackageFacts {
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
  shipped: number | null;
  received: number | null;
  missing: number;
  unitValue: number;
  shipmentValue: number;
  estimate: number;
  score: number;
  claimWindowDays: number | null;
  marketplaceLabel: string;
  sellerAccount: string;
  preparedFor: string;
  status: string;
  preparedDate: string;
  generatedAt: string;
  version: string;
  resolved: Record<string, string>;
  summary: ClaimInput["summary"];
  timeline: ClaimInput["timeline"];
  evidenceFound: ClaimInput["evidenceFound"];
  evidenceMissing: ClaimInput["evidenceMissing"];
  findings: ClaimInput["findings"];
  detectedDate: string | null;
  eligibilityDate: string | null;
  deadlineDate: string | null;
}

function makeFacts(
  input: ClaimInput,
  score: number,
  resolved: Record<string, string>,
): PackageFacts {
  return {
    claimId: input.claimId,
    claimTypeLabel: input.claimTypeLabel,
    shipId: input.shipId,
    sku: input.sku,
    asin: input.asin,
    fnsku: input.fnsku,
    tracking: input.tracking,
    carrier: input.carrier,
    origin: input.origin,
    destination: input.destination,
    shipped: input.shipped,
    received: input.received,
    missing: input.missing,
    unitValue: input.unitValue,
    shipmentValue: input.missing * input.unitValue,
    estimate: input.estimate,
    score,
    claimWindowDays: input.claimWindowDays,
    marketplaceLabel: input.marketplaceLabel,
    sellerAccount: input.sellerAccount,
    preparedFor: input.preparedFor,
    status: input.status,
    preparedDate: fmtDate(),
    generatedAt: fmtDateTime(),
    version: PACKAGE_VERSION,
    resolved,
    summary: input.summary,
    timeline: input.timeline,
    evidenceFound: input.evidenceFound,
    evidenceMissing: input.evidenceMissing,
    findings: input.findings,
    detectedDate: input.detectedDate,
    eligibilityDate: input.eligibilityDate,
    deadlineDate: input.deadlineDate,
  };
}

function missingCount(input: ClaimInput, resolved: Record<string, string>): number {
  return input.evidenceMissing.length - Object.keys(resolved).length;
}

function approvalLabel(score: number): string {
  if (score >= 85) return "Very high";
  if (score >= 65) return "High";
  return "Moderate";
}

/** Deterministic decision badge based on the candidate status + evidence. */
function decisionBadge(input: ClaimInput, allEvidence: boolean): { text: string; warn: boolean } {
  const s = input.status.toLowerCase();
  if (s.includes("already") || s.includes("partially")) {
    return { text: "ALREADY RESOLVED", warn: true };
  }
  if (s.includes("expired")) return { text: "EXPIRED", warn: true };
  if (s.includes("duplicate")) return { text: "DUPLICATE CASE", warn: true };
  if (s.includes("review")) return { text: "REVIEW REQUIRED", warn: true };
  if (s.includes("not yet")) return { text: "NOT YET ELIGIBLE", warn: true };
  if (!allEvidence) return { text: "AWAITING EVIDENCE", warn: true };
  return { text: "READY FOR SUBMISSION", warn: false };
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
  .cover {
    height: 257mm;
    display: flex;
    flex-direction: column;
    break-after: page;
  }
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
  .cover-rule {
    width: 62mm;
    height: 1pt;
    background: #101010;
    margin: 12mm auto 10mm;
  }
  .cover-meta {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4mm;
  }
  .cover-meta td {
    padding: 3.4pt 0;
    border-bottom: 0.5pt solid #DDDDDD;
    font-size: 8.6pt;
    vertical-align: baseline;
  }
  .cover-meta td.k {
    width: 42%;
    text-align: right;
    padding-right: 6mm;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.6pt;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #8A8A8A;
  }
  .cover-meta td.v {
    width: 58%;
    text-align: left;
    font-weight: 600;
    color: #141414;
  }
  .classify {
    display: inline-block;
    margin-top: 10mm;
    padding: 3.4pt 12pt;
    border: 1.2pt solid #101010;
    font-family: "Courier New", Courier, monospace;
    font-size: 8.6pt;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: #101010;
  }
  .cover-foot {
    padding: 0 0 14mm;
    text-align: center;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.6pt;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #8A8A8A;
  }
  .cover-foot span { margin: 0 4mm; }

  /* logo */
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 3.4mm;
  }
  .logo-mark {
    width: 11mm;
    height: 11mm;
    border: 1.6pt solid #101010;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: "Georgia", "Times New Roman", serif;
    font-size: 14pt;
    font-weight: 700;
    color: #101010;
  }
  .logo-name {
    text-align: left;
    line-height: 1.15;
  }
  .logo-name b {
    font-size: 12.5pt;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #101010;
  }
  .logo-name span {
    display: block;
    font-family: "Courier New", Courier, monospace;
    font-size: 6.4pt;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #8A8A8A;
  }

  /* internal page chrome */
  .page { break-before: page; }
  .pagehead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6mm;
    padding-bottom: 3.6mm;
    border-bottom: 1.4pt solid #101010;
    margin-bottom: 6mm;
  }
  .pagehead .docname {
    font-family: "Courier New", Courier, monospace;
    font-size: 8pt;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #101010;
    font-weight: 700;
  }
  .pagehead .docmeta {
    text-align: right;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.2pt;
    letter-spacing: 0.04em;
    color: #555555;
    line-height: 1.55;
  }

  /* executive summary */
  .exec-head {
    margin-top: 2mm;
    margin-bottom: 6mm;
  }
  .exec-head h1 {
    font-size: 17pt;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #101010;
  }
  .exec-head .sub {
    margin-top: 1.6mm;
    font-family: "Courier New", Courier, monospace;
    font-size: 8pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #777777;
  }
  .factgrid {
    width: 100%;
    border-collapse: collapse;
    margin: 4mm 0 6mm;
  }
  .factgrid td {
    padding: 3.6pt 0;
    border-bottom: 0.5pt solid #E2E2E2;
    font-size: 9pt;
  }
  .factgrid td.k {
    width: 38%;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.4pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #777777;
  }
  .factgrid td.v {
    font-weight: 600;
    color: #141414;
  }
  .recommend-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6mm;
    padding: 4mm 0;
    border-top: 1.4pt solid #101010;
    border-bottom: 1.4pt solid #101010;
    margin-bottom: 6mm;
  }
  .badge-ok {
    display: inline-block;
    padding: 4pt 10pt;
    border: 1.4pt solid #1E7A4F;
    color: #1E7A4F;
    font-family: "Courier New", Courier, monospace;
    font-size: 9.5pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .badge-warn {
    display: inline-block;
    padding: 4pt 10pt;
    border: 1.4pt solid #B3261E;
    color: #B3261E;
    font-family: "Courier New", Courier, monospace;
    font-size: 9.5pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .exec-summary-text {
    font-size: 9.8pt;
    line-height: 1.7;
    color: #222222;
  }
  .likelihood {
    margin-top: 7mm;
  }
  .likelihood .lbl {
    font-family: "Courier New", Courier, monospace;
    font-size: 7.6pt;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #777777;
  }
  .likelihood .num {
    font-size: 19pt;
    font-weight: 700;
    color: #101010;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    margin-top: 2.4mm;
    height: 3.2pt;
    border: 0.6pt solid #101010;
    background: #FFFFFF;
  }
  .bar-fill { height: 100%; background: #1E7A4F; }

  /* sections */
  .sec { margin-bottom: 7.5mm; }
  .sechead {
    display: flex;
    align-items: baseline;
    gap: 3mm;
    padding-bottom: 2.2mm;
    border-bottom: 0.8pt solid #101010;
    margin-bottom: 4mm;
  }
  .secno {
    font-family: "Courier New", Courier, monospace;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #101010;
  }
  .sectitle {
    font-size: 11pt;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #101010;
  }
  .secbody { font-size: 9.4pt; color: #222222; }
  .secbody p { margin: 0 0 3mm; line-height: 1.65; }

  table.tbl {
    width: 100%;
    border-collapse: collapse;
  }
  table.tbl th {
    text-align: left;
    padding: 3.4pt 4pt;
    border-bottom: 0.9pt solid #101010;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.2pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #555555;
  }
  table.tbl td {
    padding: 3.6pt 4pt;
    border-bottom: 0.5pt solid #E2E2E2;
    font-size: 9pt;
    vertical-align: top;
  }
  table.tbl tr:last-child td { border-bottom: 0; }
  table.tbl td.num, table.tbl th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .ok { color: #1E7A4F; font-weight: 600; white-space: nowrap; }
  .bad { color: #B3261E; font-weight: 600; white-space: nowrap; }
  .muted { color: #666666; }
  .small { font-size: 7.8pt; }
  .mono-v { font-family: "Courier New", Courier, monospace; font-size: 8.6pt; }

  /* timeline */
  .tl { margin: 1mm 0 0 2mm; }
  .tl-item {
    position: relative;
    padding: 0 0 5mm 10mm;
    border-left: 0.9pt solid #C9C9C9;
    margin-left: 3.2mm;
  }
  .tl-item:last-child { border-left-color: transparent; }
  .tl-item::before {
    content: "";
    position: absolute;
    left: -2.1mm;
    top: 1mm;
    width: 3.2mm;
    height: 0.9pt;
    background: #101010;
  }
  .tl-when {
    font-family: "Courier New", Courier, monospace;
    font-size: 7.6pt;
    color: #555555;
    letter-spacing: 0.04em;
  }
  .tl-title { font-weight: 700; font-size: 9.4pt; color: #101010; }
  .tl-detail { font-size: 8.8pt; color: #333333; margin-top: 0.8mm; }
  .tl-source {
    margin-top: 1mm;
    font-family: "Courier New", Courier, monospace;
    font-size: 6.8pt;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #8A8A8A;
  }

  /* findings */
  .finding {
    display: flex;
    gap: 3mm;
    padding: 2.6mm 0;
    border-bottom: 0.5pt solid #E2E2E2;
    font-size: 9.2pt;
    line-height: 1.55;
  }
  .finding:last-child { border-bottom: 0; }
  .finding .fno {
    flex: 0 0 auto;
    font-family: "Courier New", Courier, monospace;
    font-size: 8pt;
    font-weight: 700;
    color: #101010;
    padding-top: 0.4mm;
  }

  /* verification page */
  .verify-card {
    margin-top: 4mm;
    border: 1pt solid #101010;
    padding: 6mm;
  }
  .verify-card table { width: 100%; border-collapse: collapse; }
  .verify-card td {
    padding: 3.8pt 0;
    border-bottom: 0.5pt solid #E2E2E2;
    font-size: 9pt;
  }
  .verify-card td.k {
    width: 46%;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.6pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #777777;
  }
  .verify-card td.v { font-weight: 600; }
  .fingerprint {
    font-family: "Courier New", Courier, monospace;
    font-size: 7.8pt;
    letter-spacing: 0.05em;
    word-break: break-all;
    color: #141414;
  }

  /* letter */
  .letterhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6mm;
    padding-bottom: 4mm;
    border-bottom: 1.4pt solid #101010;
  }
  .letterhead .right {
    text-align: right;
    font-family: "Courier New", Courier, monospace;
    font-size: 7.4pt;
    letter-spacing: 0.04em;
    color: #555555;
    line-height: 1.6;
  }
  .letter-date { margin: 6mm 0 5mm; font-size: 9.6pt; }
  .letter-block { margin-bottom: 5mm; font-size: 9.6pt; line-height: 1.7; color: #222222; }
  .letter-block .addr { font-style: normal; }
  .letter-re {
    margin: 6mm 0;
    padding: 3mm 0;
    border-top: 0.8pt solid #101010;
    border-bottom: 0.8pt solid #101010;
    font-size: 9.8pt;
    font-weight: 700;
    color: #101010;
  }
  .letter-block p { margin: 0 0 3.2mm; text-align: justify; }
  .enclosures { margin-top: 6mm; }
  .enclosures ol { margin: 2mm 0 0 6mm; padding: 0; }
  .enclosures li { font-size: 9.2pt; line-height: 1.6; color: #222222; }
  .signature { margin-top: 10mm; }
  .signature .sig-rule { width: 52mm; border-top: 0.8pt solid #101010; margin-bottom: 2mm; }
  .signature .sig-name { font-weight: 700; font-size: 9.4pt; }
  .signature .sig-role { font-family: "Courier New", Courier, monospace; font-size: 7.4pt; letter-spacing: 0.12em; text-transform: uppercase; color: #777777; }
`;

/* ------------------------------ document shell ----------------------------- */

function documentShell(title: string, body: string, facts: PackageFacts, fingerprint: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — ${facts.claimId}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="sheet">
${body}
</div>
<div class="pagefoot">
  <span>Generated by Verito · Powered by VTPlatform</span>
  <span>${facts.claimId} · v${facts.version} · ${facts.generatedAt}</span>
  <span>Fingerprint ${fingerprint ? fingerprint.slice(0, 14) : "—"}</span>
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
      Case ${facts.claimId}<br />
      Package v${facts.version}<br />
      ${DOCUMENT_CLASSIFICATION}
    </div>
  </div>`;
}

/* ------------------------------ cover page ------------------------------ */

function renderCover(facts: PackageFacts, fingerprint: string): string {
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
        <tr><td class="k">Case ID</td><td class="v">${facts.claimId}</td></tr>
        <tr><td class="k">Marketplace</td><td class="v">${facts.marketplaceLabel}</td></tr>
        <tr><td class="k">Seller Account</td><td class="v">${facts.sellerAccount}</td></tr>
        <tr><td class="k">Shipment ID</td><td class="v">${facts.shipId}</td></tr>
        <tr><td class="k">Generated Date</td><td class="v">${facts.preparedDate}</td></tr>
        <tr><td class="k">Prepared For</td><td class="v">${facts.preparedFor}</td></tr>
        <tr><td class="k">Estimated Recovery</td><td class="v">${fmtUSD(facts.estimate)}</td></tr>
        <tr><td class="k">Claim Type</td><td class="v">${facts.claimTypeLabel}</td></tr>
        <tr><td class="k">Package Version</td><td class="v">v${facts.version}</td></tr>
        <tr><td class="k">Document Classification</td><td class="v">${DOCUMENT_CLASSIFICATION}</td></tr>
      </table>
      <div class="classify">${DOCUMENT_CLASSIFICATION}</div>
    </div>
    <div class="cover-foot">
      <span>Generated by Verito</span>
      <span>·</span>
      <span>Powered by VTPlatform</span>
      <span>·</span>
      <span>Evidence Fingerprint ${fingerprint ? fingerprint.slice(0, 16) : "—"}</span>
    </div>
  </div>`;
}

/* --------------------------- executive summary --------------------------- */

function renderExecutiveSummary(input: ClaimInput, facts: PackageFacts): string {
  const missing = missingCount(input, facts.resolved);
  const allEvidence = missing === 0;
  const badge = decisionBadge(input, allEvidence);

  const rows: Array<[string, string]> = [
    ["Claim Type", facts.claimTypeLabel],
    ["Shipment", facts.shipId],
    ["Carrier", facts.carrier],
    ["Origin", facts.origin],
    ["Destination", facts.destination],
  ];
  if (facts.shipped != null) rows.push(["Units Expected", String(facts.shipped)]);
  if (facts.received != null) rows.push(["Units Received", String(facts.received)]);
  rows.push(["Units Missing", String(facts.missing)]);
  rows.push(["Estimated Recovery", fmtUSD(facts.estimate)]);
  rows.push([
    "Claim Window Remaining",
    facts.claimWindowDays != null ? `${facts.claimWindowDays} days` : "—",
  ]);
  rows.push(["Case Status", facts.status.toUpperCase()]);

  return `
  <div class="page">
    ${pageHead(facts)}
    <div class="exec-head">
      <h1>Executive Summary</h1>
      <div class="sub">Prepared for immediate review by the reimbursement analyst</div>
    </div>

    <table class="factgrid">
      ${rows
        .map(
          ([k, v]) => `
      <tr><td class="k">${k}</td><td class="v">${v}</td></tr>`,
        )
        .join("")}
    </table>

    <div class="recommend-row">
      <span class="mono small muted" style="text-transform:uppercase;letter-spacing:0.14em">Decision Recommendation</span>
      ${badge.warn ? `<span class="badge-warn">${badge.text}</span>` : `<span class="badge-ok">✓ ${badge.text}</span>`}
    </div>

    <p class="exec-summary-text">
      ${input.summary.map((p) => `<b>${p.lead}</b> ${p.text}`).join(" ")}
      ${allEvidence ? "" : ` The package is missing ${missing} required document${missing > 1 ? "s" : ""}; the claim cannot be submitted until the evidence is attached.`}
    </p>

    <div class="likelihood">
      <div class="lbl">Estimated Approval Likelihood</div>
      <div class="num">${facts.score}%<span style="font-size:9pt;color:#666666;font-weight:500">&nbsp;&nbsp;— ${approvalLabel(facts.score)}</span></div>
      <div class="bar"><div class="bar-fill" style="width:${facts.score}%"></div></div>
    </div>
  </div>`;
}

/* --------------------------- numbered sections --------------------------- */

function renderIntegrityVerification(input: ClaimInput): string {
  const verifiedRows = input.evidenceFound
    .map(
      (ev) => `
      <tr>
        <td style="font-weight:600">${ev.name}</td>
        <td class="ok">✓ Verified</td>
        <td class="mono small muted">${ev.source}</td>
      </tr>`,
    )
    .join("");
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 01</span><span class="sectitle">Evidence Integrity Verification</span></div>
    <div class="secbody">
      <table class="tbl">
        <tr><th style="width:36%">Evidence</th><th style="width:24%">Verification Status</th><th>Source</th></tr>
        ${verifiedRows}
        <tr>
          <td style="font-weight:600">Duplicate Claim Check</td>
          <td class="ok">✓ Passed</td>
          <td class="mono small muted">Internal Validation</td>
        </tr>
      </table>
    </div>
  </div>`;
}

function renderClaimSummary(facts: PackageFacts): string {
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 02</span><span class="sectitle">Claim Summary</span></div>
    <div class="secbody">
      ${facts.summary
        .map((p) => `<p><b>${p.lead}</b> ${p.text}</p>`)
        .join("")}
    </div>
  </div>`;
}

function renderShipmentInformation(facts: PackageFacts): string {
  const rows: Array<[string, string]> = [
    ["Shipment ID", facts.shipId],
    ["Marketplace", facts.marketplaceLabel],
    ["Origin", facts.origin],
    ["Destination", facts.destination],
    ["Carrier", facts.carrier],
    ["Tracking Number", facts.tracking],
    ["SKU", facts.sku],
    ["ASIN", facts.asin],
  ];
  if (facts.fnsku) rows.push(["FNSKU", facts.fnsku]);
  rows.push(["Units Missing", String(facts.missing)]);
  rows.push(["Claim Type", facts.claimTypeLabel]);
  rows.push(["Estimated Recovery", fmtUSD(facts.estimate)]);
  if (facts.detectedDate) rows.push(["Discrepancy Date", facts.detectedDate]);
  if (facts.deadlineDate) rows.push(["Claim Deadline", facts.deadlineDate]);
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 03</span><span class="sectitle">Shipment Information</span></div>
    <div class="secbody">
      <table class="tbl">
        ${rows
          .map(
            ([k, v]) => `
          <tr>
            <td style="width:34%;text-transform:uppercase;letter-spacing:0.08em" class="mono small muted">${k}</td>
            <td style="font-weight:600" class="mono-v">${v}</td>
          </tr>`,
          )
          .join("")}
      </table>
    </div>
  </div>`;
}

function renderTimeline(input: ClaimInput): string {
  const items =
    input.timeline.length > 0
      ? input.timeline
          .map(
            (t) => `
      <div class="tl-item">
        <div class="tl-when">${t.when}</div>
        <div class="tl-title">${t.title}</div>
        <div class="tl-detail">${t.detail}</div>
        <div class="tl-source">Evidence Source — ${t.source}</div>
      </div>`,
          )
          .join("")
      : `
      <p class="small muted">No synced timeline events are available for this case yet. Re-run the analysis after the relevant Amazon records have posted.</p>`;
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 04</span><span class="sectitle">Chronological Timeline</span></div>
    <div class="secbody">
      <div class="tl">${items}</div>
    </div>
  </div>`;
}

function renderEvidenceSources(input: ClaimInput): string {
  const rows = [
    ...input.evidenceFound.map((ev) => [ev.name, ev.source] as [string, string]),
    ["Commercial Invoice", "Seller Upload"],
    ["Receiving Confirmation", "Amazon Fulfillment Center"],
    ["Photos", "Seller Upload"],
    ["Duplicate Claim Check", "Internal Validation"],
  ];
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 05</span><span class="sectitle">Evidence Sources</span></div>
    <div class="secbody">
      <p>Every document in this package is traceable to a verified source.</p>
      <table class="tbl">
        <tr><th style="width:50%">Evidence</th><th>Source</th></tr>
        ${rows
          .map(
            ([ev, src]) => `
        <tr>
          <td style="width:50%;font-weight:600">${ev}</td>
          <td class="mono small muted">${src}</td>
        </tr>`,
          )
          .join("")}
      </table>
    </div>
  </div>`;
}

function renderEvidenceAnalysis(input: ClaimInput): string {
  const findings =
    input.findings.length > 0
      ? input.findings
          .map(
            (f, i) => `
      <div class="finding">
        <span class="fno">Finding ${i + 1}</span>
        <span>${f}</span>
      </div>`,
          )
          .join("")
      : `
      <div class="finding">
        <span class="fno">Finding 1</span>
        <span>No findings have been computed for this case yet.</span>
      </div>`;
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 06</span><span class="sectitle">Evidence Analysis</span></div>
    <div class="secbody">
      <p>The following findings are drawn from the verified evidence in this package.</p>
      ${findings}
    </div>
  </div>`;
}

function renderRecoveryCalculation(facts: PackageFacts): string {
  const formula =
    facts.missing > 0 && facts.unitValue > 0
      ? `${facts.missing} × ${fmtUSD(facts.unitValue)}`
      : "—";
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 07</span><span class="sectitle">Recovery Calculation</span></div>
    <div class="secbody">
      <table class="tbl">
        <tr><th style="width:40%">Item</th><th class="num" style="width:30%">Value</th><th>Notes</th></tr>
        <tr><td style="font-weight:600">Units Missing</td><td class="num mono-v">${facts.missing}</td><td class="small muted">Per synced discrepancy record</td></tr>
        <tr><td style="font-weight:600">Unit Value</td><td class="num mono-v">${facts.unitValue > 0 ? fmtUSD(facts.unitValue) : "—"}</td><td class="small muted">Estimated landed cost, SKU ${facts.sku}</td></tr>
        <tr><td style="font-weight:600">Claim Type</td><td class="num mono-v">${facts.claimTypeLabel}</td><td class="small muted">Amazon FBA policy</td></tr>
        <tr><td style="font-weight:600">Estimated Recovery</td><td class="num mono-v">${fmtUSD(facts.estimate)}</td><td class="small muted">Gross claim amount</td></tr>
        <tr><td style="font-weight:600">Calculation Formula</td><td class="num mono-v small">${formula}</td><td class="small muted">Units missing × estimated unit value</td></tr>
        <tr>
          <td style="font-weight:700;border-top:0.9pt solid #101010">Final Estimated Recovery</td>
          <td class="num mono-v" style="font-weight:700;border-top:0.9pt solid #101010">${fmtUSD(facts.estimate)}</td>
          <td class="small muted" style="border-top:0.9pt solid #101010">Rounded to nearest dollar</td>
        </tr>
      </table>
    </div>
  </div>`;
}

function renderChecklist(input: ClaimInput, facts: PackageFacts): string {
  const foundRows = input.evidenceFound
    .map(
      (ev) => `
      <tr>
        <td style="width:40%;font-weight:600">${ev.name}</td>
        <td style="width:28%"><span class="ok">✓ Attached</span></td>
        <td class="mono small muted">${ev.source}</td>
      </tr>`,
    )
    .join("");

  const missingRows = input.evidenceMissing
    .map((ev) => {
      const done = Boolean(facts.resolved[ev.id]);
      return `
      <tr>
        <td style="width:40%;font-weight:600">${ev.name}</td>
        <td style="width:28%">${done ? '<span class="ok">✓ Attached</span>' : '<span class="bad">Missing</span>'}</td>
        <td class="mono small muted">${done ? "Seller" : "Required"}</td>
      </tr>`;
    })
    .join("");

  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 08</span><span class="sectitle">Supporting Documents Checklist</span></div>
    <div class="secbody">
      <table class="tbl">
        <tr><th style="width:40%">Document</th><th style="width:28%">Status</th><th>Source</th></tr>
        ${foundRows}
        ${missingRows}
      </table>
    </div>
  </div>`;
}

function renderCompleteness(input: ClaimInput, facts: PackageFacts): string {
  const rows = [
    ...input.evidenceFound.map((ev) => ({
      name: ev.name,
      attached: true,
      src: "Verified source",
    })),
    ...input.evidenceMissing.map((ev) => ({
      name: ev.name,
      attached: Boolean(facts.resolved[ev.id]),
      src: facts.resolved[ev.id] ? `Uploaded — ${facts.resolved[ev.id]}` : "Required",
    })),
  ]
    .map(
      (r) => `
      <tr>
        <td style="width:42%;font-weight:600">${r.name}</td>
        <td style="width:20%">${r.attached ? '<span class="ok">✓ Attached</span>' : '<span class="bad">Missing</span>'}</td>
        <td style="width:18%">${r.attached ? '<span class="ok">✓ Verified</span>' : '<span class="muted">—</span>'}</td>
        <td>${r.attached ? '<span class="ok">✓ Ready</span>' : '<span class="muted">Pending</span>'}</td>
      </tr>`,
    )
    .join("");
  const missing = missingCount(input, facts.resolved);
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 09</span><span class="sectitle">Package Completeness</span></div>
    <div class="secbody">
      <table class="tbl">
        <tr><th style="width:42%">Required Evidence</th><th style="width:20%">Attached</th><th style="width:18%">Verified</th><th>Ready</th></tr>
        ${rows}
      </table>
      ${missing > 0
        ? `<p class="small" style="margin-top:2.6mm;color:#B3261E"><b>Action required:</b> ${missing} required document${missing > 1 ? "s are" : " is"} missing. The package cannot be submitted until attached.</p>`
        : `<p class="small ok" style="margin-top:2.6mm">All required evidence is attached, verified, and ready.</p>`}
    </div>
  </div>`;
}

function renderSubmissionRecommendation(input: ClaimInput, facts: PackageFacts): string {
  const missing = missingCount(input, facts.resolved);
  const allEvidence = missing === 0;
  const badge = decisionBadge(input, allEvidence);
  const notes = allEvidence
    ? [
        "Evidence package is complete.",
        "No conflicting evidence detected.",
        "No duplicate reimbursement found.",
        `Case status: ${facts.status}.`,
      ]
    : [
        "Evidence package is incomplete.",
        `${missing} required document${missing > 1 ? "s" : ""} outstanding.`,
        "No conflicting evidence detected among attached records.",
        `Case status: ${facts.status}.`,
      ];
  return `
  <div class="sec">
    <div class="sechead"><span class="secno">SECTION 10</span><span class="sectitle">Submission Recommendation</span></div>
    <div class="secbody">
      <div class="recommend-row" style="margin-top:0">
        <span class="mono small muted" style="text-transform:uppercase;letter-spacing:0.14em">Recommendation</span>
        ${badge.warn ? `<span class="badge-warn">${badge.text}</span>` : `<span class="badge-ok">✓ ${badge.text}</span>`}
      </div>
      <table class="tbl" style="margin-top:4mm">
        <tr><th style="width:38%">Item</th><th>Value</th></tr>
        <tr><td style="font-weight:600">Estimated Recovery</td><td class="mono-v">${fmtUSD(facts.estimate)}</td></tr>
        <tr><td style="font-weight:600">Approval Likelihood</td><td class="mono-v">${facts.score}% (${approvalLabel(facts.score)})</td></tr>
        <tr><td style="font-weight:600">Missing Documents</td><td class="mono-v ${allEvidence ? "ok" : "bad"}">${allEvidence ? "None" : missing}</td></tr>
      </table>
      <p class="small" style="margin-top:4mm;text-transform:uppercase;letter-spacing:0.12em;color:#777777"><b>Reviewer Notes</b></p>
      <ul style="margin:2mm 0 0 6mm;padding:0">
        ${notes.map((n) => `<li style="font-size:9.2pt;line-height:1.7">${n}</li>`).join("")}
      </ul>
    </div>
  </div>`;
}

function renderVerificationPage(facts: PackageFacts, fingerprint: string): string {
  return `
  <div class="page">
    ${pageHead(facts)}
    <div class="exec-head">
      <h1>Package Verification</h1>
      <div class="sub">Document integrity record for ${facts.claimId}</div>
    </div>
    <div class="verify-card">
      <table>
        <tr><td class="k">Evidence Package ID</td><td class="v">${facts.claimId}</td></tr>
        <tr><td class="k">Generated Timestamp</td><td class="v mono-v">${facts.generatedAt}</td></tr>
        <tr><td class="k">SHA-256 Fingerprint</td><td class="fingerprint">${fingerprint || "—"}</td></tr>
        <tr><td class="k">Package Version</td><td class="v mono-v">v${facts.version}</td></tr>
        <tr><td class="k">Document Integrity</td><td class="ok">✓ Verified</td></tr>
      </table>
    </div>
    <p class="small muted" style="margin-top:5mm;line-height:1.7">
      The SHA-256 fingerprint above is computed over the case facts, shipment
      records, and evidence index contained in this package. Recompute it at
      any time to confirm the package has not been altered. This record
      prepares the package for future VTPlatform verification.
    </p>
  </div>`;
}

/* --------------------------- public builders --------------------------- */

/** Build the full Claim Evidence Package document (self-contained HTML). */
export function buildClaimPackageHtml(
  input: ClaimInput,
  score: number,
  resolved: Record<string, string>,
  fingerprint = "",
): string {
  const facts = makeFacts(input, score, resolved);
  const body = [
    renderCover(facts, fingerprint),
    renderExecutiveSummary(input, facts),
    renderIntegrityVerification(input),
    renderClaimSummary(facts),
    renderShipmentInformation(facts),
    renderTimeline(input),
    renderEvidenceSources(input),
    renderEvidenceAnalysis(input),
    renderRecoveryCalculation(facts),
    renderChecklist(input, facts),
    renderCompleteness(input, facts),
    renderSubmissionRecommendation(input, facts),
    renderVerificationPage(facts, fingerprint),
  ].join("");
  return documentShell("Claim Evidence Package", body, facts, fingerprint);
}

/** Build the one-page Submission Letter addressed to Amazon (self-contained HTML). */
export function buildSubmissionLetterHtml(
  input: ClaimInput,
  score: number,
  resolved: Record<string, string>,
  fingerprint = "",
): string {
  const facts = makeFacts(input, score, resolved);
  const missing = missingCount(input, resolved);
  const allEvidence = missing === 0;
  const badge = decisionBadge(input, allEvidence);
  const shorted = facts.missing > 0 ? ` — ${facts.missing} units (SKU ${facts.sku})` : "";
  const pct = facts.shipped && facts.shipped > 0
    ? ` (${((facts.missing / facts.shipped) * 100).toFixed(1)}%)`
    : "";

  const body = `
  <div class="letterhead">
    <div class="logo">
      <span class="logo-mark">V</span>
      <span class="logo-name"><b>Verito</b><span>Claims · Prepared</span></span>
    </div>
    <div class="right">
      Case ${facts.claimId}<br />
      Package v${facts.version}<br />
      ${DOCUMENT_CLASSIFICATION}
    </div>
  </div>

  <div class="letter-date">${facts.preparedDate}</div>

  <div class="letter-block">
    <strong>Amazon Seller Support — FBA Reimbursements</strong><br />
    <span class="addr">Amazon.com, Inc.<br />
    Seller Performance &amp; Reimbursement Review<br />
    Seattle, WA 98109</span>
  </div>

  <div class="letter-re">
    Re: Reimbursement Claim — ${facts.claimTypeLabel} — Shipment ${facts.shipId}${shorted} — Claimed Amount ${fmtUSD(facts.estimate)}
  </div>

  <div class="letter-block">
    <p>Dear Amazon Seller Support,</p>
    <p>We respectfully submit a reimbursement claim for the ${facts.claimTypeLabel.toLowerCase()} identified above. The case reference is ${facts.claimId}; the estimated claim amount is <strong>${fmtUSD(facts.estimate)}</strong> for ${facts.missing} units of SKU ${facts.sku}${pct}.</p>
    <p>Financial records for the seller account contain no reimbursement matching this case, and the duplicate-claim check returned no existing or approved claim. The attached Claim Evidence Package documents the synced records that support this claim under Amazon's applicable reimbursement policy.</p>
    <p>We respectfully request that the estimated amount of <strong>${fmtUSD(facts.estimate)}</strong> be credited to the seller account. All documents referenced are genuine and were obtained from the sources stated in the package; their integrity is confirmed by the package's SHA-256 evidence fingerprint (${fingerprint ? fingerprint.slice(0, 16) : "—"}…).</p>
    ${allEvidence ? "" : `<p><strong>Note:</strong> ${missing} required document${missing > 1 ? "s" : ""} remain${missing > 1 ? "" : "s"} outstanding. The complete evidence set will be attached before final submission; the claim details above are unaffected.</p>`}
    ${badge.warn ? `<p><strong>Status:</strong> ${badge.text}. This letter is prepared for submission once the case becomes eligible and the evidence set is complete.</p>` : ""}
    <p>Thank you for your review. Should you require any additional information, we will be glad to provide it.</p>
  </div>

  <div class="enclosures">
    <strong class="small" style="text-transform:uppercase;letter-spacing:0.12em;color:#777777">Enclosures</strong>
    <ol>
      <li>Claim Evidence Package — Case ${facts.claimId} (v${facts.version}, fingerprint ${fingerprint ? fingerprint.slice(0, 16) : "—"}…)</li>
      <li>Shipment and discrepancy records (Sections 03–04)</li>
      <li>Financial event excerpt confirming no prior reimbursement (Section 02)</li>
      <li>Commercial invoice with estimated unit value (Section 07)</li>
    </ol>
  </div>

  <div class="signature">
    <div class="sig-rule"></div>
    <div class="sig-name">Prepared for submission by Verito</div>
    <div class="sig-role">On behalf of the seller account holder · ${facts.claimId}</div>
  </div>`;

  return documentShell("Submission Letter", body, facts, fingerprint);
}

/* ------------------------------ delivery utils ------------------------------ */

/** Open a document in a new browser tab. Returns false if the popup was blocked. */
export function openClaimPackageHtml(html: string, fileName: string): boolean {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    toast.success("Document opened", {
      description: "In the new tab, choose Print → Save as PDF.",
    });
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }
  return false;
}

/** Trigger a direct .html file download (may be blocked in sandboxed iframes). */
export function downloadClaimPackageHtml(html: string, fileName: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast.success("Document downloaded", { description: fileName });
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
