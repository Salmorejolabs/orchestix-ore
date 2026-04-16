import type { CcsBlueprint } from '../ccs/types';
import type { AciPerception, AciTaskSummary, AciDependency } from './types';

// L1 — Percepción
// Convierte un blueprint CCS en una vista operativa para ACI.
// v0.2.1: análisis de riesgo real basado en grado de dependencias.
export function perceiveBlueprint(blueprint: CcsBlueprint): AciPerception {
  // Contar conexiones entrantes y salientes por tarea
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const t of blueprint.tasks) {
    inDegree.set(t.id, 0);
    outDegree.set(t.id, 0);
  }

  for (const dep of blueprint.dependencies) {
    outDegree.set(dep.from, (outDegree.get(dep.from) ?? 0) + 1);
    inDegree.set(dep.to, (inDegree.get(dep.to) ?? 0) + 1);
  }

  const riskHints: string[] = [];

  const tasks: AciTaskSummary[] = blueprint.tasks.map((t) => {
    const totalConnections = (inDegree.get(t.id) ?? 0) + (outDegree.get(t.id) ?? 0);

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';

    if (totalConnections > 2) {
      riskLevel = 'HIGH';
      riskHints.push(`Tarea con demasiadas dependencias: ${t.id}`);
    } else if (totalConnections === 0) {
      riskLevel = 'LOW';
      riskHints.push(`Tarea aislada: ${t.id}`);
    } else {
      riskLevel = 'MEDIUM';
    }

    return {
      id: t.id,
      name: t.name,
      riskLevel,
    };
  });

  const dependencies: AciDependency[] = blueprint.dependencies.map((d) => ({
    fromTaskId: d.from,
    toTaskId: d.to,
  }));

  return {
    tasks,
    dependencies,
    riskHints,
  };
}
