/**
 * OCO Types v0.1 — Orchestration Cognitive Outpost
 * Contratos de frontera entre ACI (mente) y UACP (cuerpo).
 * Fuente: Sección 3, Volumen II — Especificación Técnica Ejecutable.
 */

// ─── ApprovedOrder (producida por ACI) ───────────────────────────────────────

export interface ApprovedOrderPlan {
  blueprint_ref: string;
  estimated_cost: number;
  estimated_duration_days: number;
  risk_score: number;
  assumptions?: string[];
  alternatives?: Array<{
    name: string;
    delta_cost: number;
    delta_time: number;
    delta_risk: number;
  }>;
}

export interface ApprovedOrderGovernanceContext {
  root_policies: string[];
  violations: string[];           // vacío si todo OK
  notes?: string;
}

export interface ApprovedOrder {
  intent_id: string;              // formato: INT-YYYYMMDD-NNN
  case_id: string;                // formato: CASE-N
  intent?: unknown;               // Intent completo (referencia a esquema ACI)
  plan: ApprovedOrderPlan;
  governance_context: ApprovedOrderGovernanceContext;
  created_at?: string;
  created_by?: "ACI";
}

// ─── OcoOrder (interno OCO) ──────────────────────────────────────────────────

export interface OcoOrder {
  id: string;                     // UUID interno OCO
  intent_id: string;
  case_id: string;
  blueprint_ref: string;
  tasks: string[];                // orden topológico de reasoning L3
  evidence: {
    constitutional: unknown[];
    reasoning: string;
  };
  metrics: {
    estimated_cost: number;
    estimated_duration_days: number;
    risk_score: number;
  };
  governance: {
    root_policies: string[];
    hard_policies: string[];
    soft_policies: string[];
  };
  timestamp: string;              // ISO 8601
}

// ─── GovernanceFingerprint ───────────────────────────────────────────────────

export interface GovernanceFingerprint {
  root_policies: string[];
  hard_policies: string[];
  soft_policies: string[];
  risk_score: number;
}

// ─── IntentionToken (contrato oficial OCO → UACP) ────────────────────────────

export interface IntentionTokenMetadata {
  trace_id: string;
  environment: "dev" | "staging" | "prod";
  priority: number;               // 0–10
}

export interface IntentionToken {
  token_id: string;               // formato: TOK-YYYYMMDD-NNNNNN
  case_id: string;
  intent_id: string;
  approved_order_hash: string;    // formato: sha256:<64 hex chars>
  governance_fingerprint: GovernanceFingerprint;
  issued_at: string;              // ISO 8601
  issued_by: "OCO";
  previous_token_hash: string | null;
  signature: string;              // Ed25519 base64 (stub en v0.1)
  metadata: IntentionTokenMetadata;
}

// ─── ExecutionEnvelope (entregado a UACP) ────────────────────────────────────

export interface ExecutionEnvelope {
  token: IntentionToken;
  approved_order: ApprovedOrder;
  received_at: string;
  source: "OCO_QUEUE";
}

// ─── OcoResult (respuesta de process_approved_order) ─────────────────────────

export type OcoStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface OcoResult {
  ok: true;
  token: IntentionToken;
  envelope: ExecutionEnvelope;
}

export interface OcoError {
  ok: false;
  code: string;                   // OCO_001 … OCO_008
  message: string;
}

export type OcoResponse = OcoResult | OcoError;
