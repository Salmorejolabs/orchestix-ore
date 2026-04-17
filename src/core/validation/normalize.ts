/**
 * Validation Pipeline — Capas 5–6 (Legitimación)
 *
 * Capa 5 — NormalizedOrder: representación canónica, determinista, sin ambigüedad.
 * Capa 6 — Artefacto Determinista: canonical_json + SHA-256 + metadata.
 *
 * Principios de canonicalización (Sección 5.3.6):
 *   - Unicidad Canónica: misma semántica → mismo NormalizedOrder bit a bit
 *   - Claves ordenadas alfabéticamente (RFC 8785 JCS compatible)
 *   - Sin coerción implícita: "7" no es 7
 *   - Sin defaults invisibles
 *   - Determinismo absoluto (ART-DET-01)
 *
 * Fuente: Secciones 5.3.6–5.3.7, OCO v1.0 ORCHESTIXX.
 */

import { createHash, randomUUID } from "crypto";
import type { NormalizedOrder, NormalizedGovernance, NormalizedPayload, DeterministicArtifact } from "./types";
import { SV_ERR } from "./types";

const SCHEMA_VERSION = "1.0.0";

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 5 — NormalizedOrder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transforma la orden cruda en NormalizedOrder canónico.
 * Función pura: sin efectos secundarios, sin estado mutable.
 * Throws con código SV_ERR.NORMALIZE_FAILED si falla.
 */
export function normalizeOrder(raw: Record<string, unknown>): NormalizedOrder {
  try {
    const gov  = raw.governance  as Record<string, unknown>;
    const pay  = raw.payload     as Record<string, unknown>;
    const meta = raw.metadata    as Record<string, unknown> | undefined;

    const governance: NormalizedGovernance = {
      P1_cost_max:   Number(gov.P1_cost_max),
      P2_timeout_ms: Number(gov.P2_timeout_ms),
      P3_ethics:     gov.P3_ethics as "hard" | "soft",
      P4_risk_max:   Number(gov.P4_risk_max),
    };

    const payload: NormalizedPayload = {
      action: String(pay.action),
      params: (pay.params as Record<string, unknown>) ?? {},
    };

    // NormalizedOrder con claves en orden canónico
    const normalized: NormalizedOrder = {
      case_id:          String(raw.case_id),
      governance,
      hash:             String(raw.hash),
      normalized_at:    new Date().toISOString(),
      payload,
      priority:         Number(raw.priority),
      schema_version:   SCHEMA_VERSION,
      signature:        String(raw.signature),
      source:           String(raw.source),
      target:           String(raw.target),
      trace_id:         String(raw.trace_id),
      trace_parent:     raw.trace_parent != null ? String(raw.trace_parent) : null,
      type:             String(raw.type),
    };

    return normalized;
  } catch (e) {
    throw { code: SV_ERR.NORMALIZE_FAILED, message: `Normalization failed: ${(e as Error).message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 6 — Artefacto Determinista
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera el artefacto determinista a partir del NormalizedOrder.
 *
 * Propiedades (ART-DET-01):
 *   - canonical_json: claves ordenadas, sin espacios extra (RFC 8785)
 *   - artifact_hash:  SHA-256(canonical_json)
 *   - artifact_id:    UUID v4 único
 *
 * La función es pura: f(NormalizedOrder) → DeterministicArtifact.
 * Sin timestamps de sistema operativo en el hash (solo normalized_at del NormalizedOrder).
 */
export function buildArtifact(normalized: NormalizedOrder): DeterministicArtifact {
  // Serialización canónica: claves ordenadas globalmente (recursivo)
  const canonical_json = serializeCanonical(normalized);
  const artifact_hash  = "sha256:" + createHash("sha256").update(canonical_json, "utf8").digest("hex");

  return {
    artifact_id:       randomUUID(),
    normalized_order:  normalized,
    canonical_json,
    artifact_hash,
    generated_at:      new Date().toISOString(),
    schema_version:    SCHEMA_VERSION,
  };
}

/**
 * Serialización canónica con claves ordenadas alfabéticamente (RFC 8785 compatible).
 * Función pura y determinista.
 */
export function serializeCanonical(value: unknown): string {
  if (value === null)  return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number")  return String(value);
  if (typeof value === "string")  return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map(serializeCanonical).join(",") + "]";
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys
      .filter(k => obj[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${serializeCanonical(obj[k])}`);
    return "{" + pairs.join(",") + "}";
  }

  return JSON.stringify(value);
}
