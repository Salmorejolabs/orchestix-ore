/**
 * OCO Validators v0.1
 * Validaciones deterministas no negociables antes de emitir un token.
 * v0.1: implementa OCO_001–OCO_005. OCO_006 (hash) está en el orchestrator.
 * OCO_007 (hash chain) y OCO_008 (firma Ed25519) son stubs en esta versión.
 *
 * Referencia: Sección 3.3, Volumen II.
 */

import type { ApprovedOrder } from "./types";

export class OcoValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "OcoValidationError";
  }
}

// ─── OCO_001: Validación estructural ─────────────────────────────────────────

export function validateStructure(order: ApprovedOrder): void {
  const required = ["intent_id", "case_id", "plan", "governance_context"] as const;

  for (const field of required) {
    if (order[field] === undefined || order[field] === null) {
      throw new OcoValidationError(
        "OCO_001",
        `ApprovedOrder missing required field: '${field}'`
      );
    }
  }

  if (typeof order.intent_id !== "string" || order.intent_id.trim() === "") {
    throw new OcoValidationError("OCO_001", "intent_id must be a non-empty string");
  }

  if (typeof order.case_id !== "string" || order.case_id.trim() === "") {
    throw new OcoValidationError("OCO_001", "case_id must be a non-empty string");
  }
}

// ─── OCO_002: Consistencia de IDs ────────────────────────────────────────────

const INTENT_ID_PATTERN = /^INT-\d{8}-\d{3}$/;
const CASE_ID_PATTERN   = /^CASE-\d+(\.\d+)*$/;

export function validateIds(order: ApprovedOrder): void {
  if (!INTENT_ID_PATTERN.test(order.intent_id)) {
    throw new OcoValidationError(
      "OCO_002",
      `intent_id format invalid: '${order.intent_id}' (expected INT-YYYYMMDD-NNN)`
    );
  }

  if (!CASE_ID_PATTERN.test(order.case_id)) {
    throw new OcoValidationError(
      "OCO_002",
      `case_id format invalid: '${order.case_id}' (expected CASE-N or CASE-N.N)`
    );
  }
}

// ─── OCO_003: Sin violaciones de gobernanza ───────────────────────────────────

export function validateGovernance(order: ApprovedOrder): void {
  const violations = order.governance_context?.violations ?? [];

  if (!Array.isArray(violations)) {
    throw new OcoValidationError(
      "OCO_003",
      "governance_context.violations must be an array"
    );
  }

  if (violations.length > 0) {
    throw new OcoValidationError(
      "OCO_003",
      `ApprovedOrder has governance violations: [${violations.join(", ")}]`
    );
  }
}

// ─── OCO_004: Políticas HARD presentes ───────────────────────────────────────

const HARD_POLICIES = ["P2", "P3", "P6", "P7"] as const;

export function validateHardPolicies(order: ApprovedOrder): void {
  const rootPolicies = order.governance_context?.root_policies ?? [];

  for (const policy of HARD_POLICIES) {
    if (!rootPolicies.includes(policy)) {
      throw new OcoValidationError(
        "OCO_004",
        `HARD policy '${policy}' missing from governance_context.root_policies`
      );
    }
  }
}

// ─── OCO_005: Métricas válidas ────────────────────────────────────────────────

export function validateMetrics(order: ApprovedOrder): void {
  const { estimated_cost, estimated_duration_days, risk_score } = order.plan ?? {};

  if (typeof estimated_cost !== "number" || estimated_cost < 0) {
    throw new OcoValidationError(
      "OCO_005",
      `plan.estimated_cost must be a number >= 0 (got ${estimated_cost})`
    );
  }

  if (typeof estimated_duration_days !== "number" || estimated_duration_days < 0) {
    throw new OcoValidationError(
      "OCO_005",
      `plan.estimated_duration_days must be a number >= 0 (got ${estimated_duration_days})`
    );
  }

  if (typeof risk_score !== "number" || risk_score < 0 || risk_score > 1) {
    throw new OcoValidationError(
      "OCO_005",
      `plan.risk_score must be a number in [0, 1] (got ${risk_score})`
    );
  }
}

// ─── Ejecutar todas las validaciones en orden ─────────────────────────────────

export function runAllValidations(order: ApprovedOrder): void {
  validateStructure(order);
  validateIds(order);
  validateGovernance(order);
  validateHardPolicies(order);
  validateMetrics(order);
  // OCO_006: hash calculado por el orchestrator
  // OCO_007: hash chain stub en v0.1
  // OCO_008: firma Ed25519 stub en v0.1
}
