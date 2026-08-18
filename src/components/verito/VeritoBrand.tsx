import { cn } from "@/lib/utils";

/** Served from /public — Vite exposes public/ at the site root. */
const LOGO_URL = "/assets/Verito-logo.png";

/**
 * Verito mark — the uploaded brand asset (public/assets/Verito-logo.png).
 * Sized as a standalone logo mark; override with `className` when needed.
 */
export function VeritoMark({ className }: { className?: string }) {
  return (
    <img
      src={LOGO_URL}
      alt="Verito"
      draggable={false}
      className={cn("h-12 w-auto object-contain", className)}
    />
  );
}

/**
 * Full brand lockup: the logo mark on its own.
 * Kept as a thin wrapper so call sites stay stable.
 */
export function VeritoBrand({ className }: { className?: string }) {
  return <VeritoMark className={className} />;
}
