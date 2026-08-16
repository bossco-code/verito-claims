"use node";

/**
 * AmazonDataProvider — the clean server-side abstraction (spec §10).
 *
 *   AMAZON SP-API
 *      ↓
 *   AMAZON SERVICES (finances / inbound / inventory / reports)
 *      ↓
 *   AmazonDataProvider (this module — token lifecycle + facades)
 *      ↓
 *   NORMALIZED DATA (normalizer.ts)
 *      ↓
 *   REIMBURSEMENT ENGINE (engine.ts)
 *
 * Frontend components never call Amazon directly; the reimbursement engine
 * never depends on Amazon response formats. The provider owns the LWA
 * access-token lifecycle (refresh + in-process cache) so callers just ask for
 * domain data.
 */

import { refreshAccessToken } from "./authService";
import { getAmazonConfig, getEncryptionKey } from "./env";
import { decryptToken } from "./encryption";
import { fetchFinancialEvents } from "./financesService";
import { fetchInboundShipments, fetchShipmentItems } from "./inboundService";
import { fetchInventorySummaries } from "./inventoryService";
import { fetchSettlementReportText } from "./reportsService";
import type { AmazonConfig } from "./env";
import type { RegionCode } from "./config";
import type { AmazonShipment, AmazonShipmentItem, AmazonInventorySummary } from "./normalizer";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/** Per-process access-token cache (1h validity, refreshed pre-emptively). */
const tokenCache = new Map<string, CachedToken>();

export interface ProviderOptions {
  userId: string;
  encryptedRefreshToken: string;
  region: RegionCode;
}

export class AmazonDataProvider {
  private config: AmazonConfig;
  private refreshToken: string;
  private cacheKey: string;

  constructor(opts: ProviderOptions) {
    this.config = getAmazonConfig();
    this.refreshToken = decryptToken(
      opts.encryptedRefreshToken,
      getEncryptionKey(),
    );
    this.cacheKey = `${opts.userId}:${opts.region}`;
  }

  get marketplaceId(): string {
    return this.config.marketplaceId;
  }

  get region(): RegionCode {
    return this.config.region;
  }

  /** Short-lived access token, refreshed from the stored refresh token. */
  async accessToken(): Promise<string> {
    const cached = tokenCache.get(this.cacheKey);
    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
      return cached.accessToken;
    }
    const { accessToken, expiresIn } = await refreshAccessToken(
      this.config,
      this.refreshToken,
    );
    tokenCache.set(this.cacheKey, {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    return accessToken;
  }

  /* ─────────────────────────── Domain facades ─────────────────────────── */

  async getFinancialEvents(after: Date, before: Date) {
    return fetchFinancialEvents(await this.accessToken(), this.config, {
      postedAfter: after,
      postedBefore: before,
    });
  }

  async getInboundShipments(): Promise<AmazonShipment[]> {
    return fetchInboundShipments(await this.accessToken(), this.config);
  }

  async getInboundItems(shipmentId: string): Promise<AmazonShipmentItem[]> {
    return fetchShipmentItems(await this.accessToken(), this.config, shipmentId);
  }

  async getInventorySummaries(): Promise<AmazonInventorySummary[]> {
    return fetchInventorySummaries(await this.accessToken(), this.config);
  }

  /** Settlement report text, or null when unavailable. */
  async getSettlementReportText(): Promise<string | null> {
    return fetchSettlementReportText(await this.accessToken(), this.config);
  }
}
