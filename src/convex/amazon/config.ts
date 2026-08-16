/**
 * Amazon SP-API constants — endpoints, regions, roles, report types.
 *
 * Verified against Amazon's official SP-API documentation (see
 * /docs/amazon-sp-api.md for per-operation detail and sources).
 */

export const REGIONS = {
  NA: {
    code: "NA",
    spApiEndpoint: "https://sellingpartnerapi-na.amazon.com",
    sellerCentralDomain: "sellercentral.amazon.com",
    defaultMarketplaceId: "ATVPDKIKX0DER", // US
  },
  EU: {
    code: "EU",
    spApiEndpoint: "https://sellingpartnerapi-eu.amazon.com",
    sellerCentralDomain: "sellercentral-europe.amazon.com",
    defaultMarketplaceId: "A1PA6795UKMFR9", // DE
  },
  FE: {
    code: "FE",
    spApiEndpoint: "https://sellingpartnerapi-fe.amazon.com",
    sellerCentralDomain: "sellercentral.amazon.co.jp",
    defaultMarketplaceId: "A1VC38T7YXB528", // JP
  },
} as const;

export type RegionCode = keyof typeof REGIONS;

/** Login with Amazon token endpoint (also used for SP-API). */
export const LWA_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";

/** Amazon consent page path (SP-API authorization). */
export const SELLER_CENTRAL_CONSENT_PATH = "/apps/authorize/consent";

/** Roles required by the SP-API operations Phase 1 uses. */
export const REQUIRED_ROLES = {
  FINANCES: "Finance and Accounting",
  FULFILLMENT_INBOUND: "Amazon Fulfillment",
  FULFILLMENT_INVENTORY: "Amazon Fulfillment", // FBA Inventory API: Amazon Fulfillment | Product Listing
  REPORTS: "Reports (see per-report role)",
} as const;

/** Default lookback window for financial data on first sync (days). */
export const DEFAULT_FINANCE_LOOKBACK_DAYS = 180;

/** Rate-limit pacing safety factors (SP-API token bucket). */
export const HTTP = {
  maxRetries: 5,
  baseBackoffMs: 1000,
  maxBackoffMs: 30000,
  minSpacingMs: 250, // never fire faster than this per operation
  maxPaginationPages: 50, // hard cap per domain fetch
} as const;

/** Finances API v0 — reimbursement-relevant event list fields. */
export const FINANCE_EVENT_LISTS = {
  reimbursement: [
    "SAFETReimbursementEventList",
    "FBADirectPaymentEventList",
    "RemovalShipmentAdjustmentEventList",
    "TDSReimbursementEventList",
  ],
  loss: ["FBALossEventList"],
  adjustment: ["AdjustmentEventList"],
  fee: [
    "FBAInventoryFeesEventList",
    "RemovalShipmentEventList",
    "CouponPaymentEventList",
    "DebtRecoveryEventList",
    "LoanServicingEventList",
    "PayWithAmazonEventList",
    "SellerReviewEnrollmentPaymentEventList",
    "ServiceFeeEventList",
    "TaxWithholdingEventList",
    "TrialShipmentEventList",
  ],
} as const;

/** Reports API 2021-06-30 — report types used in Phase 1. */
export const REPORT_TYPES = {
  SETTLEMENT_V2: "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2",
} as const;

/** Default deadline windows (months) — configurable via the claimPolicies table. */
export const DEFAULT_CLAIM_WINDOW_MONTHS = 18;

/** Key for the human-facing claim id prefix. */
export const CLAIM_ID_PREFIX = "CLM";
