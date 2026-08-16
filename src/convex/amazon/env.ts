"use node";

/**
 * Server-side configuration for the Amazon integration (spec §9).
 *
 * All secrets live in Convex environment variables (Keys tab / `convex env
 * set`) — never in source, never in the browser. When a required variable is
 * missing the integration reports a clear configuration error instead of
 * pretending to work (spec §9, §47).
 */

import { REGIONS, RegionCode } from "./config";

export class ConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(
      `Amazon SP-API integration is not configured. Missing: ${missing.join(", ")}`,
    );
    this.name = "ConfigError";
    this.missing = missing;
  }
}

export interface AmazonConfig {
  clientId: string;
  clientSecret: string;
  region: RegionCode;
  marketplaceId: string;
  redirectUri: string;
  oauthVersion: string; // "beta" for draft apps; omit ("") for published
  lookbackDays: number;
}

/** Which env vars are required for the integration to function. */
export const AMAZON_ENV_VARS = [
  "AMAZON_LWA_CLIENT_ID",
  "AMAZON_LWA_CLIENT_SECRET",
] as const;

function regionOf(value: string | undefined): RegionCode {
  const v = (value ?? "NA").toUpperCase();
  return v in REGIONS ? (v as RegionCode) : "NA";
}

/** Read the full Amazon config or throw a ConfigError listing what's missing. */
export function getAmazonConfig(): AmazonConfig {
  const clientId = process.env.AMAZON_LWA_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET?.trim() ?? "";
  const missing: string[] = [];
  if (!clientId) missing.push("AMAZON_LWA_CLIENT_ID");
  if (!clientSecret) missing.push("AMAZON_LWA_CLIENT_SECRET");

  if (missing.length > 0) throw new ConfigError(missing);

  const region = regionOf(process.env.AMAZON_REGION);
  const marketplaceId =
    process.env.AMAZON_MARKETPLACE_ID?.trim() ?? REGIONS[region].defaultMarketplaceId;
  const siteUrl = process.env.SITE_URL?.trim();
  const redirectUri =
    process.env.AMAZON_REDIRECT_URI?.trim() ??
    (siteUrl ? `${siteUrl}/amazon/callback` : "");

  if (!redirectUri) {
    throw new ConfigError(["AMAZON_REDIRECT_URI (or SITE_URL)"]);
  }

  return {
    clientId,
    clientSecret,
    region,
    marketplaceId,
    redirectUri,
    oauthVersion: process.env.AMAZON_OAUTH_VERSION ?? "beta",
    lookbackDays: Number(process.env.AMAZON_FINANCE_LOOKBACK_DAYS ?? 180) || 180,
  };
}

/** Read-only config status for the UI (no secrets). */
export function getConfigStatus(): {
  configured: boolean;
  missing: string[];
  marketplaceId: string | null;
  region: string | null;
  redirectUri: string | null;
} {
  const missing: string[] = [];
  for (const name of AMAZON_ENV_VARS) {
    if (!process.env[name]?.trim()) missing.push(name);
  }
  const siteUrl = process.env.SITE_URL?.trim();
  const redirectUri =
    process.env.AMAZON_REDIRECT_URI?.trim() ??
    (siteUrl ? `${siteUrl}/amazon/callback` : null);
  if (!redirectUri) missing.push("AMAZON_REDIRECT_URI (or SITE_URL)");
  const region = regionOf(process.env.AMAZON_REGION);
  return {
    configured: missing.length === 0,
    missing,
    marketplaceId:
      process.env.AMAZON_MARKETPLACE_ID?.trim() ?? REGIONS[region].defaultMarketplaceId,
    region: REGIONS[region].code,
    redirectUri,
  };
}

/** Key used to encrypt Amazon refresh tokens at rest (AES-256-GCM). */
export function getEncryptionKey(): string {
  const key = process.env.AMAZON_TOKEN_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new ConfigError(["AMAZON_TOKEN_ENCRYPTION_KEY"]);
  }
  return key;
}
