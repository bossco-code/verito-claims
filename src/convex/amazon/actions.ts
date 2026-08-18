"use node";

/**
 * Public Amazon integration actions (spec §8–§9, §33).
 *
 *  - beginAmazonAuth:      start the official SP-API authorization flow
 *  - completeAmazonAuth:   server-side code exchange; store refresh token
 *                          ENCRYPTED; mark the account connected
 *  - getAmazonConfigStatus: read-only configuration status for the UI
 *  - disconnectAmazon:      revoke the authorization and delete the user's
 *                          Amazon data (events, candidates, sync history)
 *
 * Secrets never reach the browser: the LWA client secret is only used in
 * these actions, and refresh tokens are stored AES-256-GCM encrypted.
 *
 * Return types are annotated explicitly on each handler: these actions call
 * `internal.amazon.db.*`, and the generated `internal` type derives from
 * `fullApi`, which includes these actions' own types — an un-annotated return
 * type can collapse to `any` under `tsc -b` (TS7022/TS7023).
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { buildAuthorizeUrl, exchangeAuthorizationCode, generateState } from "./authService";
import { encryptToken } from "./encryption";
import { getAmazonConfig, getConfigStatus, getEncryptionKey } from "./env";

/** Start the SP-API authorization flow. Returns the Seller Central consent URL. */
export type BeginAuthResult =
  | { ok: false; error: string; errorCode?: string }
  | { ok: true; url: string };

export const beginAmazonAuth = action({
  args: {},
  handler: async (ctx): Promise<BeginAuthResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { ok: false as const, error: "Please sign in first." };
    }

    let config;
    try {
      config = getAmazonConfig();
    } catch (error) {
      return { ok: false as const, error: (error as Error).message, errorCode: "config" as const };
    }
    try {
      getEncryptionKey();
    } catch (error) {
      return { ok: false as const, error: (error as Error).message, errorCode: "config" as const };
    }

    const state = generateState();
    await ctx.runMutation(internal.amazon.db.createPendingConnection, {
      userId,
      state,
      marketplaceId: config.marketplaceId,
      region: config.region,
    });

    return { ok: true as const, url: buildAuthorizeUrl(config, state) };
  },
});

/**
 * Complete the OAuth handshake. The seller lands back on /amazon/callback
 * with `spapi_oauth_code` + `state`; this action exchanges the code for
 * tokens server-side and stores the refresh token encrypted.
 */
export type CompleteAuthResult =
  | { ok: false; error: string; errorCode?: string }
  | { ok: true; sellerId: string | null };

export const completeAmazonAuth = action({
  args: {
    code: v.string(),
    state: v.string(),
    sellingPartnerId: v.optional(v.string()),
  },
  handler: async (ctx, { code, state, sellingPartnerId }): Promise<CompleteAuthResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { ok: false as const, error: "Please sign in first." };
    }

    let config;
    let encryptionKey;
    try {
      config = getAmazonConfig();
      encryptionKey = getEncryptionKey();
    } catch (error) {
      return { ok: false as const, error: (error as Error).message, errorCode: "config" as const };
    }

    const connection = await ctx.runQuery(internal.amazon.db.getConnectionByState, { state });
    if (!connection || connection.userId !== userId || connection.status !== "pending") {
      return {
        ok: false as const,
        error:
          "Amazon authorization could not be verified (missing or expired state). Please try connecting again.",
        errorCode: "invalid_state" as const,
      };
    }

    try {
      const tokens = await exchangeAuthorizationCode(config, code);
      const encryptedRefreshToken = encryptToken(tokens.refreshToken, encryptionKey);
      await ctx.runMutation(internal.amazon.db.completeConnection, {
        connectionId: connection._id,
        encryptedRefreshToken,
        sellerId: sellingPartnerId,
        connectedAt: Date.now(),
      });
      return { ok: true as const, sellerId: sellingPartnerId ?? null };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Amazon authorization failed";
      // eslint-disable-next-line no-console
      console.error("[amazon] OAuth code exchange failed:", message);
      await ctx.runMutation(internal.amazon.db.patchConnection, {
        connectionId: connection._id,
        patch: { status: "failed", lastError: message },
      });
      return { ok: false as const, error: message, errorCode: "oauth_exchange" as const };
    }
  },
});

/** Read-only config status — lets the UI explain why Connect isn't available. */
export const getAmazonConfigStatus = action({
  args: {},
  handler: async () => {
    return getConfigStatus();
  },
});

/** Revoke the Amazon authorization and wipe the user's Amazon data. */
export type DisconnectResult = { ok: false; error: string } | { ok: true };

export const disconnectAmazon = action({
  args: {},
  handler: async (ctx): Promise<DisconnectResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { ok: false as const, error: "Please sign in first." };
    }
    await ctx.runMutation(internal.amazon.db.revokeConnection, { userId });
    // Delete in pages until nothing is left (mutations have execution limits).
    for (let i = 0; i < 100; i++) {
      const { deleted } = await ctx.runMutation(internal.amazon.db.deleteUserDataPage, {
        userId,
        limit: 300,
      });
      if (deleted === 0) break;
    }
    return { ok: true as const };
  },
});
