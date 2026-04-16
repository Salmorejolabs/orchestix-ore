import type { CcsBlueprint } from '../ccs/types';
import type { AciMemoryContext } from './types';

// L2 — Memoria (stub)
// Versión mínima: devuelve un contexto fijo/simulado.
// Más adelante se conectará a una memoria real (v0.3+).

export function recallMemory(_blueprint: CcsBlueprint): AciMemoryContext {
  return {
    pastExecutions: 0,
    failureRate: 0,
    similarBlueprints: [],
    confidence: 0.25, // confianza baja por defecto
  };
}
