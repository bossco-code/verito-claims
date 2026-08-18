import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { VeritoTopbar } from "@/components/verito/VeritoTopbar";
import { HomeScreen } from "@/components/verito/HomeScreen";
import type { CandidateDoc } from "@/components/verito/HomeScreen";
import { WorkingScreen } from "@/components/verito/WorkingScreen";
import { FirstRunIntro } from "@/components/verito/FirstRunIntro";
import { ConnectModal } from "@/components/verito/ConnectModal";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileCheck2, FolderOpen, Loader2 } from "lucide-react";

type Screen = "home" | "working" | "intro";

const FIRST_RUN_KEY = "verito.firstRun.seen";

function hasSeenFirstRun(): boolean {
  try {
    return window.localStorage.getItem(FIRST_RUN_KEY) === "1";
  } catch {
    return false;
  }
}

function markFirstRunSeen() {
  try {
    window.localStorage.setItem(FIRST_RUN_KEY, "1");
  } catch {
    // Ignore — storage can be unavailable in sandboxed previews.
  }
}

/** The highest-value actionable opportunity; falls back to any candidate. */
function pickTopCandidate(candidates: CandidateDoc[]): CandidateDoc | null {
  if (candidates.length === 0) return null;
  const actionable = candidates.filter(
    (c) => c.status === "ELIGIBLE" || c.status === "NOT_YET_ELIGIBLE",
  );
  const pool = actionable.length > 0 ? actionable : candidates;
  return [...pool].sort((a, b) => (b.estimated_value ?? 0) - (a.estimated_value ?? 0))[0];
}

export default function Dashboard() {
  const [screen, setScreen] = useState<Screen>("home");
  const [connectOpen, setConnectOpen] = useState(false);
  const [runId, setRunId] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [config, setConfig] = useState<{
    configured: boolean;
    missing: string[];
  } | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const connection = useQuery(api.amazon.queries.getConnection);
  const opportunities = useQuery(api.amazon.queries.listOpportunities);
  const cases = useQuery(api.evidence.queries.listCases);
  const startClaimRun = useMutation(api.claims.startClaimRun);
  const startProCheckout = useAction(api.checkout.createCheckoutSession);
  const getConfigStatus = useAction(api.amazon.actions.getAmazonConfigStatus);
  const openCase = useAction(api.evidence.actions.openCase);

  const connected = connection?.status === "connected";

  // listOpportunities returns the rows typed as EvaluatedCandidate; the rows
  // are real claimCandidates docs (with _id/_creationTime), so cast for the
  // screens that key on _id.
  const candidates = useMemo(
    () => (opportunities?.candidates ?? []) as unknown as CandidateDoc[],
    [opportunities],
  );
  const summary = opportunities?.summary ?? null;
  const topCandidate = useMemo(() => pickTopCandidate(candidates), [candidates]);

  // Read the server-side Amazon config status once, so the Connect button can
  // explain honestly why authorization is unavailable (missing keys, etc.).
  useEffect(() => {
    let alive = true;
    void getConfigStatus()
      .then((status) => {
        if (alive) {
          setConfig({
            configured: status.configured,
            missing: status.missing,
          });
        }
      })
      .catch(() => {
        if (alive) setConfig({ configured: true, missing: [] });
      });
    return () => {
      alive = false;
    };
  }, [getConfigStatus]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [screen]);

  const handleUpgradeToPro = useCallback(async () => {
    try {
      const result = await startProCheckout({
        successUrl: `${window.location.origin}/dashboard`,
      });
      if (result?.ok && result.url) {
        window.location.href = result.url;
        return;
      }
      toast.error("Pro checkout isn't set up yet", {
        description: "Add CREEM_API_KEY in the project Keys tab, then try again.",
      });
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Couldn't start Pro checkout");
    }
  }, [startProCheckout]);

  /**
   * Core "start the analyze procedure" step. Server-enforced plan gate:
   * Free users get 5 runs/month, Pro users are unlimited. On success it
   * advances to the working/analysis screen; on the monthly limit it offers
   * an upgrade to Pro.
   */
  const startAnalysis = useCallback(async () => {
    if (preparing) return;
    setPreparing(true);
    try {
      const result = await startClaimRun();
      if (!result?.ok) {
        if (result?.reason === "limit") {
          toast.error("You've used your free claims for this month", {
            description:
              "Free plan includes 5 prepared claims per month. Upgrade to Pro for unlimited claims.",
            action: {
              label: "Upgrade to Pro",
              onClick: () => void handleUpgradeToPro(),
            },
          });
        } else {
          toast.error("Please sign in to prepare claims");
        }
        return;
      }
      setRunId((id) => id + 1);
      setScreen("working");
    } catch (error) {
      console.error("startClaimRun error:", error);
      toast.error("Couldn't start claim preparation");
    } finally {
      setPreparing(false);
    }
  }, [preparing, startClaimRun, handleUpgradeToPro]);

  /**
   * Auto-start after the OAuth handshake: Amazon redirects back to
   * /amazon/callback, which navigates here with ?amazon=connected. The first
   * time we observe the connection as live, the analyze procedure starts on
   * its own (still gated by the plan quota). The one-shot flag is consumed so
   * a refresh doesn't re-run the analysis.
   */
  const autoStartHandled = useRef(false);
  useEffect(() => {
    if (searchParams.get("amazon") !== "connected") return;
    if (autoStartHandled.current) return;
    if (!connected) return;
    autoStartHandled.current = true;
    navigate("/dashboard", { replace: true });
    void startAnalysis();
  }, [searchParams, connected, startAnalysis, navigate]);

  /**
   * Phase 2 entry point: [REVIEW CASE] creates or opens the EvidenceCase for
   * a Phase 1 candidate (never a duplicate) and routes to the workspace.
   */
  const handleReviewCase = useCallback(
    async (candidate: CandidateDoc) => {
      if (opening) return;
      setOpening(true);
      try {
        const result = await openCase({ claimCandidateId: candidate._id });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        navigate(`/case/${result.caseId}`);
      } catch (error) {
        console.error("openCase error:", error);
        toast.error("Couldn't open the evidence case");
      } finally {
        setOpening(false);
      }
    },
    [opening, openCase, navigate],
  );

  /** Where the analysis lands. First run ever → the "what Verito found" intro. */
  const handleAnalysisDone = useCallback(() => {
    if (!hasSeenFirstRun()) {
      markFirstRunSeen();
      setScreen("intro");
      return;
    }
    if (topCandidate) {
      void handleReviewCase(topCandidate);
    } else {
      setScreen("home");
    }
  }, [topCandidate, handleReviewCase]);

  const handlePrepare = useCallback(() => {
    void startAnalysis();
  }, [startAnalysis]);

  const step = screen === "home" ? 1 : screen === "working" ? 2 : 3;
  const openCases = cases?.filter((c) => c.status !== "CLOSED") ?? [];
  const hasCases = (cases?.length ?? 0) > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <VeritoTopbar
        step={step}
        onBrandClick={() => setScreen("home")}
        connected={connected}
      />

      <main className="flex-1">
        {screen === "home" && (
          <>
            <HomeScreen
              connected={connected}
              connection={connection}
              onConnect={() => setConnectOpen(true)}
              onPrepare={handlePrepare}
              onPrepareOne={(candidate) => void handleReviewCase(candidate)}
              preparing={preparing || opening}
              candidates={candidates}
              summary={summary}
              configConfigured={config?.configured ?? true}
              configMissing={config?.missing ?? []}
            />

            {hasCases && (
              <section className="mx-auto w-full max-w-6xl px-5 pb-14 sm:px-8">
                <div className="flex items-baseline justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                    <FolderOpen className="size-4 text-teal" />
                    Evidence cases
                  </h2>
                  <span className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
                    {openCases.length} active · {cases!.length - openCases.length} closed
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(cases ?? []).map((c) => (
                    <button
                      key={c.caseId}
                      type="button"
                      onClick={() => navigate(`/case/${c.caseId}`)}
                      className="group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-teal/50"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-[11.5px] font-semibold tracking-[0.04em] text-foreground">
                          {c.caseNumber}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {c.claimId} · {c.case_type.replaceAll("_", " ").toLowerCase()}
                          {c.days_remaining != null ? ` · ${c.days_remaining}d left` : ""}
                        </p>
                        <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-teal-deep">
                          {c.decision.replaceAll("_", " ")}
                        </p>
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-teal" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {screen === "working" && (
          <WorkingScreen
            key={runId}
            runId={runId}
            onDone={handleAnalysisDone}
            onBack={() => setScreen("home")}
          />
        )}

        {screen === "intro" && (
          <FirstRunIntro
            candidates={candidates}
            summary={summary}
            onReview={() => {
              if (topCandidate) void handleReviewCase(topCandidate);
              else setScreen("home");
            }}
            onDashboard={() => setScreen("home")}
          />
        )}
      </main>

      <ConnectModal open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
