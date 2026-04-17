/**
 * Validation Pipeline v0.1 — Orquestador de 12 Capas
 *
 * Tres fases:
 *   Purificación  (Capas 1–5):  Sintaxis → Tipos → Presencia → Ledger → NormalizedOrder
 *   Legitimación  (Capas 6–8):  Artefacto → Firma(stub) → Registro Ledger
 *   Ejecución     (Capas 9–12): Políticas P1-P8 → Efectos(stub) → CASE(stub) → GCC
 *
 * Regla SV-CASCADE-01: orden fijo, fail-fast por capa.
 * Regla ART-DET-01:    artefacto = función pura de NormalizedOrder.
 * Fuente: Secciones 5.3.0–5.3.14, OCO v1.0 ORCHESTIXX.
 */

import type { PipelineResult, LedgerContext as LedgerCtxType } from "./types";
import { SV_ERR } from "./types";
import {
  validateSyntax,
  validateTypes,
  validatePresence,
  validateLedgerContext,
} from "./layers";
import { normalizeOrder, buildArtifact } from "./normalize";
import { PolicyEngine, ordToContext } from "../policy/engine";
import { LedgerFractal } from "../../ledger/ledger";

export type { LedgerCtxType as LedgerContext };

// ─── Opciones del pipeline ────────────────────────────────────────────────────

export interface PipelineOptions {
  ledgerContext?: LedgerCtxType;   // contexto de referencias activas
  ledger?:        LedgerFractal;   // para registrar eventos (capa 8)
  skipLedgerLayer?: boolean;       // saltar capa 4 (útil en tests)
  skipPolicyLayer?: boolean;       // saltar capas 9 (útil en tests de capas 1-6)
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

export function runPipeline(
  raw:  unknown,
  opts: PipelineOptions = {},
): PipelineResult {
  const start = Date.now();

  const {
    ledgerContext = { activeCases: new Set(), frozenCases: new Set(), blockedAgents: new Set() },
    ledger,
    skipLedgerLayer = false,
    skipPolicyLayer = false,
  } = opts;

  // ── FASE 1: PURIFICACIÓN (Capas 1–5) ────────────────────────────────────

  // Capa 1 — Sintaxis
  const r1 = validateSyntax(raw);
  if (!r1.ok) return reject(r1.error!, 1, start);

  const obj = raw as Record<string, unknown>;

  // Capa 2 — Tipos
  const r2 = validateTypes(obj);
  if (!r2.ok) return reject(r2.error!, 2, start);

  // Capa 3 — Presencia
  const r3 = validatePresence(obj);
  if (!r3.ok) return reject(r3.error!, 3, start);

  // Capa 4 — Contexto Ledger
  if (!skipLedgerLayer) {
    const r4 = validateLedgerContext(obj, ledgerContext);
    if (!r4.ok) return reject(r4.error!, 4, start);
  }

  // Capa 5 — NormalizedOrder
  let normalized;
  try {
    normalized = normalizeOrder(obj);
  } catch (e: unknown) {
    const fe = e as { code?: string; message?: string };
    return reject(
      { code: fe.code ?? SV_ERR.NORMALIZE_FAILED, layer: 5, message: fe.message ?? "Normalization failed" },
      5, start,
    );
  }

  // ── FASE 2: LEGITIMACIÓN (Capas 6–8) ────────────────────────────────────

  // Capa 6 — Artefacto Determinista
  const artifact = buildArtifact(normalized);

  // Capa 7 — Firma Constitucional (stub v0.1 — Ed25519 real en v1.0)
  // signature ya existe en el NormalizedOrder; en v1.0 se verifica con clave pública de ACI.

  // Capa 8 — Registro en el Ledger
  let ledger_event_id: string | undefined;
  if (ledger) {
    const result = ledger.ingest({
      event_type: "ORD_STRUCTURALLY_VALID",
      case_id:    normalized.case_id,
      trace_id:   normalized.trace_id,
      payload: {
        artifact_hash:  artifact.artifact_hash,
        artifact_id:    artifact.artifact_id,
        schema_version: artifact.schema_version,
      },
    });
    ledger_event_id = result.event_id;
  }

  // ── FASE 3: EJECUCIÓN (Capas 9–12) ──────────────────────────────────────

  // Capa 9/10 — Evaluación por Motor de Políticas P1–P8
  let policy_verdict: "ALLOW" | "DENY" | undefined;
  let policy_error:   string | undefined;

  if (!skipPolicyLayer) {
    const engine  = new PolicyEngine();
    const pCtx    = ordToContext({
      trace_id:         normalized.trace_id,
      trace_parent:     normalized.trace_parent,
      case_id:          normalized.case_id,
      cost_estimated:   0,   // en pre-ejecución el coste real es 0
      P1_budget:        normalized.governance.P1_cost_max,
      governance: {
        P1_cost_max:   normalized.governance.P1_cost_max,
        P2_timeout_ms: normalized.governance.P2_timeout_ms,
        P3_ethics:     normalized.governance.P3_ethics,
        P4_risk_max:   normalized.governance.P4_risk_max,
      },
      schema_valid:         true,
      agent_scope_valid:    !ledgerContext.blockedAgents.has(normalized.source),
      case_active:          !ledgerContext.frozenCases.has(normalized.case_id),
      precedence_ok:        true,
      mutation_authorized:  true,
      impact:               1.0,
    });

    const evalResult = engine.evaluate(pCtx);
    policy_verdict   = evalResult.verdict;
    policy_error     = evalResult.error_code;

    if (policy_verdict === "DENY") {
      return {
        verdict:         "REJECTED",
        layers_passed:   8,
        error: {
          code:    policy_error ?? "POL_ERR_UNKNOWN",
          layer:   10,
          message: `Policy evaluation DENY: ${policy_error}`,
        },
        normalized,
        artifact,
        policy_verdict,
        policy_error,
        ledger_event_id,
        duration_ms:  Date.now() - start,
        evaluated_at: new Date().toISOString(),
      };
    }
  }

  // Capas 11–12: Consolidación CASE + GCC (stub v0.1 — integración completa en v1.0)

  return {
    verdict:          "ACCEPTED",
    layers_passed:    skipPolicyLayer ? 6 : 12,
    normalized,
    artifact,
    policy_verdict:   policy_verdict ?? "ALLOW",
    ledger_event_id,
    duration_ms:      Date.now() - start,
    evaluated_at:     new Date().toISOString(),
  };
}

// ─── Helper privado ───────────────────────────────────────────────────────────

function reject(
  error:        { code: string; layer: number; message: string; field?: string; value?: unknown },
  layers_passed: number,
  start:         number,
): PipelineResult {
  return {
    verdict:       "REJECTED",
    layers_passed: layers_passed - 1,
    error: {
      code:    error.code,
      layer:   error.layer,
      field:   error.field,
      message: error.message,
      value:   error.value,
    },
    duration_ms:  Date.now() - start,
    evaluated_at: new Date().toISOString(),
  };
}
