/**
 * Ledger Store v0.1 — Almacén en memoria
 * En v1.0: PostgreSQL con tabla ledger_events (ver spec SQL Sección 7.3).
 * Índices: case_id, agent_id, event_type, trace_id, timestamp.
 * Fuente: Sección 7.3 + 7.6, Volumen III.
 */

import type {
  LedgerEntry, LedgerIngestInput, LedgerQuery,
  IngestResult, ChainVerificationResult,
} from "./types";
import { buildEntry, verifyChain } from "./chain";

export class LedgerStore {
  // Almacén principal: event_id → entry
  private readonly entries = new Map<string, LedgerEntry>();

  // Índices secundarios para consultas O(1)
  private readonly byCaseId    = new Map<string, string[]>();   // case_id → event_ids[]
  private readonly byAgentId   = new Map<string, string[]>();
  private readonly byEventType = new Map<string, string[]>();
  private readonly byTraceId   = new Map<string, string[]>();

  // Secuencia por case_id para el hash chain
  private readonly caseSeq     = new Map<string, number>();
  private readonly caseLastHash = new Map<string, string>();

  // ─── Ingestión ───────────────────────────────────────────────────────────

  ingest(input: LedgerIngestInput): IngestResult {
    const prev_hash = this.caseLastHash.get(input.case_id) ?? "";
    const seq       = (this.caseSeq.get(input.case_id) ?? 0) + 1;

    const entry = buildEntry(input, prev_hash, seq);

    // Almacenar
    this.entries.set(entry.event_id, entry);

    // Actualizar índices
    this._index(this.byCaseId,    input.case_id,               entry.event_id);
    this._index(this.byEventType, input.event_type,             entry.event_id);
    if (input.agent_id) this._index(this.byAgentId,  input.agent_id,  entry.event_id);
    if (input.trace_id) this._index(this.byTraceId,  input.trace_id,  entry.event_id);

    // Avanzar cadena
    this.caseSeq.set(input.case_id, seq);
    this.caseLastHash.set(input.case_id, entry.hash);

    return { event_id: entry.event_id, hash: entry.hash, seq };
  }

  // ─── Consultas ────────────────────────────────────────────────────────────

  /** Todos los eventos de un caso, ordenados por timestamp ASC. */
  queryByCase(case_id: string): LedgerEntry[] {
    return this._resolve(this.byCaseId.get(case_id) ?? [])
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /** Eventos de un agente, ordenados por timestamp DESC. */
  queryByAgent(agent_id: string, limit = 1000): LedgerEntry[] {
    return this._resolve(this.byAgentId.get(agent_id) ?? [])
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  /** Consulta genérica con filtros opcionales. */
  query(q: LedgerQuery): LedgerEntry[] {
    let candidates: LedgerEntry[];

    // Punto de entrada más selectivo primero
    if (q.case_id) {
      candidates = this.queryByCase(q.case_id);
    } else if (q.trace_id) {
      candidates = this._resolve(this.byTraceId.get(q.trace_id) ?? []);
    } else if (q.agent_id) {
      candidates = this._resolve(this.byAgentId.get(q.agent_id) ?? []);
    } else if (q.event_type) {
      candidates = this._resolve(this.byEventType.get(q.event_type) ?? []);
    } else {
      candidates = [...this.entries.values()];
    }

    // Filtros adicionales
    if (q.agent_id && !q.case_id) {
      candidates = candidates.filter(e => e.agent_id === q.agent_id);
    }
    if (q.event_type) {
      candidates = candidates.filter(e => e.event_type === q.event_type);
    }
    if (q.trace_id) {
      candidates = candidates.filter(e => e.trace_id === q.trace_id);
    }
    if (q.from_ts) {
      candidates = candidates.filter(e => e.timestamp >= q.from_ts!);
    }
    if (q.to_ts) {
      candidates = candidates.filter(e => e.timestamp <= q.to_ts!);
    }

    candidates = candidates.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return q.limit ? candidates.slice(0, q.limit) : candidates;
  }

  /** Obtener una entrada por event_id. */
  getById(event_id: string): LedgerEntry | undefined {
    return this.entries.get(event_id);
  }

  // ─── Verificación de integridad ───────────────────────────────────────────

  verifyCase(case_id: string): ChainVerificationResult {
    const chain = this.queryByCase(case_id);
    return verifyChain(chain, case_id);
  }

  // ─── Estadísticas ─────────────────────────────────────────────────────────

  stats() {
    return {
      total_events: this.entries.size,
      total_cases:  this.byCaseId.size,
      total_agents: this.byAgentId.size,
      event_types:  [...this.byEventType.keys()],
    };
  }

  // ─── Reset (para tests) ───────────────────────────────────────────────────

  reset(): void {
    this.entries.clear();
    this.byCaseId.clear();
    this.byAgentId.clear();
    this.byEventType.clear();
    this.byTraceId.clear();
    this.caseSeq.clear();
    this.caseLastHash.clear();
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private _index(map: Map<string, string[]>, key: string, value: string): void {
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  }

  private _resolve(ids: string[]): LedgerEntry[] {
    return ids
      .map(id => this.entries.get(id))
      .filter((e): e is LedgerEntry => e !== undefined);
  }
}

export const ledgerStore = new LedgerStore();
