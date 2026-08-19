"use node";

/**
 * Amazon data provider — wraps SP-API service modules behind a single
 * class that manages token refresh and delegates to the domain-specific
 * service functions.
 */

import { getAmazonConfig, getEncryptionKey } from "./env";
import { decryptToken } from "./encryption";
import { refreshAccessToken } from "./authService";
import { getFinancialEvents as fetchFinancialEvents } from "./financesService";
import { getInboundShipments as fetchInboundShipments, getInboundItems as fetchInboundItems } from "./inboundService";
import { getInventorySummaries as fetchInventorySummaries } from "./inventoryService";
import { getSettlementReportText as fetchSettlementReportText } from "./reportsService";
import type { AmazonFinancialEventsPayload } from "./normalizer";
import type { AmazonShipmentItem } from "./normalizer";
import type { AmazonInventorySummary } from "./normalizer";

export interface AmazonDataProviderConfig {
  userId: string;
  encryptedRefreshToken: string;
  region: string;
}

export class AmazonDataProvider {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private readonly config: AmazonDataProviderConfig;
  private readonly region: string;

  constructor(config: AmazonDataProviderConfig) {
    this.config = config;
    this.region = config.region;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const appConfig = getAmazonConfig();
    const encryptionKey = getEncryptionKey();
    const refreshToken = decryptToken(this.config.encryptedRefreshToken, encryptionKey);
    const result = await refreshAccessToken(appConfig, refreshToken);

    this.accessToken = result.accessToken;
    this.tokenExpiresAt = Date.now() + result.expiresIn * 1000;
    return this.accessToken;
  }

  async getFinancialEvents(
    postedAfter: Date,
    postedBefore: Date,
  ): Promise<AmazonFinancialEventsPayload> {
    const token = await this.getAccessToken();
    return fetchFinancialEvents(token, this.region as any, postedAfter, postedBefore);
  }

  async getInboundShipments() {
    const token = await this.getAccessToken();
    return fetchInboundShipments(token, this.region as any);
  }

  async getInboundItems(shipmentId: string): Promise<AmazonShipmentItem[]> {
    const token = await this.getAccessToken();
    return fetchInboundItems(token, this.region as any, shipmentId);
  }

  async getInventorySummaries(): Promise<AmazonInventorySummary[]> {
    const token = await this.getAccessToken();
    return fetchInventorySummaries(token, this.region as any);
  }

  async getSettlementReportText(): Promise<string | null> {
    const token = await this.getAccessToken();
    return fetchSettlementReportText(token, this.region as any);
  }
}
