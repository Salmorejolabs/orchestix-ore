/**
 * UACP GraphEngine v0.1
 * Operaciones puras sobre ExecutionGraph.
 * Fuente: Sección 6.3, Volumen III.
 */

import type { ExecutionGraph, ExecutionNode, NodeStatus } from "./types";
import { TERMINAL_STATUSES } from "./types";

/**
 * Devuelve nodos cuyas dependencias están COMPLETED y su estado es PENDING.
 * Equivalente a ExecutionGraph.get_ready_nodes() del pseudocódigo Python.
 */
export function getReadyNodes(graph: ExecutionGraph): ExecutionNode[] {
  const ready: ExecutionNode[] = [];

  for (const node of graph.nodes.values()) {
    if (node.status !== "PENDING") continue;

    const depsOk = node.dependencies.every(dep => {
      const depNode = graph.nodes.get(dep);
      return depNode === undefined || depNode.status === "COMPLETED";
    });

    if (depsOk) ready.push(node);
  }

  return ready;
}

/**
 * True si todos los nodos están en estado terminal.
 */
export function isComplete(graph: ExecutionGraph): boolean {
  for (const node of graph.nodes.values()) {
    if (!TERMINAL_STATUSES.has(node.status)) return false;
  }
  return true;
}

/**
 * Congela la rama: marca todos los nodos PENDING como SKIPPED.
 * Activado por el CircuitBreaker.
 */
export function freezeBranch(graph: ExecutionGraph): void {
  const now = new Date().toISOString();
  for (const node of graph.nodes.values()) {
    if (node.status === "PENDING") {
      node.status    = "SKIPPED";
      node.error     = "Branch frozen due to circuit breaker";
      node.finished_at = now;
    }
  }
}

/**
 * True si hay nodos PENDING que no pueden avanzar porque sus deps fallaron o fueron skipped.
 * Detecta deadlocks donde no hay nodos listos pero el grafo no está completo.
 */
export function hasDeadlock(graph: ExecutionGraph): boolean {
  if (isComplete(graph)) return false;
  return getReadyNodes(graph).length === 0;
}

/**
 * Estadísticas del grafo.
 */
export function graphStats(graph: ExecutionGraph) {
  let completed = 0, failed = 0, skipped = 0, pending = 0, running = 0;

  for (const node of graph.nodes.values()) {
    if (node.status === "COMPLETED") completed++;
    else if (node.status === "FAILED")    failed++;
    else if (node.status === "SKIPPED")   skipped++;
    else if (node.status === "PENDING")   pending++;
    else if (node.status === "RUNNING")   running++;
  }

  return { completed, failed, skipped, pending, running, total: graph.nodes.size };
}
