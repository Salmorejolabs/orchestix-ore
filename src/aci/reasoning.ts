import type { CcsBlueprint } from '../ccs/types';
import type { AciReasoning } from './types';

// L3 — Razonamiento
// Versión mínima: detecta ciclos simples y propone un orden básico.

export function reasonAboutBlueprint(blueprint: CcsBlueprint): AciReasoning {
  const taskIds = blueprint.tasks.map((t) => t.id);

  // Detectar ciclos simples: si una dependencia apunta a sí misma
  const hasSelfCycle = blueprint.dependencies.some(
    (d) => d.from === d.to
  );

  // En v0.2 no hacemos DFS completo, solo chequeo mínimo
  const viable = !hasSelfCycle;

  return {
    viable,
    viabilityScore: viable ? 0.8 : 0.0,
    suggestedOrder: taskIds, // orden básico
    concerns: hasSelfCycle ? ['Ciclo detectado en dependencias'] : [],
  };
}
