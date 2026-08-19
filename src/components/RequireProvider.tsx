import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

/**
 * Route guard for the provider dashboard.
 * Requires the user to be authenticated AND have the "provider" role.
 * Non-provider users are redirected to /dashboard.
 * Unauthenticated users are redirected to /auth.
 */
export function RequireProvider({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const isProvider = useQuery(api.amazon.providerMode.isProvider);
  const location = useLocation();

  if (isLoading || isProvider === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  if (!isProvider) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
