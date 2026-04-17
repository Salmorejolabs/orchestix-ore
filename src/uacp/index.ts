/**
 * UACP v0.1 — Unified Agent Coordination Protocol
 * Punto de entrada público: executeEnvelope()
 *
 * Flujo completo:
 *   ExecutionEnvelope (de OCO) + CcsBlueprint
 *   → GraphBuilder → ExecutionGraph
 *   → UACPScheduler → UACPResult
 */

import type { ExecutionEnvelope } from "../oco/types";
import type { CcsBlueprint } from "../ccs/types";
import type { UACPResult } from "./types";
import { GraphBuilder } from "./graph-builder";
import { UACPScheduler, MockAgentGateway, SimpleCircuitBreaker } from "./scheduler";

export { GraphBuilder }                           from "./graph-builder";
export { UACPScheduler, MockAgentGateway, SimpleCircuitBreaker } from "./scheduler";
export { getReadyNodes, isComplete, freezeBranch, hasDeadlock, graphStats } from "./graph-engine";
export type {
  ExecutionNode, ExecutionGraph, NodeStatus,
  LedgerEvent, UACPResult, AgentDescriptor,
} from "./types";

// ─── Instancias por defecto ───────────────────────────────────────────────────

const _builder        = new GraphBuilder();
const _gateway        = new MockAgentGateway();
const _circuitBreaker = new SimpleCircuitBreaker(3);
const _scheduler      = new UACPScheduler(_gateway, _circuitBreaker);

/**
 * Ejecuta un ExecutionEnvelope de OCO contra un blueprint CCS.
 * Punto de entrada de alto nivel para el pipeline CCS→ACI→OCO→UACP.
 */
export async function executeEnvelope(
  envelope:  ExecutionEnvelope,
  blueprint: CcsBlueprint
): Promise<UACPResult> {
  const graph = _builder.build(envelope, blueprint);
  return _scheduler.run(graph);
}
