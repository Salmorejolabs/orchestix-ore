/**
 * OCO Token Builder v0.1
 * Genera IntentionToken y ExecutionEnvelope a partir de una ApprovedOrder validada.
 *
 * v0.1 stubs:
 *  - approved_order_hash: SHA-256 real del JSON serializado
 *  - signature: "stub-v0.1" (Ed25519 en v1.0)
 *  - previous_token_hash: null (hash chain en v1.0)
 *  - token_id counter: en memoria (persistente en v1.0)
 *
 * Referencia: Secciones 3.4, 3.5, Volumen II.
 */

import { createHash } from "crypto";
import type {
  ApprovedOrder,
  IntentionToken,
  IntentionTokenMetadata,
  GovernanceFingerprint,
  ExecutionEnvelope,
} from "./types";

// ─── Contador de token_id (en memoria para v0.1) ──────────────────────────────

let _tokenCounter = 0;

function nextTokenId(): string {
  _tokenCounter++;
  const date  = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const seq   = String(_tokenCounter).padStart(6, "0");
  return `TOK-${date}-${seq}`;
}

// ─── Trace ID (Sección 3.5) ───────────────────────────────────────────────────

export function generateTraceId(caseId: string): string {
  const timestamp   = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 15) + "Z";
  const safeCaseId  = caseId.replace(/-/g, "_").toLowerCase();
  return `trace_${safeCaseId}_${timestamp}`;
}

// ─── Hash SHA-256 de ApprovedOrder (OCO_006) ──────────────────────────────────

export function hashApprovedOrder(order: ApprovedOrder): string {
  // Serialización determinista: claves ordenadas
  const canonical = JSON.stringify(order, Object.keys(order).sort());
  const hash      = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hash}`;
}

// ─── Governance Fingerprint ───────────────────────────────────────────────────

const HARD_POLICIES = new Set(["P2", "P3", "P6", "P7"]);

export function buildGovernanceFingerprint(order: ApprovedOrder): GovernanceFingerprint {
  const rootPolicies = order.governance_context?.root_policies ?? [];

  return {
    root_policies: [...rootPolicies],
    hard_policies: rootPolicies.filter(p => HARD_POLICIES.has(p)),
    soft_policies: rootPolicies.filter(p => !HARD_POLICIES.has(p)),
    risk_score:    order.plan.risk_score,
  };
}

// ─── IntentionToken Builder ───────────────────────────────────────────────────

export interface BuildTokenOptions {
  environment?: "dev" | "staging" | "prod";
  priority?:    number;
}

export function buildIntentionToken(
  order:         ApprovedOrder,
  approvedHash:  string,
  traceId:       string,
  opts:          BuildTokenOptions = {}
): IntentionToken {
  const metadata: IntentionTokenMetadata = {
    trace_id:    traceId,
    environment: opts.environment ?? "dev",
    priority:    opts.priority    ?? 5,
  };

  return {
    token_id:              nextTokenId(),
    case_id:               order.case_id,
    intent_id:             order.intent_id,
    approved_order_hash:   approvedHash,
    governance_fingerprint: buildGovernanceFingerprint(order),
    issued_at:             new Date().toISOString(),
    issued_by:             "OCO",
    previous_token_hash:   null,      // hash chain en v1.0
    signature:             "stub-v0.1",  // Ed25519 en v1.0
    metadata,
  };
}

// ─── ExecutionEnvelope Builder ────────────────────────────────────────────────

export function buildExecutionEnvelope(
  token:         IntentionToken,
  approvedOrder: ApprovedOrder
): ExecutionEnvelope {
  return {
    token,
    approved_order: approvedOrder,
    received_at:    new Date().toISOString(),
    source:         "OCO_QUEUE",
  };
}
