import { Button } from "@/components/ui/button";
import type { Doc } from "@/convex/_generated/dataModel";
import type { OpportunitySummary } from "@/convex/amazon/types";
import { claimTypeLabel, statusLabel } from "./claimInput";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  KeyRound,
  Loader2,
  Lock,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CandidateDoc = Doc<"claimCandidates">;

export interface ConnectionInfo {
  status: string;
  sellerId: string | null;
  marketplaceId: string;
  region: string;
  connectedAt: number | null;
  lastSyncAt: number | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  dataFrom: number | null;
  dataTo: number | null;
}

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

const HOW_IT_WORKS = [
  {
    icon: Lock,
    title: "Connect securely",
    text: "Official Amazon OAuth — read-only access, refresh token stored encrypted.",
  },
  {
    icon: ScanSearch,
    title: "We analyze",
    text: "Financial, inbound, and inventory records are reconciled automatically.",
  },
  {
    icon: RefreshCw,
    title: "You review",
    text: "Actionable, prioritized opportunities — you decide what to submit.",
  },
] as const;

function fmtSyncDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function HomeScreen({
  connected,
  connection,
  onConnect,
  onPrepare,
  onPrepareOne,
  preparing,
  candidates,
  summary,
  configConfigured,
  configMissing,
}: {
  connected: boolean;
  connection: ConnectionInfo | null | undefined;
  onConnect: () => void;
  onPrepare: () => void;
  onPrepareOne: (candidate: CandidateDoc) => void;
  preparing: boolean;
  candidates: CandidateDoc[];
  summary: OpportunitySummary | null;
  configConfigured: boolean;
  configMissing: string[];
}) {
  if (!connected) {
    return (
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_70%_0%,oklch(0.46_0.1_178/0.07),transparent_70%)]"
          aria-hidden="true"
        />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-16 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-gold" aria-hidden="true" />
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                AI operations assistant for Amazon FBA sellers
              </span>
            </div>
            <h1 className="mt-5 text-[clamp(38px,4.6vw,56px)] font-semibold leading-[1.04] tracking-tight">
              Recover more.
              <br />
              <span className="text-teal">Do less.</span>
            </h1>
            <p className="mt-5 max-w-[46ch] text-[16.5px] leading-relaxed text-muted-foreground">
              Verito connects to your Amazon Seller Central account, finds
              reimbursement opportunities, gathers the evidence, and prepares
              marketplace-ready claim packages. You only review and submit.
            </p>

            {!configConfigured && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-gold/40 bg-gold-soft/50 px-4 py-3.5">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-gold-deep" />
                <p className="text-[12.5px] leading-relaxed text-gold-deep">
                  <b className="font-medium">Amazon integration not configured yet.</b>{" "}
                  Add{" "}
                  <span className="font-mono text-[11px]">
                    {configMissing.length > 0
                      ? configMissing.join(", ")
                      : "AMAZON_LWA_CLIENT_ID, AMAZON_LWA_CLIENT_SECRET"}
                  </span>{" "}
                  in the project Keys tab, then connect.
                </p>
              </div>
            )}

            {connection?.status === "failed" && connection.lastError && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-rust/40 bg-rust-soft/50 px-4 py-3.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rust" />
                <p className="text-[12.5px] leading-relaxed text-rust">
                  <b className="font-medium">Connection failed:</b> {connection.lastError}
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                size="lg"
                className="h-12 rounded-xl px-6 text-[14.5px] shadow-[0_8px_24px_-8px_oklch(0.46_0.1_178/0.55)] transition-all hover:-translate-y-0.5"
                onClick={onConnect}
              >
                Connect Amazon Seller Central
                <ArrowRight className="size-4" />
              </Button>
            </div>
            <p className="mt-4 font-mono text-[11px] tracking-[0.04em] text-muted-foreground/80">
              OAuth · read-only access · disconnect anytime
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.2, 0.7, 0.2, 1] }}
            className="relative mx-auto w-full max-w-md lg:max-w-none"
          >
            <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(16,24,22,0.05),0_18px_44px_-16px_rgba(16,24,22,0.14)] sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                  How Verito works
                </p>
                <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                  3 steps
                </span>
              </div>
              <ol className="mt-6">
                {HOW_IT_WORKS.map((step, i) => {
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
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-teal/30 bg-teal-soft/50 px-4 py-3.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-deep" />
                <p className="text-[12px] leading-relaxed text-teal-deep">
                  Verito never lists, prices, or modifies your catalog. Tokens are
                  encrypted at rest and scoped to the roles you approve.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    );
  }

  const actionable = candidates.filter(
    (c) => c.status === "ELIGIBLE" || c.status === "NOT_YET_ELIGIBLE",
  );
  const nextExpiry = actionable
    .filter((c) => c.days_remaining != null && c.days_remaining > 0)
    .sort((a, b) => (a.days_remaining ?? 0) - (b.days_remaining ?? 0))[0];

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
      {/* daily brief */}
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(16,24,22,0.04)] sm:p-7">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-soft text-teal">
            <ScanSearch className="size-5" />
          </span>
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
              Daily brief · last analysis {fmtSyncDate(connection?.lastSyncAt ?? null)}
            </p>
            <p className="mt-1.5 max-w-[62ch] text-[14.5px] leading-relaxed text-muted-foreground">
              {summary && summary.total > 0 ? (
                <>
                  Verito found{" "}
                  <b className="font-medium text-foreground">
                    {summary.actionable} actionable reimbursement opportunity
                    {summary.actionable === 1 ? "" : "ies"}
                  </b>{" "}
                  worth an estimated{" "}
                  <b className="font-medium text-foreground">
                    {fmtUsd(summary.potentialRecovery)}
                  </b>
                  . {summary.urgent > 0 && <> {summary.urgent} need urgent attention.</>}
                </>
              ) : (
                <>
                  Your account was analyzed.{" "}
                  <b className="font-medium text-foreground">
                    No unresolved reimbursement opportunities found.
                  </b>{" "}
                  We&apos;ll keep an eye out on the next sync.
                </>
              )}
            </p>
          </div>
        </div>
        <Button
          className="h-11 rounded-xl px-5"
          onClick={onPrepare}
          disabled={preparing}
        >
          {preparing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              Run analysis
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>

      {/* stats */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Potential recovery"
          value={fmtUsd(summary?.potentialRecovery)}
          meta={`across ${summary?.actionable ?? 0} actionable opportunities`}
        />
        <StatCard
          label="Actionable now"
          value={<span className="text-[28px]">{summary?.actionable ?? 0}</span>}
          meta={`${summary?.alreadyReimbursed ?? 0} already reimbursed · ${summary?.expired ?? 0} expired`}
        />
        <StatCard
          label="Next expiration"
          value={
            <span className="text-[28px]">
              {nextExpiry?.days_remaining != null ? `${nextExpiry.days_remaining}d` : "—"}
            </span>
          }
          meta={
            nextExpiry
              ? `case ${nextExpiry.claimId}${nextExpiry.sku ? ` · ${nextExpiry.sku}` : ""}`
              : "no active deadline"
          }
        />
      </div>

      {/* opportunities */}
      <div className="mt-10 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Opportunities</h2>
        <span className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
          {candidates.length} detected · sorted by priority
        </span>
      </div>

      {candidates.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-border/80 bg-card p-10 text-center shadow-[0_1px_2px_rgba(16,24,22,0.04)]">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-soft">
            <PackageCheck className="size-5 text-teal" />
          </span>
          <h3 className="mt-4 text-lg font-semibold tracking-tight">
            No unresolved reimbursement opportunities found
          </h3>
          <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">
            Verito reconciled your financial, inbound, and inventory records
            and found no discrepancies that warrant a claim. Re-run the
            analysis any time — new Amazon records are picked up automatically.
          </p>
          <Button
            variant="outline"
            className="mt-6 rounded-xl"
            onClick={onPrepare}
            disabled={preparing}
          >
            {preparing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Re-run analysis
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {candidates.map((cand) => {
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
                <Button
                  variant="outline"
                  className="mt-4 w-full rounded-xl"
                  onClick={() => onPrepareOne(cand)}
                >
                  Review claim package
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* status breakdown */}
      {summary && summary.total > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Portfolio at a glance</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(16,24,22,0.04)]">
            <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-4 border-b border-border/80 bg-muted/40 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:grid">
              <span>Status</span>
              <span className="text-right">Actionable</span>
              <span className="text-right">Urgent</span>
              <span className="text-right">Resolved</span>
              <span className="text-right">Expired</span>
            </div>
            <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] sm:items-center">
              <span className="text-[13.5px] font-medium">
                {candidates.length} total {candidates.length === 1 ? "case" : "cases"}
              </span>
              <span className="font-mono text-[13px] tabular-nums sm:text-right">
                {summary.actionable}
              </span>
              <span className="font-mono text-[13px] tabular-nums sm:text-right">
                {summary.urgent}
              </span>
              <span className="font-mono text-[13px] tabular-nums sm:text-right">
                {summary.alreadyReimbursed}
              </span>
              <span className="font-mono text-[13px] tabular-nums sm:text-right">
                {summary.expired}
              </span>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-6">
        <span className="font-mono text-[11px] tracking-[0.03em] text-muted-foreground">
          Powered by VTPlatform — one evidence engine, every marketplace
        </span>
        <span className="font-mono text-[11px] tracking-[0.03em] text-muted-foreground/70">
          Shopify and Walmart connectors coming next
        </span>
      </footer>
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
