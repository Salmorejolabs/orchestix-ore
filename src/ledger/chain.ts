/**
 * Ledger Hash Chain v0.1
 * SHA-256 determinista sobre campos canónicos del evento.
 * Cada evento incluye prev_hash → cadena inmutable por case_id.
 * Fuente: Sección 7.4, Volumen III.
 */

import { createHash } from "crypto";
import { randomUUID } from "crypto";
import type { LedgerEntry, LedgerIngestInput, ChainVerificationResult } from "./types";

// ─── Función de hash canónico ─────────────────────────────────────────────────
// Orden de claves determinista (sort_keys = true en la spec Python).
// Excluye event_id y hash del propio cálculo.

export function computeEntryHash(
  entry: Omit<LedgerEntry, "hash" | "event_id">,
): string {
  const base = {
    timestamp:  entry.timestamp,
    event_type: entry.event_type,
    case_id:    entry.case_id,
    node_id:    entry.node_id ?? null,
    agent_id:   entry.agent_id ?? null,
    trace_id:   entry.trace_id ?? null,
    region:     entry.region  ?? null,
    country:    entry.country ?? null,
    payload:    entry.payload,
    prev_hash:  entry.prev_hash,
  };

  // JSON canónico: claves ordenadas, sin espacios extra
  const canonical = JSON.stringify(base, Object.keys(base).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ─── Constructor de entrada completa ─────────────────────────────────────────

export function buildEntry(
  input:     LedgerIngestInput,
  prev_hash: string,
  seq:       number,
): LedgerEntry {
  const timestamp = new Date().toISOString();
  const event_id  = randomUUID();

  const partial: Omit<LedgerEntry, "hash" | "event_id"> = {
    timestamp,
    event_type: input.event_type,
    case_id:    input.case_id,
    node_id:    input.node_id,
    agent_id:   input.agent_id,
    trace_id:   input.trace_id,
    region:     input.region,
    country:    input.country,
    payload:    input.payload,
    prev_hash,
  };

  const hash = computeEntryHash(partial);

  return { ...partial, event_id, hash };
}

// ─── Verificador de integridad de cadena ──────────────────────────────────────

export function verifyChain(
  entries:  LedgerEntry[],
  case_id:  string,
): ChainVerificationResult {
  if (entries.length === 0) {
    return { case_id, valid: true, events_checked: 0 };
  }

  let prev_hash = "";

  for (const entry of entries) {
    const { hash, event_id, ...rest } = entry;
    const expected = computeEntryHash({ ...rest, prev_hash });

    if (expected !== hash) {
      return {
        case_id,
        valid:          false,
        events_checked: entries.indexOf(entry),
        broken_at:      event_id,
        reason:         `hash mismatch at event ${event_id}: expected ${expected}, got ${hash}`,
      };
    }

    // El prev_hash para el siguiente eslabón es el hash de este entry
    prev_hash = hash;
  }

  return { case_id, valid: true, events_checked: entries.length };
}
