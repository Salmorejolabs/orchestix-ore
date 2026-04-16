import type { GovernanceCheck, GovernanceCheckId } from './types';
import type { CcsBlueprint } from '../ccs/types';

// P1–P8 — Gobernanza
// P1, P2, P5 con reglas reales. P3, P4, P6, P7, P8 pasan por defecto.
const PRINCIPLES: GovernanceCheckId[] = [
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8',
];

export function evaluateGovernance(blueprint: CcsBlueprint): GovernanceCheck[] {
  const { tasks, dependencies } = blueprint;

  // ── P1: coherencia estructural ───────────────────────────────────────────
  const taskIds = tasks.map((t) => t.id);
  const uniqueIds = new Set(taskIds);
  const hasDuplicates = uniqueIds.size !== taskIds.length;
  const isEmpty = tasks.length === 0;

  const p1Passed = !hasDuplicates && !isEmpty;
  const p1Notes = isEmpty
    ? 'El blueprint no contiene tareas.'
    : hasDuplicates
    ? `IDs de tarea duplicados detectados: ${taskIds
        .filter((id, i) => taskIds.indexOf(id) !== i)
        .join(', ')}.`
    : '';

  // ── P2: proporcionalidad / simplicidad ───────────────────────────────────
  const p2Passed = tasks.length <= 20;
  const p2Notes = p2Passed
    ? ''
    : `El blueprint supera el límite de 20 tareas (actual: ${tasks.length}).`;

  // ── P5: minimización de riesgo ───────────────────────────────────────────
  // Réplica mínima del cálculo de grado (sin importar perception.ts)
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    outDegree.set(t.id, 0);
  }

  for (const dep of dependencies) {
    outDegree.set(dep.from, (outDegree.get(dep.from) ?? 0) + 1);
    inDegree.set(dep.to, (inDegree.get(dep.to) ?? 0) + 1);
  }

  const highRiskTasks = tasks.filter(
    (t) => (inDegree.get(t.id) ?? 0) + (outDegree.get(t.id) ?? 0) > 2,
  );

  const p5Passed = highRiskTasks.length === 0;
  const p5Notes = p5Passed
    ? ''
    : `Tareas con riesgo HIGH detectadas: ${highRiskTasks.map((t) => t.id).join(', ')}.`;

  // ── Construcción del resultado ────────────────────────────────────────────
  const overrides: Partial<Record<GovernanceCheckId, GovernanceCheck>> = {
    P1: { id: 'P1', passed: p1Passed, notes: p1Notes },
    P2: { id: 'P2', passed: p2Passed, notes: p2Notes },
    P5: { id: 'P5', passed: p5Passed, notes: p5Notes },
  };

  return PRINCIPLES.map((id) =>
    overrides[id] ?? { id, passed: true, notes: '' },
  );
}
