import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
  PROVIDER: "provider",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
  v.literal(ROLES.PROVIDER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Creem subscription state, kept in sync by the webhook handler
    // (src/convex/webhooks.ts). One row per Creem subscription, linked to the
    // Convex user who started the checkout via metadata.userId (fallback:
    // customer email).
    subscriptions: defineTable({
      creemSubscriptionId: v.string(), // Creem subscription id
      userId: v.optional(v.id("users")), // Convex user who owns the subscription
      email: v.optional(v.string()), // buyer email from Creem
      status: v.string(), // active | past_due | canceled | paused | expired | ...
      plan: v.string(), // plan tier ("pro")
      productId: v.optional(v.string()), // Creem product id
      customerId: v.optional(v.string()), // Creem customer id
      currentPeriodEnd: v.optional(v.number()), // epoch ms
      cancelAtPeriodEnd: v.optional(v.boolean()),
      lastEvent: v.optional(v.string()), // last webhook eventType processed
      lastEventAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_creem_id", ["creemSubscriptionId"])
      .index("by_user", ["userId"])
      .index("by_email", ["email"]),

    // Claim preparation runs, used to enforce the Free plan's monthly limit
    // (5 prepared claims per month; Pro is unlimited). One row per user +
    // calendar month, incremented by the startClaimRun mutation
    // (src/convex/claims.ts).
    claimRuns: defineTable({
      userId: v.id("users"),
      month: v.string(), // "YYYY-MM"
      count: v.number(),
    }).index("by_user_month", ["userId", "month"]),

    // ─────────────────────────────────────────────────────────────────────
    // PHASE 1 — Amazon Reimbursement Opportunity Engine
    // ---------------------------------------------------------------------
    // One row per Verito user ↔ Amazon seller authorization. The refresh
    // token is stored ENCRYPTED (AES-256-GCM, key in AMAZON_TOKEN_ENCRYPTION_KEY)
    // and is never exposed to the frontend.
    amazonConnections: defineTable({
      userId: v.id("users"),
      state: v.optional(v.string()), // CSRF state token for an in-flight OAuth flow
      status: v.string(), // pending | connected | expired | revoked | failed
      sellerId: v.optional(v.string()), // Amazon selling partner / merchant id
      marketplaceId: v.string(), // e.g. ATVPDKIKX0DER (US)
      region: v.string(), // NA | EU | FE
      encryptedRefreshToken: v.optional(v.string()), // AES-256-GCM ciphertext
      connectedAt: v.optional(v.number()),
      lastSyncAt: v.optional(v.number()),
      lastSyncStatus: v.optional(v.string()), // complete | in_progress | failed
      lastError: v.optional(v.string()), // last sync / auth error, user-readable
      dataFrom: v.optional(v.number()), // analyzed data range (epoch ms)
      dataTo: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_state", ["state"]),

    // Normalized Amazon events (raw source references preserved for the
    // future Evidence Engine). Idempotent upserts keyed by
    // (userId, source, source_record_id).
    normalizedEvents: defineTable({
      userId: v.id("users"),
      event_id: v.string(),
      event_type: v.string(), // FBA_LOSS | FBA_DAMAGE | FBA_RECEIVING_DISCREPANCY | REIMBURSEMENT | SHIPMENT | FINANCIAL_EVENT | ...
      marketplace_id: v.string(),
      sku: v.optional(v.string()),
      asin: v.optional(v.string()),
      fnsku: v.optional(v.string()),
      quantity: v.optional(v.number()),
      amount: v.optional(v.number()),
      currency: v.optional(v.string()),
      event_date: v.number(), // epoch ms
      shipment_id: v.optional(v.string()),
      order_id: v.optional(v.string()),
      source: v.string(), // amazon.finances | amazon.inbound | amazon.inventory | amazon.reports
      source_record_id: v.string(), // Amazon event/source identifier
      retrieved_at: v.number(),
      metadata: v.optional(v.any()), // raw source reference, never discarded
    })
      .index("by_user_source", ["userId", "source", "source_record_id"])
      .index("by_user_type", ["userId", "event_type"]),

    // ClaimCandidates — potential opportunities, NOT claims. State machine is
    // deterministic (see src/convex/amazon/engine.ts). Idempotent upserts
    // keyed by (userId, candidateKey) so repeated syncs update, not duplicate.
    claimCandidates: defineTable({
      userId: v.id("users"),
      candidateKey: v.string(),
      claimId: v.string(), // human-facing id, e.g. CLM-2026-1234
      candidate_type: v.string(), // FBA_LOSS | FBA_DAMAGE | FBA_RECEIVING_DISCREPANCY
      marketplace_id: v.string(),
      sku: v.optional(v.string()),
      asin: v.optional(v.string()),
      fnsku: v.optional(v.string()),
      shipment_id: v.optional(v.string()),
      quantity: v.optional(v.number()),
      estimated_value: v.optional(v.number()),
      currency: v.optional(v.string()),
      trigger_event_id: v.string(), // → normalizedEvents.event_id (traceability)
      detected_at: v.number(),
      eligibility_date: v.optional(v.number()),
      deadline_date: v.optional(v.number()),
      days_remaining: v.optional(v.number()),
      reimbursement_status: v.string(), // NOT_REIMBURSED | ALREADY_REIMBURSED | PARTIALLY_REIMBURSED | UNKNOWN
      status: v.string(), // ELIGIBLE | NOT_YET_ELIGIBLE | ALREADY_REIMBURSED | PARTIALLY_REIMBURSED | EXPIRED | DUPLICATE | REQUIRES_MANUAL_REVIEW | POLICY_REVIEW_REQUIRED
      priority: v.string(), // HIGH | MEDIUM | LOW | MONITOR | REQUIRES REVIEW | NO ACTION | EXPIRED
      data_completeness: v.number(), // 0..1
      policy: v.optional(v.any()), // applied ClaimPolicy snapshot
      reconciliation: v.optional(v.any()), // matched reimbursement snapshot
      created_at: v.number(),
      updated_at: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_key", ["userId", "candidateKey"]),

    // Configurable claim policies (deadline rules). Seeded with documented
    // defaults; update without touching the engine.
    claimPolicies: defineTable({
      policy_id: v.string(),
      marketplace: v.string(), // NA | EU | FE | "*"
      claim_type: v.string(), // FBA_LOSS | FBA_DAMAGE | FBA_RECEIVING_DISCREPANCY
      effective_date: v.number(), // epoch ms — policy applies from this date
      eligibility_offset_days: v.number(), // days after trigger event
      deadline_offset_days: v.number(), // days after trigger event
      eligibility_rule: v.string(), // human-readable rule
      deadline_rule: v.string(), // human-readable rule
      policy_version: v.string(),
      source_reference: v.string(), // where the rule comes from
      active: v.boolean(),
    }).index("by_type", ["claim_type", "marketplace"]),

    // Synchronization runs — the UI polls this for REAL stage progress.
    syncRuns: defineTable({
      userId: v.id("users"),
      status: v.string(), // running | complete | failed
      stage: v.string(), // current stage key
      message: v.string(), // user-readable current stage
      error: v.optional(v.string()),
      errorCode: v.optional(v.string()),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
      stages: v.optional(v.any()), // { [stageKey]: { status, at } }
      stats: v.optional(v.any()), // { eventsStored, candidatesCreated, candidatesUpdated }
      dataFrom: v.optional(v.number()),
      dataTo: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    // ─────────────────────────────────────────────────────────────────────
    // PHASE 2 — Evidence Cases (claim workspace)
    // ---------------------------------------------------------------------
    // One EvidenceCase per ClaimCandidate — created on first REVIEW CASE,
    // never duplicated (dedup by claimCandidateId). Owns the evidence
    // graph, deterministic verification, AI analysis and versioned packages.
    evidenceCases: defineTable({
      userId: v.id("users"),
      claimCandidateId: v.id("claimCandidates"),
      caseNumber: v.string(), // human-facing id, e.g. EV-2026-0001
      case_type: v.string(), // FBA_LOSS | FBA_DAMAGE | FBA_RECEIVING_DISCREPANCY
      status: v.string(), // OPEN | COLLECTING_EVIDENCE | VERIFYING | EVIDENCE_INCOMPLETE | EVIDENCE_CONFLICT | READY_FOR_REVIEW | APPROVED_BY_SELLER | PACKAGE_GENERATED | SUBMISSION_READY | CLOSED
      decision: v.string(), // NOT_READY | EVIDENCE_INCOMPLETE | EVIDENCE_CONFLICT | READY_FOR_REVIEW | SELLER_APPROVED | PACKAGE_READY
      estimated_recovery: v.optional(v.number()),
      currency: v.optional(v.string()),
      created_at: v.number(),
      updated_at: v.number(),
      reviewed_at: v.optional(v.number()),
      reviewed_by: v.optional(v.string()),
      // Deterministic snapshots (never AI-decided) — refreshed on each verify run.
      verification: v.optional(v.any()), // { checks: [...], conflicts: [...], ranAt }
      completeness: v.optional(v.any()), // { status, missing: [...], ranAt }
      last_collected_at: v.optional(v.number()),
      // Seller rejection (audit-friendly) — { reason, code, note, at }
      rejection: v.optional(v.any()),
    })
      .index("by_user", ["userId"])
      .index("by_user_candidate", ["userId", "claimCandidateId"]),

    // Evidence items — the traceable evidence graph behind a case. Every item
    // carries a stable evidenceKey (source + source_record_id) so repeated
    // collections update, never duplicate (spec §39 idempotency). The display
    // id (evidenceNo, "E-001") is stable per item within a case.
    evidenceItems: defineTable({
      userId: v.id("users"),
      caseId: v.id("evidenceCases"),
      evidenceKey: v.string(), // stable idempotency key
      evidenceNo: v.string(), // stable display id, e.g. "E-001"
      evidence_type: v.string(), // SHIPMENT_RECORD | INBOUND_EVENT | INVENTORY_EVENT | REIMBURSEMENT_RECORD | FINANCIAL_TRANSACTION | ORDER_RECORD | RETURN_EVENT | ADJUSTMENT_EVENT | CALCULATION | SYSTEM_RECORD | OTHER
      source: v.string(), // e.g. amazon.inbound, Seller Upload, Internal Validation
      source_record_id: v.optional(v.string()), // Amazon source identifier
      event_id: v.optional(v.string()), // → normalizedEvents.event_id
      shipment_id: v.optional(v.string()),
      order_id: v.optional(v.string()),
      sku: v.optional(v.string()),
      asin: v.optional(v.string()),
      fnsku: v.optional(v.string()),
      marketplace_id: v.optional(v.string()),
      title: v.string(),
      description: v.optional(v.string()),
      event_date: v.optional(v.number()), // epoch ms
      retrieved_at: v.optional(v.number()),
      quantity: v.optional(v.number()),
      amount: v.optional(v.number()),
      currency: v.optional(v.string()),
      relevance: v.string(), // DIRECT | SUPPORTING | CONTEXTUAL | IRRELEVANT
      verification_status: v.string(), // CONSISTENT | INCONSISTENT | MISSING | AMBIGUOUS | NOT_APPLICABLE | PENDING
      confidence: v.optional(v.number()), // 0..1
      metadata: v.optional(v.any()), // original normalized data, never discarded
      created_at: v.number(),
      updated_at: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_case", ["caseId"])
      .index("by_case_key", ["caseId", "evidenceKey"]),

    // AI-assisted analysis for a case (spec §22). One row per case — a new
    // run replaces it (regeneration is an audited action). AI is never the
    // authority for decisions; every statement references EvidenceItems.
    aiAnalyses: defineTable({
      userId: v.id("users"),
      caseId: v.id("evidenceCases"),
      status: v.string(), // pending | generated | failed
      summary: v.optional(v.string()),
      key_facts: v.optional(v.array(v.string())),
      discrepancy_explanation: v.optional(v.string()),
      missing_information: v.optional(v.array(v.string())),
      potential_conflicts: v.optional(v.array(v.string())),
      draft_narrative: v.optional(v.string()),
      generated_at: v.optional(v.number()),
      model_identifier: v.optional(v.string()),
      evidence_references: v.optional(v.array(v.string())), // evidenceNo ids used
      error: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_case", ["caseId"]),

    // Versioned claim evidence packages (spec §31–§32). A package captures an
    // exact evidence snapshot; regenerating creates a NEW version, never
    // silently mutates an existing one.
    claimEvidencePackages: defineTable({
      userId: v.id("users"),
      caseId: v.id("evidenceCases"),
      packageId: v.string(), // e.g. PKG-2026-0001-v1
      version: v.number(),
      status: v.string(), // NOT_READY | INCOMPLETE | READY_FOR_REVIEW | APPROVED | GENERATED | SUBMISSION_READY
      generated_at: v.number(),
      generated_by: v.optional(v.string()), // "system" | user identifier
      evidence_snapshot: v.any(), // exact evidence state used to generate
      ai_analysis_id: v.optional(v.id("aiAnalyses")),
      fingerprint: v.optional(v.string()), // VERITO PACKAGE FINGERPRINT
    })
      .index("by_user", ["userId"])
      .index("by_case", ["caseId"]),

    // Case-level audit trail (spec §36). Every state change is recorded with
    // actor + action + timestamp for full auditability.
    auditEvents: defineTable({
      userId: v.id("users"),
      caseId: v.id("evidenceCases"),
      actor: v.string(), // "system" | "seller" | "ai"
      action: v.string(), // case.created | evidence.collected | evidence.updated | verification.performed | ai.analysis.generated | ai.analysis.regenerated | narrative.edited | seller.approved | seller.rejected | package.generated | package.regenerated | status.changed | ...
      objectId: v.optional(v.string()),
      details: v.optional(v.any()),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_case", ["caseId"]),
    webhookEvents: defineTable({
      eventType: v.string(),
      outcome: v.string(), // processed | acknowledged | missing_signature | invalid_signature | no_secret | invalid_json
      receivedAt: v.number(),
    }).index("by_time", ["receivedAt"]),

    // ---------------------------------------------------------------------
    // PHASE 3A - Technical SEO scans (daily crawler, spec §19/§37–§39)
    // ---------------------------------------------------------------------
    seoIssues: defineTable({
      url: v.string(),
      issueType: v.string(),
      severity: v.string(),
      description: v.string(),
      status: v.string(),
      detectedAt: v.number(),
      issueKey: v.string(),
      metadata: v.optional(v.any()),
      resolvedAt: v.optional(v.number()),
    })
      .index("by_key", ["issueKey"])
      .index("by_url", ["url"]),

    seoChangeLogs: defineTable({
      changeType: v.string(),
      targetUrl: v.string(),
      oldValue: v.optional(v.string()),
      newValue: v.optional(v.string()),
      reason: v.string(),
      automatic: v.boolean(),
      actor: v.string(),
      createdAt: v.number(),
    }).index("by_time", ["createdAt"]),

    seoScans: defineTable({
      trigger: v.string(),
      status: v.string(),
      startedAt: v.number(),
      siteUrl: v.string(),
      finishedAt: v.optional(v.number()),
      urlCount: v.optional(v.number()),
      issueCount: v.optional(v.number()),
      healthScore: v.optional(v.number()),
      error: v.optional(v.string()),
    }).index("by_time", ["startedAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
