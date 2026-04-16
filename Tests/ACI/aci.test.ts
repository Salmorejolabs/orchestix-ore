import { describe, it, expect } from 'vitest';

import { perceiveBlueprint } from '../../src/aci/perception';
import { recallMemory } from '../../src/aci/memory';
import { reasonAboutBlueprint } from '../../src/aci/reasoning';
import { runAciCycle } from '../../src/aci/cycle';

const mockBlueprint = {
  id: 'bp_test_001',
  name: 'Blueprint Test',
  tasks: [
    { id: 't1', name: 'Task 1' },
    { id: 't2', name: 'Task 2' },
  ],
  dependencies: [
    { from: 't1', to: 't2' }
  ]
};

describe('ACI v0.2', () => {

  it('L1 Percepción: detecta tareas y dependencias', () => {
    const p = perceiveBlueprint(mockBlueprint);

    expect(p.tasks.length).toBe(2);
    expect(p.dependencies.length).toBe(1);
  });

  it('L2 Memoria: devuelve contexto mínimo', () => {
    const m = recallMemory(mockBlueprint);

    expect(m.confidence).toBeDefined();
    expect(m.pastExecutions).toBe(0);
  });

  it('L3 Razonamiento: blueprint viable', () => {
    const r = reasonAboutBlueprint(mockBlueprint);

    expect(r.viable).toBe(true);
    expect(r.suggestedOrder.length).toBe(2);
  });

  it('Ciclo ACI completo: genera OrdenAprobada', () => {
    const order = runAciCycle(mockBlueprint);

    expect(order.traceId).toBeDefined();
    expect(order.decision).toBe('GO');
    expect(order.blueprintId).toBe('bp_test_001');
  });

});
