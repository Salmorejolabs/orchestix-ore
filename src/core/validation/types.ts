/**
 * Validation Pipeline — Types v0.1
 * Contratos de las 12 capas del pipeline constitucional del OCO.
 * Fuente: Secciones 5.3.0–5.3.14, OCO v1.0 ORCHESTIXX.
 *
 * Fases:
 *   Purificación  (Capas 1–5):  Sintaxis → Tipos → Presencia → Ledger → NormalizedOrder
 *   Legitimación  (Capas 6–8):  Artefacto → Firma → Registro Ledger
 *   Ejecución     (Capas 9–12): Políticas → Efectos → CASE → Certificación GCC
 */

// ─── Códigos de error estructural ────────────────────────────────────────────

export const SV_ERR = {
  // Capa 1: Sintaxis
  SYNTAX_INVALID_JSON:    "ERR_STRUCTURE_SYNTAX_INVALID_JSON",
  SYNTAX_ROOT_TYPE:       "ERR_STRUCTURE_SYNTAX_ROOT_TYPE",
  SYNTAX_DUPLICATE_KEY:   "ERR_STRUCTURE_SYNTAX_DUPLICATE_KEY",
  SYNTAX_UNKNOWN_FIELD:   "ERR_STRUCTURE_SYNTAX_UNKNOWN_FIELD",
  SYNTAX_DEPTH:           "ERR_STRUCTURE_SYNTAX_DEPTH",
  // Capa 2: Tipos
  TYPE_MISMATCH:          "ERR_STRUCTURE_TYPE_MISMATCH",
  TYPE_RANGE:             "ERR_STRUCTURE_TYPE_RANGE",
  TYPE_FORMAT:            "ERR_STRUCTURE_TYPE_FORMAT",
  // Capa 3: Presencia
  FIELD_MISSING:          "ERR_STRUCTURE_FIELD_MISSING",
  FIELD_NULL:             "ERR_STRUCTURE_FIELD_NULL",
  // Capa 4: Contexto Ledger
  LEDGER_CASE_NOT_FOUND:  "ERR_STRUCTURE_LEDGER_CASE_NOT_FOUND",
  LEDGER_CASE_FROZEN:     "ERR_STRUCTURE_LEDGER_CASE_FROZEN",
  LEDGER_AGENT_BLOCKED:   "ERR_STRUCTURE_LEDGER_AGENT_BLOCKED",
  LEDGER_REF_INVALID:     "ERR_STRUCTURE_LEDGER_REF_INVALID",
  // Capa 5: Normalización
  NORMALIZE_FAILED:       "ERR_STRUCTURE_NORMALIZE_FAILED",
  // Capa 6: Artefacto
  ARTIFACT_FAILED:        "ERR_STRUCTURE_ARTIFACT_FAILED",
  // Generic
  PIPELINE_INTERNAL:      "ERR_STRUCTURE_PIPELINE_INTERNAL",
} as const;

// ─── Error de capa estructural ────────────────────────────────────────────────

export interface StructuralError {
  code:    string;
  layer:   number;          // 1–12
  field?:  string;
  message: string;
  value?:  unknown;
}

// ─── Resultado de validación de una capa ─────────────────────────────────────

export interface LayerResult {
  ok:     boolean;
  layer:  number;
  error?: StructuralError;
}

// ─── Campos permitidos del esquema constitucional (Capa 1) ───────────────────

export const ALLOWED_FIELDS = new Set([
  "trace_id", "trace_parent", "case_id", "type", "priority",
  "source", "target", "payload", "governance", "constraints",
  "metadata", "signature", "hash",
]);

export const REQUIRED_FIELDS = [
  "trace_id", "case_id", "type", "priority",
  "source", "target", "payload", "governance", "signature", "hash",
] as const;

// ─── NormalizedOrder (Capa 5) — forma canónica y sin ambigüedad ───────────────

export interface NormalizedGovernance {
  P1_cost_max:   number;   // número, nunca string
  P2_timeout_ms: number;
  P3_ethics:     "hard" | "soft";
  P4_risk_max:   number;
}

export interface NormalizedPayload {
  action: string;
  params: Record<string, unknown>;
}

export interface NormalizedOrder {
  // Identificación
  trace_id:     string;
  trace_parent: string | null;
  case_id:      string;
  type:         string;
  priority:     number;           // entero 1–10
  source:       string;
  target:       string;
  // Contenido
  payload:      NormalizedPayload;
  governance:   NormalizedGovernance;
  // Seguridad
  signature:    string;
  hash:         string;
  // Metadatos de normalización
  normalized_at:    string;       // ISO 8601
  schema_version:   string;       // "1.0.0"
}

// ─── Artefacto Determinista (Capa 6) ─────────────────────────────────────────

export interface DeterministicArtifact {
  artifact_id:       string;      // UUID v4
  normalized_order:  NormalizedOrder;
  canonical_json:    string;      // JSON canónico con claves ordenadas
  artifact_hash:     string;      // SHA-256 del canonical_json
  generated_at:      string;      // ISO 8601
  schema_version:    string;
}

// ─── Resultado del pipeline completo ─────────────────────────────────────────

export type PipelineVerdict = "ACCEPTED" | "REJECTED";

export interface PipelineResult {
  verdict:         PipelineVerdict;
  layers_passed:   number;
  error?:          StructuralError;
  normalized?:     NormalizedOrder;
  artifact?:       DeterministicArtifact;
  policy_verdict?: "ALLOW" | "DENY";
  policy_error?:   string;
  ledger_event_id?: string;
  duration_ms:     number;
  evaluated_at:    string;
}
