import { Button } from "@/components/ui/button";
import { VeritoBrand } from "@/components/verito/VeritoBrand";
import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

type Phase = "checking" | "authorizing" | "redirecting" | "error";

/**
 * Amazon OAuth callback — the redirect_uri for the SP-API authorization flow.
 *
 * The seller approves on Seller Central and Amazon redirects here with
 * `spapi_oauth_code` + `state`. This page exchanges the code server-side
 * (client secret never reaches the browser), then sends the user to the
 * dashboard, which automatically starts the real analysis procedure. Any
 * real error from Amazon or the code exchange is shown verbatim — Verito
 * never pretends a connection succeeded when it did not.
 */
export default function AmazonCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const completeAuth = useAction(api.amazon.actions.completeAmazonAuth);

  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const ranRef = useRef(false);

  const goDashboard = useCallback(
    (query = "") => {
      navigate(`/dashboard${query}`, { replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const amazonError = searchParams.get("error");
    const code = searchParams.get("spapi_oauth_code") ?? searchParams.get("code");
    const state = searchParams.get("state") ?? "";
    const sellingPartnerId = searchParams.get("selling_partner_id") ?? undefined;

    if (amazonError) {
      const description = searchParams.get("error_description");
      setError(
        `Amazon returned an error: ${amazonError}${description ? ` — ${description}` : ""}. No changes were made to your account.`,
      );
      setErrorCode("amazon_error");
      setPhase("error");
      return;
    }

    if (!code) {
      setError(
        "No authorization code was returned by Amazon. Please start the connection again from the dashboard.",
      );
      setErrorCode("missing_code");
      setPhase("error");
      return;
    }

    (async () => {
      setPhase("authorizing");
      const result = await completeAuth({ code, state, sellingPartnerId });
      if (!result.ok) {
        setError(result.error);
        setErrorCode(result.errorCode ?? "oauth_exchange");
        setPhase("error");
        return;
      }
      // Success — the dashboard picks up ?amazon=connected and starts the
      // analysis procedure automatically (with the plan quota gate).
      setPhase("redirecting");
      window.setTimeout(() => goDashboard("?amazon=connected"), 900);
    })();
  }, [searchParams, completeAuth, goDashboard]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-md">
        <div className="flex justify-center">
          <VeritoBrand />
        </div>

        {phase === "checking" || phase === "authorizing" || phase === "redirecting" ? (
          <div className="mt-10 flex flex-col items-center gap-5 text-center">
            <span className="relative flex size-14 items-center justify-center rounded-full bg-teal-soft">
              <Loader2 className="size-6 animate-spin text-teal" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {phase === "checking" && "Verifying your authorization…"}
                {phase === "authorizing" && "Connecting Seller Central…"}
                {phase === "redirecting" && "Connected — starting analysis"}
              </h1>
              <p className="mt-2 font-mono text-[11.5px] tracking-[0.04em] text-muted-foreground">
                {phase === "checking" && "Checking the response from Amazon"}
                {phase === "authorizing" &&
                  "Exchanging the secure token — your refresh token is stored encrypted"}
                {phase === "redirecting" && "Taking you to your workspace"}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-rust/40 bg-rust-soft/50 p-6 sm:p-7">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rust-soft">
                <AlertTriangle className="size-5 text-rust" />
              </span>
              <div className="min-w-0">
                <h1 className="text-[15px] font-semibold tracking-tight">
                  Amazon connection failed
                </h1>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                  {error}
                </p>
                {errorCode && (
                  <p className="mt-2 font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground/80">
                    Code: {errorCode}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                className="rounded-xl"
                onClick={() => goDashboard()}
              >
                Back to dashboard
                <ArrowRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => navigate("/dashboard", { replace: true })}
              >
                <ArrowLeft className="size-4" />
                Start over
              </Button>
            </div>
          </div>
        )}

        {phase === "redirecting" && (
          <div className="mt-6 flex items-center justify-center gap-2 font-mono text-[11px] tracking-[0.04em] text-teal-deep">
            <CheckCircle2 className="size-4" />
            Amazon Seller Central authorized
          </div>
        )}
      </div>
    </div>
  );
}
