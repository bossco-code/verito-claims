import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const ROWS = [
  { label: "Shipment shortage", amount: "$416", dot: "bg-teal" },
  { label: "Warehouse damage", amount: "$214", dot: "bg-gold" },
  { label: "Return not restocked", amount: "$182", dot: "bg-rust" },
] as const;

/** Soft layered preview card showing "potential recovery" — optionally locked. */
export function ClaimPreviewCard({
  locked = false,
  className,
}: {
  locked?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(16,24,22,0.05),0_18px_44px_-16px_rgba(16,24,22,0.14)] sm:p-7">
        {/* soft top wash */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(70%_100%_at_50%_0%,oklch(0.46_0.1_178/0.08),transparent)]"
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                Potential recovery
              </p>
              <p className="mt-1.5 text-[34px] font-semibold leading-none tracking-tight tabular-nums">
                $812
              </p>
            </div>
            <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
              3 open
            </span>
          </div>

          <div className="mt-6 space-y-0.5">
            {ROWS.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 border-t border-border/70 py-2.5 last:border-b"
              >
                <span className="flex items-center gap-2.5 text-[13px] font-medium text-foreground/90">
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", row.dot)}
                    aria-hidden="true"
                  />
                  {row.label}
                </span>
                <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {row.amount}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Scan finished · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>
        </div>

        {locked && (
          <>
            <div
              className="absolute inset-0 bg-card/45 backdrop-blur-[5px]"
              aria-hidden="true"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full border border-border bg-card/80 shadow-sm">
                <Lock className="size-4 text-ink-soft" />
              </span>
              <span className="max-w-[24ch] font-mono text-[11px] leading-relaxed text-ink-soft">
                Connect your account to see what Verito finds
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
