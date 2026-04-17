/**
 * Ledger Fractal — Types v0.1
 * Memoria inmutable del organismo. Fuente: Sección 7, Volumen III.
 *
 * Unifica eventos de todos los módulos:
 *   - FSM (ORD_CREATED, ORD_RUNNING, ORD_COMPLETED, …)
 *   - UACP (NODE_STARTED, NODE_COMPLETED, BRANCH_FROZEN, DEADLOCK, …)
 *   - OCO (OCO_TOKEN_ISSUED, OCO_VALIDATION_FAILED)
 *   - Gobernanza (HARD_POLICY_VIOLATION, CASE_FROZEN, CORE_FROZEN, …)
 *   - Agentes (AGENT_BLOCKED, AGENT_EXECUTION_RESULT, AGENT_ERROR)
 *   - SEE (SEE_RECOMMENDATION, WEIGHTS_ADJUSTED)
 */

// ─── Event types unificados ───────────────────────────────────────────────────

export type LedgerEventType =
  // FSM / Orders
  | "ORD_CREATED"
  | "ORD_STRUCTURALLY_VALID"
  | "ORD_CONSTITUTIONALLY_VALID"
  | "ORD_QUEUED"
  | "ORD_RUNNING"
  | "ORD_WAITING"
  | "ORD_COMPLETED"
  | "ORD_FAILED"
  | "ORD_CANCELLED"
  | "ORD_REVOKED"
  | "ORD_FROZEN"
  | "ORD_MUTATED"
  | "ORD_FINAL_STATE"
  // UACP
  | "CASE_STARTED"
  | "CASE_COMPLETED"
  | "CASE_FAILED"
  | "NODE_STARTED"
  | "NODE_COMPLETED"
  | "NODE_FAILED"
  | "BRANCH_FROZEN"
  | "DEADLOCK"
  | "HARD_POLICY_VIOLATION"
  // OCO
  | "OCO_TOKEN_ISSUED"
  | "OCO_VALIDATION_FAILED"
  // Governance
  | "CASE_FROZEN"
  | "CORE_FROZEN"
  | "GOVERNANCE_OVERRIDE_ATTEMPT"
  | "GOVERNANCE_OVERRIDE_REJECTED"
  // Agents
  | "AGENT_BLOCKED"
  | "AGENT_EXECUTION_RESULT"
  | "AGENT_ERROR"
  // SEE
  | "SEE_RECOMMENDATION"
  | "WEIGHTS_ADJUSTED"
  // Generic
  | string;

// ─── LedgerEntry — unidad atómica inmutable ───────────────────────────────────

export interface LedgerEntry {
  event_id:    string;           // UUID v4
  timestamp:   string;           // ISO 8601
  event_type:  LedgerEventType;
  case_id:     string;
  node_id?:    string;
  agent_id?:   string;
  trace_id?:   string;           // trace_id de OCO/FSM que origina el evento
  region?:     string;
  country?:    string;
  payload:     Record<string, unknown>;
  prev_hash:   string;           // "" si es el primer evento del caso
  hash:        string;           // SHA-256 de (entry fields + prev_hash)
}

// ─── Input para ingesta (sin hash ni event_id — los genera el Ledger) ─────────

export interface LedgerIngestInput {
  event_type: LedgerEventType;
  case_id:    string;
  node_id?:   string;
  agent_id?:  string;
  trace_id?:  string;
  region?:    string;
  country?:   string;
  payload:    Record<string, unknown>;
}

// ─── Resultado de ingestión ───────────────────────────────────────────────────

export interface IngestResult {
  event_id: string;
  hash:     string;
  seq:      number;           // posición dentro del caso
}

// ─── Consulta ─────────────────────────────────────────────────────────────────

export interface LedgerQuery {
  case_id?:    string;
  agent_id?:   string;
  event_type?: LedgerEventType;
  trace_id?:   string;
  from_ts?:    string;         // ISO timestamp
  to_ts?:      string;
  limit?:      number;
}

// ─── Resultado de verificación de integridad ──────────────────────────────────

export interface ChainVerificationResult {
  case_id:       string;
  valid:         boolean;
  events_checked: number;
  broken_at?:    string;       // event_id donde se rompe la cadena
  reason?:       string;
}
