import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { VeritoBrand } from "@/components/verito/VeritoBrand";

/**
 * /setup-provider?key=<PROVIDER_SETUP_KEY>
 *
 * One-time page to claim the provider role. The secret key is passed as a
 * query parameter and verified server-side against the PROVIDER_SETUP_KEY
 * env var. The page is not linked publicly — only reachable by URL.
 */
export default function SetupProvider() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const claimRole = useMutation(api.users.claimProviderRole);

  const [status, setStatus] = useState<
    "idle" | "claiming" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const setupKey = searchParams.get("key") ?? "";

  // Auto-claim once authenticated + key is present
  useEffect(() => {
    if (authLoading || !isAuthenticated || !setupKey || status !== "idle")
      return;

    setStatus("claiming");
    claimRole({ setupKey })
      .then((res) => {
        setStatus("done");
        setMessage(res.message ?? "Provider role activated.");
        // Redirect to provider dashboard after a short pause
        setTimeout(() => navigate("/provider", { replace: true }), 1800);
      })
      .catch((err: Error) => {
        setStatus("error");
        setMessage(err.message || "Setup failed.");
      });
  }, [authLoading, isAuthenticated, setupKey, status, claimRole, navigate]);

  // Not authenticated → redirect to auth with returnTo
  if (!authLoading && !isAuthenticated) {
    const returnTo = `/setup-provider?key=${encodeURIComponent(setupKey)}`;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="max-w-sm text-center">
          <p className="text-sm text-muted-foreground">
            Signing in required. Redirecting…
          </p>
        </div>
      </div>
    );
  }

  // Missing key
  if (!setupKey && !authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="max-w-sm text-center space-y-6">
          <VeritoBrand />
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <AlertTriangle className="mx-auto size-8 text-rust" />
            <p className="mt-4 text-sm font-medium">Missing setup key</p>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              This page requires a setup key in the URL. If you were given a
              provider setup link, paste the full URL including the{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                ?key=
              </code>{" "}
              parameter.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-sm text-center space-y-6">
        <VeritoBrand />

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          {status === "idle" || status === "claiming" ? (
            <>
              <Loader2 className="mx-auto size-8 animate-spin text-teal" />
              <p className="mt-4 text-sm font-medium">
                Activating provider access…
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Verifying your setup key and configuring your account.
              </p>
            </>
          ) : status === "done" ? (
            <>
              <ShieldCheck className="mx-auto size-8 text-teal" />
              <p className="mt-4 text-sm font-medium">{message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Redirecting to your provider dashboard…
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="mx-auto size-8 text-rust" />
              <p className="mt-4 text-sm font-medium">{message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Check your setup key and try again.
              </p>
              <Button
                className="mt-5 h-9 rounded-xl"
                variant="outline"
                onClick={() => {
                  setStatus("idle");
                  setMessage("");
                }}
              >
                Try again
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
