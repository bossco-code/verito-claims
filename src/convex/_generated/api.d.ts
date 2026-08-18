/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as amazon_actions from "../amazon/actions.js";
import type * as amazon_authService from "../amazon/authService.js";
import type * as amazon_config from "../amazon/config.js";
import type * as amazon_db from "../amazon/db.js";
import type * as amazon_detection from "../amazon/detection.js";
import type * as amazon_eligibility from "../amazon/eligibility.js";
import type * as amazon_encryption from "../amazon/encryption.js";
import type * as amazon_engine from "../amazon/engine.js";
import type * as amazon_env from "../amazon/env.js";
import type * as amazon_financesService from "../amazon/financesService.js";
import type * as amazon_httpClient from "../amazon/httpClient.js";
import type * as amazon_inboundService from "../amazon/inboundService.js";
import type * as amazon_inventoryService from "../amazon/inventoryService.js";
import type * as amazon_normalizer from "../amazon/normalizer.js";
import type * as amazon_policyEngine from "../amazon/policyEngine.js";
import type * as amazon_priority from "../amazon/priority.js";
import type * as amazon_provider from "../amazon/provider.js";
import type * as amazon_queries from "../amazon/queries.js";
import type * as amazon_reconciliation from "../amazon/reconciliation.js";
import type * as amazon_reportsService from "../amazon/reportsService.js";
import type * as amazon_sync from "../amazon/sync.js";
import type * as amazon_types from "../amazon/types.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as billing from "../billing.js";
import type * as checkout from "../checkout.js";
import type * as claims from "../claims.js";
import type * as crons from "../crons.js";
import type * as evidence_actions from "../evidence/actions.js";
import type * as evidence_ai from "../evidence/ai.js";
import type * as evidence_calculation from "../evidence/calculation.js";
import type * as evidence_collection from "../evidence/collection.js";
import type * as evidence_completeness from "../evidence/completeness.js";
import type * as evidence_db from "../evidence/db.js";
import type * as evidence_decision from "../evidence/decision.js";
import type * as evidence_queries from "../evidence/queries.js";
import type * as evidence_timeline from "../evidence/timeline.js";
import type * as evidence_types from "../evidence/types.js";
import type * as evidence_verification from "../evidence/verification.js";
import type * as http from "../http.js";
import type * as seo_actions from "../seo/actions.js";
import type * as seo_adminHttp from "../seo/adminHttp.js";
import type * as seo_engine_config from "../seo/engine/config.js";
import type * as seo_engine_crawler from "../seo/engine/crawler.js";
import type * as seo_engine_health from "../seo/engine/health.js";
import type * as seo_engine_issues from "../seo/engine/issues.js";
import type * as seo_engine_robots from "../seo/engine/robots.js";
import type * as seo_engine_sitemap from "../seo/engine/sitemap.js";
import type * as seo_mutations from "../seo/mutations.js";
import type * as seo_publicHttp from "../seo/publicHttp.js";
import type * as seo_queries from "../seo/queries.js";
import type * as subscriptions from "../subscriptions.js";
import type * as users from "../users.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "amazon/actions": typeof amazon_actions;
  "amazon/authService": typeof amazon_authService;
  "amazon/config": typeof amazon_config;
  "amazon/db": typeof amazon_db;
  "amazon/detection": typeof amazon_detection;
  "amazon/eligibility": typeof amazon_eligibility;
  "amazon/encryption": typeof amazon_encryption;
  "amazon/engine": typeof amazon_engine;
  "amazon/env": typeof amazon_env;
  "amazon/financesService": typeof amazon_financesService;
  "amazon/httpClient": typeof amazon_httpClient;
  "amazon/inboundService": typeof amazon_inboundService;
  "amazon/inventoryService": typeof amazon_inventoryService;
  "amazon/normalizer": typeof amazon_normalizer;
  "amazon/policyEngine": typeof amazon_policyEngine;
  "amazon/priority": typeof amazon_priority;
  "amazon/provider": typeof amazon_provider;
  "amazon/queries": typeof amazon_queries;
  "amazon/reconciliation": typeof amazon_reconciliation;
  "amazon/reportsService": typeof amazon_reportsService;
  "amazon/sync": typeof amazon_sync;
  "amazon/types": typeof amazon_types;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  billing: typeof billing;
  checkout: typeof checkout;
  claims: typeof claims;
  crons: typeof crons;
  "evidence/actions": typeof evidence_actions;
  "evidence/ai": typeof evidence_ai;
  "evidence/calculation": typeof evidence_calculation;
  "evidence/collection": typeof evidence_collection;
  "evidence/completeness": typeof evidence_completeness;
  "evidence/db": typeof evidence_db;
  "evidence/decision": typeof evidence_decision;
  "evidence/queries": typeof evidence_queries;
  "evidence/timeline": typeof evidence_timeline;
  "evidence/types": typeof evidence_types;
  "evidence/verification": typeof evidence_verification;
  http: typeof http;
  "seo/actions": typeof seo_actions;
  "seo/adminHttp": typeof seo_adminHttp;
  "seo/engine/config": typeof seo_engine_config;
  "seo/engine/crawler": typeof seo_engine_crawler;
  "seo/engine/health": typeof seo_engine_health;
  "seo/engine/issues": typeof seo_engine_issues;
  "seo/engine/robots": typeof seo_engine_robots;
  "seo/engine/sitemap": typeof seo_engine_sitemap;
  "seo/mutations": typeof seo_mutations;
  "seo/publicHttp": typeof seo_publicHttp;
  "seo/queries": typeof seo_queries;
  subscriptions: typeof subscriptions;
  users: typeof users;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
