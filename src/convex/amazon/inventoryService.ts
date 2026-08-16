"use node";

/**
 * AmazonInventoryService — FBA Inventory API (v1).
 *
 * Operations (verified against Amazon SP-API docs, see /docs/amazon-sp-api.md):
 *  - getInventorySummaries: GET /fba/inventory/v1/summaries
 *      ?granularityType=Marketplace&granularityId=<marketplaceId>
 *      &marketplaceIds=<marketplaceId>&details=true&paginationToken=..
 * Required role: Amazon Fulfillment (or Product Listing).
 *
 * With `details=true` the summaries expose `unsellableQty` (damaged, defective,
 * expired, …) and `researchingQuantity` — the deterministic basis for the
 * FBA damage / FBA loss scenarios. This API replaces the legacy
 * GET_FBA_FULFILLMENT_INVENTORY_ADJUSTMENTS_DATA report, which has been
 * deprecated by Amazon.
 *
 * Note: this operation paginates with `paginationToken` (not NextToken).
 */

import { HTTP } from "./config";
import type { AmazonConfig } from "./env";
import { spApiRequest } from "./httpClient";
import type { AmazonInventorySummary } from "./normalizer";

interface InventoryPage {
  payload?: {
    inventorySummaries?: AmazonInventorySummary[];
    pagination?: { nextToken?: string };
  };
}

/** Fetch inventory summaries with detail breakdowns (paginated). */
export async function fetchInventorySummaries(
  accessToken: string,
  config: AmazonConfig,
): Promise<AmazonInventorySummary[]> {
  const out: AmazonInventorySummary[] = [];
  let token: string | undefined;
  const maxPages = HTTP.maxPaginationPages;

  for (let page = 0; page < maxPages; page++) {
    const res = await spApiRequest<InventoryPage>({
      region: config.region,
      accessToken,
      path: "/fba/inventory/v1/summaries",
      params: {
        granularityType: "Marketplace",
        granularityId: config.marketplaceId,
        marketplaceIds: config.marketplaceId,
        details: true,
        paginationToken: token,
      },
    });
    out.push(...(res.payload?.inventorySummaries ?? []));
    token = res.payload?.pagination?.nextToken;
    if (!token) break;
  }
  return out;
}
