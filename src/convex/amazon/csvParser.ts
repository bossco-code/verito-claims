/**
 * CSV Parser for Amazon Seller Central report exports.
 *
 * Parses the three main report types into NormalizedEvent[] so the existing
 * analysis engine can run on manually-uploaded data (provider mode).
 *
 * Report formats:
 * 1. Financial Events — "Detail with financial event group ID" report
 * 2. Inventory — "Inventory Event Detail" or "Inventory Adjustments" report
 * 3. Settlement — V2 Settlement flat file (tab-delimited)
 */

import type { NormalizedEvent, EventType } from "./types";

export type CsvReportType = "financial_events" | "inventory" | "settlement";

export interface CsvParseResult {
  events: NormalizedEvent[];
  reportType: CsvReportType;
  rowCount: number;
  parsedCount: number;
  errors: string[];
}

interface ParseContext {
  marketplaceId: string;
  sellerId: string;
  retrievedAt: number;
}

/* ──────────────────── helpers ──────────────────── */

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

function parseDate(v: unknown): number | undefined {
  const s = str(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

function evtId(source: string, recordId: string): string {
  return `csv_${source}_${recordId}`;
}

/** Split a CSV line respecting quoted fields. */
function splitCsvLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function buildRowMap(headers: string[]): (row: string[]) => Record<string, string> {
  return (cols: string[]) => {
    const map: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i]!;
      map[key] = cols[i] ?? "";
    }
    return map;
  };
}

/* ──────────── Financial Events CSV parser ──────────── */

/**
 * Amazon's "Detail with financial event group ID" CSV report has columns like:
 *   date, type, event type, order id, sku, quantity, amount, currency, ...
 *
 * We look for rows with event types matching loss/damage/reimbursement patterns.
 */
function parseFinancialEventsCsv(
  text: string,
  ctx: ParseContext,
): { events: NormalizedEvent[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { events: [], errors: ["CSV has no data rows"] };

  // Detect delimiter (comma or tab)
  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const headers = splitCsvLine(lines[0]!, delimiter);
  const row = buildRowMap(headers);
  const events: NormalizedEvent[] = [];
  const errors: string[] = [];

  // Try to find the column indices for key fields
  const dateCol = headers.find((h) => /date|posted|transaction/i.test(h));
  const typeCol = headers.find((h) => /event.?type|type|description/i.test(h));
  const skuCol = headers.find((h) => /sku|seller.?sku/i.test(h));
  const asinCol = headers.find((h) => /asin/i.test(h));
  const qtyCol = headers.find((h) => /qty|quantity/i.test(h));
  const amountCol = headers.find((h) => /amount|compensation|payment/i.test(h));
  const currencyCol = headers.find((h) => /currency/i.test(h));
  const orderIdCol = headers.find((h) => /order.?id/i.test(h));
  const shipmentIdCol = headers.find((h) => /shipment.?id/i.test(h));
  const txIdCol = headers.find((h) => /transaction.?id/i.test(h));

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!, delimiter);
    const r = row(cols);

    const eventType = str(r[typeCol ?? ""]) ?? "";
    const date = parseDate(r[dateCol ?? ""]);

    if (!date) {
      errors.push(`Row ${i + 1}: no parseable date`);
      continue;
    }

    // Classify the event type
    let normalizedType: EventType;
    const et = eventType.toUpperCase();
    if (/loss|lost|missing/i.test(et)) {
      normalizedType = "FBA_LOSS";
    } else if (/damage|damaged/i.test(et)) {
      normalizedType = "FBA_DAMAGE";
    } else if (/reimburs/i.test(et)) {
      normalizedType = "REIMBURSEMENT";
    } else if (/adjustment|inventory/i.test(et)) {
      normalizedType = "INVENTORY_ADJUSTMENT";
    } else if (/return/i.test(et)) {
      normalizedType = "CUSTOMER_RETURN";
    } else {
      normalizedType = "FINANCIAL_EVENT";
    }

    const recordId = str(r[txIdCol ?? ""]) ?? `row-${i}`;
    const sku = str(r[skuCol ?? ""]);

    events.push({
      event_id: evtId("financial_csv", recordId),
      event_type: normalizedType,
      marketplace_id: ctx.marketplaceId,
      sku,
      asin: str(r[asinCol ?? ""]),
      quantity: num(r[qtyCol ?? ""]),
      amount: num(r[amountCol ?? ""]),
      currency: str(r[currencyCol ?? ""]) ?? "USD",
      event_date: date,
      order_id: str(r[orderIdCol ?? ""]),
      shipment_id: str(r[shipmentIdCol ?? ""]),
      source: "csv.financial_events",
      source_record_id: recordId,
      retrieved_at: ctx.retrievedAt,
      metadata: { csvRow: i + 1, rawType: eventType, sellerId: ctx.sellerId },
    });
  }

  return { events, errors };
}

/* ──────────── Inventory CSV parser ──────────── */

/**
 * Amazon Inventory Event Detail CSV typically has:
 *   date, event type, sku, asin, fnsku, quantity, disposition, ...
 */
function parseInventoryCsv(
  text: string,
  ctx: ParseContext,
): { events: NormalizedEvent[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { events: [], errors: ["CSV has no data rows"] };

  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const headers = splitCsvLine(lines[0]!, delimiter);
  const row = buildRowMap(headers);
  const events: NormalizedEvent[] = [];
  const errors: string[] = [];

  const dateCol = headers.find((h) => /date|event.?date|posted/i.test(h));
  const typeCol = headers.find((h) => /event.?type|type|disposition|reason/i.test(h));
  const skuCol = headers.find((h) => /sku|seller.?sku/i.test(h));
  const asinCol = headers.find((h) => /asin/i.test(h));
  const fnskuCol = headers.find((h) => /fnsku/i.test(h));
  const qtyCol = headers.find((h) => /qty|quantity/i.test(h));

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!, delimiter);
    const r = row(cols);

    const eventType = str(r[typeCol ?? ""]) ?? "";
    const date = parseDate(r[dateCol ?? ""]);

    if (!date) {
      errors.push(`Row ${i + 1}: no parseable date`);
      continue;
    }

    const et = eventType.toUpperCase();
    let normalizedType: EventType;
    if (/damage|defect|unsellable/i.test(et)) {
      normalizedType = "FBA_DAMAGE";
    } else if (/lost|missing|research/i.test(et)) {
      normalizedType = "FBA_LOSS";
    } else if (/adjust/i.test(et)) {
      normalizedType = "INVENTORY_ADJUSTMENT";
    } else if (/return/i.test(et)) {
      normalizedType = "CUSTOMER_RETURN";
    } else {
      normalizedType = "INVENTORY_ADJUSTMENT";
    }

    const sku = str(r[skuCol ?? ""]);
    const recordId = `inv:${sku ?? "nosku"}:${i}`;

    events.push({
      event_id: evtId("inventory_csv", recordId),
      event_type: normalizedType,
      marketplace_id: ctx.marketplaceId,
      sku,
      asin: str(r[asinCol ?? ""]),
      fnsku: str(r[fnskuCol ?? ""]),
      quantity: num(r[qtyCol ?? ""]),
      event_date: date,
      source: "csv.inventory",
      source_record_id: recordId,
      retrieved_at: ctx.retrievedAt,
      metadata: { csvRow: i + 1, rawType: eventType, sellerId: ctx.sellerId },
    });
  }

  return { events, errors };
}

/* ──────────── Settlement CSV parser ──────────── */

/**
 * Amazon V2 Settlement flat file is tab-delimited with columns like:
 *   date, type, order id, sku, quantity, marketplaces撒付, product sales, ...
 *
 * The key fields for reimbursement detection are:
 *   - Rows with negative amounts (losses)
 *   - SKU-level financial data
 */
function parseSettlementCsv(
  text: string,
  ctx: ParseContext,
): { events: NormalizedEvent[]; unitPrices: Record<string, number>; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { events: [], unitPrices: {}, errors: ["CSV has no data rows"] };

  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const headers = splitCsvLine(lines[0]!, delimiter);
  const row = buildRowMap(headers);
  const events: NormalizedEvent[] = [];
  const errors: string[] = [];
  const priceAccum = new Map<string, { sum: number; qty: number }>();

  const dateCol = headers.find((h) => /date|settlement.?start|settlement.?end/i.test(h));
  const typeCol = headers.find((h) => /type|description|event.?type/i.test(h));
  const skuCol = headers.find((h) => /sku|seller.?sku/i.test(h));
  const asinCol = headers.find((h) => /asin/i.test(h));
  const qtyCol = headers.find((h) => /qty|quantity/i.test(h));
  const amountCol = headers.find((h) => /amount|total|product.?sales|item.?price|price.?amount/i.test(h));
  const currencyCol = headers.find((h) => /currency/i.test(h));
  const orderIdCol = headers.find((h) => /order.?id/i.test(h));
  const txIdCol = headers.find((h) => /transaction.?id/i.test(h));
  const priceTypeCol = headers.find((h) => /price.?type/i.test(h));
  const priceAmountCol = headers.find((h) => /price.?amount/i.test(h));

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!, delimiter);
    const r = row(cols);

    const eventType = str(r[typeCol ?? ""]) ?? "";
    const date = parseDate(r[dateCol ?? ""]);

    // For settlement V2 with price-type columns, accumulate unit prices
    if (priceTypeCol && priceAmountCol) {
      const pt = str(r[priceTypeCol]) ?? "";
      const pa = num(r[priceAmountCol]);
      const sku = str(r[skuCol ?? ""]);
      if (pt === "ItemPrice" && pa !== undefined && sku) {
        const qty = num(r[qtyCol ?? ""]) || 1;
        const t = priceAccum.get(sku) ?? { sum: 0, qty: 0 };
        t.sum += pa * qty;
        t.qty += qty;
        priceAccum.set(sku, t);
      }
    }

    if (!date) {
      errors.push(`Row ${i + 1}: no parseable date`);
      continue;
    }

    const et = eventType.toUpperCase();
    let normalizedType: EventType;
    if (/loss|lost|missing/i.test(et)) {
      normalizedType = "FBA_LOSS";
    } else if (/damage|damaged/i.test(et)) {
      normalizedType = "FBA_DAMAGE";
    } else if (/reimburs/i.test(et)) {
      normalizedType = "REIMBURSEMENT";
    } else if (/adjust/i.test(et)) {
      normalizedType = "INVENTORY_ADJUSTMENT";
    } else {
      normalizedType = "FINANCIAL_EVENT";
    }

    const recordId = str(r[txIdCol ?? ""]) ?? `settle-${i}`;
    const sku = str(r[skuCol ?? ""]);

    events.push({
      event_id: evtId("settlement_csv", recordId),
      event_type: normalizedType,
      marketplace_id: ctx.marketplaceId,
      sku,
      asin: str(r[asinCol ?? ""]),
      quantity: num(r[qtyCol ?? ""]),
      amount: num(r[amountCol ?? ""]),
      currency: str(r[currencyCol ?? ""]) ?? "USD",
      event_date: date,
      order_id: str(r[orderIdCol ?? ""]),
      source: "csv.settlement",
      source_record_id: recordId,
      retrieved_at: ctx.retrievedAt,
      metadata: { csvRow: i + 1, rawType: eventType, sellerId: ctx.sellerId },
    });
  }

  // Convert accumulated prices
  const unitPrices: Record<string, number> = {};
  for (const [sku, t] of priceAccum) {
    if (t.qty > 0) unitPrices[sku] = Math.max(0, t.sum / t.qty);
  }

  return { events, unitPrices, errors };
}

/* ──────────── Auto-detect report type ──────────── */

function detectReportType(headerLine: string): CsvReportType {
  const lower = headerLine.toLowerCase();
  if (/financial|event.?group|transaction.?id/i.test(lower) && /posted.?date|date/i.test(lower)) {
    return "financial_events";
  }
  if (/inventory|disposition|adjustment.?quantity|fnsku/i.test(lower)) {
    return "inventory";
  }
  if (/settlement|price.?type|price.?amount|order.?item.?id/i.test(lower)) {
    return "settlement";
  }
  // Default to financial events as the most common report type
  return "financial_events";
}

/* ──────────── public API ──────────── */

/**
 * Parse an Amazon report CSV and return NormalizedEvents.
 * Auto-detects the report type from the header row.
 */
export function parseAmazonCsv(
  csvText: string,
  marketplaceId: string,
  sellerId: string,
): CsvParseResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { events: [], reportType: "financial_events", rowCount: 0, parsedCount: 0, errors: ["Empty or invalid CSV"] };
  }

  const reportType = detectReportType(lines[0]!);
  const ctx: ParseContext = {
    marketplaceId,
    sellerId,
    retrievedAt: Date.now(),
  };

  let result: { events: NormalizedEvent[]; errors: string[]; unitPrices?: Record<string, number> };

  switch (reportType) {
    case "inventory":
      result = parseInventoryCsv(csvText, ctx);
      break;
    case "settlement":
      result = parseSettlementCsv(csvText, ctx);
      break;
    case "financial_events":
    default:
      result = parseFinancialEventsCsv(csvText, ctx);
      break;
  }

  const rowCount = lines.length - 1;
  return {
    events: result.events,
    reportType,
    rowCount,
    parsedCount: result.events.length,
    errors: result.errors,
    ...(result.unitPrices ? { unitPrices: result.unitPrices } : {}),
  } as CsvParseResult & { unitPrices?: Record<string, number> };
}

/**
 * Parse settlement CSV specifically and also return unit prices.
 */
export function parseSettlementWithPrices(
  csvText: string,
  marketplaceId: string,
  sellerId: string,
): CsvParseResult & { unitPrices: Record<string, number> } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { events: [], reportType: "settlement", rowCount: 0, parsedCount: 0, errors: ["Empty or invalid CSV"], unitPrices: {} };
  }

  const ctx: ParseContext = { marketplaceId, sellerId, retrievedAt: Date.now() };
  const result = parseSettlementCsv(csvText, ctx);

  return {
    events: result.events,
    reportType: "settlement",
    rowCount: lines.length - 1,
    parsedCount: result.events.length,
    errors: result.errors,
    unitPrices: result.unitPrices,
  };
}
