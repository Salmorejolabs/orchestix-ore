/**
 * Validation Pipeline — Capas 1–4 (Purificación)
 *
 * Capa 1 — Sintaxis:  JSON válido, campos conocidos, profundidad ≤16
 * Capa 2 — Tipos:     tipos primitivos y rangos (sin coerción implícita)
 * Capa 3 — Presencia: campos obligatorios y no nulos
 * Capa 4 — Ledger:    referencias activas (CASE, agente)
 *
 * Regla SV-CASCADE-01: orden fijo, fail-fast por capa.
 * Coste computacional ascendente: CPU → CPU → CPU → I/O.
 * Fuente: Secciones 5.3.2–5.3.5, OCO v1.0 ORCHESTIXX.
 */

import type { LayerResult, StructuralError } from "./types";
import { SV_ERR, ALLOWED_FIELDS, REQUIRED_FIELDS } from "./types";

// ─── Helper: construir error ──────────────────────────────────────────────────

function err(layer: number, code: string, message: string, field?: string, value?: unknown): LayerResult {
  return { ok: false, layer, error: { code, layer, field, message, value } };
}
function ok(layer: number): LayerResult { return { ok: true, layer }; }

// ─── Regexes de formato (Capa 1 & 2) ─────────────────────────────────────────

const TRACE_ID_RE   = /^ROOT\.SO\.ORD\.\d{8}T\d{6}Z\.[A-Za-z0-9]+$/;
const CASE_ID_RE    = /^CASE-\d+(\.\d+)*$/;
const SIG_PREFIX_RE = /^(ed25519:|ecdsa:)/;
const HASH_RE       = /^sha256:[a-f0-9]{64}$/;

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 1 — Sintaxis (Schema & Format)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valida que el documento es un objeto JSON canónico con estructura permitida.
 * No verifica tipos de valores ni campos obligatorios — solo estructura.
 * Es la barrera más barata y debe ejecutarse primero (SV-CASCADE-01).
 */
export function validateSyntax(raw: unknown): LayerResult {
  const L = 1;

  // Debe ser un objeto (no array, string, número, null)
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return err(L, SV_ERR.SYNTAX_ROOT_TYPE, "Root must be a JSON object", undefined, typeof raw);
  }

  const obj = raw as Record<string, unknown>;

  // Campos desconocidos (Schema Hard-Lock)
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return err(L, SV_ERR.SYNTAX_UNKNOWN_FIELD, `Unknown field '${key}'`, key);
    }
  }

  // Profundidad máxima ≤16
  const depth = measureDepth(raw, 0);
  if (depth > 16) {
    return err(L, SV_ERR.SYNTAX_DEPTH, `Object depth ${depth} exceeds max 16`);
  }

  return ok(L);
}

function measureDepth(val: unknown, current: number): number {
  if (current > 16) return current;
  if (val === null || typeof val !== "object") return current;
  if (Array.isArray(val)) {
    return Math.max(current, ...val.map(v => measureDepth(v, current + 1)));
  }
  const obj = val as Record<string, unknown>;
  const children = Object.values(obj).map(v => measureDepth(v, current + 1));
  return children.length === 0 ? current : Math.max(...children);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 2 — Tipos (Type & Domain)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica tipos primitivos y rangos de dominio.
 * Sin coerción implícita: "7" como string cuando se espera number → DENY.
 */
export function validateTypes(raw: Record<string, unknown>): LayerResult {
  const L = 2;

  // trace_id: string con formato canónico
  if (raw.trace_id !== undefined) {
    if (typeof raw.trace_id !== "string") {
      return err(L, SV_ERR.TYPE_MISMATCH, "trace_id must be string", "trace_id", raw.trace_id);
    }
    if (!TRACE_ID_RE.test(raw.trace_id as string)) {
      return err(L, SV_ERR.TYPE_FORMAT, "trace_id format invalid (ROOT.SO.ORD.YYYYMMDDTHHMMSSZ.NONCE)", "trace_id", raw.trace_id);
    }
  }

  // trace_parent: string | null
  if (raw.trace_parent !== undefined && raw.trace_parent !== null) {
    if (typeof raw.trace_parent !== "string") {
      return err(L, SV_ERR.TYPE_MISMATCH, "trace_parent must be string or null", "trace_parent", raw.trace_parent);
    }
    if (!TRACE_ID_RE.test(raw.trace_parent as string)) {
      return err(L, SV_ERR.TYPE_FORMAT, "trace_parent format invalid", "trace_parent", raw.trace_parent);
    }
  }

  // case_id: string fractal
  if (raw.case_id !== undefined) {
    if (typeof raw.case_id !== "string" || !CASE_ID_RE.test(raw.case_id as string)) {
      return err(L, SV_ERR.TYPE_FORMAT, "case_id must match CASE-N.N format", "case_id", raw.case_id);
    }
  }

  // priority: integer 1–10
  if (raw.priority !== undefined) {
    if (!Number.isInteger(raw.priority) || (raw.priority as number) < 1 || (raw.priority as number) > 10) {
      return err(L, SV_ERR.TYPE_RANGE, "priority must be integer 1–10", "priority", raw.priority);
    }
  }

  // type: enum
  const VALID_TYPES = ["OA", "OMA", "OW", "OT", "OC"];
  if (raw.type !== undefined && !VALID_TYPES.includes(raw.type as string)) {
    return err(L, SV_ERR.TYPE_MISMATCH, `type must be one of ${VALID_TYPES.join(",")}`, "type", raw.type);
  }

  // governance: objeto con campos numéricos
  if (raw.governance !== undefined) {
    const gov = raw.governance as Record<string, unknown>;
    if (typeof gov !== "object" || Array.isArray(gov)) {
      return err(L, SV_ERR.TYPE_MISMATCH, "governance must be an object", "governance");
    }
    if (gov.P1_cost_max !== undefined && (typeof gov.P1_cost_max !== "number" || (gov.P1_cost_max as number) < 0)) {
      return err(L, SV_ERR.TYPE_RANGE, "governance.P1_cost_max must be non-negative number", "governance.P1_cost_max", gov.P1_cost_max);
    }
    if (gov.P2_timeout_ms !== undefined && (!Number.isInteger(gov.P2_timeout_ms) || (gov.P2_timeout_ms as number) <= 0)) {
      return err(L, SV_ERR.TYPE_RANGE, "governance.P2_timeout_ms must be positive integer", "governance.P2_timeout_ms", gov.P2_timeout_ms);
    }
    if (gov.P3_ethics !== undefined && !["hard", "soft"].includes(gov.P3_ethics as string)) {
      return err(L, SV_ERR.TYPE_MISMATCH, "governance.P3_ethics must be 'hard' or 'soft'", "governance.P3_ethics", gov.P3_ethics);
    }
    if (gov.P4_risk_max !== undefined && (!Number.isInteger(gov.P4_risk_max) || (gov.P4_risk_max as number) < 1 || (gov.P4_risk_max as number) > 10)) {
      return err(L, SV_ERR.TYPE_RANGE, "governance.P4_risk_max must be integer 1–10", "governance.P4_risk_max", gov.P4_risk_max);
    }
  }

  // signature: prefijo ed25519: o ecdsa:
  if (raw.signature !== undefined) {
    if (typeof raw.signature !== "string" || !SIG_PREFIX_RE.test(raw.signature as string)) {
      return err(L, SV_ERR.TYPE_FORMAT, "signature must start with 'ed25519:' or 'ecdsa:'", "signature");
    }
  }

  // hash: sha256:<64hex>
  if (raw.hash !== undefined) {
    if (typeof raw.hash !== "string" || !HASH_RE.test(raw.hash as string)) {
      return err(L, SV_ERR.TYPE_FORMAT, "hash must be sha256:<64 hex chars>", "hash", raw.hash);
    }
  }

  return ok(L);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 3 — Presencia (Required Fields)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica que todos los campos obligatorios existen y no son nulos.
 * Coste: O(n) donde n = número de campos requeridos. Muy barato.
 */
export function validatePresence(raw: Record<string, unknown>): LayerResult {
  const L = 3;

  for (const field of REQUIRED_FIELDS) {
    if (raw[field] === undefined || raw[field] === null) {
      return err(L, SV_ERR.FIELD_MISSING, `Required field '${field}' is missing or null`, field);
    }
  }

  // payload.action obligatorio
  const payload = raw.payload as Record<string, unknown> | undefined;
  if (!payload || !payload.action || typeof payload.action !== "string") {
    return err(L, SV_ERR.FIELD_MISSING, "payload.action is required and must be a non-empty string", "payload.action");
  }

  // governance sub-fields obligatorios
  const gov = raw.governance as Record<string, unknown> | undefined;
  if (!gov) return err(L, SV_ERR.FIELD_MISSING, "governance is required", "governance");

  const govRequired = ["P1_cost_max", "P2_timeout_ms", "P3_ethics", "P4_risk_max"];
  for (const gf of govRequired) {
    if (gov[gf] === undefined || gov[gf] === null) {
      return err(L, SV_ERR.FIELD_MISSING, `governance.${gf} is required`, `governance.${gf}`);
    }
  }

  return ok(L);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 4 — Contexto Ledger (Ledger Context Validation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica que las referencias (case_id, agente) existen y están activas.
 * Es la capa más costosa (I/O) — se ejecuta SOLO si las capas 1-3 pasan.
 * En v0.1: validación en memoria con estado inyectado.
 * En v1.0: consulta real al Ledger / CASE Registry.
 */
export interface LedgerContext {
  activeCases:    Set<string>;      // case_ids activos
  frozenCases:    Set<string>;      // case_ids congelados
  blockedAgents:  Set<string>;      // agent_ids bloqueados
}

export function validateLedgerContext(
  raw:     Record<string, unknown>,
  ledger:  LedgerContext,
): LayerResult {
  const L = 4;

  const case_id = raw.case_id as string;
  const source  = raw.source  as string;

  // CASE debe existir y estar activo
  if (ledger.frozenCases.has(case_id)) {
    return err(L, SV_ERR.LEDGER_CASE_FROZEN, `CASE '${case_id}' is frozen`, "case_id", case_id);
  }

  // Si tenemos un set de casos activos y el case_id no está, rechazamos
  if (ledger.activeCases.size > 0 && !ledger.activeCases.has(case_id)) {
    return err(L, SV_ERR.LEDGER_CASE_NOT_FOUND, `CASE '${case_id}' not found`, "case_id", case_id);
  }

  // Agente (source) no debe estar bloqueado
  if (ledger.blockedAgents.has(source)) {
    return err(L, SV_ERR.LEDGER_AGENT_BLOCKED, `Agent '${source}' is blocked`, "source", source);
  }

  return ok(L);
}
