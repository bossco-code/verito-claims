/**
 * Data normalization layer (spec §15).
 *
 * Amazon API responses → Verito's internal NormalizedEvent model. The
 * reimbursement engine never sees raw Amazon payloads. Source identifiers are
 * preserved verbatim (spec §13) for the future Evidence Engine.
 *
 * Sources: amazon.finances | amazon.inbound | amazon.inventory | amazon.reports
 */

import {
  FINANCE_EVENT_LISTS,
  LWA_TOKEN_ENDPOINT,
  REGIONS,
} from "./config";
import { EventType, NormalizedEvent } from "./types";

export const SOURCES = {
  FINANCES: "amazon.finances",
  INBOUND: "amazon.inbound",
  INVENTORY: "amazon.inventory",
  REPORTS: "amazon.reports",
} as const;

export interface NormalizeContext {
  marketplaceId: string;
  retrievedAt: number;
}

function evtId(ctx: NormalizeContext, source: string, recordId: string): string {
  return `evt_${source}_${recordId}`;
}

/* ─────────────────────────── Finances ─────────────────────────── */

export interface AmazonFinancialEventsPayload {
  FinancialEvents?: {
    FBALossEventList?: Array<Record<string, unknown>>;
    SAFETReimbursementEventList?: Array<Record<string, unknown>>;
    FBADirectPaymentEventList?: Array<Record<string, unknown>>;
    RemovalShipmentAdjustmentEventList?: Array<Record<string, unknown>>;
    TDSReimbursementEventList?: Array<Record<string, unknown>>;
    AdjustmentEventList?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  NextToken?: string;
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}
function num(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function date(v: unknown): number | undefined {
  const s = str(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

/** Normalize the Finances API payload into events. Reimbursement-like lists
 *  become REIMBURSEMENT events (used by reconciliation); losses become
 *  FBA_LOSS; everything else FINANCIAL_EVENT. */
export function normalizeFinancialEvents(
  payload: AmazonFinancialEventsPayload,
  ctx: NormalizeContext,
): NormalizedEvent[] {
  const fe = payload.FinancialEvents ?? {};
  const out: NormalizedEvent[] = [];
  const push = (list: unknown, eventType: EventType, key: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((raw, i) => {
      const rec = raw as Record<string, unknown>;
      const posted = date(rec.PostedDate ?? rec.PaymentPostedDate ?? rec.Date);
      if (posted === undefined) return;
      const recordId = str(rec.TransactionId ?? rec.SellerTransactionID) ?? `${key}-${i}`;
      const base = {
        event_type: eventType,
        marketplace_id: ctx.marketplaceId,
        sku: str(rec.SellerSKU ?? rec.SKU),
        asin: str(rec.ASIN),
        fnsku: str(rec.FNSKU),
        shipment_id: str(rec.ShipmentId),
        order_id: str(rec.OrderId),
        currency: str(rec.CurrencyCode ?? rec.Currency),
        event_date: posted,
        retrieved_at: ctx.retrievedAt,
        source: SOURCES.FINANCES,
        source_record_id: recordId,
        metadata: { raw: rec } as unknown as Record<string, unknown>,
      };
      out.push({
        ...base,
        event_id: evtId(ctx, SOURCES.FINANCES, recordId),
        event_type: eventType,
        amount: num(
          rec.ReimbursedAmount ?? rec.CompensationAmount ?? rec.DirectPaymentAmount ?? rec.AdjustmentAmount,
        ),
        quantity: num(rec.QuantityReimbursed ?? rec.QuantityLost ?? rec.Quantity),
        metadata: {
          raw: rec,
          posted_date: posted,
        },
      } as NormalizedEvent);
    });
  };

  for (const key of FINANCE_EVENT_LISTS.reimbursement) {
    push(fe[key], "REIMBURSEMENT", key);
  }
  for (const key of FINANCE_EVENT_LISTS.loss) {
    push(fe[key], "FBA_LOSS", key);
  }
  for (const key of FINANCE_EVENT_LISTS.adjustment) {
    push(fe[key], "INVENTORY_ADJUSTMENT", key);
  }
  for (const key of FINANCE_EVENT_LISTS.fee) {
    push(fe[key], "FINANCIAL_EVENT", key);
  }
  return out;
}

/* ─────────────────────────── Inbound ─────────────────────────── */

export interface AmazonShipmentItem {
  ShipmentId?: string;
  SellerSKU?: string;
  FNSKU?: string;
  ASIN?: string;
  QuantityShipped?: number;
  QuantityReceived?: number;
  QuantityInCase?: number;
}

export interface AmazonShipment {
  ShipmentId?: string;
  ShipmentName?: string;
  ShipmentStatus?: string;
  DestinationFulfillmentCenterId?: string;
  ShipmentStatusDate?: string;
}

/** Normalize inbound shipment items. Items where received < shipped become
 *  FBA_RECEIVING_DISCREPANCY events (the shortage is the discrepancy); all
 *  items also emit SHIPMENT events for full traceability. */
export function normalizeInboundItems(
  items: AmazonShipmentItem[],
  shipment: AmazonShipment,
  ctx: NormalizeContext,
): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  const shipId = str(shipment.ShipmentId) ?? "unknown";
  const dest = str(shipment.DestinationFulfillmentCenterId);
  const statusDate = date(shipment.ShipmentStatusDate);
  for (const it of items) {
    const sku = str(it.SellerSKU);
    const shipped = num(it.QuantityShipped);
    const received = num(it.QuantityReceived);
    const recordId = `${shipId}:${sku ?? "nosku"}`;
    const base = {
      event_id: evtId(ctx, SOURCES.INBOUND, recordId),
      marketplace_id: ctx.marketplaceId,
      sku,
      asin: str(it.ASIN),
      fnsku: str(it.FNSKU),
      shipment_id: shipId,
      event_date: statusDate ?? ctx.retrievedAt,
      retrieved_at: ctx.retrievedAt,
      source: SOURCES.INBOUND,
      source_record_id: recordId,
      metadata: {
        raw: it,
        destinationFulfillmentCenterId: dest,
        shipmentStatus: str(shipment.ShipmentStatus),
      } as Record<string, unknown>,
    };
    if (shipped !== undefined) {
      out.push({
        ...base,
        event_type: "SHIPMENT",
        quantity: shipped,
        metadata: { ...base.metadata, receivedQuantity: received },
      });
    }
    const missing =
      shipped !== undefined && received !== undefined ? shipped - received : undefined;
    if (missing !== undefined && missing >= 1) {
      out.push({
        ...base,
        event_id: `${base.event_id}:disc`,
        event_type: "FBA_RECEIVING_DISCREPANCY",
        quantity: missing,
        metadata: {
          ...base.metadata,
          shippedQuantity: shipped,
          receivedQuantity: received,
        },
      });
    }
  }
  return out;
}

/* ─────────────────────────── Inventory ─────────────────────────── */

export interface AmazonInventorySummary {
  sku?: string;
  asin?: string;
  fnSku?: string;
  unsellableQty?: {
    damagedUnitQty?: number;
    customerDamagedUnitQty?: number;
    carrierDamagedUnitQty?: number;
    defectiveUnitQty?: number;
    expiredUnitQty?: number;
  };
  researchingQuantity?: {
    totalResearchingQuantity?: number;
  };
  totalQuantity?: number;
}

/** Normalize inventory summaries. Damaged/unsellable units → FBA_DAMAGE;
 *  researching units (lost/being investigated) → FBA_LOSS. */
export function normalizeInventorySummaries(
  summaries: AmazonInventorySummary[],
  ctx: NormalizeContext,
): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const s of summaries) {
    const sku = str(s.sku);
    if (!sku) continue;
    const damaged =
      s.unsellableQty?.damagedUnitQty ??
      s.unsellableQty?.customerDamagedUnitQty ??
      s.unsellableQty?.carrierDamagedUnitQty ??
      0;
    const researching = s.researchingQuantity?.totalResearchingQuantity ?? 0;
    const recordId = `inv:${sku}`;
    const base = {
      event_id: evtId(ctx, SOURCES.INVENTORY, recordId),
      marketplace_id: ctx.marketplaceId,
      sku,
      asin: str(s.asin),
      fnsku: str(s.fnSku),
      event_date: ctx.retrievedAt,
      retrieved_at: ctx.retrievedAt,
      source: SOURCES.INVENTORY,
      source_record_id: recordId,
      metadata: { raw: s } as Record<string, unknown>,
    };
    if (damaged >= 1) {
      out.push({
        ...base,
        event_id: `${base.event_id}:damaged`,
        event_type: "FBA_DAMAGE",
        quantity: damaged,
      });
    }
    if (researching >= 1) {
      out.push({
        ...base,
        event_id: `${base.event_id}:researching`,
        event_type: "FBA_LOSS",
        quantity: researching,
      });
    }
  }
  return out;
}

/* ─────────────────────────── Settlement ─────────────────────────── */

/** Derive per-SKU average item price from the V2 settlement flat file.
 *  Only rows with price-type "ItemPrice" contribute. If the report can't be
 *  parsed, returns {} (never fabricates prices). */
export function unitPricesFromSettlement(text: string): Record<string, number> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return {};
  const header = lines[0]!.split("\t").map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const skuIdx = idx("sku");
  const priceTypeIdx = idx("price-type");
  const priceAmountIdx = idx("price-amount");
  const qtyIdx = idx("quantity-purchased");
  if (skuIdx < 0 || priceTypeIdx < 0 || priceAmountIdx < 0) return {};

  const totals = new Map<string, { sum: number; qty: number }>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split("\t");
    const sku = cols[skuIdx]?.trim();
    const priceType = cols[priceTypeIdx]?.trim();
    const amount = Number(cols[priceAmountIdx]);
    if (!sku || priceType !== "ItemPrice" || !Number.isFinite(amount)) continue;
    const qty = Number(cols[qtyIdx]) || 1;
    const t = totals.get(sku) ?? { sum: 0, qty: 0 };
    t.sum += amount * qty;
    t.qty += qty;
    totals.set(sku, t);
  }
  const out: Record<string, number> = {};
  for (const [sku, t] of totals) {
    if (t.qty > 0) out[sku] = Math.max(0, t.sum / t.qty);
  }
  return out;
}

export { REGIONS, LWA_TOKEN_ENDPOINT };
