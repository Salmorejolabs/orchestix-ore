import { CcsBlueprint } from "../types";
import { CcsContext } from "../context";

export type ValidationResult = {
  ok: boolean;
  article: string;
  message: string;
};

export function validateBlueprint(
  blueprint: CcsBlueprint,
  context: CcsContext
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // P1: Propósito
  const p1 = context.constitution.articles.find(a => a.id === "P1");
  if (p1) {
    if (!blueprint.name || blueprint.name.length < 3) {
      results.push({
        ok: false,
        article: "P1",
        message: "El blueprint no tiene un propósito claro."
      });
    }
  }

  // P3: No circularidad
  const p3 = context.constitution.articles.find(a => a.id === "P3");
  if (p3) {
    const hasCycle = detectCycle(blueprint);
    if (hasCycle) {
      results.push({
        ok: false,
        article: "P3",
        message: "Se detectó un ciclo en las dependencias."
      });
    }
  }

  return results;
}

// Algoritmo de detección de ciclos (Kahn)
function detectCycle(blueprint: CcsBlueprint): boolean {
  const indegree: Record<string, number> = {};
  blueprint.tasks.forEach(t => (indegree[t.id] = 0));

  blueprint.dependencies.forEach(dep => {
    indegree[dep.to] = (indegree[dep.to] || 0) + 1;
  });

  const queue = Object.keys(indegree).filter(k => indegree[k] === 0);
  let visited = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;

    blueprint.dependencies
      .filter(dep => dep.from === node)
      .forEach(dep => {
        indegree[dep.to]--;
        if (indegree[dep.to] === 0) queue.push(dep.to);
      });
  }

  return visited !== blueprint.tasks.length;
}
