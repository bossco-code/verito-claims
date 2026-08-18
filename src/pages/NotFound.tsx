import { Button } from "@/components/ui/button";
import { VeritoBrand } from "@/components/verito/VeritoBrand";
import { ArrowLeft, Home } from "lucide-react";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

const ease: [number, number, number, number] = [0.2, 0.7, 0.2, 1];

export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            to="/"
            className="flex items-center rounded-lg transition-opacity hover:opacity-80"
          >
            <VeritoBrand />
          </Link>
          <Button
            variant="outline"
            className="h-9 rounded-xl"
            asChild
          >
            <Link to="/dashboard">
              <Home className="size-4" />
              Open dashboard
            </Link>
          </Button>
        </div>
      </header>

      {/* 404 content */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-24">
        <div
          className="pointer-events-none absolute inset-0 bg-dots opacity-40"
          aria-hidden="true"
        />

        <div className="relative w-full max-w-xl text-center">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, ease }}
            className="flex items-center justify-center gap-3"
          >
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Error 404 — page not found
            </span>
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
          </motion.div>

          <motion.h1
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.05, ease }}
            className="mt-6 text-[clamp(72px,16vw,140px)] font-semibold leading-none tracking-tight"
          >
            404
          </motion.h1>

          <motion.p
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.1, ease }}
            className="mt-5 text-[16px] leading-relaxed text-muted-foreground"
          >
            The page you&apos;re looking for doesn&apos;t exist or was moved.
            Your claims are still safe — head back and pick up where you left
            off.
          </motion.p>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.15, ease }}
            className="mt-7"
          >
            <span className="inline-block rounded-lg border border-border/80 bg-card px-4 py-2 font-mono text-[12px] text-muted-foreground">
              {pathname}
            </span>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.2, ease }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <Button className="h-11 rounded-xl px-5" asChild>
              <Link to="/">
                <ArrowLeft className="size-4" />
                Back to home
              </Link>
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl px-5"
              asChild
            >
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
