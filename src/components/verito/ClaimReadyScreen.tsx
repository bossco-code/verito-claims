import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  Printer,
  Upload,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { claimInputFromCandidate, type CandidateDoc } from "./claimInput";
import { useCountUp } from "./useCountUp";
import {
  buildClaimPackageHtml,
  buildSubmissionLetterHtml,
  computeEvidenceFingerprint,
  downloadClaimPackageHtml,
  openClaimPackageHtml,
  PACKAGE_VERSION,
} from "./claimPackage";

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

function approvalLabel(score: number) {
  if (score >= 85) return "Very high";
  if (score >= 65) return "High";
  if (score >= 45) return "Moderate";
  return "Low";
}

/** Split a locale date-time string like "Aug 5, 2026, 10:24 AM" into parts. */
function splitWhen(when: string): [string, string] {
  const i = when.lastIndexOf(", ");
  if (i > -1) return [when.slice(0, i), when.slice(i + 2)];
  return [when, ""];
}

export type ClaimQuota =
  | { plan: "signed_out"; limit: null; used: null; remaining: null }
  | { plan: "free"; limit: number; used: number; remaining: number }
  | { plan: "pro"; limit: null; used: null; remaining: null };

/**
 * Claim review screen. Fully data-driven: it loads the REAL claim candidate
 * plus the synced Amazon events behind it (getOpportunityEvidence), builds
 * the ClaimInput package from those records, and generates the PDFs from it.
 * Nothing is fabricated — values the engine did not capture render as "—".
 */
export function ClaimReadyScreen({
  candidate,
  onBack,
  quota,
}: {
  candidate: CandidateDoc;
  onBack: () => void;
  quota?: ClaimQuota | null;
}) {
  const evidence = useQuery(api.amazon.queries.getOpportunityEvidence, {
    candidateId: candidate._id,
  });

  const input = useMemo(
    () =>
      evidence ? claimInputFromCandidate(evidence.candidate, evidence.events) : null,
    [evidence],
  );

  const [resolved, setResolved] = useState<Record<string, string>>({});
  const resolvedCount = Object.keys(resolved).length;

  const baseScore = Math.min(
    96,
    Math.max(0, Math.round((candidate.data_completeness ?? 0) * 100)),
  );
  const score = input
    ? Math.min(96, baseScore + resolvedCount * 12)
    : baseScore;

  const [fingerprint, setFingerprint] = useState("");
  useEffect(() => {
    if (!input) return;
    let alive = true;
    computeEvidenceFingerprint(input, score, resolved).then((fp) => {
      if (alive) setFingerprint(fp);
    });
    return () => {
      alive = false;
    };
  }, [input, score, resolved]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewTitle, setPreviewTitle] = useState("Claim Evidence Package");
  const [previewKey, setPreviewKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const autoPrintRef = useRef(false);

  const packageHtml = () =>
    input ? buildClaimPackageHtml(input, score, resolved, fingerprint) : "";
  const letterHtml = () =>
    input ? buildSubmissionLetterHtml(input, score, resolved, fingerprint) : "";

  const openDoc = (kind: "package" | "letter") => {
    if (!input) return;
    if (kind === "package") {
      setPreviewTitle("Claim Evidence Package");
      setPreviewHtml(packageHtml());
    } else {
      setPreviewTitle("Submission Letter");
      setPreviewHtml(letterHtml());
    }
    autoPrintRef.current = true;
    setPreviewKey((k) => k + 1); // remount iframe so a fresh load event always fires
    setPreviewOpen(true);
  };

  const handleIframeLoad = () => {
    if (!autoPrintRef.current) return;
    autoPrintRef.current = false;
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    // Let the document finish painting before opening the print dialog.
    window.setTimeout(() => {
      frame.focus();
      frame.print();
    }, 250);
  };

  const handlePrint = () => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    frame.focus();
    frame.print();
  };

  const handleOpenTab = () => {
    if (!input) return;
    const opened = openClaimPackageHtml(
      previewHtml,
      `${input.claimId}-${previewTitle.includes("Letter") ? "submission-letter" : "claim-package"}.html`,
    );
    if (!opened) toast.info("New tab was blocked — use Print / Save as PDF instead.");
  };

  const handleDownloadHtml = () => {
    if (!input) return;
    downloadClaimPackageHtml(
      previewHtml,
      `${input.claimId}-${previewTitle.includes("Letter") ? "submission-letter" : "claim-package"}.html`,
    );
  };

  const freeQuotaLabel =
    quota && quota.plan === "free"
      ? `${quota.used} of ${quota.limit} free claims used this month`
      : null;

  if (!input) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-24 text-center sm:py-32">
        {evidence === undefined ? (
          <>
            <Loader2 className="mx-auto size-6 animate-spin text-teal" />
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Loading claim evidence…
            </p>
          </>
        ) : (
          <div className="rounded-2xl border border-rust/40 bg-rust-soft/50 p-7">
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              This claim&apos;s evidence records could not be loaded. Go back and
              re-run the analysis.
            </p>
            <Button className="mt-5 rounded-xl" onClick={onBack}>
              <ArrowLeft className="size-4" />
              Back to dashboard
            </Button>
          </div>
        )}
      </div>
    );
  }

  const foundCount = input.evidenceFound.length + resolvedCount;
  const evidenceTotal = input.evidenceFound.length + input.evidenceMissing.length;
  const missingCount = input.evidenceMissing.length - resolvedCount;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      {/* case meta */}
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
      >
        <span>
          Claim <b className="font-medium text-foreground">{input.claimId}</b>
        </span>
        <span aria-hidden="true" className="text-border">/</span>
        <span>
          Prepared{" "}
          <b className="font-medium text-foreground">
            {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </b>
        </span>
        <span aria-hidden="true" className="text-border">/</span>
        <span>
          Marketplace <b className="font-medium text-foreground">{input.marketplaceLabel}</b>
        </span>
      </motion.div>

      {/* head */}
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.5, delay: 0.05, ease: [0.2, 0.7, 0.2, 1] }}
        className="mt-6 flex flex-wrap items-end justify-between gap-5"
      >
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Claim ready for review
          </h1>
          <p className="mt-2.5 max-w-[56ch] text-[14.5px] leading-relaxed text-muted-foreground">
            Verito assembled the evidence, timeline, and package for{" "}
            {input.claimTypeLabel.toLowerCase()} {input.shipId !== "—" ? `on shipment ${input.shipId}` : "on this case"}.
            Review the missing documents below, then print the claim package
            and submission letter.
          </p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Button>
      </motion.div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          {/* executive summary */}
          <DossierBlock title="Executive summary" delay={0.1}>
            <p className="text-[14.5px] leading-[1.75] text-muted-foreground">
              {input.summary.map((part, i) => (
                <span key={i}>
                  {i > 0 && " "}
                  <b className="font-medium text-foreground">{part.lead}</b>{" "}
                  {part.text}
                </span>
              ))}
            </p>
          </DossierBlock>

          {/* timeline */}
          <DossierBlock title="Timeline" delay={0.15}>
            <ol className="flex flex-col">
              {input.timeline.map((item, i) => {
                const [date, time] = splitWhen(item.when);
                return (
                  <li key={i} className="grid grid-cols-[86px_16px_1fr]">
                    <span className="pt-1 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
                      {date}
                      <span className="block text-[9.5px]">{time}</span>
                    </span>
                    <span className="flex flex-col items-center">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          i === input.timeline.length - 1 ? "bg-teal" : "bg-ink",
                        )}
                        aria-hidden="true"
                      />
                      {i < input.timeline.length - 1 && (
                        <span className="min-h-7 w-px flex-1 bg-border" aria-hidden="true" />
                      )}
                    </span>
                    <span className="pb-6 pl-3.5">
                      <span className="block text-[13.5px] font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        {item.detail}
                      </span>
                      <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
                        {item.source}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </DossierBlock>

          {/* evidence index */}
          <DossierBlock title="Evidence index" delay={0.2}>
            <div className="grid gap-7 sm:grid-cols-2">
              {/* found */}
              <div>
                <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  <span className="size-2 rounded-[3px] bg-teal" aria-hidden="true" />
                  Found — {foundCount}
                </p>
                <ul className="mt-3">
                  {input.evidenceFound.map((ev) => (
                    <li
                      key={ev.name}
                      className="flex items-start gap-2.5 border-t border-border/70 py-2.5 first:border-t-0"
                    >
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-teal-soft">
                        <Check className="size-2.5 text-teal" strokeWidth={3.5} />
                      </span>
                      <span>
                        <span className="block text-[13px] font-medium">{ev.name}</span>
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                          {ev.source}
                        </span>
                      </span>
                    </li>
                  ))}
                  {input.evidenceMissing
                    .filter((ev) => resolved[ev.id])
                    .map((ev) => (
                      <li
                        key={ev.id}
                        className="flex items-start gap-2.5 border-t border-border/70 py-2.5 first:border-t-0"
                      >
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-teal-soft">
                          <Check className="size-2.5 text-teal" strokeWidth={3.5} />
                        </span>
                        <span>
                          <span className="block text-[13px] font-medium">{ev.name}</span>
                          <span className="font-mono text-[10.5px] text-teal-deep">
                            Uploaded — {resolved[ev.id]}
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>
              </div>

              {/* missing */}
              <div>
                <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  <span className="size-2 rounded-[3px] bg-rust" aria-hidden="true" />
                  Missing — {missingCount}
                </p>
                <ul className="mt-3">
                  {input.evidenceMissing
                    .filter((ev) => !resolved[ev.id])
                    .map((ev) => (
                      <li
                        key={ev.id}
                        className="border-t border-border/70 py-2.5 first:border-t-0"
                      >
                        <span className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-rust-soft">
                            <AlertTriangle className="size-2.5 text-rust" strokeWidth={2.5} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium">{ev.name}</span>
                            <span className="block font-mono text-[10.5px] text-muted-foreground">
                              {ev.hint}
                            </span>
                            <UploadButton
                              onFile={(name) =>
                                setResolved((r) => ({ ...r, [ev.id]: name }))
                              }
                            />
                          </span>
                        </span>
                      </li>
                    ))}
                  {missingCount === 0 && (
                    <li className="flex items-start gap-2.5 border-t border-border/70 py-2.5 text-[13px] text-muted-foreground first:border-t-0">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-teal-soft">
                        <Check className="size-2.5 text-teal" strokeWidth={3.5} />
                      </span>
                      Nothing missing — all required documents provided.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </DossierBlock>
        </div>

        {/* sidebar */}
        <motion.aside
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
          className="lg:sticky lg:top-24"
        >
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(16,24,22,0.04),0_18px_44px_-18px_rgba(16,24,22,0.12)] sm:p-7">
            <ScoreRing score={score} />

            <div className="mt-3 flex justify-center">
              <span className="rounded-full bg-teal-soft px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-teal-deep">
                Approval likelihood: {approvalLabel(score)}
              </span>
            </div>

            <div className="my-6 h-px bg-border" />

            <dl className="space-y-4">
              <div className="flex items-baseline justify-between">
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  Estimated recovery
                </dt>
                <dd className="text-[22px] font-semibold tracking-tight tabular-nums">
                  ${(input.estimate ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  Claim window
                </dt>
                <dd className="text-[15px] font-medium tabular-nums">
                  {input.claimWindowDays != null
                    ? `${input.claimWindowDays} days left`
                    : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  Evidence
                </dt>
                <dd className="text-[15px] font-medium tabular-nums">
                  {foundCount} of {evidenceTotal}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  Case status
                </dt>
                <dd className="text-[13px] font-medium capitalize tabular-nums">
                  {input.status.replaceAll("_", " ")}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  Plan
                </dt>
                <dd className="text-[13px] font-medium tabular-nums">
                  {quota?.plan === "pro"
                    ? "Pro · unlimited"
                    : freeQuotaLabel ?? "Free · 5 claims/mo"}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-col gap-2.5">
              <Button
                className="h-11 w-full rounded-xl"
                onClick={() => openDoc("package")}
              >
                <Download className="size-4" />
                Claim Evidence Package (PDF)
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl"
                onClick={() => openDoc("letter")}
              >
                <FileText className="size-4" />
                Submission Letter (PDF)
              </Button>
            </div>
            <p className="mt-3 text-center font-mono text-[10.5px] tracking-[0.02em] text-muted-foreground">
              Print dialog opens automatically — preview · download .html
            </p>
          </div>
        </motion.aside>
      </div>

      {/* package preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90vh] max-w-[1100px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[1100px]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card px-5 py-3.5">
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold tracking-tight">
                {previewTitle} · {input.claimId}
              </DialogTitle>
              <DialogDescription className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                {foundCount} of {evidenceTotal} evidence attached
                {missingCount > 0 ? ` · ${missingCount} missing` : " · complete"}
                {fingerprint ? ` · v${PACKAGE_VERSION}` : ""}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="rounded-lg" onClick={handlePrint}>
                <Printer className="size-4" />
                Print / Save as PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={handleOpenTab}
              >
                <ExternalLink className="size-4" />
                New tab
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={handleDownloadHtml}
              >
                <FileDown className="size-4" />
                .html
              </Button>
              <DialogClose asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 rounded-lg"
                  aria-label="Close preview"
                >
                  <X className="size-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
          <iframe
            key={previewKey}
            ref={iframeRef}
            title={`${previewTitle} — ${input.claimId}`}
            srcDoc={previewHtml}
            onLoad={handleIframeLoad}
            className="min-h-0 w-full flex-1 border-0 bg-white"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DossierBlock({
  title,
  delay,
  children,
}: {
  title: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <motion.section
      {...fadeUp}
      transition={{ duration: 0.5, delay, ease: [0.2, 0.7, 0.2, 1] }}
      className="rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(16,24,22,0.04)] sm:p-7"
    >
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

function UploadButton({ onFile }: { onFile: (name: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file.name);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-rust/50 bg-rust-soft/60 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-rust transition-colors hover:bg-rust-soft"
      >
        <Upload className="size-3" />
        Upload file
      </button>
    </>
  );
}

function ScoreRing({ score }: { score: number }) {
  const R = 78;
  const C = 2 * Math.PI * R;
  const offset = C - (score / 100) * C;
  const animScore = useCountUp(score, true, { duration: 1100 });

  return (
    <div className="relative mx-auto w-[190px]">
      <svg viewBox="0 0 200 200" className="w-full">
        <circle
          cx="100"
          cy="100"
          r="94"
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="1 5"
        />
        <circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke="var(--border)"
          strokeWidth="11"
        />
        <circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke="var(--gold)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 100 100)"
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)" }}
        />
        <text
          x="100"
          y="98"
          textAnchor="middle"
          className="fill-foreground"
          style={{
            fontSize: 38,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}
        >
          {animScore}%
        </text>
        <text
          x="100"
          y="121"
          textAnchor="middle"
          style={{
            fontSize: 9,
            letterSpacing: "1.6px",
            fontFamily: "var(--font-mono)",
            fill: "var(--muted-foreground)",
          }}
        >
          RECOVERY SCORE
        </text>
      </svg>
    </div>
  );
}
