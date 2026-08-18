import JSZip from "jszip";
import { toast } from "sonner";

/**
 * Verito — Claim package ZIP export.
 *
 * Bundles a claim evidence case into a single .zip file:
 *
 *  - claim-evidence-package.html  — the self-contained evidence package
 *    document (the exact HTML the preview shows), ready to print / save as
 *    PDF or open in a browser tab.
 *  - evidence-data.json           — machine-readable export of the case:
 *    candidate, evidence items, verification, completeness, decision,
 *    AI analysis, packages and audit trail. Useful for records, backup and
 *    re-verification (the package fingerprint can be recomputed from it).
 *  - README.txt                   — manifest describing the contents.
 *
 * The ZIP is generated entirely in the browser; nothing is uploaded.
 */

export interface ClaimZipContents {
  /** Display case number, e.g. "CASE-1042". Used for folder/file names. */
  caseNumber: string;
  /** Self-contained package HTML — the same document the preview renders. */
  packageHtml: string;
  /** Machine-readable case data (must be JSON-serializable). */
  data: Record<string, unknown>;
}

/** Normalize a case number into a safe file/folder name. */
function safeName(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-");
  return (cleaned || "case").slice(0, 60);
}

function buildReadme(contents: ClaimZipContents): string {
  const name = safeName(contents.caseNumber);
  return [
    `VERITO — CLAIM EVIDENCE PACKAGE EXPORT`,
    `==========================================`,
    ``,
    `Case:            ${contents.caseNumber}`,
    `Exported:        ${new Date().toISOString()}`,
    ``,
    `Contents`,
    `--------`,
    `1. claim-evidence-package.html`,
    `   The claim evidence package document — self-contained, A4-ready.`,
    `   Open it in a browser and use Print -> Save as PDF, or keep as`,
    `   the HTML record of the package.`,
    ``,
    `2. evidence-data.json`,
    `   Machine-readable export of the evidence case: candidate and`,
    `   shipment facts, every evidence item, verification checks,`,
    `   completeness, decision, AI analysis, package versions and the`,
    `   audit trail. This is the source of truth the package was`,
    `   generated from.`,
    ``,
    `3. README.txt`,
    `   This manifest.`,
    ``,
    `Confidentiality`,
    `----------------`,
    `This export contains seller account claim data and is CONFIDENTIAL.`,
    `Keep it in a secure location and share only with parties that need`,
    `it for claim preparation or submission.`,
    ``,
    `Verification`,
    `------------`,
    `The evidence package document references a SHA-256 evidence`,
    `fingerprint. The fingerprint can be recomputed from the package`,
    `facts and evidence index in evidence-data.json to confirm the`,
    `package has not been altered.`,
    ``,
  ].join("\n");
}

/**
 * Build and download a .zip containing the claim evidence package.
 * Runs fully client-side (JSZip in the browser).
 */
export async function downloadClaimPackageZip(contents: ClaimZipContents): Promise<void> {
  const zip = new JSZip();
  const name = safeName(contents.caseNumber);
  const folder = zip.folder(`case-${name}`) ?? zip;

  folder.file("claim-evidence-package.html", contents.packageHtml);
  folder.file("evidence-data.json", JSON.stringify(contents.data, null, 2));
  folder.file("README.txt", buildReadme(contents));

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const fileName = `case-${name}-claim-package.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast.success("Claim package downloaded", {
    description: `${fileName} — package, data and manifest.`,
  });
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
