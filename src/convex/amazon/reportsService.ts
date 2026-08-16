"use node";

/**
 * AmazonReportsService — Reports API (2021-06-30).
 *
 * Used only where the primary APIs can't provide the data (spec §11):
 * Phase 1 uses the V2 settlement report to derive per-SKU average item
 * prices (unit value for recovery estimates).
 *
 * Operations (verified against Amazon SP-API docs, see /docs/amazon-sp-api.md):
 *  - createReport:     POST   /reports/2021-06-30/reports
 *  - getReport:        GET    /reports/2021-06-30/reports/{reportId}
 *  - getReportDocument GET    /reports/2021-06-30/reports/{reportId}/document
 *
 * Report type: GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2
 * Required role: Finance and Accounting.
 *
 * If the report cannot be created/parsed (role missing, data unavailable) the
 * service returns null — it NEVER fabricates prices. The sync layer records
 * the reports domain as unavailable and the engine lowers data completeness.
 */

import { createDecipheriv } from "node:crypto";
import { REPORT_TYPES } from "./config";
import type { AmazonConfig } from "./env";
import { spApiRequest } from "./httpClient";

const REPORT_POLL_MS = 5000;
const REPORT_POLL_MAX = 12; // ~60s

interface CreateReportResponse {
  reportId?: string;
}
interface ReportStatusResponse {
  reportId?: string;
  reportProcessingStatus?: string;
  processingEndTime?: string;
}
interface ReportDocumentResponse {
  reportDocumentId?: string;
  url?: string;
  encryptionDetails?: { standard?: string; initializationVector?: string; key?: string };
}

function decryptReport(
  text: string,
  encryption?: ReportDocumentResponse["encryptionDetails"],
): string {
  if (!encryption || encryption.standard !== "AES" || !encryption.key) return text;
  const decipher = createDecipheriv(
    "aes-256-cbc",
    Buffer.from(encryption.key, "base64"),
    Buffer.from(encryption.initializationVector ?? "", "base64"),
  );
  return Buffer.concat([decipher.update(Buffer.from(text, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

/** Request the V2 settlement report and download its text. Returns null on
 *  any failure (never throws — the sync layer treats it as domain-unavailable). */
export async function fetchSettlementReportText(
  accessToken: string,
  config: AmazonConfig,
): Promise<string | null> {
  try {
    const created = await spApiRequest<CreateReportResponse>({
      region: config.region,
      accessToken,
      path: "/reports/2021-06-30/reports",
      method: "POST",
      body: {
        reportType: REPORT_TYPES.SETTLEMENT_V2,
        marketplaceIds: [config.marketplaceId],
      },
    });
    const reportId = created.reportId;
    if (!reportId) return null;

    for (let i = 0; i < REPORT_POLL_MAX; i++) {
      await new Promise((r) => setTimeout(r, REPORT_POLL_MS));
      const status = await spApiRequest<ReportStatusResponse>({
        region: config.region,
        accessToken,
        path: `/reports/2021-06-30/reports/${reportId}`,
      });
      const s = status.reportProcessingStatus;
      if (s === "COMPLETE") break;
      if (s === "CANCELLED" || s === "FATAL") return null;
      if (i === REPORT_POLL_MAX - 1) return null;
    }

    const doc = await spApiRequest<ReportDocumentResponse>({
      region: config.region,
      accessToken,
      path: `/reports/2021-06-30/reports/${reportId}/document`,
    });
    if (!doc.url) return null;
    const res = await fetch(doc.url);
    if (!res.ok) return null;
    const text = await res.text();
    return decryptReport(text, doc.encryptionDetails);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[reports] settlement report unavailable:", (error as Error).message);
    return null;
  }
}
