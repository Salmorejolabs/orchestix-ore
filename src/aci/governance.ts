import type { GovernanceCheck, GovernanceCheckId } from './types';
import type { CcsBlueprint } from '../ccs/types';

// P1–P8 — Gobernanza (versión mínima)
// Cada principio devuelve "passed: true" por defecto.
// Más adelante añadiremos reglas reales basadas en la Constitución ORE.

const PRINCIPLES: GovernanceCheckId[] = [
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'
];

export function evaluateGovernance(_blueprint: CcsBlueprint): GovernanceCheck[] {
  return PRINCIPLES.map((id) => ({
    id,
    passed: true,
    notes: '', // se rellenará en v0.2.1+
  }));
}
