/**
 * UACP Scheduler v0.1
 * Bucle principal de ejecución fractal.
 * En v0.1: agente mock determinista (AgentGateway real en v1.0).
 * Fuente: Sección 6.5, Volumen III.
 */

import type { ExecutionGraph, ExecutionNode, LedgerEvent, UACPResult } from "./types";
import {
  getReadyNodes,
  isComplete,
  freezeBranch,
  hasDeadlock,
  graphStats,
} from "./graph-engine";

// ─── Interfaces de dependencias (inyectables) ─────────────────────────────────

export interface AgentGateway {
  execute(node: ExecutionNode): Promise<Record<string, unknown>>;
}

export interface CircuitBreakerManager {
  isFrozen(caseId: string): boolean;
  recordViolation(caseId: string): void;
  violationCount(caseId: string): number;
}

// ─── Mock AgentGateway (para tests y demo sin agentes reales) ─────────────────

export class MockAgentGateway implements AgentGateway {
  async execute(node: ExecutionNode): Promise<Record<string, unknown>> {
    // Simula latencia de 0ms y devuelve resultado determinista
    return {
      node_id: node.node_id,
      action:  node.action,
      status:  "ok",
      mock:    true,
    };
  }
}

// ─── Mock CircuitBreaker (threshold: 3 violaciones) ──────────────────────────

export class SimpleCircuitBreaker implements CircuitBreakerManager {
  private violations = new Map<string, number>();
  private readonly threshold: number;

  constructor(threshold = 3) {
    this.threshold = threshold;
  }

  isFrozen(caseId: string): boolean {
    return (this.violations.get(caseId) ?? 0) >= this.threshold;
  }

  recordViolation(caseId: string): void {
    this.violations.set(caseId, (this.violations.get(caseId) ?? 0) + 1);
  }

  violationCount(caseId: string): number {
    return this.violations.get(caseId) ?? 0;
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export class UACPScheduler {
  private events: LedgerEvent[] = [];

  constructor(
    private readonly gateway:        AgentGateway,
    private readonly circuitBreaker: CircuitBreakerManager,
    private readonly maxConcurrent = 10
  ) {}

  /**
   * Ejecuta el grafo completo de forma fractal con paralelismo real.
   */
  async run(graph: ExecutionGraph): Promise<UACPResult> {
    const startTime = Date.now();
    this.events = [];

    this.recordEvent("CASE_STARTED", graph.case_id, undefined, {
      trace_id: graph.metadata.trace_id,
      token_id: graph.metadata.token_id,
    });

    try {
      while (!isComplete(graph)) {
        // Circuit breaker: congelar si hay demasiadas violaciones
        if (this.circuitBreaker.isFrozen(graph.case_id)) {
          freezeBranch(graph);
          this.recordEvent("BRANCH_FROZEN", graph.case_id, undefined, {
            reason:    "circuit_breaker",
            violations: this.circuitBreaker.violationCount(graph.case_id),
          });
          break;
        }

        const readyNodes = getReadyNodes(graph);

        // Deadlock: nodos pendientes sin dependencias satisfacibles
        if (readyNodes.length === 0 && !isComplete(graph)) {
          if (hasDeadlock(graph)) {
            const pending = [...graph.nodes.values()]
              .filter(n => n.status === "PENDING")
              .map(n => n.node_id);
            this.recordEvent("DEADLOCK", graph.case_id, undefined, { pending_nodes: pending });
            break;
          }
          break; // todos en RUNNING — esperar
        }

        // Ejecutar en paralelo (respetando max concurrencia)
        const batch = readyNodes.slice(0, this.maxConcurrent);
        await Promise.all(batch.map(node => this._executeNode(graph, node)));
      }
    } catch (e) {
      this.recordEvent("CASE_FAILED", graph.case_id, undefined, {
        error:    (e as Error).message,
        trace_id: graph.metadata.trace_id,
      });
      return this._buildResult(graph, startTime, false);
    }

    const stats = graphStats(graph);
    const success = stats.completed === stats.total;

    this.recordEvent(
      success ? "CASE_COMPLETED" : "CASE_FAILED",
      graph.case_id,
      undefined,
      { success, trace_id: graph.metadata.trace_id, ...stats }
    );

    return this._buildResult(graph, startTime, success);
  }

  // ─── Ejecución de nodo individual ─────────────────────────────────────────

  private async _executeNode(graph: ExecutionGraph, node: ExecutionNode): Promise<void> {
    node.status     = "RUNNING";
    node.started_at = new Date().toISOString();

    this.recordEvent("NODE_STARTED", node.case_id, node.node_id, {
      action:   node.action,
      trace_id: graph.metadata.trace_id,
    });

    try {
      const result     = await this.gateway.execute(node);
      node.result      = result;
      node.status      = "COMPLETED";
      node.finished_at = new Date().toISOString();

      this.recordEvent("NODE_COMPLETED", node.case_id, node.node_id, {
        agent_id:    node.agent_id,
        duration_ms: this._durationMs(node),
        result,
      });
    } catch (e) {
      node.status      = "FAILED";
      node.error       = (e as Error).message;
      node.finished_at = new Date().toISOString();

      this.recordEvent("NODE_FAILED", node.case_id, node.node_id, {
        error:       node.error,
        duration_ms: this._durationMs(node),
      });

      if (this._isHardViolation(node.error)) {
        this.recordEvent("HARD_POLICY_VIOLATION", node.case_id, node.node_id, {
          error: node.error,
        });
        this.circuitBreaker.recordViolation(node.case_id);
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _isHardViolation(error?: string): boolean {
    if (!error) return false;
    const lower = error.toLowerCase();
    return ["p3", "p6", "p7", "hard policy"].some(k => lower.includes(k));
  }

  private _durationMs(node: ExecutionNode): number {
    if (!node.started_at || !node.finished_at) return 0;
    return new Date(node.finished_at).getTime() - new Date(node.started_at).getTime();
  }

  private recordEvent(
    eventType: LedgerEvent["event_type"],
    caseId:    string,
    nodeId?:   string,
    extra:     Record<string, unknown> = {}
  ): void {
    this.events.push({
      event_type: eventType,
      case_id:    caseId,
      node_id:    nodeId,
      timestamp:  new Date().toISOString(),
      extra,
    });
  }

  private _buildResult(
    graph:     ExecutionGraph,
    startTime: number,
    success:   boolean
  ): UACPResult {
    const stats = graphStats(graph);
    return {
      case_id:         graph.case_id,
      trace_id:        graph.metadata.trace_id,
      success,
      nodes_total:     stats.total,
      nodes_completed: stats.completed,
      nodes_failed:    stats.failed,
      nodes_skipped:   stats.skipped,
      events:          [...this.events],
      duration_ms:     Date.now() - startTime,
    };
  }

  getEvents(): LedgerEvent[] {
    return [...this.events];
  }
}
