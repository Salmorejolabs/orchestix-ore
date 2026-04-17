import { expect } from "chai";
import { GraphBuilder } from "../../src/uacp/graph-builder";
import {
  getReadyNodes, isComplete, freezeBranch, hasDeadlock, graphStats,
} from "../../src/uacp/graph-engine";
import {
  UACPScheduler, MockAgentGateway, SimpleCircuitBreaker,
} from "../../src/uacp/scheduler";
import { executeEnvelope } from "../../src/uacp/index";
import { OcoOrchestrator } from "../../src/oco/orchestrator";
import { runAciCycle } from "../../src/aci/cycle";
import type { ExecutionEnvelope, ApprovedOrder } from "../../src/oco/types";
import type { CcsBlueprint } from "../../src/ccs/types";
import type { ExecutionGraph } from "../../src/uacp/types";

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
    root_policies: ["P1", "P2", "P3", "P4", "P6", "P7", "P8"],
    violations:    [],
  },
  created_by: "ACI",
};

function buildEnvelope(): ExecutionEnvelope {
  const oco    = new OcoOrchestrator({ environment: "dev", priority: 5 });
  const result = oco.processApprovedOrder(validOrder);
  if (!result.ok) throw new Error(`OCO error: ${result.message}`);
  return result.envelope;
}

function buildGraph(env: ExecutionEnvelope): ExecutionGraph {
  return new GraphBuilder().build(env, blueprint);
}

// ─── GRAPH ENGINE ─────────────────────────────────────────────────────────────

describe("UACP GraphEngine", () => {

  it("construye grafo con 3 nodos desde blueprint", () => {
    const env   = buildEnvelope();
    const graph = buildGraph(env);
    expect(graph.nodes.size).to.equal(3);
  });

  it("trace_id y token_id se propagan al grafo", () => {
    const env   = buildEnvelope();
    const graph = buildGraph(env);
    expect(graph.metadata.trace_id).to.match(/^trace_case_1_/);
    expect(graph.metadata.token_id).to.match(/^TOK-/);
  });

  it("solo t1 está listo al inicio (sin dependencias)", () => {
    const env   = buildEnvelope();
    const graph = buildGraph(env);
    const ready = getReadyNodes(graph);
    expect(ready.length).to.equal(1);
    expect(ready[0].node_id).to.equal("t1");
  });

  it("no está completo al inicio", () => {
    const env   = buildEnvelope();
    const graph = buildGraph(env);
    expect(isComplete(graph)).to.equal(false);
  });

  it("está completo cuando todos son COMPLETED", () => {
    const env   = buildEnvelope();
    const graph = buildGraph(env);
    for (const node of graph.nodes.values()) node.status = "COMPLETED";
    expect(isComplete(graph)).to.equal(true);
  });

  it("freezeBranch convierte PENDING en SKIPPED", () => {
    const env   = buildEnvelope();
    const graph = buildGraph(env);
    freezeBranch(graph);
    for (const node of graph.nodes.values()) {
      expect(node.status).to.equal("SKIPPED");
    }
  });

  it("hasDeadlock detecta situación de bloqueo", () => {
    const env   = buildEnvelope();
    const graph = buildGraph(env);
    // Simular t1 fallida sin completarse → t2 y t3 nunca estarán listos
    graph.nodes.get("t1")!.status = "FAILED";
    expect(hasDeadlock(graph)).to.equal(true);
  });

  it("graphStats cuenta nodos correctamente", () => {
    const env   = buildEnvelope();
    const graph = buildGraph(env);
    graph.nodes.get("t1")!.status = "COMPLETED";
    graph.nodes.get("t2")!.status = "FAILED";
    const stats = graphStats(graph);
    expect(stats.completed).to.equal(1);
    expect(stats.failed).to.equal(1);
    expect(stats.pending).to.equal(1);
    expect(stats.total).to.equal(3);
  });

});

// ─── SCHEDULER ────────────────────────────────────────────────────────────────

describe("UACP Scheduler", () => {

  it("ejecuta pipeline de 3 nodos en cadena y completa con éxito", async () => {
    const env       = buildEnvelope();
    const graph     = buildGraph(env);
    const scheduler = new UACPScheduler(new MockAgentGateway(), new SimpleCircuitBreaker());
    const result    = await scheduler.run(graph);
    expect(result.success).to.equal(true);
    expect(result.nodes_completed).to.equal(3);
    expect(result.nodes_failed).to.equal(0);
  });

  it("events contiene CASE_STARTED y CASE_COMPLETED", async () => {
    const env       = buildEnvelope();
    const graph     = buildGraph(env);
    const scheduler = new UACPScheduler(new MockAgentGateway(), new SimpleCircuitBreaker());
    const result    = await scheduler.run(graph);
    const types = result.events.map(e => e.event_type);
    expect(types).to.include("CASE_STARTED");
    expect(types).to.include("CASE_COMPLETED");
  });

  it("circuit breaker congela la rama tras umbral de violaciones", async () => {
    const env = buildEnvelope();
    const graph = buildGraph(env);

    // Gateway que lanza error de hard policy
    const failGateway: MockAgentGateway = {
      async execute() { throw new Error("p3 hard policy violated"); }
    } as unknown as MockAgentGateway;

    const cb        = new SimpleCircuitBreaker(1); // umbral 1
    const scheduler = new UACPScheduler(failGateway, cb);
    const result    = await scheduler.run(graph);

    expect(result.success).to.equal(false);
    const hasFrozen = result.events.some(e => e.event_type === "BRANCH_FROZEN");
    expect(hasFrozen).to.equal(true);
  });

  it("deadlock se detecta si deps fallidas bloquean el grafo", async () => {
    const env   = buildEnvelope();
    const graph = buildGraph(env);

    // Forzar t1 como FAILED directamente para crear deadlock
    graph.nodes.get("t1")!.status = "FAILED";

    const scheduler = new UACPScheduler(new MockAgentGateway(), new SimpleCircuitBreaker());
    const result    = await scheduler.run(graph);

    expect(result.success).to.equal(false);
    const hasDeadlockEvent = result.events.some(e => e.event_type === "DEADLOCK");
    expect(hasDeadlockEvent).to.equal(true);
  });

  it("trace_id del token OCO aparece en los eventos", async () => {
    const env       = buildEnvelope();
    const graph     = buildGraph(env);
    const scheduler = new UACPScheduler(new MockAgentGateway(), new SimpleCircuitBreaker());
    const result    = await scheduler.run(graph);
    const startEvt  = result.events.find(e => e.event_type === "CASE_STARTED");
    expect(startEvt?.extra.trace_id).to.match(/^trace_case_1_/);
  });

});

// ─── PIPELINE E2E: ACI → OCO → UACP ──────────────────────────────────────────

describe("Pipeline E2E: CCS → ACI → OCO → UACP", () => {

  it("pipeline completo produce UACPResult con success: true", async () => {
    // 1. ACI cycle (simulado con blueprint CCS)
    const aciResult = await runAciCycle(blueprint);
    expect(aciResult.status).to.equal("approved");

    // 2. OCO: ApprovedOrder → IntentionToken + ExecutionEnvelope
    const oco       = new OcoOrchestrator({ environment: "dev", priority: 5 });
    const ocoResult = oco.processApprovedOrder(validOrder);
    expect(ocoResult.ok).to.equal(true);
    if (!ocoResult.ok) return;

    // 3. UACP: ExecutionEnvelope → ejecución fractal
    const result = await executeEnvelope(ocoResult.envelope, blueprint);
    expect(result.success).to.equal(true);
    expect(result.nodes_completed).to.equal(3);
    expect(result.trace_id).to.equal(ocoResult.token.metadata.trace_id);
  });

  it("el trace_id de OCO fluye hasta UACP sin mutación", async () => {
    const oco       = new OcoOrchestrator({ environment: "dev", priority: 5 });
    const ocoResult = oco.processApprovedOrder(validOrder);
    if (!ocoResult.ok) throw new Error("OCO error");

    const result = await executeEnvelope(ocoResult.envelope, blueprint);
    expect(result.trace_id).to.equal(ocoResult.token.metadata.trace_id);
  });

  it("pipeline con blueprint de 1 tarea también funciona", async () => {
    const singleTaskBp: CcsBlueprint = {
      id:    "CASE-2",
      name:  "Single task",
      tasks: [{ id: "t1", name: "ping", owner: "agentA", justification: "ok", impact: ["low"] }],
      dependencies: [],
    };
    const order: ApprovedOrder = {
      ...validOrder,
      intent_id: "INT-20260416-002",
      case_id:   "CASE-2",
    };

    const oco       = new OcoOrchestrator({ environment: "dev", priority: 5 });
    const ocoResult = oco.processApprovedOrder(order);
    if (!ocoResult.ok) throw new Error("OCO error");

    const result = await executeEnvelope(ocoResult.envelope, singleTaskBp);
    expect(result.success).to.equal(true);
    expect(result.nodes_completed).to.equal(1);
  });

});
