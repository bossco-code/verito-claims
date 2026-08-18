import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { VeritoBrand } from "@/components/verito/VeritoBrand";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router";

const ease: [number, number, number, number] = [0.2, 0.7, 0.2, 1];

export type LegalSection = {
  heading: string;
  paragraphs: ReactNode[];
  list?: ReactNode[];
};

export function LegalLayout({
  eyebrow,
  title,
  updated,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            to="/"
            className="flex items-center rounded-lg transition-opacity hover:opacity-80"
          >
            <VeritoBrand />
          </Link>
          <Button variant="outline" className="h-9 rounded-xl" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              Back to home
            </Link>
          </Button>
        </div>
      </header>

      {/* ---------- content ---------- */}
      <main className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_35%_at_50%_0%,oklch(0.46_0.1_178/0.07),transparent_72%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-3xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="flex items-center gap-3"
          >
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-teal">
              {eyebrow}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05, ease }}
            className="mt-5 text-[clamp(32px,4.5vw,48px)] font-semibold leading-[1.05] tracking-tight"
          >
            {title}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground"
          >
            Last updated: {updated}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease }}
            className="mt-6 text-[15px] leading-relaxed text-muted-foreground"
          >
            {intro}
          </motion.p>

          {/* ---------- contents ---------- */}
          <motion.nav
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.22, ease }}
            className="mt-10 grid gap-x-8 gap-y-2.5 rounded-2xl border border-border/80 bg-card p-6 sm:grid-cols-2"
            aria-label="Contents"
          >
            <p className="col-span-full font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              Contents
            </p>
            {sections.map((section, i) => (
              <a
                key={section.heading}
                href={`#sec-${i + 1}`}
                className="flex items-baseline gap-2 text-[13px] leading-snug text-muted-foreground transition-colors hover:text-teal"
              >
                <span className="shrink-0 font-mono text-[11px] text-teal">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{section.heading}</span>
              </a>
            ))}
          </motion.nav>

          {/* ---------- sections ---------- */}
          {sections.map((section, i) => (
            <section
              key={section.heading}
              id={`sec-${i + 1}`}
              className="mt-12 scroll-mt-28 border-t border-border/70 pt-10"
            >
              <div className="flex items-baseline gap-4">
                <span className="shrink-0 font-mono text-[12px] text-teal">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="text-[21px] font-semibold tracking-tight">
                  {section.heading}
                </h2>
              </div>
              {section.paragraphs.map((paragraph, j) => (
                <p
                  key={j}
                  className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
              {section.list && (
                <ul className="mt-4 flex flex-col gap-2.5">
                  {section.list.map((item, j) => (
                    <li
                      key={j}
                      className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-muted-foreground"
                    >
                      <span
                        className="mt-[9px] size-1.5 shrink-0 rounded-full bg-gold"
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* ---------- footer strip ---------- */}
          <div className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-8">
            <span className="font-mono text-[11px] tracking-[0.03em] text-muted-foreground/70">
              © {new Date().getFullYear()} Verito · Powered by VTPlatform
            </span>
            <span className="flex items-center gap-4 font-mono text-[11px] tracking-[0.03em] text-muted-foreground/70">
              <Link
                to="/terms"
                className="transition-colors hover:text-foreground"
              >
                Terms of Service
              </Link>
              <span aria-hidden="true">·</span>
              <Link
                to="/privacy"
                className="transition-colors hover:text-foreground"
              >
                Privacy Policy
              </Link>
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
