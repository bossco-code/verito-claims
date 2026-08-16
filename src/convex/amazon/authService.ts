"use node";

/**
 * AmazonAuthService (spec §8).
 *
 * Implements Amazon's official SP-API authorization flow:
 *
 *   Seller clicks [Connect Amazon] → redirected to Seller Central consent
 *   (`/apps/authorize/consent?application_id=...&state=...&version=beta`)
 *   → Amazon redirects back to `redirect_uri` with `spapi_oauth_code` and
 *   `state` → Verito exchanges the code server-side at the LWA token
 *   endpoint (client secret never reaches the browser) → refresh token is
 *   stored encrypted.
 *
 * No seller password is ever requested; no password is ever stored. PKCE is
 * NOT part of the SP-API web flow (the code exchange is protected by the
 * client secret + short-lived code + state). Do NOT pass a `scope` for
 * standard SP-API apps — access is governed by the roles configured on the
 * developer application.
 */

import { randomUUID } from "node:crypto";
import { REGIONS, SELLER_CENTRAL_CONSENT_PATH } from "./config";
import type { AmazonConfig } from "./env";
import { lwaTokenRequest } from "./httpClient";

/** Build the Seller Central consent URL for the seller. */
export function buildAuthorizeUrl(config: AmazonConfig, state: string): string {
  const domain = REGIONS[config.region].sellerCentralDomain;
  const params = new URLSearchParams({
    application_id: config.clientId,
    state,
  });
  // `version=beta` is required for Draft applications; omit it (set
  // AMAZON_OAUTH_VERSION="") for published apps.
  if (config.oauthVersion) params.set("version", config.oauthVersion);
  return `https://${domain}${SELLER_CENTRAL_CONSENT_PATH}?${params.toString()}`;
}

/** Fresh CSRF state token for one authorization attempt. */
export function generateState(): string {
  return `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

/** Exchange the authorization code (spapi_oauth_code) for tokens. */
export async function exchangeAuthorizationCode(
  config: AmazonConfig,
  code: string,
): Promise<TokenSet> {
  const data = await lwaTokenRequest(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    },
    config.clientId,
    config.clientSecret,
  );
  if (!data.access_token || !data.refresh_token) {
    throw new Error("LWA token exchange did not return access/refresh tokens");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

/** Refresh an access token from a stored refresh token. */
export async function refreshAccessToken(
  config: AmazonConfig,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const data = await lwaTokenRequest(
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    config.clientId,
    config.clientSecret,
  );
  if (!data.access_token) {
    throw new Error("LWA refresh did not return an access token");
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}
