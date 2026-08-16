"use node";

/**
 * SP-API HTTP client (spec §33–§34).
 *
 * - Authenticates with the LWA access token via the `x-amz-access-token`
 *   header (SP-API does NOT use `Authorization: Bearer`).
 * - Is rate-limit aware: paces requests, honors `Retry-After`, and retries
 *   429/5xx with exponential backoff + jitter.
 * - Never swallows errors: throws AmazonApiError with the SP-API error
 *   payload so the sync layer can log and surface the real reason.
 */

import { HTTP, LWA_TOKEN_ENDPOINT, REGIONS, RegionCode } from "./config";

export class AmazonApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "AmazonApiError";
    this.status = status;
    this.code = code;
  }
}

export function parseSpApiErrors(body: string): { code?: string; message?: string }[] {
  try {
    const json = JSON.parse(body) as { errors?: Array<{ code?: string; message?: string }> };
    return json.errors ?? [];
  } catch {
    return [];
  }
}

/** Throttle requests per process so we stay under the token bucket. */
let lastCallAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SpApiRequestOptions {
  region: RegionCode;
  accessToken: string;
  path: string; // e.g. /finances/v0/financialEvents
  params?: Record<string, string | number | boolean | undefined>;
  method?: "GET" | "POST";
  body?: unknown;
  maxPages?: number;
}

/** Call an SP-API endpoint with rate-limit-aware retries. */
export async function spApiRequest<T>(options: SpApiRequestOptions): Promise<T> {
  const { region, accessToken, path, params, method = "GET", body } = options;
  const url = new URL(path, REGIONS[region].spApiEndpoint);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  let attempt = 0;
  for (;;) {
    // Minimum spacing between SP-API calls (default rate limits are per-second).
    const minGap = 400;
    const wait = Math.max(0, lastCallAt + minGap - Date.now());
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();

    const res = await fetch(url, {
      method,
      headers: {
        "x-amz-access-token": accessToken,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.ok) {
      const text = await res.text();
      return (text ? JSON.parse(text) : {}) as T;
    }

    // Read rate-limit signals.
    const rateLimit = res.headers.get("x-amzn-RateLimit-Limit");
    const retryAfter = res.headers.get("Retry-After");
    const text = await res.text();
    const errors = parseSpApiErrors(text);
    const code = errors[0]?.code ?? null;
    const message =
      errors[0]?.message ?? `SP-API request failed (HTTP ${res.status})`;

    const retriable =
      res.status === 429 ||
      res.status === 500 ||
      res.status === 503 ||
      res.status === 504;

    if (!retriable || attempt >= HTTP.maxRetries) {
      throw new AmazonApiError(res.status, code, message);
    }

    attempt++;
    const backoff = Math.min(
      HTTP.maxBackoffMs,
      HTTP.baseBackoffMs * 2 ** (attempt - 1) * (0.5 + Math.random() * 0.5),
    );
    const delay = retryAfter ? Number(retryAfter) * 1000 : backoff;
    // eslint-disable-next-line no-console
    console.warn(
      `[sp-api] throttled (${code ?? res.status}); retrying in ${Math.round(delay)}ms (rateLimit=${rateLimit ?? "?"})`,
    );
    await sleep(delay);
  }
}

/** Paginated GET using NextToken, with a hard page cap. */
export async function spApiPaginated<TResult, TItem>(
  options: SpApiRequestOptions & {
    itemsPath: string; // dot-path to the items array in the payload
  },
): Promise<TItem[]> {
  const out: TItem[] = [];
  let nextToken: string | undefined;
  const maxPages = options.maxPages ?? HTTP.maxPaginationPages;
  for (let page = 0; page < maxPages; page++) {
    const payload = await spApiRequest<TResult & { NextToken?: string }>({
      ...options,
      params: { ...(options.params ?? {}), NextToken: nextToken },
    });
    const items = (getByPath(payload, options.itemsPath) as TItem[] | undefined) ?? [];
    out.push(...items);
    nextToken = payload.NextToken;
    if (!nextToken) break;
  }
  return out;
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export interface LwaTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** POST to the LWA token endpoint (authorization_code or refresh_token). */
export async function lwaTokenRequest(
  form: Record<string, string>,
  clientId: string,
  clientSecret: string,
): Promise<LwaTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    ...form,
  });
  const res = await fetch(LWA_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as LwaTokenResponse;
  if (!res.ok || data.error) {
    throw new AmazonApiError(
      res.status,
      data.error ?? null,
      data.error_description ?? data.error ?? `LWA token request failed (HTTP ${res.status})`,
    );
  }
  return data;
}
