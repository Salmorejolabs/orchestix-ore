import { AciBlueprint, AciReasoning } from "./types";

export function reasonAboutBlueprint(blueprint: AciBlueprint): AciReasoning {
  // Construimos un grafo de dependencias a partir de las tareas
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const task of blueprint.tasks) {
    graph.set(task.id, task.dependsOn || []);
    inDegree.set(task.id, task.dependsOn?.length || 0);
  }

  // Kahn’s algorithm
  const queue = [...inDegree.entries()]
    .filter(([_, deg]) => deg === 0)
    .map(([id]) => id);

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    for (const [taskId, deps] of graph.entries()) {
      if (deps.includes(current)) {
        const newDeg = inDegree.get(taskId)! - 1;
        inDegree.set(taskId, newDeg);
        if (newDeg === 0) queue.push(taskId);
      }
    }
  }

  const hasCycle = order.length !== blueprint.tasks.length;

  return {
    viable: !hasCycle,
    order,
    constitutional: hasCycle ? "CYCLE_DETECTED" : "OK",
    reasoning: hasCycle
      ? "Se detectó un ciclo en las dependencias del blueprint."
      : "El blueprint es válido y las tareas pueden ejecutarse en este orden."
  };
}
