/**
 * Policy Engine — Constitutional Registry v0.1 (Semántica canónica)
 *
 * P1: Economía         — coste escalado ≤ presupuesto (Decimal128 → int×100)
 * P2: Trazabilidad     — trace_id válido + causalidad temporal
 * P3: Integridad       — esquema estructural + profundidad fractal
 * P4: Riesgo           — risk normalizado [0–1] ≤ límite (int×10000)
 * P5: Soberanía CASE   — agente pertenece al CASE + CASE activo
 * P6: Precedencia      — sin conflicto con orden superior
 * P7: Mutabilidad      — mutación autorizada o no es mutación
 * P8: Proporcionalidad — impacto ≥ f(coste, riesgo) = α·c + β·r
 *
 * Fuente: Secciones 5.2.1–5.2.8, OCO v1.0 ORCHESTIXX.
 */

import type { Policy } from "./types";
import { buildAST, lte, gte, eq, and, int, placeholder, between } from "./ast";

// ─── P1: Economía (Budget & Cost Limits) ─────────────────────────────────────
// Coste escalado ×100 (centavos). order.cost_scaled ≤ order.P1_max_scaled
// Hard-Constraint. Tres niveles: global → case → agent (v0.1: un nivel).

const P1: Policy = {
  id:          "P1",
  name:        "Economía",
  description: "El coste estimado no puede exceder el presupuesto asignado (Decimal128 escalado ×100).",
  hard:        true,
  ast: buildAST("P1",
    lte(
      placeholder("order.cost_scaled",  "INT"),
      placeholder("order.P1_max_scaled","INT"),
    ),
  ),
};

// ─── P2: Trazabilidad (Traceability & Lineage) ────────────────────────────────
// trace_id_valid == 1 AND trace_causality_ok == 1
// Hard-Constraint.

const P2: Policy = {
  id:          "P2",
  name:        "Trazabilidad",
  description: "El trace_id debe ser válido y la causalidad padre→hijo debe ser coherente.",
  hard:        true,
  ast: buildAST("P2",
    and(
      eq(placeholder("order.trace_id_valid",    "INT"), int(1)),
      eq(placeholder("order.trace_causality_ok","INT"), int(1)),
    ),
  ),
};

// ─── P3: Integridad Estructural (Structural Integrity) ────────────────────────
// schema_valid == 1 AND depth_valid == 1
// Hard-Constraint.

const P3: Policy = {
  id:          "P3",
  name:        "Integridad Estructural",
  description: "El esquema de la orden debe ser válido y la profundidad fractal no debe exceder el límite.",
  hard:        true,
  ast: buildAST("P3",
    and(
      eq(placeholder("order.schema_valid","INT"), int(1)),
      eq(placeholder("order.depth_valid", "INT"), int(1)),
    ),
  ),
};

// ─── P4: Riesgo (Risk Boundaries) ────────────────────────────────────────────
// Risk NormalizedFloat [0–1] escalado ×10000. risk_scaled ≤ P4_max_scaled
// AND risk_scaled BETWEEN 0 AND 10000.
// Hard-Constraint. SIL-4.

const P4: Policy = {
  id:          "P4",
  name:        "Riesgo",
  description: "El riesgo normalizado [0–1] no puede exceder el límite constitucional.",
  hard:        true,
  ast: buildAST("P4",
    and(
      lte(placeholder("order.risk_scaled",    "INT"), placeholder("order.P4_max_scaled","INT")),
      between(placeholder("order.risk_scaled","INT"), int(0), int(10000)),
    ),
  ),
};

// ─── P5: Soberanía del CASE (CASE Sovereignty) ───────────────────────────────
// agent_scope_valid == 1 AND case_active == 1
// Hard-Constraint. Brecha de seguridad crítica si falla.

const P5: Policy = {
  id:          "P5",
  name:        "Soberanía del CASE",
  description: "El agente debe estar vinculado al CASE y el CASE debe estar activo.",
  hard:        true,
  ast: buildAST("P5",
    and(
      eq(placeholder("order.agent_scope_valid","INT"), int(1)),
      eq(placeholder("order.case_active",       "INT"), int(1)),
    ),
  ),
};

// ─── P6: Precedencia Constitucional (Constitutional Precedence) ──────────────
// precedence_ok == 1 (sin conflicto con orden superior / Lex Superior)
// Hard-Constraint.

const P6: Policy = {
  id:          "P6",
  name:        "Precedencia Constitucional",
  description: "La orden no puede contradecir ninguna política de rango superior.",
  hard:        true,
  ast: buildAST("P6",
    eq(placeholder("order.precedence_ok","INT"), int(1)),
  ),
};

// ─── P7: Mutabilidad Controlada (Controlled Mutability) ──────────────────────
// mutation_authorized == 1 (si hay mutación, está autorizada; si no hay, pasa)
// Hard-Constraint.

const P7: Policy = {
  id:          "P7",
  name:        "Mutabilidad Controlada",
  description: "Toda mutación de estado o política requiere autorización constitucional explícita.",
  hard:        true,
  ast: buildAST("P7",
    eq(placeholder("order.mutation_authorized","INT"), int(1)),
  ),
};

// ─── P8: Proporcionalidad (Proportionality) ──────────────────────────────────
// f(c,r) = α·c + β·r  (α=0.3, β=0.7 por defecto, escalados ×10000)
// impact_scaled ≥ proportionality_threshold_scaled
// Hard-Constraint. Eficiencia de Pareto.

const P8: Policy = {
  id:          "P8",
  name:        "Proporcionalidad",
  description: "El impacto esperado debe justificar el coste y el riesgo: impact ≥ α·cost + β·risk.",
  hard:        true,
  ast: buildAST("P8",
    gte(
      placeholder("order.impact_scaled",               "INT"),
      placeholder("order.proportionality_threshold_scaled","INT"),
    ),
  ),
};

// ─── Registro canónico P1–P8 ──────────────────────────────────────────────────

export const CONSTITUTIONAL_POLICIES: Map<string, Policy> = new Map([
  ["P1", P1],
  ["P2", P2],
  ["P3", P3],
  ["P4", P4],
  ["P5", P5],
  ["P6", P6],
  ["P7", P7],
  ["P8", P8],
]);

// Orden fijo de evaluación (hardcoded — no modificable en runtime)
export const EVALUATION_ORDER = ["P1","P2","P3","P4","P5","P6","P7","P8"] as const;
export type  PolicyId = typeof EVALUATION_ORDER[number];
