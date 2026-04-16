import type { CcsBlueprint } from '../ccs/types';
import type { AciOrder, AciDecision } from './types';

import { perceiveBlueprint } from './perception';
import { recallMemory } from './memory';
import { reasonAboutBlueprint } from './reasoning';
import { evaluateGovernance } from './governance';

// Genera un traceId simple (v0.2)
function generateTraceId(): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1_000_000).toString(16).toUpperCase();
  return `ACI-${ts}-${rand}`;
}

// Decide según razonamiento + gobernanza
function decide(viable: boolean): AciDecision {
  if (!viable) return 'REJECT';
  return 'GO'; // en v0.2 no usamos condiciones aún
}

// Ciclo completo ACI
export function runAciCycle(blueprint: CcsBlueprint): AciOrder {
  const perception = perceiveBlueprint(blueprint);
  const memory = recallMemory(blueprint);
  const reasoning = reasonAboutBlueprint(blueprint);
  const governance = evaluateGovernance(blueprint);

  const decision = decide(reasoning.viable);
  const traceId = generateTraceId();

  return {
    decision,
    traceId,
    blueprintId: blueprint.id,
    perception,
    memory,
    reasoning,
    governance,
  };
}
