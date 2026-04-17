/**
 * Policy Engine — Types v0.1
 * AST Constitucional, BoundContext, Decision ALLOW/DENY, códigos POL_ERR.
 * Fuente: Secciones 5.1.1–5.1.7, OCO v1.0 ORCHESTIXX.
 *
 * Invariantes aplicados:
 *   POL-INV-01: Determinismo absoluto (misma entrada → misma salida)
 *   POL-INV-02: Pureza funcional (sin efectos secundarios)
 *   POL-INV-04: Atomicidad de evaluación
 *   POL-INV-05: Fail-safe (ante error → DENY)
 */

// ─── AST Node Types ───────────────────────────────────────────────────────────

export type ComparisonOperator = "≤" | "≥" | "==" | "≠" | "<" | ">" | "lte" | "gte" | "eq" | "neq" | "lt" | "gt";
export type LogicalOperator    = "AND" | "OR" | "NOT";
export type AggregateOperator  = "SUM" | "AVG" | "COUNT" | "MIN" | "MAX";
export type ValueType          = "INT" | "FLOAT" | "STRING" | "BOOL";

// Nodo raíz
export interface PolicyNode {
  kind:       "POLICY";
  id:         string;             // P1..P12
  expression: AstNode;
}

// Nodo de comparación: left op right
export interface ComparisonNode {
  kind:  "COMPARISON";
  op:    ComparisonOperator;
  left:  OperandNode;
  right: OperandNode;
}

// Nodo lógico: AND, OR, NOT
export interface LogicalNode {
  kind:  "LOGICAL";
  op:    LogicalOperator;
  left:  AstNode;
  right?: AstNode;  // null para NOT
}

// Nodo de rango: value BETWEEN low AND high (inclusivo)
export interface RangeNode {
  kind:  "RANGE";
  value: OperandNode;
  low:   OperandNode;
  high:  OperandNode;
}

// Nodo constante: valor literal tipado
export interface ConstantNode {
  kind:  "CONSTANT";
  type:  ValueType;
  value: number | string | boolean;
}

// Nodo placeholder: {{order.priority}}, {{case.P1_remaining}}, etc.
export interface PlaceholderNode {
  kind:   "PLACEHOLDER";
  symbol: string;              // nombre del placeholder
  type:   ValueType;
}

// Nodo de agregación: SUM/AVG/COUNT sobre lista en contexto
export interface AggregateNode {
  kind:   "AGGREGATE";
  op:     AggregateOperator;
  symbol: string;              // símbolo de lista en el contexto
}

export type OperandNode = ConstantNode | PlaceholderNode | AggregateNode;
export type AstNode     = ComparisonNode | LogicalNode | RangeNode | OperandNode;

// ─── AST completo de una política ────────────────────────────────────────────

export interface ConstitutionalAST {
  policy_id:  string;           // "P1", "P2", …, "P12"
  version:    string;
  expression: AstNode;
  hash:       string;           // SHA-256 del AST serializado (integridad)
}

// ─── BoundContext — snapshot atómica ─────────────────────────────────────────
// Todos los valores se resuelven antes de la evaluación (TOCTOU protection).

export type ContextValue = number | string | boolean | number[];

export interface BoundContext {
  snapshot_id:  string;
  captured_at:  string;              // ISO timestamp
  bindings:     Record<string, ContextValue>;
}

// ─── Decision ─────────────────────────────────────────────────────────────────

export type Verdict = "ALLOW" | "DENY";

export interface PolicyDecision {
  verdict:         Verdict;
  policy_id:       string;
  error_code?:     string;
  violated_node?:  string;
  evidence?:       PolicyEvidence;
  evaluated_at:    string;
}

export interface PolicyEvidence {
  symbol:    string;
  expected:  ContextValue;
  actual:    ContextValue;
  operator?: string;
}

// ─── Pipeline result ──────────────────────────────────────────────────────────

export interface EvaluationResult {
  verdict:      Verdict;
  decisions:    PolicyDecision[];     // una por principio evaluado
  error_code?:  string;
  duration_ms:  number;
  evaluated_at: string;
}

// ─── Error codes POL_ERR ──────────────────────────────────────────────────────
// Sección 5.1.7 — códigos de falla del motor de políticas.

export const POL_ERR = {
  // Errores constitucionales por principio
  CONS_P1:  "POL_ERR_CONS_P1",   // Coste excedido
  CONS_P2:  "POL_ERR_CONS_P2",   // Timeout excedido
  CONS_P3:  "POL_ERR_CONS_P3",   // Violación ética
  CONS_P4:  "POL_ERR_CONS_P4",   // Riesgo excedido
  CONS_P5:  "POL_ERR_CONS_P5",   // Acción no permitida
  CONS_P6:  "POL_ERR_CONS_P6",   // Inconsistencia fractal
  CONS_P7:  "POL_ERR_CONS_P7",   // Conflicto con orden superior
  CONS_P8:  "POL_ERR_CONS_P8",   // Sin permisos RBAC
  CONS_P9:  "POL_ERR_CONS_P9",   // Violación P9
  CONS_P10: "POL_ERR_CONS_P10",
  CONS_P11: "POL_ERR_CONS_P11",
  CONS_P12: "POL_ERR_CONS_P12",

  // Errores de pipeline
  PIPELINE_LOAD:      "POL_ERR_PIPELINE_LOAD",
  PIPELINE_PARSE:     "POL_ERR_PIPELINE_PARSE",
  PIPELINE_BIND:      "POL_ERR_PIPELINE_BIND",
  PIPELINE_EVAL:      "POL_ERR_PIPELINE_EVAL",
  PIPELINE_INTEGRITY: "POL_ERR_PIPELINE_INTEGRITY",

  // Errores de contexto
  CONTEXT_MISSING:    "POL_ERR_CONTEXT_MISSING",
  CONTEXT_TYPE:       "POL_ERR_CONTEXT_TYPE",

  // Bypass detectado
  BYPASS:             "POL_ERR_BYPASS",

  // Fail-safe genérico
  FAIL_SAFE:          "POL_ERR_FAIL_SAFE",
} as const;

// ─── Policy class ─────────────────────────────────────────────────────────────

export interface Policy {
  id:          string;        // "P1".."P12"
  name:        string;
  description: string;
  hard:        boolean;       // política HARD = no se puede relajar
  ast:         ConstitutionalAST;
}
