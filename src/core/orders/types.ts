/**
 * Core Orders — Types v0.1
 * Modelo canónico ORD según SDS ORDERS 1.0, Sección 4.1.
 * FSM states según SDS ORD CORE 1.0, Sección 4.3.
 */

// ─── FSM States ───────────────────────────────────────────────────────────────

export type OrderState =
  | "CREATED"
  | "STRUCTURALLY_VALID"
  | "CONSTITUTIONALLY_VALID"
  | "QUEUED"
  | "RUNNING"
  | "WAITING"
  | "MUTATED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "REVOKED"
  | "FROZEN";

export const TERMINAL_ORDER_STATES = new Set<OrderState>([
  "COMPLETED", "FAILED", "CANCELLED", "REVOKED", "FROZEN",
]);

export const ACTIVE_ORDER_STATES = new Set<OrderState>([
  "QUEUED", "RUNNING", "WAITING",
]);

// ─── Order Type ───────────────────────────────────────────────────────────────

export type OrderType = "OA" | "OMA" | "OW" | "OT" | "OC";

// ─── Governance Policy ────────────────────────────────────────────────────────

export interface OrderGovernance {
  P1_cost_max:    number;    // coste máximo en micro€
  P2_timeout_ms:  number;    // timeout en ms
  P3_ethics:      "hard" | "soft";
  P4_risk_max:    number;    // 1–10
}

// ─── Constraints (opcionales) ─────────────────────────────────────────────────

export interface OrderConstraints {
  allowed_actions?:   string[];
  forbidden_actions?: string[];
  allowed_targets?:   string[];
  forbidden_targets?: string[];
  max_priority?:      number;
  max_depth?:         number;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export interface OrderMetadata {
  created_at:      string;        // ISO 8601
  version?:        string;
  decompose?:      boolean;
  requires_swarm?: boolean;
}

// ─── ORD — Objeto canónico ────────────────────────────────────────────────────

export interface OrdJson {
  trace_id:     string;           // ROOT.SO.ORD.YYYYMMDDTHHMMSSZ.NONCE
  trace_parent: string | null;    // null si es raíz
  case_id:      string;           // CASE-N.N.N
  type:         OrderType;
  priority:     number;           // 1–10
  source:       string;           // DID o PKI pointer
  target:       string;           // DID o PKI pointer
  payload: {
    action: string;
    params: Record<string, unknown>;
  };
  governance:   OrderGovernance;
  constraints?: OrderConstraints;
  metadata?:    OrderMetadata;
  signature:    string;           // ed25519:... o ecdsa:...
  hash:         string;           // sha256:... (RFC 8785 JCS)
}

// ─── Order (objeto en vuelo dentro del CORE) ─────────────────────────────────

export interface Order extends OrdJson {
  state:        OrderState;
  created_at:   string;
  updated_at:   string;
  worker_id?:   string;
  error_code?:  string;
  error_msg?:   string;
  result_hash?: string;
  cost_real?:   number;
  duration_ms?: number;
  actor?:       string;           // quien disparó la última transición
}

// ─── FSM Transition ───────────────────────────────────────────────────────────

export interface FsmTransition {
  from:    OrderState | OrderState[];
  to:      OrderState;
  trigger: string;
}

// ─── Validation Result ────────────────────────────────────────────────────────

export interface OrderValidationResult {
  ok:         boolean;
  error_code: string;
  message:    string;
}
