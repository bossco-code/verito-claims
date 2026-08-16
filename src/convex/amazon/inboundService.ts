"use node";

/**
 * AmazonInboundService — FBA inbound shipment data (spec §11).
 *
 * Operations (verified against Amazon SP-API docs, see /docs/amazon-sp-api.md):
 *  - FBA Inbound Fulfillment API v0 (still supported for read/legacy paths):
 *      getShipments: GET /fba/inbound/v0/shipments
 *      getShipmentItemsByShipmentId: GET /fba/inbound/v0/shipments/{shipmentId}/shipmentItems
 *    These expose the exact expected-vs-received quantities needed for
 *    receiving-discrepancy detection: `QuantityShipped` vs `QuantityReceived`.
 *  - The current Fulfillment Inbound API 2024-03-20 is the migration target
 *    (GET /inbound/fba/2024-03-20/...); its item model uses `quantity`
 *    (planned/shipped) with received quantities surfaced through inbound
 *    tracking. Phase 1 reads v0 for received quantities and documents the
 *    2024 API as the forward path.
 *
 * Required role: Amazon Fulfillment.
 */

import { HTTP } from "./config";
import type { AmazonConfig } from "./env";
import { spApiPaginated, spApiRequest } from "./httpClient";
import type { AmazonShipment, AmazonShipmentItem } from "./normalizer";

interface ShipmentsPage {
  payload?: { ShipmentData?: AmazonShipment[]; NextToken?: string };
}

/** List inbound shipments (v0 getShipments). */
export async function fetchInboundShipments(
  accessToken: string,
  config: AmazonConfig,
): Promise<AmazonShipment[]> {
  const out = await spApiPaginated<ShipmentsPage, AmazonShipment>({
    region: config.region,
    accessToken,
    path: "/fba/inbound/v0/shipments",
    params: {
      QueryType: "SHIPMENT",
      MarketplaceId: config.marketplaceId,
    },
    itemsPath: "payload.ShipmentData",
    maxPages: HTTP.maxPaginationPages,
  });
  return out;
}

/** Fetch items for one shipment (v0 getShipmentItemsByShipmentId). */
export async function fetchShipmentItems(
  accessToken: string,
  config: AmazonConfig,
  shipmentId: string,
): Promise<AmazonShipmentItem[]> {
  interface ItemsPage {
    payload?: { ItemData?: AmazonShipmentItem[]; NextToken?: string };
  }
  const items: AmazonShipmentItem[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await spApiRequest<ItemsPage>({
      region: config.region,
      accessToken,
      path: `/fba/inbound/v0/shipments/${encodeURIComponent(shipmentId)}/shipmentItems`,
      params: { NextToken: nextToken },
    });
    items.push(...(res.payload?.ItemData ?? []));
    nextToken = res.payload?.NextToken;
    if (!nextToken) break;
  }
  return items;
}
