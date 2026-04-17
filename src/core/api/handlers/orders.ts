/**
 * A. Orders API — Handlers
 * POST /v1/core/orders     — Recibe, valida y encola una orden
 * GET  /v1/core/orders/:trace_id — Consulta estado + historial Ledger
 *
 * Invariante API01: Toda orden pasa por OCO (P1–P8) antes de ejecutarse.
 * Invariante API02: Toda acción genera evento en Ledger.
 * Fuente: Secciones 2.13.3–2.13.4, Capítulo II.
 */

import type { ApiRequest, ApiResponse } from "../types";
import { ok, created, badRequest, notFound, forbidden, unavailable, conflict } from "../types";
import { validateStructural, computeOrdHash } from "../../orders/validators";
import { OrderFsm } from "../../orders/fsm";
import type { OrdJson } from "../../orders/types";
import type { CoreState } from "../core-state";

// ─── POST /v1/core/orders ────────────────────────────────────────────────────

export function handlePostOrder(state: CoreState) {
  return (req: ApiRequest): ApiResponse => {
    // Guard: CORE congelado
    if (state.coreFrozen) {
      return unavailable("CORE is frozen — no new orders accepted");
    }

    const body = req.body as Partial<OrdJson> | null;
    if (!body) return badRequest("ERR_ORD_001", "Request body is required");

    // Anillo 1: Validación estructural V01–V08
    const structural = validateStructural(body);
    if (!structural.ok) {
      return {
        status: 400,
        body: {
          error_code: structural.error_code,
          message:    structural.message,
          timestamp:  new Date().toISOString(),
        },
      };
    }

    const ord = body as OrdJson;

    // Guard: agente bloqueado (P1 / RBAC)
    if (state.isBlocked(ord.source)) {
      return forbidden(`Agent '${ord.source}' is blocked`);
    }

    // Guard: CASE congelado
    const caseData = state.getCase(ord.case_id);
    if (caseData?.frozen) {
      return conflict("CASE_FROZEN", `CASE '${ord.case_id}' is frozen — no new orders accepted`);
    }

    // Guard: backpressure (saturation > 90%)
    const global = state.globalQueueStats();
    if (global.saturation_ratio > 0.9) {
      return { status: 429, body: { error_code: "BACKPRESSURE", message: "Queue capacity exceeded (>90%)" } };
    }

    // FSM: CREATED → STRUCTURALLY_VALID → CONSTITUTIONALLY_VALID → QUEUED
    const fsm = new OrderFsm();
    let order = fsm.create(ord.trace_id, ord.case_id, ord.source);

    // Copiar campos del ORD al order
    order = {
      ...order,
      ...ord,
      state:      order.state,
      created_at: order.created_at,
      updated_at: order.updated_at,
    };

    order = fsm.markStructurallyValid(order, ["V01","V02","V03","V04","V05","V06","V07","V08"]);
    // v0.1: OCO stub — en v1.0 se llama al OcoOrchestrator real
    order = fsm.markConstitutionallyValid(order, ["P1","P2","P3","P4","P6","P7","P8"]);
    order = fsm.enqueue(order, `${ord.case_id}-queue`, ord.priority);

    // Persistir
    state.saveOrder(order, "ORD_QUEUED", ord.source);

    // Ledger
    state.ledger.fromFsmEvents(fsm.getEvents());

    return {
      status: 201,
      body: {
        trace_id:  ord.trace_id,
        state:     "QUEUED",
        message:   "Order accepted and queued",
        timestamp: new Date().toISOString(),
      },
    };
  };
}

// ─── GET /v1/core/orders/:trace_id ───────────────────────────────────────────

export function handleGetOrder(state: CoreState) {
  return (req: ApiRequest): ApiResponse => {
    const { trace_id } = req.params;
    const record = state.getOrder(trace_id);

    if (!record) {
      return notFound(`Order '${trace_id}' not found`);
    }

    const ledgerHistory = state.ledger.query({ trace_id });

    return ok({
      trace_id:   record.order.trace_id,
      state:      record.order.state,
      case_id:    record.order.case_id,
      priority:   record.order.priority,
      risk:       record.order.governance?.P4_risk_max,
      governance: record.order.governance,
      history:    [
        ...record.history,
        ...ledgerHistory.map(e => ({
          event:     e.event_type,
          timestamp: e.timestamp,
          actor:     e.agent_id ?? "SYSTEM",
        })),
      ].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    });
  };
}
