import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { AlertTriangle, ArrowRight, Check, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const PERMISSIONS = [
  "Orders & order items",
  "Inventory & shipment reports",
  "Financial events",
  "Returns & reimbursements",
] as const;

type Stage = "idle" | "starting" | "redirecting" | "error";

/**
 * Amazon Seller Central consent modal.
 *
 * "Allow access" starts the real SP-API authorization flow: it asks the
 * backend for a fresh consent URL (beginAmazonAuth) and sends the seller to
 * Amazon's sign-in. Amazon redirects back to /amazon/callback, where the
 * code is exchanged server-side and the analysis procedure starts
 * automatically. No fake handshake — if the integration is not configured,
 * the real configuration error is shown.
 */
export function ConnectModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const beginAmazonAuth = useAction(api.amazon.actions.beginAmazonAuth);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStage("idle");
      setError(null);
      setUrl(null);
    }
  }, [open]);

  const handleAllow = async () => {
    if (stage === "starting" || stage === "redirecting") return;
    setStage("starting");
    setError(null);
    const result = await beginAmazonAuth();
    if (!result.ok) {
      setError(result.error);
      setStage("error");
      return;
    }
    setUrl(result.url);
    setStage("redirecting");
    // Let the "Opening Amazon…" state paint before navigating away.
    window.setTimeout(() => {
      window.location.assign(result.url);
    }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[420px]">
        {stage === "starting" || stage === "redirecting" ? (
          <div className="flex flex-col items-center gap-4 px-8 py-14">
            <span className="relative flex size-12 items-center justify-center rounded-full bg-teal-soft">
              <Loader2 className="size-5 animate-spin text-teal" />
            </span>
            <DialogTitle className="text-[15px] font-semibold tracking-tight">
              {stage === "starting" ? "Preparing secure authorization…" : "Opening Amazon…"}
            </DialogTitle>
            <DialogDescription className="text-center font-mono text-[11px] tracking-[0.04em]">
              {stage === "starting"
                ? "Creating a fresh, single-use authorization link"
                : "You&apos;ll sign in on Amazon&apos;s site — analysis starts automatically after you approve"}
            </DialogDescription>
          </div>
        ) : stage === "error" ? (
          <div className="flex flex-col gap-4 px-7 py-8">
            <span className="flex size-11 items-center justify-center rounded-xl bg-rust-soft">
              <AlertTriangle className="size-5 text-rust" />
            </span>
            <div>
              <DialogTitle className="text-[15px] font-semibold tracking-tight">
                Can&apos;t start Amazon authorization
              </DialogTitle>
              <DialogDescription className="mt-2 text-[13px] leading-relaxed">
                {error}
              </DialogDescription>
            </div>
            <div className="mt-1 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button className="flex-1" onClick={handleAllow}>
                Try again
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-6 pb-2 sm:p-7 sm:pb-3">
              <div className="flex items-center gap-3.5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink font-mono text-[11px] font-semibold tracking-wide text-background">
                  amzn
                </span>
                <div>
                  <DialogTitle className="text-[16px] font-semibold tracking-tight">
                    Connect to Seller Central
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-[12.5px]">
                    Verito requests <b className="font-medium text-foreground/80">read-only</b> access
                  </DialogDescription>
                </div>
              </div>
            </div>

            <div className="px-6 pt-5 sm:px-7 sm:pt-6">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Permissions
                </p>
                <ul className="mt-3 space-y-2.5">
                  {PERMISSIONS.map((perm) => (
                    <li
                      key={perm}
                      className="flex items-center gap-2.5 text-[13px] text-foreground/80"
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-teal-soft">
                        <Check className="size-3 text-teal" strokeWidth={3} />
                      </span>
                      {perm}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-4 text-[11.5px] leading-relaxed text-muted-foreground">
                You&apos;ll complete sign-in on Amazon&apos;s site. After you
                approve, Verito connects your account and{" "}
                <b className="font-medium text-foreground/80">
                  starts analyzing it right away
                </b>
                . Verito never lists, prices, or modifies your catalog. You can
                disconnect at any time from Settings.
              </p>
            </div>

            <div className="mt-5 flex gap-3 border-t border-border/80 bg-muted/20 p-4 sm:px-7">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleAllow}>
                Allow access
                <ExternalLink className="size-3.5" />
              </Button>
            </div>
            <p className="border-t border-border/60 px-6 py-3 text-center font-mono text-[10px] tracking-[0.03em] text-muted-foreground/80 sm:px-7">
              Official SP-API OAuth · token stored encrypted · <ArrowRight className="inline size-2.5" /> you&apos;ll return to /amazon/callback
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
