import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Crown, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Plan awareness popups — the pricing cards live here now instead of the
 * landing page:
 *
 *  1. FREE WELCOME  — fires once, right after the seller successfully connects
 *     their Amazon Seller Central account. Introduces the Free plan
 *     (5 prepared claims / month). Remembered per connection, so it never
 *     repeats for the same account.
 *
 *  2. PRO UPSELL    — fires once per day when the Free plan's monthly claim
 *     allowance is exhausted (remaining === 0). Offers the real Creem
 *     checkout (reuses api.checkout.createCheckoutSession; degrades to a
 *     toast if CREEM_API_KEY isn't configured yet).
 *
 * Both popups only appear in the authenticated app (Dashboard) and read
 * server-enforced quota state — they are informational, never authoritative.
 */

export interface PlanQuota {
  plan: "signed_out" | "free" | "pro";
  limit: number | null;
  used: number | null;
  remaining: number | null;
}

const FREE_WELCOME_PREFIX = "verito.freeWelcome.seen.v1.";
const PRO_UPSELL_PREFIX = "verito.proUpsell.seen.v1.";

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Ignore — storage can be unavailable in sandboxed previews.
  }
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PlanDialogs({
  connectedAt,
  quota,
}: {
  /** Epoch ms of the current Amazon connection — unique per connection. */
  connectedAt: number | null | undefined;
  quota: PlanQuota | undefined;
}) {
  const [freeOpen, setFreeOpen] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [startingPro, setStartingPro] = useState(false);
  const startProCheckout = useAction(api.checkout.createCheckoutSession);

  const onFree = quota?.plan === "free";
  const outOfClaims = onFree && (quota.remaining ?? 1) === 0;

  // Decide which popup (if any) should appear. Pro wins when both conditions
  // are somehow true; otherwise the free welcome fires on a fresh connection.
  useEffect(() => {
    if (outOfClaims) {
      const key = `${PRO_UPSELL_PREFIX}${dayKey()}`;
      if (!readFlag(key)) {
        setFlag(key);
        setProOpen(true);
      }
      return;
    }
    if (connectedAt && onFree) {
      const key = `${FREE_WELCOME_PREFIX}${connectedAt}`;
      if (!readFlag(key)) {
        setFlag(key);
        setFreeOpen(true);
      }
    }
  }, [outOfClaims, connectedAt, onFree]);

  const handleUpgrade = async () => {
    if (startingPro) return;
    setStartingPro(true);
    try {
      const result = await startProCheckout({
        successUrl: `${window.location.origin}/dashboard`,
      });
      if (result?.ok && result.url) {
        window.location.href = result.url;
        return;
      }
      toast.error("Pro checkout isn't set up yet", {
        description:
          "Add CREEM_API_KEY (and optionally CREEM_PRO_PRODUCT_ID) in the project Keys tab, then try again.",
      });
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Couldn't start Pro checkout");
    } finally {
      setStartingPro(false);
    }
  };

  return (
    <>
      {/* Free plan welcome — fires once after connecting Seller Central. */}
      <Dialog open={freeOpen} onOpenChange={setFreeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <span className="flex size-11 items-center justify-center rounded-xl bg-teal-soft text-teal">
              <Gift className="size-5" />
            </span>
            <DialogTitle className="mt-4 text-xl tracking-tight">
              You&apos;re on Verito Free
            </DialogTitle>
            <DialogDescription className="text-[13.5px] leading-relaxed">
              Seller Central is connected — Verito is now scanning your
              records. The Free plan includes{" "}
              <b className="font-medium text-foreground">
                5 prepared claims per month
              </b>{" "}
              at no cost, no card required.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-teal/30 bg-teal-soft/50 px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-teal-deep">
              Free plan · 5 claims / month
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-teal-deep">
              When you hit the limit, we&apos;ll show you how to unlock
              unlimited claims with Pro.
            </p>
          </div>
          <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                setFreeOpen(false);
                void handleUpgrade();
              }}
              disabled={startingPro}
            >
              {startingPro ? "Opening checkout…" : "Upgrade to Pro · $49/mo"}
            </Button>
            <Button onClick={() => setFreeOpen(false)}>Start using Verito</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pro upsell — fires once per day when the free allowance runs out. */}
      <Dialog open={proOpen} onOpenChange={setProOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <span className="flex size-11 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
              <Crown className="size-5" />
            </span>
            <DialogTitle className="mt-4 text-xl tracking-tight">
              You&apos;ve used your 5 free claims
            </DialogTitle>
            <DialogDescription className="text-[13.5px] leading-relaxed">
              This month&apos;s free allowance is done. Upgrade to Pro for{" "}
              <b className="font-medium text-foreground">unlimited prepared claims</b>,
              continuous daily monitoring, and full recovery tracking —{" "}
              <b className="font-medium text-foreground">$49/month</b>, cancel
              anytime.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-card px-4 py-3.5 text-[13px] text-muted-foreground">
            <li className="flex items-center gap-2.5">
              <span className="size-1.5 rounded-full bg-teal" aria-hidden="true" />
              Unlimited claims — no monthly cap
            </li>
            <li className="flex items-center gap-2.5">
              <span className="size-1.5 rounded-full bg-teal" aria-hidden="true" />
              Continuous daily monitoring
            </li>
            <li className="flex items-center gap-2.5">
              <span className="size-1.5 rounded-full bg-teal" aria-hidden="true" />
              Claim history &amp; recovery tracking
            </li>
          </ul>
          <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setProOpen(false)}
              disabled={startingPro}
            >
              Maybe later
            </Button>
            <Button onClick={handleUpgrade} disabled={startingPro}>
              {startingPro ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Opening checkout…
                </>
              ) : (
                <>
                  Start Pro · $49/mo
                  <Crown className="size-4" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
