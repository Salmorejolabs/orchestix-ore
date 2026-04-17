/**
 * CORE API — State v0.1
 * Estado operativo compartido del CORE en memoria.
 * En v1.0: PostgreSQL + Redis.
 *
 * Gestiona:
 *   - Order registry    (trace_id → Order + historial)
 *   - Case registry     (case_id → CaseState)
 *   - Blocked agents    (agent_id → BlockRecord)
 *   - Anomalies         (lista auditable)
 *   - Core freeze state
 *   - Queue metrics     (case_id → QueueMetrics)
 */

import type { Order } from "../orders/types";
import { LedgerFractal } from "../../ledger/ledger";

// ─── Order history entry ──────────────────────────────────────────────────────

export interface OrderHistoryEntry {
  event:     string;
  timestamp: string;
  actor:     string;
}

// ─── Order record ─────────────────────────────────────────────────────────────

export interface OrderRecord {
  order:   Order;
  history: OrderHistoryEntry[];
}

// ─── Case state ───────────────────────────────────────────────────────────────

export interface CaseState {
  case_id:        string;
  parent?:        string;
  frozen:         boolean;
  degraded:       boolean;
  closed_at?:     string;
  governance: {
    max_priority:      number;
    P4_risk_max:       number;
    allowed_actions:   string[];
    forbidden_actions: string[];
  };
  active_orders:  number;
  queue_size:     number;
  ledger_pointer: string;
}

// ─── Block record ─────────────────────────────────────────────────────────────

export interface BlockRecord {
  agent_id:   string;
  reason:     string;
  actor:      string;
  blocked_at: string;
}

// ─── Anomaly ──────────────────────────────────────────────────────────────────

export interface Anomaly {
  anomaly_id: string;
  timestamp:  string;
  type:       string;
  agent_id?:  string;
  severity:   "low" | "medium" | "high" | "critical";
  resolved:   boolean;
  resolution?: string;
}

// ─── CoreState ────────────────────────────────────────────────────────────────

export class CoreState {
  private orders    = new Map<string, OrderRecord>();
  private cases     = new Map<string, CaseState>();
  private blocked   = new Map<string, BlockRecord>();
  private anomalies: Anomaly[] = [];
  private _coreFrozen = false;
  private _freezeReason?: string;
  private _freezeActor?: string;

  readonly ledger: LedgerFractal;

  constructor(ledger?: LedgerFractal) {
    this.ledger = ledger ?? new LedgerFractal();
    this._seedDefaultCases();
  }

  // ─── Core freeze ──────────────────────────────────────────────────────────

  get coreFrozen(): boolean { return this._coreFrozen; }

  freezeCore(reason: string, actor: string): void {
    this._coreFrozen   = true;
    this._freezeReason = reason;
    this._freezeActor  = actor;
    this.ledger.ingest({
      event_type: "CORE_FROZEN",
      case_id:    "CORE",
      payload:    { reason, actor, timestamp: new Date().toISOString() },
    });
  }

  unfreezeCore(): void {
    this._coreFrozen = false;
  }

  coreStatus() {
    return {
      frozen:  this._coreFrozen,
      reason:  this._freezeReason,
      actor:   this._freezeActor,
    };
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  saveOrder(order: Order, event: string, actor = "SYSTEM"): void {
    const existing = this.orders.get(order.trace_id);
    const history  = existing?.history ?? [];
    history.push({ event, timestamp: new Date().toISOString(), actor });
    this.orders.set(order.trace_id, { order, history });

    // Actualizar cola del case
    this._updateCaseQueue(order.case_id, order.state);
  }

  getOrder(trace_id: string): OrderRecord | undefined {
    return this.orders.get(trace_id);
  }

  allOrders(): OrderRecord[] {
    return [...this.orders.values()];
  }

  // ─── Cases ────────────────────────────────────────────────────────────────

  getCase(case_id: string): CaseState | undefined {
    return this.cases.get(case_id);
  }

  freezeCase(case_id: string, reason: string, actor: string): void {
    const cs = this._ensureCase(case_id);
    cs.frozen = true;
    this.cases.set(case_id, cs);
    this.ledger.ingest({
      event_type: "CASE_FROZEN",
      case_id,
      payload:    { reason, actor, timestamp: new Date().toISOString() },
    });
  }

  allCases(): CaseState[] {
    return [...this.cases.values()];
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  blockAgent(agent_id: string, reason: string, actor: string): void {
    this.blocked.set(agent_id, {
      agent_id, reason, actor,
      blocked_at: new Date().toISOString(),
    });
    this.ledger.ingest({
      event_type: "AGENT_BLOCKED",
      case_id:    "CORE",
      agent_id,
      payload:    { reason, actor, timestamp: new Date().toISOString() },
    });
  }

  isBlocked(agent_id: string): boolean {
    return this.blocked.has(agent_id);
  }

  getBlock(agent_id: string): BlockRecord | undefined {
    return this.blocked.get(agent_id);
  }

  // ─── Anomalies ────────────────────────────────────────────────────────────

  addAnomaly(anomaly: Omit<Anomaly, "anomaly_id">): Anomaly {
    const full = { ...anomaly, anomaly_id: `ANO-${Date.now()}` };
    this.anomalies.push(full);
    return full;
  }

  getAnomalies(since?: string, limit = 100): Anomaly[] {
    let list = [...this.anomalies];
    if (since) list = list.filter(a => a.timestamp >= since);
    return list.slice(-limit);
  }

  // ─── Queue metrics (stub) ─────────────────────────────────────────────────

  queueMetrics(): Record<string, { size: number; max: number; status: string }> {
    const result: Record<string, { size: number; max: number; status: string }> = {};
    for (const [cid, cs] of this.cases) {
      const size   = cs.queue_size;
      const max    = 1000;
      const status = cs.frozen ? "frozen" : size > max * 0.9 ? "saturated" : "ok";
      result[cid]  = { size, max, status };
    }
    return result;
  }

  globalQueueStats() {
    const queues   = this.queueMetrics();
    const total    = Object.values(queues).reduce((s, q) => s + q.size, 0);
    const capacity = 10000;
    return {
      total_size:       total,
      capacity,
      saturation_ratio: +(total / capacity).toFixed(4),
    };
  }

  // ─── Reset (tests) ────────────────────────────────────────────────────────

  reset(): void {
    this.orders.clear();
    this.cases.clear();
    this.blocked.clear();
    this.anomalies = [];
    this._coreFrozen   = false;
    this._freezeReason = undefined;
    this._freezeActor  = undefined;
    this.ledger.reset();
    this._seedDefaultCases();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _ensureCase(case_id: string): CaseState {
    if (!this.cases.has(case_id)) {
      this.cases.set(case_id, this._defaultCase(case_id));
    }
    return this.cases.get(case_id)!;
  }

  private _defaultCase(case_id: string): CaseState {
    const parts = case_id.split(".");
    const parent = parts.length > 1 ? parts.slice(0, -1).join(".") : undefined;
    return {
      case_id,
      parent,
      frozen:    false,
      degraded:  false,
      governance: {
        max_priority:      10,
        P4_risk_max:       5,
        allowed_actions:   [],
        forbidden_actions: [],
      },
      active_orders:  0,
      queue_size:     0,
      ledger_pointer: `LEDGER_${case_id.replace(/[^A-Z0-9]/gi, "_").toUpperCase()}`,
    };
  }

  private _seedDefaultCases(): void {
    ["CASE-1", "CASE-1.1", "CASE-1.2", "CASE-2"].forEach(id => {
      this.cases.set(id, this._defaultCase(id));
    });
  }

  private _updateCaseQueue(case_id: string, state: string): void {
    const cs = this._ensureCase(case_id);
    if (["QUEUED", "RUNNING", "WAITING"].includes(state)) {
      cs.active_orders = (cs.active_orders ?? 0) + 1;
      cs.queue_size    = cs.active_orders;
    } else if (["COMPLETED","FAILED","CANCELLED","REVOKED","FROZEN"].includes(state)) {
      cs.active_orders = Math.max(0, (cs.active_orders ?? 1) - 1);
      cs.queue_size    = cs.active_orders;
    }
    this.cases.set(case_id, cs);
  }
}

export const coreState = new CoreState();
