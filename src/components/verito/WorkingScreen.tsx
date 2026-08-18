import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, Check, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The stages the backend writes to syncRuns (src/convex/amazon/sync.ts).
 * The UI renders these in order; progress is 100% real.
 */
const STAGES: { key: string; label: string; caption: string }[] = [
  { key: "sync_financial", label: "Syncing financial data", caption: "Financial events from Amazon SP-API" },
  { key: "sync_inbound", label: "Syncing inbound data", caption: "Shipments and receiving records" },
  { key: "sync_inventory", label: "Syncing inventory data", caption: "FBA inventory summaries" },
  { key: "sync_reports", label: "Gathering unit prices", caption: "Settlement report (landed costs)" },
  { key: "reconcile", label: "Reconciling reimbursements", caption: "Matching against financial events" },
  { key: "opportunities", label: "Calculating opportunities", caption: "Eligibility, deadlines, priority" },
];

/**
 * Live analysis screen. Drives its progress from the REAL sync run instead of
 * a simulation: it starts the sync action on mount and watches getSyncStatus
 * reactively. On failure it surfaces the actual error (never fake success);
 * on completion it reports real stats and calls `onDone`.
 */
export function WorkingScreen({
  runId,
  onDone,
  onBack,
}: {
  runId: number;
  onDone: () => void;
  onBack?: () => void;
}) {
  const sync = useQuery(api.amazon.queries.getSyncStatus);
  const startSync = useAction(api.amazon.sync.startSync);

  const [actionError, setActionError] = useState<string | null>(null);
  const [observedAt, setObservedAt] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const doneFired = useRef(false);
  const mountTime = useRef(Date.now());

  const kickOff = useCallback(async () => {
    setActionError(null);
    try {
      const result = await startSync();
      if (!result.ok) {
        setActionError(result.error);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not start the analysis");
    }
  }, [startSync]);

  useEffect(() => {
    void kickOff();
  }, [runId, kickOff]);

  const handleComplete = useCallback(() => {
    if (doneFired.current) return;
    doneFired.current = true;
    setFinished(true);
    window.setTimeout(() => onDone(), 700);
  }, [onDone]);

  // Watch the real run: observe once we see a running run (or a run that
  // started around/after mount — i.e. the one we just kicked off), then fire
  // onDone when that same run completes.
  useEffect(() => {
    if (!sync) return;
    if (sync.status === "running") {
      setObservedAt(sync.startedAt);
    } else if (sync.status === "complete") {
      if (
        (observedAt !== null && sync.startedAt === observedAt) ||
        (observedAt === null && sync.startedAt >= mountTime.current - 5_000)
      ) {
        handleComplete();
      }
    }
  }, [sync, observedAt, handleComplete]);

  const failed = sync?.status === "failed";
  const errorMessage = actionError ?? (failed ? (sync?.error ?? "Synchronization failed") : null);

  if (errorMessage) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-20 sm:py-28">
        <div className="rounded-2xl border border-rust/40 bg-rust-soft/50 p-7">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rust-soft">
              <AlertTriangle className="size-5 text-rust" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[16px] font-semibold tracking-tight">
                Analysis couldn&apos;t run
              </h1>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                {errorMessage}
              </p>
              {sync?.errorCode && (
                <p className="mt-1.5 font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground/80">
                  Code: {sync.errorCode}
                </p>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              className="rounded-xl"
              onClick={() => {
                doneFired.current = false;
                setObservedAt(null);
                void kickOff();
              }}
            >
              <RotateCcw className="size-4" />
              Try again
            </Button>
            {onBack && (
              <Button variant="outline" className="rounded-xl" onClick={onBack}>
                <ArrowLeft className="size-4" />
                Back to dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const total = STAGES.length;
  const doneCount = STAGES.filter((s) => sync?.stages?.[s.key]?.status === "done").length;
  const runningStage = sync?.status === "running" ? sync.stage : null;
  const progress = finished
    ? 100
    : sync?.status === "complete"
      ? 100
      : Math.round((doneCount / total) * 100);
  const message = sync?.message ?? null;

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-20 sm:py-28">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-teal">
          Step 02 — Analyze
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[32px]">
          {finished ? "Analysis complete" : "Analyzing your account"}
        </h1>
        <p className="mx-auto mt-3 max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">
          {finished
            ? "Reviewing real results from your Seller Central account."
            : "Verito is pulling your live Amazon records and running the opportunity engine. This usually takes under a minute."}
        </p>
      </div>

      {/* progress */}
      <div className="mt-10">
        <div className="h-1.5 overflow-hidden rounded-full bg-border/70">
          <div
            className="h-full rounded-full bg-teal transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* task list */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(16,24,22,0.04)]">
        {STAGES.map((stage, j) => {
          const isDone = doneCount > j || finished;
          const isActive = !isDone && runningStage === stage.key;
          return (
            <div
              key={stage.key}
              className={cn(
                "flex items-center gap-3.5 border-b border-border/70 px-5 py-4 transition-opacity duration-300 last:border-b-0",
                !isDone && !isActive && "opacity-40",
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                {isDone ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-teal-soft">
                    <Check className="size-3 text-teal" strokeWidth={3} />
                  </span>
                ) : isActive ? (
                  <span
                    className="size-4 animate-spin rounded-full border-2 border-border"
                    style={{ borderTopColor: "var(--gold)" }}
                    aria-hidden="true"
                  >
                    <span className="sr-only">Working…</span>
                  </span>
                ) : (
                  <span className="size-1.5 rounded-full bg-border" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[13.5px]",
                    isActive && "font-medium text-foreground",
                    isDone && "text-foreground/80",
                    !isDone && !isActive && "text-muted-foreground",
                  )}
                >
                  {stage.label}
                </span>
                <span className="block font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
                  {stage.caption}
                </span>
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {isDone ? `0${j + 1}` : ""}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center font-mono text-[11.5px] tracking-[0.04em] text-muted-foreground">
        {finished ? (
          <span className="text-teal-deep">
            <Check className="mr-1 inline size-3.5" strokeWidth={3} />
            Analysis complete — preparing your review
          </span>
        ) : sync == null && actionError == null ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            Starting analysis…
          </span>
        ) : (
          message ??
          (runningStage
            ? STAGES.find((s) => s.key === runningStage)?.label ?? "Working…"
            : "Preparing…")
        )}
      </p>

      {sync?.stats && (sync.status === "complete" || finished) && (
        <div className="mt-6 flex items-center justify-center gap-2.5 font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
          <span>
            {sync.stats.eventsStored} records stored
          </span>
          <span aria-hidden="true" className="text-border">·</span>
          <span>{sync.stats.candidatesCreated} new</span>
          <span aria-hidden="true" className="text-border">·</span>
          <span>{sync.stats.candidatesUpdated} updated</span>
        </div>
      )}
    </div>
  );
}
