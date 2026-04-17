import { expect } from "chai";
import { validateStructural, computeOrdHash, ActionRegistry } from "../../src/core/orders/validators";
import { OrderFsm, FsmError } from "../../src/core/orders/fsm";
import { TERMINAL_ORDER_STATES } from "../../src/core/orders/types";
import type { OrdJson, Order } from "../../src/core/orders/types";

// ─── Fixture: ORD canónico válido ─────────────────────────────────────────────

function buildOrd(overrides: Partial<OrdJson> = {}): OrdJson {
  const base: Omit<OrdJson, "hash" | "signature"> = {
    trace_id:     "ROOT.SO.ORD.20260416T120000Z.ABC123",
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
  return { ...base, hash, signature: "ed25519:stubbedSignature123", ...overrides } as OrdJson;
}

function validOrd(): OrdJson {
  return buildOrd();
}

// ─── VALIDATORS V01-V08 ───────────────────────────────────────────────────────

describe("Order Validators V01–V08", () => {

  it("V01: pasa con ORD completo", () => {
    expect(validateStructural(validOrd()).ok).to.equal(true);
  });

  it("V01: falla si falta trace_id", () => {
    const { trace_id: _, ...bad } = validOrd();
    const r = validateStructural(bad as Partial<OrdJson>);
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_001");
  });

  it("V01: falla si falta governance.P1_cost_max", () => {
    const bad = validOrd();
    (bad.governance as Record<string, unknown>).P1_cost_max = undefined;
    const r = validateStructural(bad);
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_001");
  });

  it("V02: falla si priority fuera de rango", () => {
    const bad = buildOrd({ priority: 15 });
    bad.hash = computeOrdHash({ ...bad, hash: "", signature: "" } as Omit<OrdJson, "hash"|"signature">);
    const r = validateStructural(bad);
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_014");
  });

  it("V02: falla si P4_risk_max fuera de rango", () => {
    const bad = buildOrd({ governance: { P1_cost_max: 500, P2_timeout_ms: 30000, P3_ethics: "hard", P4_risk_max: 11 } });
    const r = validateStructural(bad);
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_008");
  });

  it("V02: falla si type no es válido", () => {
    const bad = buildOrd({ type: "INVALID" as OrdJson["type"] });
    bad.hash = computeOrdHash({ ...bad, hash: "", signature: "" } as Omit<OrdJson, "hash"|"signature">);
    const r = validateStructural(bad);
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_014");
  });

  it("V03: falla si trace_id tiene formato incorrecto", () => {
    const bad = buildOrd({ trace_id: "INVALID-TRACE-ID" });
    bad.hash = computeOrdHash({ ...bad, hash: "", signature: "" } as Omit<OrdJson, "hash"|"signature">);
    const r = validateStructural(bad);
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_015");
  });

  it("V04: falla si case_id tiene formato incorrecto", () => {
    const bad = buildOrd({ case_id: "case-one" });
    bad.hash = computeOrdHash({ ...bad, hash: "", signature: "" } as Omit<OrdJson, "hash"|"signature">);
    const r = validateStructural(bad);
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_016");
  });

  it("V05: falla si trace_parent tiene formato incorrecto", () => {
    const bad = buildOrd({ trace_parent: "bad-parent" });
    bad.hash = computeOrdHash({ ...bad, hash: "", signature: "" } as Omit<OrdJson, "hash"|"signature">);
    const r = validateStructural(bad);
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_015");
  });

  it("V05: acepta trace_parent nulo", () => {
    const ord = validOrd();
    expect(validateStructural({ ...ord, trace_parent: null }).ok).to.equal(true);
  });

  it("V06: falla si el hash no coincide", () => {
    const ord = validOrd();
    const tampered = { ...ord, hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000" };
    const r = validateStructural(tampered);
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_002");
  });

  it("V07: falla si signature no tiene prefijo válido", () => {
    const ord = validOrd();
    const r = validateStructural({ ...ord, signature: "rsa:badSignature" });
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_003");
  });

  it("V08: falla si action no está en el registry", () => {
    const registry = new ActionRegistry(["only_this_action"]);
    const r = validateStructural(validOrd(), registry);
    expect(r.ok).to.equal(false);
    expect(r.error_code).to.equal("ERR_ORD_006");
  });

  it("V08: acepta action registrada dinámicamente", () => {
    const registry = new ActionRegistry([]);
    registry.register("analizar_documentos");
    expect(validateStructural(validOrd(), registry).ok).to.equal(true);
  });

});

// ─── FSM ─────────────────────────────────────────────────────────────────────

describe("Order FSM", () => {

  function makeOrder(): Order {
    const fsm = new OrderFsm();
    return fsm.create("ROOT.SO.ORD.20260416T120000Z.ABC123", "CASE-1", "test-actor");
  }

  it("create(): estado inicial CREATED", () => {
    const fsm = new OrderFsm();
    const order = fsm.create("ROOT.SO.ORD.20260416T120000Z.T001", "CASE-1");
    expect(order.state).to.equal("CREATED");
  });

  it("create(): emite evento ORD_CREATED", () => {
    const fsm = new OrderFsm();
    fsm.create("ROOT.SO.ORD.20260416T120000Z.T002", "CASE-1");
    expect(fsm.getEvents()[0].event).to.equal("ORD_CREATED");
  });

  it("CREATED → STRUCTURALLY_VALID", () => {
    const fsm = new OrderFsm();
    const o1 = fsm.create("ROOT.SO.ORD.20260416T120000Z.T003", "CASE-1");
    const o2 = fsm.markStructurallyValid(o1, ["V01","V02","V03","V04","V05","V06","V07","V08"]);
    expect(o2.state).to.equal("STRUCTURALLY_VALID");
  });

  it("STRUCTURALLY_VALID → CONSTITUTIONALLY_VALID", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T004", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o, ["P1","P2","P3","P4","P5","P6","P7","P8"]);
    expect(o.state).to.equal("CONSTITUTIONALLY_VALID");
  });

  it("CONSTITUTIONALLY_VALID → QUEUED", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T005", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "CASE-1-queue", 7);
    expect(o.state).to.equal("QUEUED");
  });

  it("QUEUED → RUNNING", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T006", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "worker-01", executor_id: "exec-01" });
    expect(o.state).to.equal("RUNNING");
    expect(o.worker_id).to.equal("worker-01");
  });

  it("RUNNING → COMPLETED (dentro de límites)", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T007", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    o = fsm.complete(o, { result_hash: "sha256:abc", cost_real: 100, duration_ms: 1000 });
    expect(o.state).to.equal("COMPLETED");
    expect(TERMINAL_ORDER_STATES.has(o.state)).to.equal(true);
  });

  it("RUNNING → FAILED si cost_real > P1_cost_max", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T008", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    expect(() => fsm.complete(o, { result_hash: "sha256:abc", cost_real: 99999, duration_ms: 100 }))
      .to.throw(FsmError).with.property("code", "ERR_ORD_017");
  });

  it("RUNNING → FAILED si duration_ms > P2_timeout_ms", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T009", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    expect(() => fsm.complete(o, { result_hash: "sha256:abc", cost_real: 10, duration_ms: 999999 }))
      .to.throw(FsmError).with.property("code", "ERR_ORD_018");
  });

  it("RUNNING → FAILED (error fatal)", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T010", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    o = fsm.fail(o, { error_code: "ERR_ORD_017", reason: "cost exceeded" });
    expect(o.state).to.equal("FAILED");
  });

  it("QUEUED → CANCELLED", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T011", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.cancel(o, { actor: "DASHBOARD", reason: "user request" });
    expect(o.state).to.equal("CANCELLED");
  });

  it("RUNNING → REVOKED (violación política)", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T012", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    o = fsm.revoke(o, { actor: "OCO", violated_policy: "P3", reason: "ethics violation" });
    expect(o.state).to.equal("REVOKED");
  });

  it("RUNNING → FROZEN (investigación)", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T013", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    o = fsm.freeze(o, { actor: "SEC", reason: "anomaly detected", investigation_id: "INV-001" });
    expect(o.state).to.equal("FROZEN");
  });

  it("estado terminal: no se puede transicionar desde COMPLETED", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T014", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    o = fsm.complete(o, { result_hash: "sha256:abc", cost_real: 10, duration_ms: 100 });
    expect(() => fsm.cancel(o, { actor: "X", reason: "test" }))
      .to.throw(FsmError).with.property("code", "FSM_000");
  });

  it("transición inválida lanza FsmError con código correcto", () => {
    const fsm = new OrderFsm();
    const o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T015", "CASE-1");
    expect(() => fsm.markConstitutionallyValid(o))
      .to.throw(FsmError).with.property("code", "FSM_002");
  });

  it("ciclo de vida completo genera eventos Ledger en orden", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T016", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    o = fsm.complete(o, { result_hash: "sha256:done", cost_real: 50, duration_ms: 500 });
    const events = fsm.getEvents().map(e => e.event);
    expect(events).to.deep.equal([
      "ORD_CREATED", "ORD_STRUCTURALLY_VALID", "ORD_CONSTITUTIONALLY_VALID",
      "ORD_QUEUED", "ORD_RUNNING", "ORD_COMPLETED", "ORD_FINAL_STATE",
    ]);
  });

  it("RUNNING → WAITING → RUNNING (subórdenes)", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T017", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.enqueue(o, "q", 5);
    o = fsm.startRunning(o, { worker_id: "w1", executor_id: "e1" });
    o = fsm.waitForSuborders(o, { reason: "suborders_created", suborders_count: 3 });
    expect(o.state).to.equal("WAITING");
    o = fsm.resumeFromWaiting(o);
    expect(o.state).to.equal("RUNNING");
  });

  it("CONSTITUTIONALLY_VALID → MUTATED", () => {
    const fsm = new OrderFsm();
    let o = fsm.create("ROOT.SO.ORD.20260416T120000Z.T018", "CASE-1");
    o = fsm.markStructurallyValid(o);
    o = fsm.markConstitutionallyValid(o);
    o = fsm.mutate(o, "ROOT.SO.ORD.20260416T120001Z.XYZ999", { payload: { action: "calcular" } });
    expect(o.state).to.equal("MUTATED");
  });

});
