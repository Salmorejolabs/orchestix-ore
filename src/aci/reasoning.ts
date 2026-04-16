import type { CcsBlueprint } from '../ccs/types';
import type { AciReasoning } from './types';

// L3 — Razonamiento
// Detección de ciclos mediante Kahn's algorithm (topological sort BFS).
export function reasonAboutBlueprint(blueprint: CcsBlueprint): AciReasoning {
  const taskIds = blueprint.tasks.map((t) => t.id);

  // Construir grafo de adyacencia e in-degree
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of taskIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const dep of blueprint.dependencies) {
    // dep.from debe ejecutarse antes que dep.to
    adj.get(dep.from)?.push(dep.to);
    inDegree.set(dep.to, (inDegree.get(dep.to) ?? 0) + 1);
  }

  // Kahn: inicializar cola con nodos de in-degree 0
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const suggestedOrder: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    suggestedOrder.push(node);
    for (const neighbor of (adj.get(node) ?? [])) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // Si no se procesaron todos los nodos, hay un ciclo
  const hasCycle = suggestedOrder.length !== taskIds.length;

  return {
    viable: !hasCycle,
    viabilityScore: hasCycle ? 0 : 0.9,
    suggestedOrder: hasCycle ? taskIds : suggestedOrder,
    concerns: hasCycle ? ['Ciclo detectado en dependencias'] : [],
  };
}
