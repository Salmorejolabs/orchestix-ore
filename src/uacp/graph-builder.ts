/**
 * UACP GraphBuilder v0.1
 * Construye un ExecutionGraph a partir del ExecutionEnvelope de OCO.
 * Procesa el blueprint CCS del approved_order de forma fractal recursiva.
 * Fuente: Sección 6.4, Volumen III.
 */

import type { ExecutionEnvelope } from "../oco/types";
import type { ExecutionGraph, ExecutionNode, GraphMetadata } from "./types";
import type { CcsBlueprint, CcsTask } from "../ccs/types";

export class GraphBuilder {
  /**
   * Construye ExecutionGraph desde el ExecutionEnvelope de OCO.
   * El blueprint se extrae de approved_order (referenciado via blueprint_ref).
   * En v0.1 trabajamos con blueprints CCS inyectados directamente.
   */
  build(
    envelope:  ExecutionEnvelope,
    blueprint: CcsBlueprint
  ): ExecutionGraph {
    const nodes = new Map<string, ExecutionNode>();

    this._extractNodes(blueprint, nodes, "");

    const metadata: GraphMetadata = {
      trace_id: envelope.token.metadata.trace_id,
      token_id: envelope.token.token_id,
    };

    return {
      case_id:  envelope.token.case_id,
      nodes,
      metadata,
    };
  }

  // ─── Extracción recursiva fractal ────────────────────────────────────────

  private _extractNodes(
    blueprint: CcsBlueprint,
    nodes:     Map<string, ExecutionNode>,
    prefix:    string
  ): void {
    const caseId = blueprint.id;

    for (const task of blueprint.tasks) {
      const nodeId = prefix ? `${prefix}.${task.id}` : task.id;

      nodes.set(nodeId, this._buildNode(task, caseId, nodeId, prefix));
    }

    // Sub-blueprints fractales (recursión)
    for (const sub of (blueprint as unknown as { sub_cases?: CcsBlueprint[] }).sub_cases ?? []) {
      this._extractNodes(sub, nodes, sub.id);
    }
  }

  private _buildNode(
    task:   CcsTask,
    caseId: string,
    nodeId: string,
    prefix: string
  ): ExecutionNode {
    // Normalizar dependencias al mismo espacio de nombres del nodo
    const rawDeps: string[] = task.dependsOn ?? [];
    const dependencies = rawDeps.map(dep => prefix ? `${prefix}.${dep}` : dep);

    return {
      node_id:      nodeId,
      case_id:      caseId,
      action:       task.name,   // CcsTask.name == acción a ejecutar
      input:        {},
      policies:     {},
      dependencies,
      status:       "PENDING",
      retry_count:  0,
    };
  }
}

export const graphBuilder = new GraphBuilder();
