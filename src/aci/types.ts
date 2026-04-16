import type { CcsBlueprint } from '../ccs/types';

// Decisión global de ACI
export type AciDecision = 'GO' | 'GO_WITH_CONDITIONS' | 'REJECT';

// Resumen de una tarea percibida
export type AciTaskSummary = {
  id: string;
  name: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
};

// Relación de dependencia entre tareas
export type AciDependency = {
  fromTaskId: string;
  toTaskId: string;
};

// L1 — Percepción
export type AciPerception = {
  tasks: AciTaskSummary[];
  dependencies: AciDependency[];
  riskHints: string[];
};

// L2 — Memoria
export type AciMemoryContext = {
  pastExecutions: number;
  failureRate: number; // 0–1
  similarBlueprints: string[];
  confidence: number; // 0–1
};

// L3 — Razonamiento
export type AciReasoning = {
  viable: boolean;
  viabilityScore: number; // 0–1
  suggestedOrder: string[]; // ids de tareas
  concerns: string[];
};

// P1–P8 — Gobernanza
export type GovernanceCheckId =
  | 'P1'
  | 'P2'
  | 'P3'
  | 'P4'
  | 'P5'
  | 'P6'
  | 'P7'
  | 'P8';

export type GovernanceCheck = {
  id: GovernanceCheckId;
  passed: boolean;
  notes: string;
};

// Orden final de ACI
export type AciOrder = {
  decision: AciDecision;
  traceId: string;
  blueprintId: string;
  perception: AciPerception;
  memory: AciMemoryContext;
  reasoning: AciReasoning;
  governance: GovernanceCheck[];
  conditions?: string[];
};

// Firma pública del ciclo ACI
export type RunAciCycle = (blueprint: CcsBlueprint) => AciOrder;

