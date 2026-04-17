/**
 * Order Structural Validators v0.1 — Anillo 1
 * V01–V08: validaciones stateless (sin Ledger, sin Registry externo).
 * Fuente: Sección 4.2.1, SDS ORD CORE 1.0.
 *
 * v0.1 stubs:
 *   - V06: hash check usando JSON.stringify con claves ordenadas (JCS completo en v1.0)
 *   - V08: ActionRegistry en memoria (persistente en v1.0)
 */

import { createHash } from "crypto";
import type { OrdJson, OrderValidationResult } from "./types";

// ─── ActionRegistry en memoria (stub v0.1) ────────────────────────────────────

const DEFAULT_ACTIONS = new Set([
  "analizar_documentos", "calcular", "fetch_data", "process_data",
  "publish_result", "summarize", "generate_actions", "ping",
  "analizar", "ejecutar", "consultar",
]);

export class ActionRegistry {
  private actions: Set<string>;
  constructor(actions?: string[]) {
    this.actions = actions ? new Set(actions) : new Set(DEFAULT_ACTIONS);
  }
  has(action: string): boolean { return this.actions.has(action); }
  register(action: string): void { this.actions.add(action); }
}

export const defaultActionRegistry = new ActionRegistry();

// ─── Regex patterns ───────────────────────────────────────────────────────────

const TRACE_ID_RE   = /^ROOT\.SO\.ORD\.\d{8}T\d{6}Z\.[A-Za-z0-9]+$/;
const CASE_ID_RE    = /^CASE-\d+(\.\d+)*$/;
const SIG_PREFIX_RE = /^(ed25519:|ecdsa:)/;

// ─── Canonical hash (RFC 8785 JCS — stub: sort keys) ─────────────────────────

function canonicalHash(order: OrdJson): string {
  // Excluir hash y signature del payload para calcular el hash
  const { hash: _h, signature: _s, ...body } = order;
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  return "sha256:" + createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ─── V01: Required Fields ─────────────────────────────────────────────────────

function v01RequiredFields(order: Partial<OrdJson>): OrderValidationResult {
  const required = [
    "trace_id", "case_id", "type", "priority",
    "source", "target", "payload", "governance", "signature", "hash",
  ];
  for (const f of required) {
    if ((order as Record<string, unknown>)[f] === undefined ||
        (order as Record<string, unknown>)[f] === null) {
      return { ok: false, error_code: "ERR_ORD_001", message: `Missing required field: '${f}'` };
    }
  }
  if (!order.payload?.action) {
    return { ok: false, error_code: "ERR_ORD_001", message: "Missing payload.action" };
  }
  if (order.governance?.P1_cost_max === undefined ||
      order.governance?.P2_timeout_ms === undefined ||
      order.governance?.P3_ethics === undefined ||
      order.governance?.P4_risk_max === undefined) {
    return { ok: false, error_code: "ERR_ORD_001", message: "Missing governance fields" };
  }
  return { ok: true, error_code: "", message: "" };
}

// ─── V02: Types & Ranges ──────────────────────────────────────────────────────

function v02TypesRanges(order: OrdJson): OrderValidationResult {
  if (!Number.isInteger(order.priority) || order.priority < 1 || order.priority > 10) {
    return { ok: false, error_code: "ERR_ORD_014", message: `priority must be integer 1–10 (got ${order.priority})` };
  }
  const risk = order.governance.P4_risk_max;
  if (!Number.isInteger(risk) || risk < 1 || risk > 10) {
    return { ok: false, error_code: "ERR_ORD_008", message: `P4_risk_max must be integer 1–10 (got ${risk})` };
  }
  if (typeof order.governance.P1_cost_max !== "number" || order.governance.P1_cost_max < 0) {
    return { ok: false, error_code: "ERR_ORD_008", message: "P1_cost_max must be a non-negative number" };
  }
  if (!Number.isInteger(order.governance.P2_timeout_ms) || order.governance.P2_timeout_ms <= 0) {
    return { ok: false, error_code: "ERR_ORD_008", message: "P2_timeout_ms must be a positive integer" };
  }
  if (!["hard", "soft"].includes(order.governance.P3_ethics)) {
    return { ok: false, error_code: "ERR_ORD_008", message: `P3_ethics must be 'hard' or 'soft'` };
  }
  const validTypes = ["OA", "OMA", "OW", "OT", "OC"];
  if (!validTypes.includes(order.type)) {
    return { ok: false, error_code: "ERR_ORD_014", message: `type must be one of ${validTypes.join(", ")}` };
  }
  return { ok: true, error_code: "", message: "" };
}

// ─── V03: trace_id format ─────────────────────────────────────────────────────

function v03TraceIdFormat(order: OrdJson): OrderValidationResult {
  if (!TRACE_ID_RE.test(order.trace_id)) {
    return {
      ok: false, error_code: "ERR_ORD_015",
      message: `trace_id format invalid: '${order.trace_id}' (expected ROOT.SO.ORD.YYYYMMDDTHHMMSSZ.NONCE)`,
    };
  }
  return { ok: true, error_code: "", message: "" };
}

// ─── V04: case_id format ──────────────────────────────────────────────────────

function v04CaseIdFormat(order: OrdJson): OrderValidationResult {
  if (!CASE_ID_RE.test(order.case_id)) {
    return {
      ok: false, error_code: "ERR_ORD_016",
      message: `case_id format invalid: '${order.case_id}' (expected CASE-N or CASE-N.N)`,
    };
  }
  return { ok: true, error_code: "", message: "" };
}

// ─── V05: trace_parent format (si existe) ─────────────────────────────────────

function v05TraceParentFormat(order: OrdJson): OrderValidationResult {
  if (order.trace_parent && !TRACE_ID_RE.test(order.trace_parent)) {
    return {
      ok: false, error_code: "ERR_ORD_015",
      message: `trace_parent format invalid: '${order.trace_parent}'`,
    };
  }
  return { ok: true, error_code: "", message: "" };
}

// ─── V06: Canonical hash (RFC 8785 JCS) ──────────────────────────────────────

function v06CanonicalHash(order: OrdJson): OrderValidationResult {
  const computed = canonicalHash(order);
  if (computed !== order.hash) {
    return {
      ok: false, error_code: "ERR_ORD_002",
      message: `hash mismatch (computed: ${computed}, declared: ${order.hash})`,
    };
  }
  return { ok: true, error_code: "", message: "" };
}

// ─── V07: Signature format ────────────────────────────────────────────────────

function v07SignatureFormat(order: OrdJson): OrderValidationResult {
  if (!SIG_PREFIX_RE.test(order.signature)) {
    return {
      ok: false, error_code: "ERR_ORD_003",
      message: `signature must start with 'ed25519:' or 'ecdsa:' (got '${order.signature.slice(0, 10)}...')`,
    };
  }
  return { ok: true, error_code: "", message: "" };
}

// ─── V08: ActionRegistry ──────────────────────────────────────────────────────

function v08ActionRegistry(order: OrdJson, registry: ActionRegistry): OrderValidationResult {
  const action = order.payload.action;
  if (!registry.has(action)) {
    return {
      ok: false, error_code: "ERR_ORD_006",
      message: `action '${action}' not found in ActionRegistry`,
    };
  }
  return { ok: true, error_code: "", message: "" };
}

// ─── Pipeline completo V01-V08 ────────────────────────────────────────────────

export function validateStructural(
  order: Partial<OrdJson>,
  registry: ActionRegistry = defaultActionRegistry
): OrderValidationResult {
  const checks = [
    () => v01RequiredFields(order),
    () => v02TypesRanges(order as OrdJson),
    () => v03TraceIdFormat(order as OrdJson),
    () => v04CaseIdFormat(order as OrdJson),
    () => v05TraceParentFormat(order as OrdJson),
    () => v06CanonicalHash(order as OrdJson),
    () => v07SignatureFormat(order as OrdJson),
    () => v08ActionRegistry(order as OrdJson, registry),
  ];

  for (const check of checks) {
    const result = check();
    if (!result.ok) return result;
  }

  return { ok: true, error_code: "", message: "All structural validations passed (V01–V08)" };
}

// ─── Helper: calcular hash para construir un ORD válido ──────────────────────

export function computeOrdHash(order: Omit<OrdJson, "hash" | "signature">): string {
  return canonicalHash({ ...order, hash: "", signature: "" } as OrdJson);
}
