"use node";

/**
 * Amazon data provider — wraps SP-API service modules behind a single
 * class that manages token refresh and delegates to the domain-specific
 * service functions.
 */

import { getAmazonConfig, getEncryptionKey } from "./env";
import { decryptToken } from "./encryption";
import { refreshAccessToken } from "./authService";
import { fetchFinancialEvents } from "./financesService";
import { fetchInboundShipments, fetchShipmentItems } from "./inboundService";
import { fetchInventorySummaries } from "./inventoryService";
import { fetchSettlementReportText } from "./reportsService";
import type { AmazonFinancialEventsPayload } from "./normalizer";
import type { AmazonShipmentItem } from "./normalizer";
import type { AmazonInventorySummary } from "./normalizer";
import type { AmazonConfig } from "./env";

export interface AmazonDataProviderConfig {
  userId: string;
  encryptedRefreshToken: string;
  region: string;
}

export class AmazonDataProvider {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private readonly providerConfig: AmazonDataProviderConfig;
  private readonly region: string;
  private appConfig: AmazonConfig | null = null;

  constructor(config: AmazonDataProviderConfig) {
    this.providerConfig = config;
    this.region = config.region;
  }

  private getConfig(): AmazonConfig {
    if (!this.appConfig) {
      this.appConfig = getAmazonConfig();
    }
    return this.appConfig;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const appConfig = this.getConfig();
    const encryptionKey = getEncryptionKey();
    const refreshToken = decryptToken(this.providerConfig.encryptedRefreshToken, encryptionKey);
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
    return fetchFinancialEvents(token, this.getConfig(), { postedAfter, postedBefore }) as Promise<AmazonFinancialEventsPayload>;
  }

  async getInboundShipments() {
    const token = await this.getAccessToken();
    return fetchInboundShipments(token, this.getConfig());
  }

  async getInboundItems(shipmentId: string): Promise<AmazonShipmentItem[]> {
    const token = await this.getAccessToken();
    return fetchShipmentItems(token, this.getConfig(), shipmentId);
  }

  async getInventorySummaries(): Promise<AmazonInventorySummary[]> {
    const token = await this.getAccessToken();
    return fetchInventorySummaries(token, this.getConfig());
  }

  async getSettlementReportText(): Promise<string | null> {
    const token = await this.getAccessToken();
    return fetchSettlementReportText(token, this.getConfig());
  }
}
