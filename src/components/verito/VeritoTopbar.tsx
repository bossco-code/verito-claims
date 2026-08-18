import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { Check, LogOut, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { VeritoBrand } from "./VeritoBrand";

const STEPS = [
  { n: 1, label: "Connect" },
  { n: 2, label: "Analyze" },
  { n: 3, label: "Review" },
] as const;

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "V";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "V") + (parts[1]?.[0] ?? "")
  ).toUpperCase();
}

export function VeritoTopbar({
  step,
  onBrandClick,
  connected = false,
}: {
  step: number;
  onBrandClick: () => void;
  connected?: boolean;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const showAccount = connected || Boolean(user);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <button
          type="button"
          onClick={onBrandClick}
          className="flex items-center rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <VeritoBrand />
        </button>

        {/* step indicator */}
        <nav
          aria-label="Claim progress"
          className="hidden items-center gap-2.5 md:flex"
        >
          {STEPS.map((s, i) => (
            <span key={s.n} className="flex items-center gap-2.5">
              {i > 0 && <span className="h-px w-6 bg-border" aria-hidden="true" />}
              <span
                className={cn(
                  "flex items-center gap-2 font-mono text-[11px] tracking-[0.08em]",
                  s.n < step && "text-foreground/70",
                  s.n === step && "text-foreground",
                  s.n > step && "text-muted-foreground/60",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    s.n < step && "bg-teal",
                    s.n === step && "bg-gold shadow-[0_0_0_3px_var(--gold-soft)]",
                    s.n > step && "bg-border",
                  )}
                  aria-hidden="true"
                />
                {`0${s.n} ${s.label}`}
              </span>
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {showAccount && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-9 rounded-full border border-border bg-card text-foreground",
                    connected &&
                      "relative border-teal/50 bg-teal-soft text-teal-deep hover:bg-teal-soft",
                  )}
                  aria-label="Account menu"
                >
                  {connected ? (
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wide">
                      amzn
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold">
                      {initials(user?.name, user?.email)}
                    </span>
                  )}
                  {connected && (
                    <span
                      className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-teal"
                      aria-hidden="true"
                    />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  {connected ? (
                    <>
                      <span className="block truncate text-xs font-medium text-foreground">
                        Amazon Seller Central
                      </span>
                      <span className="block truncate text-[11px] font-normal text-muted-foreground">
                        Connected · read-only access
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block truncate text-xs font-medium text-foreground">
                        {user?.name ?? user?.email ?? "Account"}
                      </span>
                      {user?.email && user?.name && (
                        <span className="block truncate text-[11px] font-normal text-muted-foreground">
                          {user.email}
                        </span>
                      )}
                    </>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {connected && (
                  <DropdownMenuItem disabled className="cursor-default opacity-100">
                    <Check className="size-4 text-teal" />
                    Seller Central connected
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate("/")} className="cursor-pointer">
                  <UserRound className="size-4" />
                  Landing page
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleSignOut}
                  variant="destructive"
                  className="cursor-pointer"
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
