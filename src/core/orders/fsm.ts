/**
 * Order FSM v0.1 — Máquina de Estados del Sistema de Órdenes
 *
 * Implementa la FSM constitucional según SDS ORD CORE 1.0, Sección 4.3.
 * Principios:
 *   - Atómica: toda transición o se aplica completamente o no se aplica.
 *   - Ledger-first: cada transición produce un FsmEvent para el Ledger.
 *   - Determinista: mismo input + estado → misma transición o rechazo.
 *   - Estados terminales inmutables: COMPLETED/FAILED/CANCELLED/REVOKED/FROZEN.
 *
 * v0.1 scope: FSM + guardias structurales. Validación constitucional P1-P8
 * delegada a OCO (ya implementado). Ledger real en la siguiente fase.
 */

import type { Order, OrderState } from "./types";
import { TERMINAL_ORDER_STATES } from "./types";

// ─── FSM Event (para Ledger) ──────────────────────────────────────────────────

export interface FsmEvent {
  event:      string;              // ORD_CREATED, ORD_STRUCTURALLY_VALID, etc.
  trace_id:   string;
  case_id:    string;
  from:       OrderState | null;
  to:         OrderState;
  timestamp:  string;
  actor?:     string;
  payload:    Record<string, unknown>;
}

// ─── FSM Error ────────────────────────────────────────────────────────────────

export class FsmError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FsmError";
  }
}

// ─── Transition payloads ──────────────────────────────────────────────────────

export interface TransitionToRunning {
  worker_id: string;
  executor_id: string;
}

export interface TransitionToCompleted {
  result_hash: string;
  cost_real:   number;
  duration_ms: number;
}

export interface TransitionToFailed {
  error_code:  string;
  reason:      string;
  cost_real?:  number;
  duration_ms?: number;
}

export interface TransitionToCancelled {
  actor:  string;
  reason: string;
}

export interface TransitionToRevoked {
  actor:            string;
  violated_policy:  string;
  reason:           string;
}

export interface TransitionToFrozen {
  actor:            string;
  reason:           string;
  investigation_id?: string;
}

export interface TransitionToWaiting {
  reason:           string;
  suborders_count?: number;
}

// ─── FSM ──────────────────────────────────────────────────────────────────────

export class OrderFsm {
  private events: FsmEvent[] = [];

  // ── Creación ─────────────────────────────────────────────────────────────

  create(traceId: string, caseId: string, actor?: string): Order {
    const now = new Date().toISOString();
    const order: Order = {
      trace_id:     traceId,
      trace_parent: null,
      case_id:      caseId,
      type:         "OA",
      priority:     5,
      source:       "",
      target:       "",
      payload:      { action: "", params: {} },
      governance:   { P1_cost_max: 1000, P2_timeout_ms: 30000, P3_ethics: "hard", P4_risk_max: 5 },
      signature:    "",
      hash:         "",
      state:        "CREATED",
      created_at:   now,
      updated_at:   now,
      actor,
    };

    this._emit({
      event:     "ORD_CREATED",
      trace_id:  traceId,
      case_id:   caseId,
      from:      null,
      to:        "CREATED",
      actor,
      payload:   { trace_id: traceId, case_id: caseId, source: "" },
    });

    return order;
  }

  // ── Transiciones ─────────────────────────────────────────────────────────

  /**
   * CREATED → STRUCTURALLY_VALID
   * Trigger: validación estructural V01-V08 OK
   */
  markStructurallyValid(order: Order, checks_passed: string[] = []): Order {
    this._guardNotTerminal(order);
    this._guardFrom(order, "CREATED", "FSM_001");

    return this._transition(order, "STRUCTURALLY_VALID", "ORD_STRUCTURALLY_VALID", {
      validator:     "STRUCTURAL",
      checks_passed,
    });
  }

  /**
   * STRUCTURALLY_VALID → CONSTITUTIONALLY_VALID
   * Trigger: OCO evalúa P1–P8 OK
   */
  markConstitutionallyValid(order: Order, policies_passed: string[] = []): Order {
    this._guardNotTerminal(order);
    this._guardFrom(order, "STRUCTURALLY_VALID", "FSM_002");

    return this._transition(order, "CONSTITUTIONALLY_VALID", "ORD_CONSTITUTIONALLY_VALID", {
      validator:      "OCO",
      policies_passed,
    });
  }

  /**
   * CONSTITUTIONALLY_VALID → QUEUED
   * Trigger: Scheduler encola
   */
  enqueue(order: Order, queue_name: string, priority: number): Order {
    this._guardNotTerminal(order);
    this._guardFrom(order, "CONSTITUTIONALLY_VALID", "FSM_003");

    return this._transition(order, "QUEUED", "ORD_QUEUED", {
      queue_name,
      priority,
    });
  }

  /**
   * QUEUED → RUNNING
   * Trigger: Executor asigna worker
   */
  startRunning(order: Order, payload: TransitionToRunning): Order {
    this._guardNotTerminal(order);
    this._guardFrom(order, "QUEUED", "FSM_004");

    const updated = this._transition(order, "RUNNING", "ORD_RUNNING", {
      worker_id:   payload.worker_id,
      executor_id: payload.executor_id,
    });

    return { ...updated, worker_id: payload.worker_id };
  }

  /**
   * RUNNING → WAITING
   * Trigger: subórdenes creadas / SWARM / IO externa
   */
  waitForSuborders(order: Order, payload: TransitionToWaiting): Order {
    this._guardNotTerminal(order);
    this._guardFrom(order, "RUNNING", "FSM_005");

    return this._transition(order, "WAITING", "ORD_WAITING", {
      reason:          payload.reason,
      suborders_count: payload.suborders_count ?? 0,
    });
  }

  /**
   * WAITING → RUNNING (re-entry)
   * Trigger: subórdenes completadas
   */
  resumeFromWaiting(order: Order): Order {
    this._guardNotTerminal(order);
    this._guardFrom(order, "WAITING", "FSM_006");

    return this._transition(order, "RUNNING", "ORD_RUNNING", {
      reason: "suborders_completed",
    });
  }

  /**
   * RUNNING → COMPLETED
   * Trigger: ejecución exitosa con coste y duración dentro de límites
   */
  complete(order: Order, payload: TransitionToCompleted): Order {
    this._guardNotTerminal(order);
    this._guardFrom(order, "RUNNING", "FSM_007");

    // Guardia de coste y timeout
    if (payload.cost_real > order.governance.P1_cost_max) {
      throw new FsmError("ERR_ORD_017",
        `cost_real (${payload.cost_real}) exceeds P1_cost_max (${order.governance.P1_cost_max})`);
    }
    if (payload.duration_ms > order.governance.P2_timeout_ms) {
      throw new FsmError("ERR_ORD_018",
        `duration_ms (${payload.duration_ms}) exceeds P2_timeout_ms (${order.governance.P2_timeout_ms})`);
    }

    const updated = this._transition(order, "COMPLETED", "ORD_COMPLETED", {
      result_hash: payload.result_hash,
      cost_real:   payload.cost_real,
      duration_ms: payload.duration_ms,
    });

    this._emit({
      event:    "ORD_FINAL_STATE",
      trace_id: order.trace_id,
      case_id:  order.case_id,
      from:     "RUNNING",
      to:       "COMPLETED",
      payload:  { final_state: "COMPLETED", cost_real: payload.cost_real },
    });

    return { ...updated, result_hash: payload.result_hash, cost_real: payload.cost_real, duration_ms: payload.duration_ms };
  }

  /**
   * RUNNING → FAILED
   * Trigger: error fatal / timeout / coste excedido
   */
  fail(order: Order, payload: TransitionToFailed): Order {
    this._guardNotTerminal(order);
    this._guardFrom(order, "RUNNING", "FSM_008");

    const updated = this._transition(order, "FAILED", "ORD_FAILED", {
      error_code:  payload.error_code,
      reason:      payload.reason,
      cost_real:   payload.cost_real,
      duration_ms: payload.duration_ms,
    });

    this._emit({
      event:    "ORD_FINAL_STATE",
      trace_id: order.trace_id,
      case_id:  order.case_id,
      from:     "RUNNING",
      to:       "FAILED",
      payload:  { final_state: "FAILED", error_code: payload.error_code },
    });

    return { ...updated, error_code: payload.error_code, error_msg: payload.reason };
  }

  /**
   * QUEUED | RUNNING | WAITING → CANCELLED
   * Trigger: cancelación por Dashboard/usuario
   */
  cancel(order: Order, payload: TransitionToCancelled): Order {
    this._guardNotTerminal(order);
    this._guardFromSet(order, ["QUEUED", "RUNNING", "WAITING"], "FSM_009");

    const updated = this._transition(order, "CANCELLED", "ORD_CANCELLED", {
      actor:  payload.actor,
      reason: payload.reason,
    });

    this._emit({
      event:    "ORD_FINAL_STATE",
      trace_id: order.trace_id,
      case_id:  order.case_id,
      from:     order.state,
      to:       "CANCELLED",
      actor:    payload.actor,
      payload:  { final_state: "CANCELLED" },
    });

    return { ...updated, actor: payload.actor };
  }

  /**
   * QUEUED | RUNNING | WAITING → REVOKED
   * Trigger: revocación por OCO/SEC (violación constitucional)
   */
  revoke(order: Order, payload: TransitionToRevoked): Order {
    this._guardNotTerminal(order);
    this._guardFromSet(order, ["QUEUED", "RUNNING", "WAITING"], "FSM_010");

    const updated = this._transition(order, "REVOKED", "ORD_REVOKED", {
      actor:           payload.actor,
      violated_policy: payload.violated_policy,
      reason:          payload.reason,
    });

    this._emit({
      event:    "ORD_FINAL_STATE",
      trace_id: order.trace_id,
      case_id:  order.case_id,
      from:     order.state,
      to:       "REVOKED",
      actor:    payload.actor,
      payload:  { final_state: "REVOKED", violated_policy: payload.violated_policy },
    });

    return { ...updated, actor: payload.actor };
  }

  /**
   * QUEUED | RUNNING | WAITING → FROZEN
   * Trigger: congelación por SEC/S3/Dashboard
   */
  freeze(order: Order, payload: TransitionToFrozen): Order {
    this._guardNotTerminal(order);
    this._guardFromSet(order, ["QUEUED", "RUNNING", "WAITING"], "FSM_011");

    return this._transition(order, "FROZEN", "ORD_FROZEN", {
      actor:            payload.actor,
      reason:           payload.reason,
      investigation_id: payload.investigation_id,
    });
  }

  /**
   * CONSTITUTIONALLY_VALID → MUTATED
   * Trigger: mutación aprobada por OCO (nuevo contrato, mismo linaje)
   */
  mutate(order: Order, new_trace_id: string, delta: Record<string, unknown>): Order {
    this._guardNotTerminal(order);
    this._guardFrom(order, "CONSTITUTIONALLY_VALID", "FSM_012");

    const updated = this._transition(order, "MUTATED", "ORD_MUTATED", {
      old_trace_id: order.trace_id,
      new_trace_id,
      case_id:      order.case_id,
      delta,
    });

    return updated;
  }

  // ── Acceso a eventos ─────────────────────────────────────────────────────

  getEvents(): FsmEvent[] { return [...this.events]; }
  clearEvents(): void { this.events = []; }

  // ── Helpers privados ─────────────────────────────────────────────────────

  private _transition(
    order:   Order,
    to:      OrderState,
    event:   string,
    payload: Record<string, unknown>,
    actor?:  string
  ): Order {
    const now = new Date().toISOString();

    this._emit({
      event,
      trace_id:  order.trace_id,
      case_id:   order.case_id,
      from:      order.state,
      to,
      actor:     actor ?? order.actor,
      payload,
    });

    return { ...order, state: to, updated_at: now };
  }

  private _emit(partial: Omit<FsmEvent, "timestamp">): void {
    this.events.push({ ...partial, timestamp: new Date().toISOString() });
  }

  private _guardNotTerminal(order: Order): void {
    if (TERMINAL_ORDER_STATES.has(order.state)) {
      throw new FsmError("FSM_000",
        `Order '${order.trace_id}' is in terminal state '${order.state}' — no transitions allowed`);
    }
  }

  private _guardFrom(order: Order, expected: OrderState, code: string): void {
    if (order.state !== expected) {
      throw new FsmError(code,
        `Invalid transition: order is in '${order.state}', expected '${expected}'`);
    }
  }

  private _guardFromSet(order: Order, allowed: OrderState[], code: string): void {
    if (!allowed.includes(order.state)) {
      throw new FsmError(code,
        `Invalid transition: order is in '${order.state}', allowed: [${allowed.join(", ")}]`);
    }
  }
}

export const orderFsm = new OrderFsm();
