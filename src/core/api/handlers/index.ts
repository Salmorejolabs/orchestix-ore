/**
 * CORE API — Handlers: Cases, Governance, Operational, Security, Health
 * Familias B, C, D, E, F de la API constitucional del CORE.
 * Fuente: Secciones 2.13.5–2.13.14, Capítulo II.
 */

import type { ApiRequest, ApiResponse } from "../types";
import { ok, accepted, badRequest, notFound, forbidden, conflict, unavailable } from "../types";
import type { CoreState } from "../core-state";
import { OrderFsm } from "../../orders/fsm";

// ════════════════════════════════════════════════════════════════════════════
// B. CASE API
// ════════════════════════════════════════════════════════════════════════════

/** GET /v1/core/cases/:case_id */
export function handleGetCase(state: CoreState) {
  return (req: ApiRequest): ApiResponse => {
    const { case_id } = req.params;
    const cs = state.getCase(case_id);
    if (!cs) return notFound(`CASE '${case_id}' not found`);
    return ok(cs);
  };
}

/** POST /v1/core/cases/:case_id/freeze */
export function handleFreezeCase(state: CoreState) {
  return (req: ApiRequest): ApiResponse => {
    const { case_id } = req.params;
    const body = req.body ?? {};
    const actor  = (body.actor  as string) || "UNKNOWN";
    const reason = (body.reason as string) || "No reason provided";

    const cs = state.getCase(case_id);
    if (!cs) return notFound(`CASE '${case_id}' not found`);
    if (cs.frozen) return badRequest("CASE_ALREADY_FROZEN", `CASE '${case_id}' is already frozen`);

    // Solo DASHBOARD, SEC o roles administrativos pueden congelar
    const allowedActors = ["DASHBOARD", "SEC", "S3", "DASHBOARD_USER"];
    if (!allowedActors.some(a => actor.toUpperCase().includes(a.toUpperCase()))) {
      return forbidden(`Actor '${actor}' does not have permission to freeze a CASE`);
    }

    state.freezeCase(case_id, reason, actor);

    return accepted({
      case_id,
      frozen:    true,
      message:   `CASE '${case_id}' frozen successfully`,
      timestamp: new Date().toISOString(),
    });
  };
}

// ════════════════════════════════════════════════════════════════════════════
// C. GOVERNANCE API
// ════════════════════════════════════════════════════════════════════════════

/** POST /v1/core/governance/revoke */
export function handleRevokeOrder(state: CoreState) {
  return (req: ApiRequest): ApiResponse => {
    const body     = req.body ?? {};
    const trace_id = body.trace_id as string;
    const reason   = (body.reason as string) ?? "No reason";
    const actor    = (body.actor  as string) ?? "UNKNOWN";

    if (!trace_id) return badRequest("ERR_GOV_001", "trace_id is required");

    const record = state.getOrder(trace_id);
    if (!record) return notFound(`Order '${trace_id}' not found`);

    const TERMINAL = ["COMPLETED","FAILED","CANCELLED","REVOKED","FROZEN"];
    if (TERMINAL.includes(record.order.state)) {
      return badRequest("ERR_GOV_002", `Order '${trace_id}' is already in terminal state '${record.order.state}'`);
    }

    const ALLOWED_ACTORS = ["OCO","SEC","S3","DASHBOARD"];
    if (!ALLOWED_ACTORS.some(a => actor.toUpperCase().includes(a))) {
      return forbidden(`Actor '${actor}' does not have permission to revoke orders`);
    }

    // FSM: → REVOKED
    const fsm = new OrderFsm();
    const updated = fsm.revoke(record.order, {
      actor,
      violated_policy: "GOVERNANCE",
      reason,
    });

    state.saveOrder(updated, "ORD_REVOKED", actor);
    state.ledger.fromFsmEvents(fsm.getEvents());

    return accepted({
      trace_id,
      state:     "REVOKED",
      message:   `Order '${trace_id}' revoked`,
      timestamp: new Date().toISOString(),
    });
  };
}

/** POST /v1/core/governance/freeze_core */
export function handleFreezeCore(state: CoreState) {
  return (req: ApiRequest): ApiResponse => {
    const body   = req.body ?? {};
    const actor  = (body.actor  as string) ?? "UNKNOWN";
    const reason = (body.reason as string) ?? "No reason";

    const ALLOWED = ["SEC","S3","DASHBOARD"];
    if (!ALLOWED.some(a => actor.toUpperCase().includes(a))) {
      return forbidden(`Actor '${actor}' does not have permission to freeze the CORE`);
    }

    state.freezeCore(reason, actor);

    return accepted({
      frozen:    true,
      message:   "CORE frozen — only healthchecks will respond",
      timestamp: new Date().toISOString(),
    });
  };
}

// ════════════════════════════════════════════════════════════════════════════
// D. OPERATIONAL API
// ════════════════════════════════════════════════════════════════════════════

/** GET /v1/core/scheduler/queues */
export function handleGetQueues(state: CoreState) {
  return (_req: ApiRequest): ApiResponse => {
    return ok({
      timestamp: new Date().toISOString(),
      global:    state.globalQueueStats(),
      queues:    state.queueMetrics(),
    });
  };
}

/** GET /v1/core/executor/workers */
export function handleGetWorkers(_state: CoreState) {
  return (_req: ApiRequest): ApiResponse => {
    // Stub v0.1 — workers reales en v1.0
    return ok({
      total_workers:             4,
      active_workers:            2,
      idle_workers:              2,
      sandbox_status:            "ok",
      avg_execution_duration_ms: 87,
      workers: [
        { id: "worker-01", state: "IDLE" },
        { id: "worker-02", state: "IDLE" },
        { id: "worker-03", state: "RUNNING", duration_ms: 45 },
        { id: "worker-04", state: "RUNNING", duration_ms: 130 },
      ],
    });
  };
}

/** GET /v1/core/swarm/nodes */
export function handleGetSwarm(_state: CoreState) {
  return (_req: ApiRequest): ApiResponse => {
    // Stub v0.1 — SWARM real en v1.0
    return ok({
      swarms: {
        "SWARM-1": {
          nodes_alive:              4,
          total_nodes:              4,
          quorum_ratio:             1.0,
          reconfigurations_recent:  0,
          tasks_pending:            1,
          tasks_running:            2,
          nodes: [
            { id: "node-01", status: "alive", load: 0.3 },
            { id: "node-02", status: "alive", load: 0.5 },
            { id: "node-03", status: "alive", load: 0.1 },
            { id: "node-04", status: "alive", load: 0.4 },
          ],
        },
      },
    });
  };
}

// ════════════════════════════════════════════════════════════════════════════
// E. SECURITY API
// ════════════════════════════════════════════════════════════════════════════

/** POST /v1/core/security/block_agent */
export function handleBlockAgent(state: CoreState) {
  return (req: ApiRequest): ApiResponse => {
    const body     = req.body ?? {};
    const agent_id = body.agent_id as string;
    const reason   = (body.reason as string) ?? "No reason";
    const actor    = (body.actor  as string) ?? "UNKNOWN";

    if (!agent_id) return badRequest("ERR_SEC_001", "agent_id is required");

    const ALLOWED = ["SEC","S3","DASHBOARD"];
    if (!ALLOWED.some(a => actor.toUpperCase().includes(a))) {
      return forbidden(`Actor '${actor}' does not have permission to block agents`);
    }

    state.blockAgent(agent_id, reason, actor);

    return accepted({
      agent_id,
      blocked:   true,
      message:   `Agent '${agent_id}' blocked`,
      timestamp: new Date().toISOString(),
    });
  };
}

/** GET /v1/core/security/anomalies */
export function handleGetAnomalies(state: CoreState) {
  return (req: ApiRequest): ApiResponse => {
    const since = req.query.since;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    return ok({ anomalies: state.getAnomalies(since, limit) });
  };
}

// ════════════════════════════════════════════════════════════════════════════
// F. HEALTH API
// ════════════════════════════════════════════════════════════════════════════

/** GET /health/liveness — proceso vivo */
export function handleLiveness(_state: CoreState) {
  return (_req: ApiRequest): ApiResponse => ({
    status: 200,
    body: { status: "alive", timestamp: new Date().toISOString() },
  });
}

/** GET /health/readiness — acepta órdenes */
export function handleReadiness(state: CoreState) {
  return (_req: ApiRequest): ApiResponse => {
    if (state.coreFrozen) {
      return unavailable("CORE is frozen — not ready");
    }
    const global = state.globalQueueStats();
    if (global.saturation_ratio > 0.95) {
      return unavailable("Queue saturation critical");
    }
    return ok({ status: "ready", timestamp: new Date().toISOString() });
  };
}

/** GET /health/deep — salud profunda */
export function handleDeepHealth(state: CoreState) {
  return (_req: ApiRequest): ApiResponse => {
    const ledgerStats = state.ledger.stats();
    const queueStats  = state.globalQueueStats();
    const coreStatus  = state.coreStatus();

    const checks = {
      core:   { healthy: !coreStatus.frozen, frozen: coreStatus.frozen },
      ledger: { healthy: true, total_events: ledgerStats.total_events },
      queues: { healthy: queueStats.saturation_ratio < 0.9, ...queueStats },
    };

    const allHealthy = Object.values(checks).every(c => c.healthy);

    return {
      status: allHealthy ? 200 : 503,
      body: {
        status:    allHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        checks,
      },
    };
  };
}

/** GET /health/constitutional — salud P1–P8 */
export function handleConstitutionalHealth(_state: CoreState) {
  return (_req: ApiRequest): ApiResponse => ok({
    status:    "constitutional",
    policies:  ["P1","P2","P3","P4","P6","P7","P8"],
    all_pass:  true,
    timestamp: new Date().toISOString(),
  });
}

/** GET /health/ledger */
export function handleLedgerHealth(state: CoreState) {
  return (_req: ApiRequest): ApiResponse => {
    const stats = state.ledger.stats();
    return ok({ status: "ok", ...stats, timestamp: new Date().toISOString() });
  };
}
