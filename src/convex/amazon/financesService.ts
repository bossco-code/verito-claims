"use node";

/**
 * AmazonFinancesService — Finances API (v0).
 *
 * Operations (verified against Amazon SP-API docs, see /docs/amazon-sp-api.md):
 *  - listFinancialEvents: GET /finances/v0/financialEvents?PostedAfter=..&PostedBefore=..
 *    &MaxResultsPerPage=..&NextToken=..
 * Required role: Finance and Accounting. No Restricted Data Token required.
 * Rate limit (default usage plan): 0.5 requests/second, burst 30.
 *
 * v0 responses wrap the body in a `payload` object and paginate with
 * `NextToken`.
 */

import { HTTP } from "./config";
import type { AmazonConfig } from "./env";
import { spApiRequest } from "./httpClient";

interface FinancesPage {
  payload?: {
    FinancialEvents?: Record<string, unknown>;
    NextToken?: string;
  };
}

/** Pull financial events for the window, paginated via NextToken. */
export async function fetchFinancialEvents(
  accessToken: string,
  config: AmazonConfig,
  opts: { postedAfter: Date; postedBefore: Date },
): Promise<Record<string, unknown>> {
  const merged: Record<string, unknown> = {};
  let nextToken: string | undefined;
  const maxPages = HTTP.maxPaginationPages;

  for (let page = 0; page < maxPages; page++) {
    const res = await spApiRequest<FinancesPage>({
      region: config.region,
      accessToken,
      path: "/finances/v0/financialEvents",
      params: {
        PostedAfter: opts.postedAfter.toISOString(),
        PostedBefore: opts.postedBefore.toISOString(),
        MaxResultsPerPage: 100,
        NextToken: nextToken,
      },
    });
    const fe = res.payload?.FinancialEvents ?? {};
    for (const [key, value] of Object.entries(fe)) {
      if (Array.isArray(value)) {
        merged[key] = [...((merged[key] as unknown[] | undefined) ?? []), ...value];
      } else if (!(key in merged)) {
        merged[key] = value;
      }
    }
    nextToken = res.payload?.NextToken;
    if (!nextToken) break;
  }

  return merged;
}
