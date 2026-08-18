import { Button } from "@/components/ui/button";
import type { Doc } from "@/convex/_generated/dataModel";
import type { OpportunitySummary } from "@/convex/amazon/types";
import { claimTypeLabel, statusLabel } from "./claimInput";
import {
  ArrowRight,
  CalendarClock,
  FileCheck2,
  LayoutDashboard,
  PackageCheck,
  Printer,
  RotateCcw,
  ScanSearch,
  Send,
  Truck,
  Upload,
} from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

const TYPE_ICONS: Record<string, typeof Truck> = {
  FBA_LOSS: Truck,
  FBA_DAMAGE: PackageCheck,
  FBA_RECEIVING_DISCREPANCY: RotateCcw,
};

const STATUS_PILL: Record<string, string> = {
  ELIGIBLE: "bg-teal-soft text-teal-deep",
  NOT_YET_ELIGIBLE: "bg-gold-soft text-gold-deep",
  ALREADY_REIMBURSED: "bg-muted text-ink-soft",
  PARTIALLY_REIMBURSED: "bg-muted text-ink-soft",
  EXPIRED: "bg-rust-soft text-rust",
  DUPLICATE: "bg-muted text-ink-soft",
  REQUIRES_MANUAL_REVIEW: "bg-rust-soft text-rust",
  POLICY_REVIEW_REQUIRED: "bg-rust-soft text-rust",
};

const NEXT_STEPS = [
  {
    icon: FileCheck2,
    title: "Review your claim package",
    text: "Evidence, timeline, and recovery math are assembled into one marketplace-ready PDF.",
  },
  {
    icon: Upload,
    title: "Upload missing evidence",
    text: "If proof of delivery or photos are flagged, add them before you print.",
  },
  {
    icon: Printer,
    title: "Print package + letter",
    text: "Save the claim package and the submission letter as PDFs — one click each.",
  },
  {
    icon: Send,
    title: "Submit to Amazon",
    text: "Attach both documents to Seller Support to open your reimbursement case.",
  },
] as const;

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/**
 * First-run experience shown once after the first completed analysis.
 * Summarizes what Verito actually found (opportunities, recovery, readiness)
 * from the live engine results and offers a path into the claim review or the
 * dashboard.
 */
export function FirstRunIntro({
  candidates,
  summary,
  onReview,
  onDashboard,
}: {
  candidates: Doc<"claimCandidates">[];
  summary: OpportunitySummary | null;
  onReview: () => void;
  onDashboard: () => void;
}) {
  const actionable = candidates.filter(
    (c) => c.status === "ELIGIBLE" || c.status === "NOT_YET_ELIGIBLE",
  );
  const shown = actionable.length > 0 ? actionable : candidates;
  const totalRecovery = summary?.potentialRecovery ?? 0;
  const avgScore = shown.length
    ? Math.round(
        shown.reduce((sum, c) => sum + (c.data_completeness ?? 0), 0) /
          shown.length *
          100,
      )
    : 0;
  const nextExpiry = actionable
    .filter((c) => c.days_remaining != null && c.days_remaining > 0)
    .sort((a, b) => (a.days_remaining ?? 0) - (b.days_remaining ?? 0))[0];

  return (
    <section className="mx-auto w-full max-w-5xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
      {/* hero */}
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
        className="text-center"
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-teal-soft px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-teal-deep">
          <ScanSearch className="size-3.5" />
          Analysis complete · First review
        </span>
        <h1 className="mt-5 text-[clamp(30px,4vw,42px)] font-semibold leading-[1.08] tracking-tight">
          Here&apos;s what Verito found
        </h1>
        <p className="mx-auto mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-muted-foreground">
          Verito reconciled your Seller Central records and identified{" "}
          <b className="font-medium text-foreground">
            {summary?.actionable ?? 0} actionable reimbursement opportunity
            {(summary?.actionable ?? 0) === 1 ? "" : "ies"}
          </b>{" "}
          worth an estimated{" "}
          <b className="font-medium text-foreground">{fmtUsd(totalRecovery)}</b>.
          Everything is ready for you to review and submit.
        </p>
      </motion.div>

      {/* stats */}
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.55, delay: 0.1, ease: [0.2, 0.7, 0.2, 1] }}
        className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          label="Actionable found"
          value={<span className="text-[30px]">{summary?.actionable ?? 0}</span>}
          meta="across your FBA account"
        />
        <StatCard
          label="Potential recovery"
          value={<span className="text-[30px]">{fmtUsd(totalRecovery)}</span>}
          meta="estimated, evidence-backed"
        />
        <StatCard
          label="Avg. recovery score"
          value={<span className="text-[30px]">{avgScore}%</span>}
          meta="data completeness across cases"
        />
        <StatCard
          label="Next expiration"
          value={
            <span className="text-[30px]">
              {nextExpiry?.days_remaining != null ? `${nextExpiry.days_remaining}d` : "—"}
            </span>
          }
          meta={
            nextExpiry ? `case ${nextExpiry.claimId}` : "no active deadline"
          }
        />
      </motion.div>

      {/* opportunities + next steps */}
      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.55, delay: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Detected opportunities
            </h2>
            <span className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
              {shown.length} prioritized
            </span>
          </div>
          {shown.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-border/80 bg-card p-8 text-center shadow-[0_1px_2px_rgba(16,24,22,0.04)]">
              <p className="text-[13.5px] text-muted-foreground">
                No unresolved reimbursement opportunities found.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              {shown.map((cand) => {
                const Icon = TYPE_ICONS[cand.candidate_type] ?? ScanSearch;
                const score = Math.round((cand.data_completeness ?? 0) * 100);
                return (
                  <div
                    key={cand._id}
                    className="group flex flex-col rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(16,24,22,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-border hover:shadow-[0_16px_36px_-14px_rgba(16,24,22,0.16)]"
                  >
                    <span className="flex items-center gap-2 self-start rounded-full bg-teal-soft px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-teal-deep">
                      <Icon className="size-3" />
                      {claimTypeLabel(cand.candidate_type)}
                    </span>
                    <p className="mt-4 text-[14.5px] font-medium leading-snug tracking-tight text-foreground">
                      {cand.sku ?? "SKU —"}
                      {cand.quantity != null ? ` · ${cand.quantity} units` : ""}
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {[
                        cand.shipment_id ?? null,
                        cand.asin ?? null,
                        cand.detected_at
                          ? new Date(cand.detected_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || cand.claimId}
                    </p>
                    <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3.5">
                      <span className="text-[21px] font-semibold tracking-tight tabular-nums">
                        {fmtUsd(cand.estimated_value)}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Score {score}%
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.06em]",
                          STATUS_PILL[cand.status] ?? "bg-muted text-ink-soft",
                        )}
                      >
                        {statusLabel(cand.status)}
                      </span>
                      {cand.days_remaining != null && cand.days_remaining >= 0 && (
                        <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                          <CalendarClock className="size-3" />
                          {cand.days_remaining}d left
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ duration: 0.55, delay: 0.26, ease: [0.2, 0.7, 0.2, 1] }}
          className="rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(16,24,22,0.04)] sm:p-7"
        >
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            What happens next
          </h2>
          <ol className="mt-4">
            {NEXT_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className="flex gap-3.5 border-t border-border/70 py-4 first:border-t-0"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-soft text-teal">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2 text-[13.5px] font-medium text-foreground">
                      <span className="font-mono text-[10px] tracking-[0.1em] text-teal-deep">
                        0{i + 1}
                      </span>
                      {step.title}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                      {step.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-gold/40 bg-gold-soft/60 px-4 py-3.5">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-gold-deep" />
            <p className="text-[12.5px] leading-relaxed text-gold-deep">
              <b className="font-medium">Tip</b> — open the claim package and
              choose Print → Save as PDF to keep both documents.
            </p>
          </div>
        </motion.div>
      </div>

      {/* CTAs */}
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.55, delay: 0.34, ease: [0.2, 0.7, 0.2, 1] }}
        className="mt-12 flex flex-col items-center gap-3.5"
      >
        <div className="flex flex-wrap justify-center gap-3.5">
          <Button
            size="lg"
            className="h-12 rounded-xl px-6 text-[14.5px] shadow-[0_8px_24px_-8px_oklch(0.46_0.1_178/0.55)] transition-all hover:-translate-y-0.5"
            onClick={onReview}
          >
            Review claim package
            <ArrowRight className="size-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 rounded-xl px-6 text-[14.5px]"
            onClick={onDashboard}
          >
            <LayoutDashboard className="size-4" />
            Go to dashboard
          </Button>
        </div>
        <p className="font-mono text-[11px] tracking-[0.03em] text-muted-foreground/80">
          Shown once after your first analysis — re-run the analysis anytime
          from the dashboard
        </p>
      </motion.div>
    </section>
  );
}

function StatCard({
  label,
  value,
  meta,
}: {
  label: string;
  value: ReactNode;
  meta: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(16,24,22,0.04)]">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2.5 text-[30px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      <p className="mt-2.5 text-[12.5px] text-muted-foreground">{meta}</p>
    </div>
  );
}
