import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { REJECTION_REASONS } from "@/convex/evidence/types";
import { useAction, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  FileArchive,
  FileCheck2,
  FileDown,
  History,
  Loader2,
  Printer,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VeritoBrand } from "@/components/verito/VeritoBrand";
import { buildEvidencePackageHtml, PHASE2_PACKAGE_VERSION } from "@/components/verito/evidencePackage";
import { downloadClaimPackageHtml, openClaimPackageHtml } from "@/components/verito/claimPackage";
import { downloadClaimPackageZip } from "@/components/verito/claimZip";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

/* ------------------------------- helpers ---------------------------------- */

function fmtUsd(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelType(t: string): string {
  return t.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const DECISION_TONE: Record<string, string> = {
  READY_FOR_REVIEW: "border-teal/60 bg-teal-soft text-teal-deep",
  SELLER_APPROVED: "border-teal/60 bg-teal-soft text-teal-deep",
  PACKAGE_READY: "border-teal/60 bg-teal-soft text-teal-deep",
  EVIDENCE_INCOMPLETE: "border-gold/50 bg-gold-soft text-gold-deep",
  EVIDENCE_CONFLICT: "border-rust/50 bg-rust-soft text-rust",
  NOT_READY: "border-border bg-muted text-ink-soft",
};

function decisionLabel(d: string): string {
  return d.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function verificationTone(s: string): { label: string; cls: string } {
  switch (s) {
    case "CONSISTENT":
      return { label: "Consistent", cls: "bg-teal-soft text-teal-deep" };
    case "INCONSISTENT":
      return { label: "Inconsistent", cls: "bg-rust-soft text-rust" };
    case "MISSING":
      return { label: "Missing", cls: "bg-gold-soft text-gold-deep" };
    case "AMBIGUOUS":
      return { label: "Ambiguous", cls: "bg-gold-soft text-gold-deep" };
    case "NOT_APPLICABLE":
      return { label: "Not applicable", cls: "bg-muted text-ink-soft" };
    default:
      return { label: "Pending", cls: "bg-muted text-ink-soft" };
  }
}

/* ------------------------------- main page --------------------------------- */

export default function CaseWorkspace() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const detail = useQuery(
    api.evidence.queries.getCaseDetail,
    caseId ? { caseId: caseId as Id<"evidenceCases"> } : "skip",
  );

  const reCollect = useAction(api.evidence.actions.reCollectEvidence);
  const runAi = useAction(api.evidence.actions.runAIAnalysis);
  const saveNarrative = useAction(api.evidence.actions.saveNarrative);
  const approve = useAction(api.evidence.actions.sellerApprove);
  const reject = useAction(api.evidence.actions.sellerReject);
  const generate = useAction(api.evidence.actions.generatePackage);

  const [busy, setBusy] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<Id<"evidenceItems"> | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>(REJECTION_REASONS.INCORRECT_DISCREPANCY);
  const [rejectNote, setRejectNote] = useState("");
  const [narrative, setNarrative] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Keep the editable narrative in sync when the AI analysis loads/changes.
  useEffect(() => {
    if (detail?.aiAnalysis?.draftNarrative != null) {
      setNarrative((prev) => (prev == null ? detail.aiAnalysis!.draftNarrative! : prev));
    } else if (detail?.aiAnalysis == null) {
      setNarrative(null);
    }
  }, [detail?.aiAnalysis?.draftNarrative, detail?.aiAnalysis == null]);

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key);
      try {
        await fn();
      } catch (error) {
        console.error(`[case] ${key} failed:`, error);
        toast.error("Something went wrong", { description: "Please try again." });
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const handleReCollect = () =>
    run("recollect", async () => {
      const result = await reCollect({ caseId: caseId as Id<"evidenceCases"> });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Evidence re-collected", {
        description: `${result.items} evidence items · decision: ${decisionLabel(result.decision)}`,
      });
    });

  const handleRunAi = () =>
    run("ai", async () => {
      const result = await runAi({ caseId: caseId as Id<"evidenceCases"> });
      if (!result.ok) {
        toast.error("AI analysis unavailable", {
          description:
            "The deterministic evidence workflow is unaffected. Check the project Keys tab for VLY_INTEGRATION_KEY.",
        });
        return;
      }
      toast.success(result.regenerated ? "AI analysis regenerated" : "AI analysis generated", {
        description:
          result.droppedRefs.length > 0
            ? `Statements referencing unknown evidence were dropped (${result.droppedRefs.length}).`
            : "All statements are traceable to evidence IDs.",
      });
    });

  const handleSaveNarrative = () =>
    run("narrative", async () => {
      if (narrative == null) return;
      const result = await saveNarrative({
        caseId: caseId as Id<"evidenceCases">,
        narrative,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Narrative saved", { description: "Your edits are stored for the package." });
    });

  const handleApprove = () =>
    run("approve", async () => {
      const result = await approve({ caseId: caseId as Id<"evidenceCases"> });
      if (!result.ok) {
        toast.error(result.error, {
          description: (result.reasons ?? []).join(" "),
        });
        return;
      }
      toast.success("Case approved", {
        description: "You can now generate the claim evidence package.",
      });
    });

  const handleReject = () =>
    run("reject", async () => {
      const result = await reject({
        caseId: caseId as Id<"evidenceCases">,
        reason: rejectReason,
        note: rejectNote || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Case rejected", {
        description: `Reason recorded: ${rejectReason}.`,
      });
      setRejectOpen(false);
      setRejectNote("");
    });

  const handleGenerate = () =>
    run("generate", async () => {
      const result = await generate({ caseId: caseId as Id<"evidenceCases"> });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Package generated — ${result.packageId}`, {
        description: "Opening the document preview. Regenerating creates a new version.",
      });
    });

  const openPreview = (fingerprint: string, version: number) => {
    if (!detail) return;
    const html = buildEvidencePackageHtml(detail, {
      version: `v${version}`,
      fingerprint,
    });
    setPreviewHtml(html);
    setPreviewKey((k) => k + 1);
    setPreviewOpen(true);
  };

  const latestPackage = detail?.packages[detail.packages.length - 1] ?? null;

  const handlePrint = () => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    frame.focus();
    frame.print();
  };

  const handleOpenTab = () => {
    if (!detail) return;
    const opened = openClaimPackageHtml(previewHtml, `${detail.caseNumber}-claim-evidence-package.html`);
    if (!opened) toast.info("New tab was blocked — use Print / Save as PDF instead.");
  };

  const handleDownload = () => {
    if (!detail) return;
    downloadClaimPackageHtml(previewHtml, `${detail.caseNumber}-claim-evidence-package.html`);
  };

  /** Download the whole case as a .zip: package HTML + machine-readable data + manifest. */
  const handleDownloadZip = () =>
    run("zip", async () => {
      if (!detail) return;
      await downloadClaimPackageZip({
        caseNumber: detail.caseNumber,
        packageHtml: previewHtml,
        data: {
          exportedAt: new Date().toISOString(),
          caseNumber: detail.caseNumber,
          caseType: detail.case_type,
          status: detail.status,
          decision: detail.decision,
          estimatedRecovery: detail.estimated_recovery,
          currency: detail.currency,
          candidate: detail.candidate,
          completeness: detail.completeness,
          verification: detail.verification,
          items: detail.items,
          auditTrail: detail.auditTrail,
          packages: detail.packages,
          aiAnalysis: detail.aiAnalysis,
          rejection: detail.rejection,
        },
      });
    });

  /* ------------------------------ loading states ------------------------------ */

  // Must run unconditionally — before the early returns below — so the hook
  // order stays stable as the query transitions undefined -> data -> null.
  const timeline = useMemo(() => {
    const items = detail?.items ?? [];
    return [...items]
      .filter((i) => i.event_date != null)
      .sort((a, b) => (a.event_date ?? 0) - (b.event_date ?? 0));
  }, [detail]);

  if (detail === undefined) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 py-28 text-center">
          <Loader2 className="size-6 animate-spin text-teal" />
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Loading case workspace…
          </p>
        </div>
      </Shell>
    );
  }

  if (detail === null) {
    return (
      <Shell>
        <div className="mx-auto w-full max-w-xl px-5 py-24 text-center">
          <div className="rounded-2xl border border-rust/40 bg-rust-soft/50 p-7">
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              This evidence case could not be found or you don&apos;t have access
              to it.
            </p>
            <Button className="mt-5 rounded-xl" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="size-4" />
              Back to dashboard
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  /* ------------------------------- derived data ------------------------------- */

  const items = detail.items;
  const direct = items.filter((i) => i.relevance === "DIRECT").length;
  const supporting = items.filter((i) => i.relevance === "SUPPORTING").length;
  const contextual = items.filter((i) => i.relevance === "CONTEXTUAL").length;
  const missingCount = detail.completeness.missing.length;
  const conflictCount = detail.verification.conflicts.length;
  const inconsistentCount = items.filter((i) => i.verification_status === "INCONSISTENT").length;

  const decisionTone = DECISION_TONE[detail.decision] ?? DECISION_TONE.NOT_READY;
  const ai = detail.aiAnalysis;
  const rejected = detail.rejection != null;

  return (
    <Shell>
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 sm:px-8">
        {/* case meta */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground"
        >
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-teal transition-colors hover:text-teal-deep"
          >
            <ArrowLeft className="size-3.5" />
            Dashboard
          </button>
          <span aria-hidden="true" className="text-border">/</span>
          <span>Case {detail.caseNumber}</span>
          <span aria-hidden="true" className="text-border">/</span>
          <span className="text-foreground/80">{labelType(detail.case_type)}</span>
        </motion.div>

        {/* header */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.04, ease: [0.2, 0.7, 0.2, 1] }}
          className="mt-5 flex flex-wrap items-end justify-between gap-5"
        >
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">
              Evidence case {detail.caseNumber}
            </h1>
            <p className="mt-2 max-w-[58ch] text-[14px] leading-relaxed text-muted-foreground">
              Every claim statement below is backed by traceable Amazon evidence.
              Review the decision, verify the evidence, then approve or reject.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleReCollect}
              disabled={busy === "recollect"}
            >
              {busy === "recollect" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Re-collect evidence
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleRunAi}
              disabled={busy === "ai"}
            >
              {busy === "ai" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {ai ? "Regenerate analysis" : "Run AI analysis"}
            </Button>
          </div>
        </motion.div>

        {/* key figures */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.2, 0.7, 0.2, 1] }}
          className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <KeyFigure label="Potential recovery" value={fmtUsd(detail.estimated_recovery, detail.currency)} meta={`claim ${detail.candidate.claimId}`} />
          <KeyFigure
            label="Deadline"
            value={detail.candidate.deadline_date ? fmtDate(detail.candidate.deadline_date) : "—"}
            meta={
              detail.candidate.days_remaining != null
                ? `${detail.candidate.days_remaining} days remaining`
                : "no policy window"
            }
          />
          <KeyFigure
            label="Status"
            value={
              <span
                className={cn(
                  "inline-block rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em]",
                  decisionTone,
                )}
              >
                {decisionLabel(detail.decision)}
              </span>
            }
            meta={rejected ? `Rejected — ${detail.rejection?.reason ?? "no reason"}` : `case ${detail.status.replaceAll("_", " ")}`}
          />
          <KeyFigure
            label="Priority"
            value={<span className="capitalize">{labelType(detail.candidate.priority)}</span>}
            meta={`${detail.candidate.quantity ?? 0} units · ${detail.candidate.sku ?? "SKU —"}`}
          />
        </motion.div>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.65fr_1fr]">
          {/* ------------------------------ left column ------------------------------ */}
          <div className="space-y-6">
            {/* evidence summary */}
            <Block title="Evidence summary" icon={<ClipboardList className="size-4" />} delay={0.12}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Count label="Direct" value={direct} cls="text-teal-deep" />
                <Count label="Supporting" value={supporting} cls="text-ink-soft" />
                <Count label="Missing" value={missingCount} cls="text-gold-deep" />
                <Count label="Conflicts" value={conflictCount} cls="text-rust" />
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
                Completeness:{" "}
                <b className="font-medium text-foreground">{detail.completeness.status}</b>
                {" · "}
                {inconsistentCount > 0 ? (
                  <span className="text-rust">
                    {inconsistentCount} evidence item{inconsistentCount > 1 ? "s" : ""} flagged inconsistent.
                  </span>
                ) : (
                  <span className="text-teal-deep">No evidence flagged inconsistent.</span>
                )}
              </p>
            </Block>

            {/* timeline */}
            <Block title="Evidence timeline" icon={<History className="size-4" />} delay={0.16}>
              {timeline.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  No dated evidence events yet. Re-collect evidence after new Amazon records post.
                </p>
              ) : (
                <ol className="flex flex-col">
                  {timeline.map((item, i) => {
                    const tone = verificationTone(item.verification_status);
                    return (
                      <li key={item.evidenceId} className="grid grid-cols-[104px_18px_1fr]">
                        <span className="pt-1 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
                          {fmtDate(item.event_date)}
                        </span>
                        <span className="flex flex-col items-center">
                          <span
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-full",
                              i === timeline.length - 1 ? "bg-teal" : "bg-ink",
                            )}
                            aria-hidden="true"
                          />
                          {i < timeline.length - 1 && (
                            <span className="min-h-7 w-px flex-1 bg-border" aria-hidden="true" />
                          )}
                        </span>
                        <span className="pb-5 pl-3">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] font-semibold tracking-[0.06em] text-ink-soft">
                              {item.evidenceNo}
                            </span>
                            <span className="text-[13.5px] font-medium text-foreground">
                              {item.title}
                            </span>
                          </span>
                          {item.description && (
                            <span className="mt-0.5 block text-[12px] text-muted-foreground">
                              {item.description}
                            </span>
                          )}
                          <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
                            {item.source}
                            {item.source_record_id ? ` · ${item.source_record_id}` : ""}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Block>

            {/* evidence list */}
            <Block title="Evidence" icon={<Scale className="size-4" />} delay={0.2}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border/80 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">ID</th>
                      <th className="py-2 pr-3 font-medium">Evidence</th>
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Source / Record</th>
                      <th className="py-2 pr-3 font-medium">Verification</th>
                      <th className="py-2 pr-3 text-right font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const tone = verificationTone(item.verification_status);
                      return (
                        <tr
                          key={item.evidenceId}
                          className="border-b border-border/60 align-top last:border-b-0"
                        >
                          <td className="py-3 pr-3 font-mono text-[11px] font-semibold text-ink-soft">
                            {item.evidenceNo}
                          </td>
                          <td className="max-w-[220px] py-3 pr-3">
                            <span className="block text-[13px] font-medium leading-snug">
                              {item.title}
                            </span>
                            {item.description && (
                              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
                                {item.description}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-3 font-mono text-[11px] text-muted-foreground">
                            {fmtDate(item.event_date)}
                          </td>
                          <td className="py-3 pr-3">
                            <span className="block text-[11.5px] text-foreground/80">{item.source}</span>
                            <span className="block font-mono text-[10.5px] text-muted-foreground">
                              {item.source_record_id ?? "—"}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            <span
                              className={cn(
                                "inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                                tone.cls,
                              )}
                            >
                              {tone.label}
                            </span>
                            {item.relevance !== "DIRECT" && (
                              <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
                                {item.relevance.toLowerCase()}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSourceId(item.evidenceId)}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-foreground/80 transition-colors hover:border-teal/50 hover:text-teal-deep"
                            >
                              View source
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Block>

            {/* AI analysis */}
            <Block
              title="AI analysis"
              icon={<Sparkles className="size-4" />}
              delay={0.24}
              badge={
                ai && ai.status === "generated" ? (
                  <span className="rounded-full bg-teal-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-teal-deep">
                    AI-generated
                  </span>
                ) : undefined
              }
            >
              {!ai || ai.status !== "generated" ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {ai?.status === "failed"
                      ? "The AI analysis failed — the deterministic evidence workflow is unaffected. You can retry, or continue without AI assistance."
                      : "Run the AI analysis to get a summary, key facts, and a draft narrative built only from the verified evidence below. Every statement references Evidence IDs."}
                  </p>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={handleRunAi}
                    disabled={busy === "ai"}
                  >
                    {busy === "ai" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Generate AI analysis
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {ai.summary}
                  </p>

                  {ai.keyFacts && ai.keyFacts.length > 0 && (
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Key facts
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {ai.keyFacts.map((fact, i) => (
                          <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/85">
                            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-teal" aria-hidden="true" />
                            {fact}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {ai.missingInformation && ai.missingInformation.length > 0 && (
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Missing information
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {ai.missingInformation.map((g, i) => (
                          <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-gold-deep">
                            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                            {g}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {ai.evidenceReferences && ai.evidenceReferences.length > 0 && (
                    <p className="font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
                      Evidence references: {ai.evidenceReferences.join(", ")}
                    </p>
                  )}

                  {/* editable draft narrative */}
                  <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Draft narrative — AI-GENERATED, seller review required
                      </p>
                      <span className="font-mono text-[10px] text-muted-foreground/70">
                        {ai.modelIdentifier ? `model ${ai.modelIdentifier}` : ""}
                      </span>
                    </div>
                    <textarea
                      value={narrative ?? ""}
                      onChange={(e) => setNarrative(e.target.value)}
                      rows={7}
                      className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground outline-none transition-colors focus:border-teal/60"
                      placeholder="The AI draft appears here — edit it before generating the package."
                    />
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        className="rounded-lg"
                        onClick={handleSaveNarrative}
                        disabled={busy === "narrative" || narrative == null}
                      >
                        {busy === "narrative" ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        Save narrative
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Block>

            {/* audit trail */}
            <Block title="Audit trail" icon={<History className="size-4" />} delay={0.28}>
              {detail.auditTrail.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No recorded events yet.</p>
              ) : (
                <ol className="flex flex-col">
                  {detail.auditTrail.map((event, i) => (
                    <li key={i} className="grid grid-cols-[104px_18px_1fr]">
                      <span className="pt-1 font-mono text-[10.5px] text-muted-foreground">
                        {fmtDateTime(event.createdAt)}
                      </span>
                      <span className="flex flex-col items-center">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border" aria-hidden="true" />
                        {i < detail.auditTrail.length - 1 && (
                          <span className="min-h-6 w-px flex-1 bg-border/70" aria-hidden="true" />
                        )}
                      </span>
                      <span className="pb-4 pl-3 text-[12.5px] text-foreground/85">
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                          {event.actor} ·{" "}
                        </span>
                        {event.action.replaceAll(".", " ")}
                        {event.objectId ? (
                          <span className="font-mono text-[10.5px] text-muted-foreground">
                            {" "}· {event.objectId}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Block>
          </div>

          {/* ------------------------------ right column ------------------------------ */}
          <aside className="space-y-6 lg:sticky lg:top-6">
            {/* decision */}
            <div className="rounded-2xl border border-border/80 bg-card p-6">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                Current decision
              </p>
              <div className="mt-3">
                <span
                  className={cn(
                    "inline-block rounded-full border px-4 py-1.5 font-mono text-[12px] uppercase tracking-[0.08em]",
                    decisionTone,
                  )}
                >
                  {decisionLabel(detail.decision)}
                </span>
              </div>
              {detail.verification.conflicts.length > 0 && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rust/40 bg-rust-soft/50 px-3.5 py-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rust" />
                  <p className="text-[12px] leading-relaxed text-rust">
                    {detail.verification.conflicts[0].detail}
                  </p>
                </div>
              )}
              {missingCount > 0 && detail.verification.conflicts.length === 0 && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-gold/40 bg-gold-soft/50 px-3.5 py-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-deep" />
                  <p className="text-[12px] leading-relaxed text-gold-deep">
                    {missingCount} required evidence categor{missingCount > 1 ? "ies are" : "y is"} missing. The case cannot be approved until resolved.
                  </p>
                </div>
              )}
            </div>

            {/* verification checks */}
            <div className="rounded-2xl border border-border/80 bg-card p-6">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                Verification
              </p>
              <ul className="mt-4 space-y-3">
                {detail.verification.checks.map((check) => {
                  const tone = verificationTone(check.status);
                  return (
                    <li key={check.check} className="flex items-start justify-between gap-3">
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-foreground/80">
                        {check.check}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                          tone.cls,
                        )}
                      >
                        {tone.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* seller review */}
            <div className="rounded-2xl border border-border/80 bg-card p-6">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                Seller review
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                Verito never submits claims automatically. You decide: approve
                the case to unlock the evidence package, or reject it with a
                recorded reason.
              </p>
              <div className="mt-4 flex flex-col gap-2.5">
                <Button
                  className="w-full rounded-xl"
                  onClick={handleApprove}
                  disabled={busy === "approve" || rejected}
                >
                  {busy === "approve" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Approve case
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => setRejectOpen(true)}
                  disabled={rejected}
                >
                  Reject case
                </Button>
              </div>
              {rejected && (
                <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                  Rejected: <b className="font-medium text-foreground">{detail.rejection?.reason}</b>
                  {detail.rejection?.note ? ` — ${detail.rejection.note}` : ""}
                </p>
              )}
            </div>

            {/* package */}
            <div className="rounded-2xl border border-border/80 bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  Claim evidence package
                </p>
                <FileCheck2 className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                A package requires seller approval first. Regenerating creates a
                new version — previous versions are preserved.
              </p>

              {latestPackage ? (
                <div className="mt-4 rounded-xl border border-border/80 bg-muted/30 p-3.5">
                  <p className="font-mono text-[11px] font-semibold text-foreground">
                    {latestPackage.packageId}
                  </p>
                  <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                    {latestPackage.status.replaceAll("_", " ")} ·{" "}
                    {fmtDateTime(latestPackage.generatedAt)}
                  </p>
                  {latestPackage.fingerprint && (
                    <p className="mt-2 break-all font-mono text-[9.5px] leading-relaxed text-muted-foreground/80">
                      FP {latestPackage.fingerprint.slice(0, 32)}…
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="rounded-lg"
                      onClick={() => openPreview(latestPackage.fingerprint ?? "", latestPackage.version)}
                    >
                      <Printer className="size-3.5" />
                      Preview / print
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 font-mono text-[11px] text-muted-foreground/80">
                  No package generated yet.
                </p>
              )}

              <Button
                className="mt-4 w-full rounded-xl"
                onClick={handleGenerate}
                disabled={busy === "generate" || detail.decision !== "SELLER_APPROVED" || rejected}
              >
                {busy === "generate" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileCheck2 className="size-4" />
                )}
                {latestPackage ? "Generate new version" : "Generate package"}
              </Button>
              {detail.decision !== "SELLER_APPROVED" && (
                <p className="mt-2.5 text-center font-mono text-[10.5px] text-muted-foreground/80">
                  Requires: approved case
                </p>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* source view dialog */}
      {sourceId && <SourceDialog evidenceId={sourceId} onClose={() => setSourceId(null)} />}

      {/* reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-[440px] overflow-hidden rounded-2xl p-0">
          <div className="p-6 sm:p-7">
            <DialogTitle className="text-[16px] font-semibold tracking-tight">
              Reject this case
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              The reason is stored for auditability. Rejecting closes the case
              and marks it not actionable.
            </DialogDescription>

            <p className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Reason
            </p>
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-2 w-full cursor-pointer rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none transition-colors focus:border-teal/60"
            >
              {Object.values(REJECTION_REASONS).map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>

            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Note (optional)
            </p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none transition-colors focus:border-teal/60"
              placeholder="Optional context for the audit trail"
            />

            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <Button variant="outline" className="rounded-xl" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="rounded-xl"
                onClick={handleReject}
                disabled={busy === "reject"}
              >
                {busy === "reject" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                Reject case
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* package preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90vh] max-w-[1100px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[1100px]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card px-5 py-3.5">
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold tracking-tight">
                Claim Evidence Package · {detail.caseNumber}
              </DialogTitle>
              <DialogDescription className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                v{latestPackage?.version ?? PHASE2_PACKAGE_VERSION} ·{" "}
                {detail.completeness.status} · decision {decisionLabel(detail.decision)}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="rounded-lg" onClick={handlePrint}>
                <Printer className="size-4" />
                Print / Save as PDF
              </Button>
              <Button size="sm" variant="outline" className="rounded-lg" onClick={handleOpenTab}>
                <ExternalLink className="size-4" />
                New tab
              </Button>
              <Button size="sm" variant="outline" className="rounded-lg" onClick={handleDownload}>
                <FileDown className="size-4" />
                .html
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={handleDownloadZip}
                disabled={busy === "zip"}
              >
                {busy === "zip" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileArchive className="size-4" />
                )}
                .zip
              </Button>
              <DialogClose asChild>
                <Button size="icon" variant="ghost" className="size-8 rounded-lg" aria-label="Close preview">
                  <X className="size-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
          <iframe
            key={previewKey}
            ref={iframeRef}
            title={`Claim Evidence Package — ${detail.caseNumber}`}
            srcDoc={previewHtml}
            className="min-h-0 w-full flex-1 border-0 bg-white"
          />
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

/* ------------------------------ sub components ------------------------------ */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex items-center rounded-lg transition-opacity hover:opacity-80"
            aria-label="Go back"
          >
            <VeritoBrand />
          </button>
          <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground sm:block">
            Evidence case workspace
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}

function KeyFigure({
  label,
  value,
  meta,
}: {
  label: string;
  value: ReactNode;
  meta: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2.5 text-[22px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      <p className="mt-2.5 truncate text-[12px] text-muted-foreground">{meta}</p>
    </div>
  );
}

function Block({
  title,
  icon,
  delay,
  badge,
  children,
}: {
  title: string;
  icon: ReactNode;
  delay: number;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.section
      {...fadeUp}
      transition={{ duration: 0.45, delay, ease: [0.2, 0.7, 0.2, 1] }}
      className="rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(16,24,22,0.04)] sm:p-7"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg bg-teal-soft text-teal">
            {icon}
          </span>
          {title}
        </h2>
        {badge}
      </div>
      <div className="mt-5">{children}</div>
    </motion.section>
  );
}

function Count({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
      <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-[24px] font-semibold leading-none tracking-tight tabular-nums", cls)}>
        {value}
      </p>
    </div>
  );
}

/* ------------------------------ source dialog ------------------------------- */

function SourceDialog({
  evidenceId,
  onClose,
}: {
  evidenceId: Id<"evidenceItems">;
  onClose: () => void;
}) {
  const source = useQuery(api.evidence.queries.getEvidenceSource, { evidenceId });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-[560px] overflow-y-auto rounded-2xl p-0">
        <div className="border-b border-border/80 px-6 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <ShieldCheck className="size-4 text-teal" />
                Source record
              </DialogTitle>
              <DialogDescription className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                {source ? source.evidenceNo : "Traceability"}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button size="icon" variant="ghost" className="size-8 rounded-lg" aria-label="Close">
                <X className="size-4" />
              </Button>
            </DialogClose>
          </div>
        </div>

        <div className="px-6 py-5 sm:px-7">
          {source === undefined ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-teal" />
            </div>
          ) : source === null ? (
            <p className="text-[13px] text-muted-foreground">Source record not found.</p>
          ) : (
            <div className="space-y-3.5">
              <div>
                <p className="text-[14px] font-medium leading-snug text-foreground">{source.title}</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">{source.relevance.toLowerCase()} · {source.verification_status.toLowerCase()}</p>
              </div>
              <dl className="space-y-2.5">
                <Row k="Evidence ID" v={source.evidenceNo} mono />
                <Row k="Source" v={source.source} />
                <Row k="Source record ID" v={source.source_record_id ?? "—"} mono />
                <Row k="Event ID" v={source.event_id ?? "—"} mono />
                <Row k="Date" v={source.event_date ? fmtDateTime(source.event_date) : "—"} />
                <Row k="Marketplace" v={source.marketplace_id ?? "—"} mono />
                <Row k="SKU / ASIN / FNSKU" v={[source.sku, source.asin, source.fnsku].filter(Boolean).join(" · ") || "—"} mono />
                <Row k="Shipment / Order" v={[source.shipment_id, source.order_id].filter(Boolean).join(" · ") || "—"} mono />
                <Row k="Amount" v={fmtUsd(source.amount, source.currency)} />
              </dl>

              {source.raw_event && (
                <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    Original normalized record
                  </p>
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-foreground/80">
                    {source.raw_event.event_type} · {fmtDateTime(source.raw_event.event_date)} ·{" "}
                    {source.raw_event.source_record_id}
                  </p>
                </div>
              )}

              {source.original_metadata != null && (
                <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    Stored metadata
                  </p>
                  <pre className="mt-2 max-h-40 overflow-auto font-mono text-[10.5px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(source.original_metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-b-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{k}</dt>
      <dd className={cn("max-w-[60%] text-right text-[12.5px] font-medium text-foreground", mono && "font-mono text-[11.5px]")}>
        {v}
      </dd>
    </div>
  );
}

/** Keep an unused export referenced so tree-shaking doesn't drop it. */
export { Download as _CaseWorkspaceIcon };
