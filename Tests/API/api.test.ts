import { expect } from "chai";
import { buildRouter } from "../../src/core/api/server";
import { CoreState } from "../../src/core/api/core-state";
import { matchPath, parseQuery } from "../../src/core/api/router";
import { computeOrdHash } from "../../src/core/orders/validators";
import type { OrdJson } from "../../src/core/orders/types";
import type { ApiRequest } from "../../src/core/api/types";

// ─── Fixture: ORD canónico válido ─────────────────────────────────────────────

function validOrd(overrides: Partial<OrdJson> = {}): OrdJson {
  const base: Omit<OrdJson,"hash"|"signature"> = {
    trace_id:     "ROOT.SO.ORD.20260416T120000Z.TEST01",
    trace_parent: null,
    case_id:      "CASE-1",
    type:         "OA",
    priority:     7,
    source:       "did:example:agentA",
    target:       "did:example:agentB",
    payload:      { action: "analizar_documentos", params: {} },
    governance:   { P1_cost_max: 500, P2_timeout_ms: 30000, P3_ethics: "hard", P4_risk_max: 4 },
    ...overrides,
  };
  const hash = computeOrdHash(base);
  return { ...base, hash, signature: "ed25519:stubbedOk", ...overrides } as OrdJson;
}

function makeReq(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method:  "GET",
    path:    "/",
    params:  {},
    query:   {},
    body:    null,
    headers: {},
    ...overrides,
  };
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

describe("Router", () => {

  it("matchPath: coincide ruta exacta", () => {
    expect(matchPath("/v1/core/orders", "/v1/core/orders")).to.deep.equal({});
  });

  it("matchPath: extrae parámetros", () => {
    const r = matchPath("/v1/core/orders/:trace_id", "/v1/core/orders/ROOT.SO.ORD.20260416T120000Z.X1");
    expect(r).to.deep.equal({ trace_id: "ROOT.SO.ORD.20260416T120000Z.X1" });
  });

  it("matchPath: devuelve null si no coincide", () => {
    expect(matchPath("/v1/core/orders/:id", "/v1/core/cases/CASE-1")).to.equal(null);
  });

  it("matchPath: devuelve null si longitud diferente", () => {
    expect(matchPath("/v1/core/orders", "/v1/core/orders/extra")).to.equal(null);
  });

  it("parseQuery: extrae parámetros de query string", () => {
    const q = parseQuery("/health/deep?since=2026-01-01&limit=50");
    expect(q.since).to.equal("2026-01-01");
    expect(q.limit).to.equal("50");
  });

  it("parseQuery: devuelve {} sin query string", () => {
    expect(parseQuery("/health/liveness")).to.deep.equal({});
  });

  it("router: 404 para ruta desconocida", async () => {
    const state  = new CoreState();
    const router = buildRouter(state);
    const res    = await router.dispatch(makeReq({ method: "GET", path: "/unknown" }));
    expect(res.status).to.equal(404);
  });

});

// ─── A. ORDERS API ────────────────────────────────────────────────────────────

describe("A. Orders API", () => {

  let state:  CoreState;
  let router: ReturnType<typeof buildRouter>;

  beforeEach(() => {
    state  = new CoreState();
    router = buildRouter(state);
  });

  it("POST /v1/core/orders: 201 con ORD válido", async () => {
    const res = await router.dispatch(makeReq({
      method: "POST",
      path:   "/v1/core/orders",
      body:   validOrd(),
    }));
    expect(res.status).to.equal(201);
    const body = res.body as Record<string, unknown>;
    expect(body.state).to.equal("QUEUED");
    expect(body.trace_id).to.equal("ROOT.SO.ORD.20260416T120000Z.TEST01");
  });

  it("POST /v1/core/orders: 400 sin body", async () => {
    const res = await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: null }));
    expect(res.status).to.equal(400);
  });

  it("POST /v1/core/orders: 400 si trace_id con formato incorrecto", async () => {
    const ord = validOrd({ trace_id: "INVALID-TRACE" });
    ord.hash  = computeOrdHash({ ...ord, hash: "", signature: "" } as Omit<OrdJson,"hash"|"signature">);
    const res = await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: ord }));
    expect(res.status).to.equal(400);
    const body = res.body as Record<string, unknown>;
    expect(body.error_code).to.equal("ERR_ORD_015");
  });

  it("POST /v1/core/orders: 400 si hash no coincide", async () => {
    const ord = { ...validOrd(), hash: "sha256:" + "0".repeat(64) };
    const res = await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: ord }));
    expect(res.status).to.equal(400);
    const body = res.body as Record<string, unknown>;
    expect(body.error_code).to.equal("ERR_ORD_002");
  });

  it("POST /v1/core/orders: 403 si agente bloqueado", async () => {
    state.blockAgent("did:example:agentA", "test block", "SEC");
    const res = await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: validOrd() }));
    expect(res.status).to.equal(403);
  });

  it("POST /v1/core/orders: 409 si CASE congelado", async () => {
    state.freezeCase("CASE-1", "test", "DASHBOARD");
    const res = await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: validOrd() }));
    expect(res.status).to.equal(409);
  });

  it("POST /v1/core/orders: 503 si CORE congelado", async () => {
    state.freezeCore("emergency", "SEC");
    const res = await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: validOrd() }));
    expect(res.status).to.equal(503);
  });

  it("GET /v1/core/orders/:trace_id: 200 tras crear orden", async () => {
    await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: validOrd() }));
    const res = await router.dispatch(makeReq({
      method: "GET",
      path:   "/v1/core/orders/ROOT.SO.ORD.20260416T120000Z.TEST01",
      params: { trace_id: "ROOT.SO.ORD.20260416T120000Z.TEST01" },
    }));
    expect(res.status).to.equal(200);
    const body = res.body as Record<string, unknown>;
    expect(body.trace_id).to.equal("ROOT.SO.ORD.20260416T120000Z.TEST01");
    expect(body.history).to.be.an("array").with.length.greaterThan(0);
  });

  it("GET /v1/core/orders/:trace_id: 404 si no existe", async () => {
    const res = await router.dispatch(makeReq({
      method: "GET",
      path:   "/v1/core/orders/ROOT.SO.ORD.20260416T000000Z.GHOST",
      params: { trace_id: "ROOT.SO.ORD.20260416T000000Z.GHOST" },
    }));
    expect(res.status).to.equal(404);
  });

  it("POST /v1/core/orders: orden queda en Ledger", async () => {
    await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: validOrd() }));
    const events = state.ledger.queryByCase("CASE-1");
    expect(events.length).to.be.greaterThan(0);
    expect(events.some(e => e.event_type === "ORD_QUEUED")).to.equal(true);
  });

});

// ─── B. CASE API ──────────────────────────────────────────────────────────────

describe("B. Case API", () => {

  let state:  CoreState;
  let router: ReturnType<typeof buildRouter>;
  beforeEach(() => { state = new CoreState(); router = buildRouter(state); });

  it("GET /v1/core/cases/:case_id: 200 para CASE existente", async () => {
    const res = await router.dispatch(makeReq({ method: "GET", path: "/v1/core/cases/CASE-1", params: { case_id: "CASE-1" } }));
    expect(res.status).to.equal(200);
    const body = res.body as Record<string, unknown>;
    expect(body.case_id).to.equal("CASE-1");
    expect(body.frozen).to.equal(false);
  });

  it("GET /v1/core/cases/:case_id: 404 si no existe", async () => {
    const res = await router.dispatch(makeReq({ method: "GET", path: "/v1/core/cases/CASE-99", params: { case_id: "CASE-99" } }));
    expect(res.status).to.equal(404);
  });

  it("POST /v1/core/cases/:case_id/freeze: 202 con actor DASHBOARD", async () => {
    const res = await router.dispatch(makeReq({
      method: "POST",
      path:   "/v1/core/cases/CASE-1/freeze",
      params: { case_id: "CASE-1" },
      body:   { reason: "test freeze", actor: "DASHBOARD" },
    }));
    expect(res.status).to.equal(202);
    expect(state.getCase("CASE-1")?.frozen).to.equal(true);
  });

  it("POST /v1/core/cases/:case_id/freeze: 400 si ya congelado", async () => {
    state.freezeCase("CASE-1", "first", "SEC");
    const res = await router.dispatch(makeReq({
      method: "POST", path: "/v1/core/cases/CASE-1/freeze",
      params: { case_id: "CASE-1" }, body: { reason: "second", actor: "SEC" },
    }));
    expect(res.status).to.equal(400);
  });

  it("POST freeze case: 403 si actor no autorizado", async () => {
    const res = await router.dispatch(makeReq({
      method: "POST", path: "/v1/core/cases/CASE-1/freeze",
      params: { case_id: "CASE-1" }, body: { reason: "x", actor: "RANDOM_USER" },
    }));
    expect(res.status).to.equal(403);
  });

  it("freeze case genera CASE_FROZEN en Ledger", async () => {
    state.freezeCase("CASE-1", "test", "SEC");
    const events = state.ledger.queryByCase("CASE-1");
    expect(events.some(e => e.event_type === "CASE_FROZEN")).to.equal(true);
  });

});

// ─── C. GOVERNANCE API ────────────────────────────────────────────────────────

describe("C. Governance API", () => {

  let state:  CoreState;
  let router: ReturnType<typeof buildRouter>;
  beforeEach(() => { state = new CoreState(); router = buildRouter(state); });

  it("POST /v1/core/governance/revoke: 202 con orden activa", async () => {
    // Primero crear la orden
    await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: validOrd() }));

    const res = await router.dispatch(makeReq({
      method: "POST",
      path:   "/v1/core/governance/revoke",
      body:   { trace_id: "ROOT.SO.ORD.20260416T120000Z.TEST01", reason: "P3 violation", actor: "OCO" },
    }));
    expect(res.status).to.equal(202);
    const body = res.body as Record<string, unknown>;
    expect(body.state).to.equal("REVOKED");
  });

  it("POST /v1/core/governance/revoke: 400 si trace_id no existe", async () => {
    const res = await router.dispatch(makeReq({
      method: "POST", path: "/v1/core/governance/revoke",
      body:   { trace_id: "ROOT.SO.ORD.20260416T000000Z.GHOST", reason: "x", actor: "OCO" },
    }));
    expect(res.status).to.equal(404);
  });

  it("POST /v1/core/governance/revoke: 403 si actor no autorizado", async () => {
    await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: validOrd() }));
    const res = await router.dispatch(makeReq({
      method: "POST", path: "/v1/core/governance/revoke",
      body:   { trace_id: "ROOT.SO.ORD.20260416T120000Z.TEST01", reason: "x", actor: "NOBODY" },
    }));
    expect(res.status).to.equal(403);
  });

  it("POST /v1/core/governance/freeze_core: 202 con actor SEC", async () => {
    const res = await router.dispatch(makeReq({
      method: "POST", path: "/v1/core/governance/freeze_core",
      body:   { reason: "attack detected", actor: "SEC" },
    }));
    expect(res.status).to.equal(202);
    expect(state.coreFrozen).to.equal(true);
  });

  it("POST /v1/core/governance/freeze_core: 403 si actor no autorizado", async () => {
    const res = await router.dispatch(makeReq({
      method: "POST", path: "/v1/core/governance/freeze_core",
      body:   { reason: "x", actor: "RANDOM" },
    }));
    expect(res.status).to.equal(403);
    expect(state.coreFrozen).to.equal(false);
  });

  it("freeze_core genera CORE_FROZEN en Ledger", async () => {
    state.freezeCore("test", "SEC");
    const events = state.ledger.queryByCase("CORE");
    expect(events.some(e => e.event_type === "CORE_FROZEN")).to.equal(true);
  });

});

// ─── D. OPERATIONAL API ───────────────────────────────────────────────────────

describe("D. Operational API", () => {

  let router: ReturnType<typeof buildRouter>;
  beforeEach(() => { router = buildRouter(new CoreState()); });

  it("GET /v1/core/scheduler/queues: 200 con estructura correcta", async () => {
    const res  = await router.dispatch(makeReq({ method: "GET", path: "/v1/core/scheduler/queues" }));
    expect(res.status).to.equal(200);
    const body = res.body as Record<string, unknown>;
    expect(body.global).to.exist;
    expect(body.queues).to.exist;
  });

  it("GET /v1/core/executor/workers: 200 con workers", async () => {
    const res  = await router.dispatch(makeReq({ method: "GET", path: "/v1/core/executor/workers" }));
    expect(res.status).to.equal(200);
    const body = res.body as Record<string, unknown>;
    expect(body.total_workers).to.be.a("number");
  });

  it("GET /v1/core/swarm/nodes: 200 con swarms", async () => {
    const res  = await router.dispatch(makeReq({ method: "GET", path: "/v1/core/swarm/nodes" }));
    expect(res.status).to.equal(200);
    const body = res.body as Record<string, unknown>;
    expect(body.swarms).to.exist;
  });

});

// ─── E. SECURITY API ─────────────────────────────────────────────────────────

describe("E. Security API", () => {

  let state:  CoreState;
  let router: ReturnType<typeof buildRouter>;
  beforeEach(() => { state = new CoreState(); router = buildRouter(state); });

  it("POST /v1/core/security/block_agent: 202 con actor SEC", async () => {
    const res = await router.dispatch(makeReq({
      method: "POST", path: "/v1/core/security/block_agent",
      body:   { agent_id: "AGENT-42", reason: "sandbox violations", actor: "SEC" },
    }));
    expect(res.status).to.equal(202);
    expect(state.isBlocked("AGENT-42")).to.equal(true);
  });

  it("POST /v1/core/security/block_agent: 400 sin agent_id", async () => {
    const res = await router.dispatch(makeReq({
      method: "POST", path: "/v1/core/security/block_agent",
      body:   { reason: "x", actor: "SEC" },
    }));
    expect(res.status).to.equal(400);
  });

  it("POST /v1/core/security/block_agent: 403 si actor no autorizado", async () => {
    const res = await router.dispatch(makeReq({
      method: "POST", path: "/v1/core/security/block_agent",
      body:   { agent_id: "AGENT-42", reason: "x", actor: "RANDOM" },
    }));
    expect(res.status).to.equal(403);
    expect(state.isBlocked("AGENT-42")).to.equal(false);
  });

  it("GET /v1/core/security/anomalies: 200 con lista", async () => {
    state.addAnomaly({ timestamp: new Date().toISOString(), type: "signature_invalid", severity: "low", resolved: false });
    const res  = await router.dispatch(makeReq({ method: "GET", path: "/v1/core/security/anomalies" }));
    expect(res.status).to.equal(200);
    const body = res.body as Record<string, unknown>;
    expect((body.anomalies as unknown[]).length).to.equal(1);
  });

  it("block_agent genera AGENT_BLOCKED en Ledger", async () => {
    state.blockAgent("AGENT-42", "test", "SEC");
    const events = state.ledger.queryByCase("CORE");
    expect(events.some(e => e.event_type === "AGENT_BLOCKED")).to.equal(true);
  });

});

// ─── F. HEALTH API ────────────────────────────────────────────────────────────

describe("F. Health API", () => {

  let state:  CoreState;
  let router: ReturnType<typeof buildRouter>;
  beforeEach(() => { state = new CoreState(); router = buildRouter(state); });

  it("GET /health/liveness: 200 siempre", async () => {
    const res = await router.dispatch(makeReq({ method: "GET", path: "/health/liveness" }));
    expect(res.status).to.equal(200);
  });

  it("GET /health/readiness: 200 si CORE activo", async () => {
    const res = await router.dispatch(makeReq({ method: "GET", path: "/health/readiness" }));
    expect(res.status).to.equal(200);
  });

  it("GET /health/readiness: 503 si CORE congelado", async () => {
    state.freezeCore("test", "SEC");
    const res = await router.dispatch(makeReq({ method: "GET", path: "/health/readiness" }));
    expect(res.status).to.equal(503);
  });

  it("GET /health/deep: 200 con checks de salud", async () => {
    const res  = await router.dispatch(makeReq({ method: "GET", path: "/health/deep" }));
    expect(res.status).to.equal(200);
    const body = res.body as Record<string, unknown>;
    expect(body.status).to.equal("healthy");
    expect(body.checks).to.exist;
  });

  it("GET /health/constitutional: 200 con P1-P8", async () => {
    const res  = await router.dispatch(makeReq({ method: "GET", path: "/health/constitutional" }));
    expect(res.status).to.equal(200);
    const body = res.body as Record<string, unknown>;
    expect(body.all_pass).to.equal(true);
  });

  it("GET /health/ledger: 200 con stats del Ledger", async () => {
    const res  = await router.dispatch(makeReq({ method: "GET", path: "/health/ledger" }));
    expect(res.status).to.equal(200);
    const body = res.body as Record<string, unknown>;
    expect(body.status).to.equal("ok");
  });

});

// ─── INVARIANTES CONSTITUCIONALES ────────────────────────────────────────────

describe("Invariantes Constitucionales (API01-API08)", () => {

  let state:  CoreState;
  let router: ReturnType<typeof buildRouter>;
  beforeEach(() => { state = new CoreState(); router = buildRouter(state); });

  it("API01: toda orden aceptada pasa por validación estructural completa", async () => {
    // Orden con priority=0 (fuera de rango 1-10) es rechazada
    const bad = validOrd({ priority: 0 });
    bad.hash  = computeOrdHash({ ...bad, hash: "", signature: "" } as Omit<OrdJson,"hash"|"signature">);
    const res = await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: bad }));
    expect(res.status).to.equal(400);
  });

  it("API02: toda acción de gobernanza genera evento en Ledger", async () => {
    state.freezeCore("test", "SEC");
    const events = state.ledger.queryByCase("CORE");
    expect(events.some(e => e.event_type === "CORE_FROZEN")).to.equal(true);
  });

  it("API04: agente bloqueado no puede emitir órdenes (SEC interviene)", async () => {
    state.blockAgent("did:example:agentA", "blocked", "SEC");
    const res = await router.dispatch(makeReq({ method: "POST", path: "/v1/core/orders", body: validOrd() }));
    expect(res.status).to.equal(403);
  });

  it("API08: todos los endpoints están versionados bajo /v1/core o /health", () => {
    const routes = buildRouter(new CoreState()).routes_list();
    const allVersioned = routes.every(r =>
      r.includes("/v1/core/") || r.includes("/health/")
    );
    expect(allVersioned).to.equal(true);
  });

  it("APIINV08: /health/liveness responde aunque el CORE esté congelado", async () => {
    state.freezeCore("emergency", "SEC");
    const res = await router.dispatch(makeReq({ method: "GET", path: "/health/liveness" }));
    expect(res.status).to.equal(200);
  });

});
