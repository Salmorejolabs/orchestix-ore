import type { CcsBlueprint } from '../ccs/types';
import type { AciPerception, AciTaskSummary, AciDependency } from './types';

// L1 — Percepción
// Convierte un blueprint CCS en una vista operativa para ACI.
// Versión mínima: solo extrae tareas y dependencias.

export function perceiveBlueprint(blueprint: CcsBlueprint): AciPerception {
  const tasks: AciTaskSummary[] = blueprint.tasks.map((t) => ({
    id: t.id,
    name: t.name,
    riskLevel: 'LOW', // placeholder — se ajustará en v0.2.1
  }));

  const dependencies: AciDependency[] = blueprint.dependencies.map((d) => ({
    fromTaskId: d.from,
    toTaskId: d.to,
  }));

  const riskHints: string[] = []; // se llenará más adelante

  return {
    tasks,
    dependencies,
    riskHints,
  };
}
