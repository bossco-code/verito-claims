import { Button } from "@/components/ui/button";
import { VeritoBrand } from "@/components/verito/VeritoBrand";
import { ClaimPreviewCard } from "@/components/verito/ClaimPreviewCard";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ArrowRight,
  Check,
  Link2,
  PackageCheck,
  Receipt,
  RotateCcw,
  ScanSearch,
  Truck,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

/**
 * Amazon Seller Central sign-in URL — the real SSO endpoint Verito sends
 * sellers to when they connect their account (read-only OAuth consent).
 */
const SELLER_CENTRAL_URL =
  "https://sellercentral.amazon.com/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fsellercentral.amazon.com%2Fhome&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=sc_na_amazon_v2&openid.mode=checkid_setup&language=en_US&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&pageId=sc_na_amazon_v2&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&ssoResponse=eyJ6aXAiOiJERUYiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiQTI1NktXIn0.tbpIO5pkzBxIzA5LSPHhMQkNObw3VA11pmSu2xylqq_5kLiwc_WRfw._tsaspZC2RduvBiB.tpup9QFY-DENeG4ZHO9aD-eA-yda9EDqjdwrutER5CLAok8Ns8UrAwsjqZUBcEitlwDXBr-A_ZCGGa12H_U0l7nFrPrl5KzfGZGoeRFoQJ68DM3-tn5El5Xn5su4NUbIevSJ-v4QcMQ0vRqP0qgdvTDRDNEI8d6RmmN7bkGTpwXlqrx14MhqUnbkPDV5TaU1bpaSR-3S.mm6aDmYTf7RCIzk3jx5_Cw";

const NAV = [
  { label: "Product", href: "#product" },
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#pricing" },
] as const;

const FEATURES = [
  {
    icon: Truck,
    title: "Shipment shortages",
    desc: "Units that left your warehouse but never arrived — detected against carrier and FC records.",
    accent: "bg-teal-soft text-teal",
  },
  {
    icon: PackageCheck,
    title: "Warehouse damage",
    desc: "Items damaged or destroyed in Amazon fulfillment centers, reconciled to your financial events.",
    accent: "bg-gold-soft text-gold-deep",
  },
  {
    icon: RotateCcw,
    title: "Returns & restocking",
    desc: "Customer returns received but never credited back to sellable inventory.",
    accent: "bg-teal-soft text-teal",
  },
  {
    icon: Receipt,
    title: "Fee overcharges",
    desc: "Dimensional weight and fulfillment fee errors corrected straight from Amazon's rate tables.",
    accent: "bg-rust-soft text-rust",
  },
] as const;

const STEPS = [
  {
    n: "01",
    icon: Link2,
    title: "Connect",
    desc: "Link your Seller Central account with read-only OAuth. Verito never lists, prices, or modifies your catalog.",
    meta: "2-minute setup",
  },
  {
    n: "02",
    icon: ScanSearch,
    title: "Analyze",
    desc: "The evidence engine cross-references shipments, inventory, returns, and financial events to surface discrepancies.",
    meta: "Runs daily, automatically",
  },
  {
    n: "03",
    icon: PackageCheck,
    title: "Review",
    desc: "Every claim ships as a polished package — timeline, evidence index, and recovery score. You review, then submit.",
    meta: "Marketplace-ready in under a minute",
  },
] as const;

const PLANS = [
  {
    name: "Free",
    amount: "$0",
    period: "/ month",
    desc: "For sellers trying Verito for the first time.",
    features: [
      "5 prepared claims per month",
      "Automatic opportunity detection",
      "Evidence index & recovery score",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Pro",
    amount: "$49",
    period: "/ month",
    desc: "For sellers ready to recover everything they're owed.",
    features: [
      "Unlimited claims",
      "Continuous daily monitoring",
      "Claim history & recovery tracking",
      "Professional PDF generation",
    ],
    cta: "Start Pro",
    featured: true,
  },
] as const;

const ease: [number, number, number, number] = [0.2, 0.7, 0.2, 1];

export default function Landing() {
  const navigate = useNavigate();
  const startProCheckout = useAction(api.checkout.createCheckoutSession);
  const [startingPro, setStartingPro] = useState(false);

  const handleStartPro = async () => {
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
          "Add CREEM_API_KEY and CREEM_PRO_PRODUCT_ID in the project Keys tab, then try again.",
      });
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Couldn't start Pro checkout");
    } finally {
      setStartingPro(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="flex items-center rounded-lg transition-opacity hover:opacity-80">
            <VeritoBrand />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section id="product" className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_42%_at_50%_0%,oklch(0.46_0.1_178/0.08),transparent_72%)]"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-40" aria-hidden="true" />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease }}
              className="flex items-center gap-3"
            >
              <span className="h-px w-8 bg-gold" aria-hidden="true" />
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                AI operations assistant for Amazon FBA sellers
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease }}
              className="mt-6 text-[clamp(40px,5.2vw,64px)] font-semibold leading-[1.02] tracking-tight"
            >
              Recover more.
              <br />
              <span className="text-teal">Do less.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12, ease }}
              className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-muted-foreground"
            >
              Verito connects to your Amazon Seller Central account, finds
              reimbursement opportunities, gathers the evidence, and prepares
              marketplace-ready claim packages. You only review and submit.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18, ease }}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              <Button
                size="lg"
                className="h-12 rounded-xl px-6 text-[14.5px] shadow-[0_8px_24px_-8px_oklch(0.46_0.1_178/0.55)] transition-all hover:-translate-y-0.5"
                asChild
              >
                <a
                  href={SELLER_CENTRAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    const win = window.open(SELLER_CENTRAL_URL, "_blank");
                    if (win) {
                      win.opener = null;
                    } else {
                      window.location.href = SELLER_CENTRAL_URL;
                    }
                  }}
                >
                  Connect Amazon Seller Central
                  <ArrowRight className="size-4" />
                </a>
              </Button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.26 }}
              className="mt-5 font-mono text-[11px] tracking-[0.04em] text-muted-foreground/80"
            >
              OAuth · read-only access · disconnect anytime
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease }}
            className="relative mx-auto w-full max-w-md lg:max-w-none"
          >
            <ClaimPreviewCard />
            <div className="absolute -right-3 -top-5 hidden -rotate-2 rounded-xl border border-border bg-card px-4 py-3 shadow-[0_12px_32px_-10px_rgba(16,24,22,0.28)] sm:block">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Shortage detected
              </p>
              <p className="mt-0.5 font-mono text-[14px] font-medium tabular-nums text-teal-deep">
                +$416 today
              </p>
            </div>
            <div className="absolute -bottom-5 -left-4 hidden rotate-2 rounded-xl border border-border bg-card px-4 py-3 shadow-[0_12px_32px_-10px_rgba(16,24,22,0.28)] sm:block">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Recovery score
              </p>
              <p className="mt-0.5 font-mono text-[14px] font-medium tabular-nums text-gold-deep">
                72% · shipment shortage
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 pt-24 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease }}
          className="max-w-2xl"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-teal">
            What Verito finds for you
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-[36px]">
            Money your P&amp;L already earned.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Amazon&apos;s reimbursements are yours by policy — but only if you
            catch them. Verito watches the gaps where sellers routinely lose
            money.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.06, ease }}
              className="group rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(16,24,22,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-border hover:shadow-[0_16px_36px_-14px_rgba(16,24,22,0.16)]"
            >
              <span className={`flex size-11 items-center justify-center rounded-xl ${f.accent}`}>
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-[15px] font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                {f.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 pt-24 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease }}
          className="max-w-2xl"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-teal">
            How it works
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-[36px]">
            From connect to claim in three steps.
          </h2>
        </motion.div>

        <div className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease }}
              className="relative"
            >
              {i < STEPS.length - 1 && (
                <span
                  className="absolute left-[52px] top-8 hidden h-px w-[calc(100%-64px)] bg-border lg:block"
                  aria-hidden="true"
                />
              )}
              <div className="flex items-center gap-5">
                <span className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,22,0.04)]">
                  <s.icon className="size-5 text-teal" />
                  <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-ink font-mono text-[9px] font-semibold text-background">
                    {s.n}
                  </span>
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    {s.meta}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-[14px] leading-relaxed text-muted-foreground">
                {s.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- pricing ---------- */}
      <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 pt-24 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Pricing
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-[36px]">
            Start free. Upgrade when it&apos;s paying for itself.
          </h2>
        </motion.div>

        <div className="mx-auto mt-12 flex max-w-md flex-col gap-6">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease }}
              className={`flex flex-col rounded-2xl border bg-card p-7 ${
                plan.featured
                  ? "border-teal/70"
                  : "border-border/80"
              }`}
            >
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {plan.name}
              </p>
              <p className="mt-3 text-[38px] font-semibold leading-none tracking-tight tabular-nums">
                {plan.amount}
                <span className="text-[14px] font-medium text-muted-foreground">
                  {plan.period}
                </span>
              </p>
              <p className="mt-3 text-[13.5px] text-muted-foreground">{plan.desc}</p>

              <ul className="mt-6 flex flex-col gap-3 border-t border-border/70 pt-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-[13.5px]">
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-teal-soft">
                      <Check className="size-2.5 text-teal" strokeWidth={3.5} />
                    </span>
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              {plan.featured ? (
                <div className="mt-7">
                  <Button
                    className="h-11 w-full rounded-xl"
                    onClick={handleStartPro}
                    disabled={startingPro}
                  >
                    {startingPro ? "Opening checkout…" : `${plan.cta} · ${plan.amount}${plan.period}`}
                    <ArrowRight className="size-4" />
                  </Button>
                  <p className="mt-3 text-center font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/80">
                    Recurring subscription · cancel anytime
                  </p>
                </div>
              ) : (
                <Button
                  className="mt-7 h-11 w-full rounded-xl"
                  variant="outline"
                  asChild
                >
                  <Link to="/dashboard">
                    {plan.cta}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="mx-auto w-full max-w-6xl px-5 pb-10 pt-20 sm:px-8">
        <div className="border-t border-border/80 pt-8">
          <Link to="/" className="inline-block transition-opacity hover:opacity-80">
            <VeritoBrand />
          </Link>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[11px] tracking-[0.03em] text-muted-foreground/70">
            © {new Date().getFullYear()} Verito · Powered by VTPlatform — one
            evidence engine, every marketplace
          </span>
          <span className="flex items-center gap-4 font-mono text-[11px] tracking-[0.03em] text-muted-foreground/70">
            <Link to="/terms" className="transition-colors hover:text-foreground">
              Terms of Service
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/privacy" className="transition-colors hover:text-foreground">
              Privacy Policy
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
