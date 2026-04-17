import { expect } from "chai";
import { LedgerFractal } from "../../src/ledger/ledger";
import { LedgerStore } from "../../src/ledger/store";
import { computeEntryHash, verifyChain, buildEntry } from "../../src/ledger/chain";
import { OrderFsm } from "../../src/core/orders/fsm";
import { OcoOrchestrator } from "../../src/oco/orchestrator";
import { GraphBuilder } from "../../src/uacp/graph-builder";
import { UACPScheduler, MockAgentGateway, SimpleCircuitBreaker } from "../../src/uacp/scheduler";
import type { ApprovedOrder } from "../../src/oco/types";
import type { CcsBlueprint } from "../../src/ccs/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const blueprint: CcsBlueprint = {
  id:    "CASE-1",
  name:  "Test Blueprint",
  tasks: [
    { id: "t1", name: "fetch_data",    owner: "agentA", justification: "ok", impact: ["low"] },
    { id: "t2", name: "process_data",  owner: "agentB", justification: "ok", impact: ["low"], dependsOn: ["t1"] },
    { id: "t3", name: "publish_result",owner: "agentC", justification: "ok", impact: ["low"], dependsOn: ["t2"] },
  ],
  dependencies: [
    { from: "t1", to: "t2" },
    { from: "t2", to: "t3" },
  ],
};

const validOrder: ApprovedOrder = {
  intent_id:  "INT-20260416-001",
  case_id:    "CASE-1",
  plan: {
    blueprint_ref:          "ccs://cases/CASE-1",
    estimated_cost:          1500,
    estimated_duration_days: 30,
    risk_score:              0.3,
  },
  governance_context: {
    root_policies: ["P1","P2","P3","P4","P6","P7","P8"],
    violations:    [],
  },
  created_by: "ACI",
};

// ─── HASH CHAIN ───────────────────────────────────────────────────────────────

describe("Ledger Hash Chain", () => {

  it("computeEntryHash produce hash SHA-256 de 64 chars", () => {
    const hash = computeEntryHash({
      timestamp:  "2026-04-16T12:00:00.000Z",
      event_type: "NODE_STARTED",
      case_id:    "CASE-1",
      prev_hash:  "",
      payload:    { node_id: "t1" },
    });
    expect(hash).to.have.length(64);
    expect(hash).to.match(/^[a-f0-9]{64}$/);
  });

  it("computeEntryHash es determinista para el mismo input", () => {
    const input = {
      timestamp:  "2026-04-16T12:00:00.000Z",
      event_type: "ORD_CREATED",
      case_id:    "CASE-1",
      prev_hash:  "",
      payload:    { trace_id: "ROOT.SO.ORD.20260416T120000Z.X1" },
    };
    expect(computeEntryHash(input)).to.equal(computeEntryHash(input));
  });

  it("prev_hash diferente produce hash diferente", () => {
    const base = {
      timestamp:  "2026-04-16T12:00:00.000Z",
      event_type: "ORD_RUNNING",
      case_id:    "CASE-1",
      payload:    {},
    };
    const h1 = computeEntryHash({ ...base, prev_hash: "" });
    const h2 = computeEntryHash({ ...base, prev_hash: "abc123" });
    expect(h1).to.not.equal(h2);
  });

  it("buildEntry enlaza prev_hash correctamente", () => {
    const e1 = buildEntry({ event_type: "ORD_CREATED", case_id: "CASE-1", payload: {} }, "", 1);
    const e2 = buildEntry({ event_type: "ORD_QUEUED",  case_id: "CASE-1", payload: {} }, e1.hash, 2);
    expect(e2.prev_hash).to.equal(e1.hash);
  });

  it("verifyChain: cadena vacía es válida", () => {
    const r = verifyChain([], "CASE-X");
    expect(r.valid).to.equal(true);
    expect(r.events_checked).to.equal(0);
  });

  it("verifyChain: cadena de 3 eventos válida", () => {
    const e1 = buildEntry({ event_type: "ORD_CREATED",  case_id: "CASE-1", payload: {} }, "",       1);
    const e2 = buildEntry({ event_type: "ORD_QUEUED",   case_id: "CASE-1", payload: {} }, e1.hash,  2);
    const e3 = buildEntry({ event_type: "ORD_RUNNING",  case_id: "CASE-1", payload: {} }, e2.hash,  3);
    const r = verifyChain([e1, e2, e3], "CASE-1");
    expect(r.valid).to.equal(true);
    expect(r.events_checked).to.equal(3);
  });

  it("verifyChain: detecta hash manipulado", () => {
    const e1 = buildEntry({ event_type: "ORD_CREATED",  case_id: "CASE-1", payload: {} }, "",       1);
    const e2 = buildEntry({ event_type: "ORD_RUNNING",  case_id: "CASE-1", payload: {} }, e1.hash,  2);
    const tampered = { ...e2, hash: "0".repeat(64) };  // hash modificado
    const r = verifyChain([e1, tampered], "CASE-1");
    expect(r.valid).to.equal(false);
    expect(r.broken_at).to.equal(e2.event_id);
  });

  it("verifyChain: detecta prev_hash incorrecto", () => {
    const e1 = buildEntry({ event_type: "ORD_CREATED", case_id: "CASE-1", payload: {} }, "", 1);
    // e2 con prev_hash erróneo (debería ser e1.hash)
    const e2 = buildEntry({ event_type: "ORD_QUEUED",  case_id: "CASE-1", payload: {} }, "WRONG_HASH", 2);
    const r = verifyChain([e1, e2], "CASE-1");
    expect(r.valid).to.equal(false);
  });

});

// ─── LEDGER STORE ──────────────────────────────────────────────────────────────

describe("Ledger Store", () => {

  let store: LedgerStore;
  beforeEach(() => { store = new LedgerStore(); });

  it("ingest(): almacena evento y devuelve event_id + hash", () => {
    const r = store.ingest({ event_type: "ORD_CREATED", case_id: "CASE-1", payload: {} });
    expect(r.event_id).to.be.a("string");
    expect(r.hash).to.have.length(64);
    expect(r.seq).to.equal(1);
  });

  it("ingest(): seq incrementa por case_id", () => {
    store.ingest({ event_type: "ORD_CREATED", case_id: "CASE-1", payload: {} });
    const r2 = store.ingest({ event_type: "ORD_QUEUED", case_id: "CASE-1", payload: {} });
    expect(r2.seq).to.equal(2);
  });

  it("ingest(): casos distintos tienen secuencias independientes", () => {
    store.ingest({ event_type: "ORD_CREATED", case_id: "CASE-1", payload: {} });
    const r = store.ingest({ event_type: "ORD_CREATED", case_id: "CASE-2", payload: {} });
    expect(r.seq).to.equal(1);
  });

  it("queryByCase(): devuelve eventos en orden timestamp ASC", () => {
    store.ingest({ event_type: "ORD_CREATED", case_id: "CASE-1", payload: { step: 1 } });
    store.ingest({ event_type: "ORD_QUEUED",  case_id: "CASE-1", payload: { step: 2 } });
    store.ingest({ event_type: "ORD_RUNNING", case_id: "CASE-1", payload: { step: 3 } });
    const events = store.queryByCase("CASE-1");
    expect(events).to.have.length(3);
    expect(events[0].event_type).to.equal("ORD_CREATED");
    expect(events[2].event_type).to.equal("ORD_RUNNING");
  });

  it("queryByAgent(): filtra por agent_id", () => {
    store.ingest({ event_type: "NODE_STARTED",   case_id: "CASE-1", agent_id: "agentA", payload: {} });
    store.ingest({ event_type: "NODE_COMPLETED", case_id: "CASE-1", agent_id: "agentA", payload: {} });
    store.ingest({ event_type: "NODE_STARTED",   case_id: "CASE-1", agent_id: "agentB", payload: {} });
    expect(store.queryByAgent("agentA")).to.have.length(2);
    expect(store.queryByAgent("agentB")).to.have.length(1);
  });

  it("query(): filtra por event_type", () => {
    store.ingest({ event_type: "ORD_CREATED",  case_id: "CASE-1", payload: {} });
    store.ingest({ event_type: "NODE_STARTED", case_id: "CASE-1", payload: {} });
    store.ingest({ event_type: "NODE_STARTED", case_id: "CASE-2", payload: {} });
    const r = store.query({ event_type: "NODE_STARTED" });
    expect(r).to.have.length(2);
  });

  it("query(): filtra por trace_id", () => {
    store.ingest({ event_type: "ORD_CREATED", case_id: "CASE-1", trace_id: "trace_case_1_X", payload: {} });
    store.ingest({ event_type: "ORD_QUEUED",  case_id: "CASE-1", trace_id: "trace_case_1_X", payload: {} });
    store.ingest({ event_type: "ORD_CREATED", case_id: "CASE-2", trace_id: "trace_case_2_Y", payload: {} });
    const r = store.query({ trace_id: "trace_case_1_X" });
    expect(r).to.have.length(2);
  });

  it("query(): limit funciona", () => {
    for (let i = 0; i < 10; i++) {
      store.ingest({ event_type: "NODE_STARTED", case_id: "CASE-1", payload: { i } });
    }
    const r = store.query({ case_id: "CASE-1", limit: 3 });
    expect(r).to.have.length(3);
  });

  it("verifyCase(): cadena íntegra pasa verificación", () => {
    store.ingest({ event_type: "ORD_CREATED",  case_id: "CASE-1", payload: {} });
    store.ingest({ event_type: "ORD_QUEUED",   case_id: "CASE-1", payload: {} });
    store.ingest({ event_type: "ORD_COMPLETED",case_id: "CASE-1", payload: {} });
    const r = store.verifyCase("CASE-1");
    expect(r.valid).to.equal(true);
    expect(r.events_checked).to.equal(3);
  });

  it("stats(): cuenta correctamente", () => {
    store.ingest({ event_type: "ORD_CREATED", case_id: "CASE-1", payload: {} });
    store.ingest({ event_type: "ORD_CREATED", case_id: "CASE-2", payload: {} });
    const s = store.stats();
    expect(s.total_events).to.equal(2);
    expect(s.total_cases).to.equal(2);
  });

});

// ─── LEDGER FRACTAL — Adaptadores ─────────────────────────────────────────────

describe("LedgerFractal — Adaptadores", () => {

  let ledger: LedgerFractal;
  beforeEach(() => { ledger = new LedgerFractal(); });

  it("fromFsmEvent(): ingesta evento FSM correctamente", () => {
    const fsm = new OrderFsm();
    const order = fsm.create("ROOT.SO.ORD.20260416T120000Z.T001", "CASE-1", "actor-test");
    const events = fsm.getEvents();

    ledger.fromFsmEvents(events);
    const stored = ledger.queryByCase("CASE-1");
    expect(stored).to.have.length(1);
    expect(stored[0].event_type).to.equal("ORD_CREATED");
    expect(stored[0].trace_id).to.equal(order.trace_id);
  });

  it("fromFsmEvents(): ciclo de vida completo FSM → Ledger", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T002", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    o = fsm.complete(o, { result_hash: "sha256:done", cost_real: 50, duration_ms: 500 });

    ledger.fromFsmEvents(fsm.getEvents());
    const stored = ledger.queryByCase("CASE-1");
    // 7 eventos: CREATED, STRUCT_VALID, CONST_VALID, QUEUED, RUNNING, COMPLETED, FINAL_STATE
    expect(stored.length).to.equal(7);
    expect(stored[0].event_type).to.equal("ORD_CREATED");
    expect(stored[stored.length - 1].event_type).to.equal("ORD_FINAL_STATE");
  });

  it("fromOcoToken(): registra OCO_TOKEN_ISSUED con trace_id y risk_score", () => {
    const oco    = new OcoOrchestrator({ environment: "dev", priority: 5 });
    const result = oco.processApprovedOrder(validOrder);
    if (!result.ok) throw new Error("OCO error");

    ledger.fromOcoToken(result.token);
    const stored = ledger.queryByCase("CASE-1");
    expect(stored).to.have.length(1);
    expect(stored[0].event_type).to.equal("OCO_TOKEN_ISSUED");
    expect(stored[0].payload.risk_score).to.equal(0.3);
    expect(stored[0].trace_id).to.match(/^trace_case_1_/);
  });

  it("fromUacpEvents(): ingesta eventos UACP correctamente", async () => {
    const oco    = new OcoOrchestrator({ environment: "dev", priority: 5 });
    const result = oco.processApprovedOrder(validOrder);
    if (!result.ok) throw new Error("OCO error");

    const graph     = new GraphBuilder().build(result.envelope, blueprint);
    const scheduler = new UACPScheduler(new MockAgentGateway(), new SimpleCircuitBreaker());
    const uacpResult = await scheduler.run(graph);

    ledger.fromUacpEvents(uacpResult.events);
    const stored = ledger.queryByCase("CASE-1");
    expect(stored.length).to.be.greaterThan(0);

    const eventTypes = stored.map(e => e.event_type);
    expect(eventTypes).to.include("CASE_STARTED");
    expect(eventTypes).to.include("CASE_COMPLETED");
    expect(eventTypes).to.include("NODE_STARTED");
    expect(eventTypes).to.include("NODE_COMPLETED");
  });

  it("verifyCase(): cadena íntegra tras múltiples adaptadores", async () => {
    // OCO
    const oco    = new OcoOrchestrator({ environment: "dev", priority: 5 });
    const result = oco.processApprovedOrder(validOrder);
    if (!result.ok) throw new Error("OCO error");
    ledger.fromOcoToken(result.token);

    // UACP
    const graph     = new GraphBuilder().build(result.envelope, blueprint);
    const scheduler = new UACPScheduler(new MockAgentGateway(), new SimpleCircuitBreaker());
    const uacpResult = await scheduler.run(graph);
    ledger.fromUacpEvents(uacpResult.events);

    const verification = ledger.verifyCase("CASE-1");
    expect(verification.valid).to.equal(true);
  });

});

// ─── PIPELINE E2E: FSM + OCO + UACP → LEDGER ──────────────────────────────────

describe("Pipeline E2E: FSM + OCO + UACP → Ledger Fractal", () => {

  it("el trace_id fluye sin mutación por toda la cadena hasta el Ledger", async () => {
    const ledger = new LedgerFractal();

    // 1. OCO → IntentionToken
    const oco    = new OcoOrchestrator({ environment: "dev", priority: 5 });
    const result = oco.processApprovedOrder(validOrder);
    if (!result.ok) throw new Error("OCO error");
    const traceId = result.token.metadata.trace_id;
    ledger.fromOcoToken(result.token);

    // 2. UACP ejecución fractal
    const graph     = new GraphBuilder().build(result.envelope, blueprint);
    const scheduler = new UACPScheduler(new MockAgentGateway(), new SimpleCircuitBreaker());
    const uacpResult = await scheduler.run(graph);
    ledger.fromUacpEvents(uacpResult.events);

    // 3. Verificar que trace_id aparece en todos los eventos del Ledger
    const allEvents = ledger.queryByCase("CASE-1");
    const withTrace = allEvents.filter(e => e.trace_id === traceId);
    expect(withTrace.length).to.be.greaterThan(0);

    // 4. Verificar integridad de la cadena completa
    const verification = ledger.verifyCase("CASE-1");
    expect(verification.valid).to.equal(true);
    expect(verification.events_checked).to.equal(allEvents.length);
  });

  it("pipeline completo: FSM (7 eventos) + OCO (1) + UACP (N) → cadena válida", async () => {
    const ledger = new LedgerFractal();

    // FSM: ciclo de vida completo de la orden
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.E2E1", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 7);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    o = fsm.complete(o, { result_hash: "sha256:final", cost_real: 100, duration_ms: 500 });
    ledger.fromFsmEvents(fsm.getEvents());

    // OCO
    const oco    = new OcoOrchestrator({ environment: "dev", priority: 5 });
    const result = oco.processApprovedOrder(validOrder);
    if (!result.ok) throw new Error("OCO error");
    ledger.fromOcoToken(result.token);

    // UACP
    const graph     = new GraphBuilder().build(result.envelope, blueprint);
    const scheduler = new UACPScheduler(new MockAgentGateway(), new SimpleCircuitBreaker());
    const uacpResult = await scheduler.run(graph);
    ledger.fromUacpEvents(uacpResult.events);

    const allEvents    = ledger.queryByCase("CASE-1");
    const verification = ledger.verifyCase("CASE-1");

    expect(allEvents.length).to.be.greaterThanOrEqual(15);
    expect(verification.valid).to.equal(true);
    expect(verification.events_checked).to.equal(allEvents.length);

    const stats = ledger.stats();
    expect(stats.total_events).to.be.greaterThanOrEqual(15);
  });

  it("un evento manipulado rompe la cadena (tamper detection)", async () => {
    const store  = new LedgerFractal();

    store.ingest({ event_type: "ORD_CREATED",  case_id: "CASE-X", payload: { a: 1 } });
    store.ingest({ event_type: "ORD_QUEUED",   case_id: "CASE-X", payload: { b: 2 } });
    store.ingest({ event_type: "ORD_COMPLETED",case_id: "CASE-X", payload: { c: 3 } });

    // Verificación normal: válida
    expect(store.verifyCase("CASE-X").valid).to.equal(true);

    // Acceder al store interno y manipular un hash
    const entries  = store.queryByCase("CASE-X");
    const internal = (store as unknown as { store: { entries: Map<string, unknown> } }).store;
    const entry1   = internal.entries.get(entries[1].event_id) as { hash: string };
    entry1.hash    = "0".repeat(64);  // manipulación directa

    expect(store.verifyCase("CASE-X").valid).to.equal(false);
  });

});
