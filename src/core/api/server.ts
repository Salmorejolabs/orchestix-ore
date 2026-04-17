/**
 * CORE API — Server v0.1
 * Ensambla el router con las 6 familias de endpoints constitucionales.
 * Node.js built-in http — sin dependencias externas.
 *
 * Familias:
 *   A. Orders      — POST/GET /v1/core/orders
 *   B. Cases       — GET/POST /v1/core/cases
 *   C. Governance  — POST /v1/core/governance/*
 *   D. Operational — GET /v1/core/scheduler|executor|swarm
 *   E. Security    — POST/GET /v1/core/security/*
 *   F. Health      — GET /health/*
 *
 * Fuente: Sección 2.13, Capítulo II.
 */

import http from "http";
import { Router, parseQuery } from "./router";
import { CoreState, coreState as defaultState } from "./core-state";
import {
  handlePostOrder,
  handleGetOrder,
} from "./handlers/orders";
import {
  handleGetCase,
  handleFreezeCase,
  handleRevokeOrder,
  handleFreezeCore,
  handleGetQueues,
  handleGetWorkers,
  handleGetSwarm,
  handleBlockAgent,
  handleGetAnomalies,
  handleLiveness,
  handleReadiness,
  handleDeepHealth,
  handleConstitutionalHealth,
  handleLedgerHealth,
} from "./handlers/index";

// ─── Construir router con estado inyectado ────────────────────────────────────

export function buildRouter(state: CoreState = defaultState): Router {
  const router = new Router();

  // A. Orders
  router.post("/v1/core/orders",           handlePostOrder(state));
  router.get("/v1/core/orders/:trace_id",  handleGetOrder(state));

  // B. Cases
  router.get("/v1/core/cases/:case_id",                handleGetCase(state));
  router.post("/v1/core/cases/:case_id/freeze",        handleFreezeCase(state));

  // C. Governance
  router.post("/v1/core/governance/revoke",            handleRevokeOrder(state));
  router.post("/v1/core/governance/freeze_core",       handleFreezeCore(state));

  // D. Operational
  router.get("/v1/core/scheduler/queues",              handleGetQueues(state));
  router.get("/v1/core/executor/workers",              handleGetWorkers(state));
  router.get("/v1/core/swarm/nodes",                   handleGetSwarm(state));

  // E. Security
  router.post("/v1/core/security/block_agent",         handleBlockAgent(state));
  router.get("/v1/core/security/anomalies",            handleGetAnomalies(state));

  // F. Health
  router.get("/health/liveness",                       handleLiveness(state));
  router.get("/health/readiness",                      handleReadiness(state));
  router.get("/health/deep",                           handleDeepHealth(state));
  router.get("/health/constitutional",                 handleConstitutionalHealth(state));
  router.get("/health/ledger",                         handleLedgerHealth(state));

  return router;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

export function createServer(state: CoreState = defaultState): http.Server {
  const router = buildRouter(state);

  return http.createServer(async (req, res) => {
    // Parsear body JSON
    let body: Record<string, unknown> | null = null;
    if (["POST","PUT","PATCH"].includes(req.method ?? "")) {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString();
        body = raw ? JSON.parse(raw) : null;
      } catch { body = null; }
    }

    const url     = req.url ?? "/";
    const path    = url.split("?")[0];
    const query   = parseQuery(url);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers[k] = v;
    }

    const apiReq = {
      method:  req.method ?? "GET",
      path,
      params:  {},
      query,
      body,
      headers,
    };

    const apiRes = await router.dispatch(apiReq);

    res.setHeader("Content-Type", "application/json");
    for (const [k, v] of Object.entries(apiRes.headers ?? {})) res.setHeader(k, v);
    res.statusCode = apiRes.status;
    res.end(JSON.stringify(apiRes.body));
  });
}
