/**
 * Ledger Fractal v0.1 — Memoria del Organismo
 *
 * Clase principal que unifica ingestión desde todos los módulos:
 *   - fromFsmEvent()   — consume FsmEvent del ciclo de vida de órdenes
 *   - fromUacpEvent()  — consume LedgerEvent de la ejecución fractal UACP
 *   - fromOcoToken()   — registra emisión de IntentionToken
 *   - ingest()         — ingestión directa genérica
 *
 * Expone:
 *   - queryByCase(), queryByAgent(), query() — consultas con índices
 *   - verifyCase()                           — verificación de integridad SHA-256
 *   - stats()                                — estadísticas del store
 *
 * Fuente: Secciones 7.1–7.11, Volumen III.
 */

import type { LedgerIngestInput, LedgerQuery, LedgerEntry, IngestResult, ChainVerificationResult } from "./types";
import type { FsmEvent } from "../core/orders/fsm";
import type { LedgerEvent as UacpEvent } from "../uacp/types";
import type { IntentionToken } from "../oco/types";
import { LedgerStore } from "./store";

export class LedgerFractal {
  constructor(private readonly store: LedgerStore = new LedgerStore()) {}

  // ─── Ingestión directa ────────────────────────────────────────────────────

  ingest(input: LedgerIngestInput): IngestResult {
    return this.store.ingest(input);
  }

  // ─── Adaptador FSM → Ledger ───────────────────────────────────────────────
  // Consume los FsmEvent que emite OrderFsm en cada transición.

  fromFsmEvent(fsmEvent: FsmEvent): IngestResult {
    return this.store.ingest({
      event_type: fsmEvent.event as LedgerIngestInput["event_type"],
      case_id:    fsmEvent.case_id,
      trace_id:   fsmEvent.trace_id,
      agent_id:   fsmEvent.actor,
      payload: {
        from:      fsmEvent.from,
        to:        fsmEvent.to,
        actor:     fsmEvent.actor,
        timestamp: fsmEvent.timestamp,
        ...fsmEvent.payload,
      },
    });
  }

  /** Ingesta batch de eventos FSM (resultado de OrderFsm.getEvents()) */
  fromFsmEvents(events: FsmEvent[]): IngestResult[] {
    return events.map(e => this.fromFsmEvent(e));
  }

  // ─── Adaptador UACP → Ledger ──────────────────────────────────────────────
  // Consume los LedgerEvent que emite UACPScheduler.

  fromUacpEvent(uacpEvent: UacpEvent): IngestResult {
    return this.store.ingest({
      event_type: uacpEvent.event_type,
      case_id:    uacpEvent.case_id,
      node_id:    uacpEvent.node_id,
      trace_id:   uacpEvent.extra?.trace_id as string | undefined,
      payload:    {
        timestamp: uacpEvent.timestamp,
        ...uacpEvent.extra,
      },
    });
  }

  /** Ingesta batch de eventos UACP (resultado de UACPScheduler.run()) */
  fromUacpEvents(events: UacpEvent[]): IngestResult[] {
    return events.map(e => this.fromUacpEvent(e));
  }

  // ─── Adaptador OCO → Ledger ───────────────────────────────────────────────
  // Registra la emisión de un IntentionToken.

  fromOcoToken(token: IntentionToken): IngestResult {
    return this.store.ingest({
      event_type: "OCO_TOKEN_ISSUED",
      case_id:    token.case_id,
      trace_id:   token.metadata.trace_id,
      payload: {
        token_id:              token.token_id,
        intent_id:             token.intent_id,
        approved_order_hash:   token.approved_order_hash,
        risk_score:            token.governance_fingerprint.risk_score,
        hard_policies:         token.governance_fingerprint.hard_policies,
        issued_at:             token.issued_at,
        environment:           token.metadata.environment,
        priority:              token.metadata.priority,
      },
    });
  }

  // ─── Consultas ────────────────────────────────────────────────────────────

  queryByCase(case_id: string): LedgerEntry[] {
    return this.store.queryByCase(case_id);
  }

  queryByAgent(agent_id: string, limit?: number): LedgerEntry[] {
    return this.store.queryByAgent(agent_id, limit);
  }

  query(q: LedgerQuery): LedgerEntry[] {
    return this.store.query(q);
  }

  getById(event_id: string): LedgerEntry | undefined {
    return this.store.getById(event_id);
  }

  // ─── Verificación de integridad ───────────────────────────────────────────

  verifyCase(case_id: string): ChainVerificationResult {
    return this.store.verifyCase(case_id);
  }

  // ─── Estadísticas ─────────────────────────────────────────────────────────

  stats() {
    return this.store.stats();
  }

  // ─── Reset (para tests) ───────────────────────────────────────────────────

  reset(): void {
    this.store.reset();
  }
}

// Instancia singleton
export const ledger = new LedgerFractal();
