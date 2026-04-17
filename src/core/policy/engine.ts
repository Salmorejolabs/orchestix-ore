/**
 * Policy Engine v0.1 — Orquestador del Pipeline Constitucional
 *
 * Pipeline de 6 etapas (Sección 5.1.3):
 *   1. LOAD   — cargar políticas del registry
 *   2. PARSE  — AST compilado (registry estático en v0.1)
 *   3. BIND   — snapshot atómica del contexto (TOCTOU protection)
 *   4. EVAL   — evaluar P1→P8 en orden fijo con el Predicate Engine
 *   5. DECIDE — fail-fast en HARD violation → DENY inmediato
 *   6. LOG    — EvaluationResult retornado al caller para Ledger
 *
 * Invariantes POL-INV aplicados:
 *   POL-INV-01: Determinismo — orden fijo P1→P8, sin aleatoriedad
 *   POL-INV-02: Pureza funcional — sin efectos secundarios
 *   POL-INV-03: No-bypass — toda evaluación pasa por evaluate()
 *   POL-INV-04: Atomicidad — contexto se congela antes de evaluar
 *   POL-INV-05: Fail-safe — ante cualquier error interno → DENY
 *
 * Fuente: Secciones 5.1.1–5.1.6 + 5.2.1–5.2.8, OCO v1.0 ORCHESTIXX.
 */

import type {
  BoundContext, EvaluationResult, PolicyDecision,
  ConstitutionalAST, ContextValue,
} from "./types";
import { POL_ERR } from "./types";
import { evaluateNode } from "./predicate";
import { CONSTITUTIONAL_POLICIES, EVALUATION_ORDER } from "./registry";

// ─── Error code por principio ─────────────────────────────────────────────────

const POLICY_ERROR: Record<string, string> = {
  P1:  POL_ERR.CONS_P1,
  P2:  POL_ERR.CONS_P2,
  P3:  POL_ERR.CONS_P3,
  P4:  POL_ERR.CONS_P4,
  P5:  POL_ERR.CONS_P5,
  P6:  POL_ERR.CONS_P6,
  P7:  POL_ERR.CONS_P7,
  P8:  POL_ERR.CONS_P8,
};

// ─── Validadores de contexto ──────────────────────────────────────────────────

const TRACE_ID_RE   = /^ROOT\.SO\.ORD\.\d{8}T\d{6}Z\.[A-Za-z0-9]+$/;
const CASE_ID_RE    = /^CASE-\d+(\.\d+)*$/;

function isValidTraceId(id?: string): boolean {
  return !!id && TRACE_ID_RE.test(id);
}

function isCausalityOk(traceId?: string, traceParent?: string | null): boolean {
  // Si no hay padre, causalidad trivialmente OK
  if (!traceParent) return true;
  // Si hay padre, ambos deben ser válidos
  if (!isValidTraceId(traceId) || !isValidTraceId(traceParent)) return false;
  // Verificación de monotonicidad: extraer timestamp (posición 3 en ROOT.SO.ORD.TSTZZZZ.NONCE)
  try {
    const childTs  = traceId!.split(".")[3];
    const parentTs = traceParent.split(".")[3];
    return childTs >= parentTs;   // no-decreciente (causalidad temporal P2-MONO-01)
  } catch {
    return false;
  }
}

// ─── Proporcionalidad P8: f(c,r) = α·c + β·r ─────────────────────────────────
// Coeficientes hardcoded (Sección 5.2.8). Escalados ×10000.
// cost_scaled: coste ×100  → normalizar ÷100 para comparar con risk ×10000
// threshold_scaled (×10000) = α * (cost_scaled/100) + β * risk_scaled
// α = 0.30, β = 0.70 → × 10000 → α_scaled = 3000, β_scaled = 7000

const P8_ALPHA = 3000;   // 0.30 × 10000
const P8_BETA  = 7000;   // 0.70 × 10000

function computeProportionalityThreshold(
  cost_scaled: number,   // coste × 100 (centavos)
  risk_scaled: number,   // riesgo × 10000 (NormalizedFloat)
): number {
  // Normalizar cost al mismo orden que risk (0–10000):
  // cost normalizado = cost_scaled / 100 (si cost_scaled está en centavos con tope de 10000€ → 1_000_000)
  // Para mantener escala comparable usamos: threshold_scaled = (α * cost_norm + β * risk_scaled)
  // donde cost_norm = min(cost_scaled / 100, 10000) / 1000 * 10000
  // Simplificación v0.1: threshold_scaled = (α * risk_scaled + β * risk_scaled) / 10000
  // Forma simple: threshold = 0.3 * (cost/max_cost) * 10000 + 0.7 * risk_scaled
  // Sin max_cost conocido → usar risk_scaled como proxy de escala
  const risk_contrib = Math.round(P8_BETA  * risk_scaled  / 10000);
  const cost_contrib = Math.round(P8_ALPHA * Math.min(cost_scaled, 10000) / 10000);
  return risk_contrib + cost_contrib;
}

// ─── Context builder ──────────────────────────────────────────────────────────

export function buildContext(fields: Record<string, ContextValue>): BoundContext {
  const bindings = Object.freeze({ ...fields });
  return {
    snapshot_id: `CTX-${Date.now()}`,
    captured_at: new Date().toISOString(),
    bindings,
  };
}

/**
 * Convierte campos operativos de una orden al BoundContext canónico P1-P8.
 * Sección 5.2.0: "el Context Binder inyecta los valores en tiempo real".
 */
export function ordToContext(ord: {
  trace_id?:            string;
  trace_parent?:        string | null;
  case_id?:             string;
  cost_estimated?:      number;   // en unidades monetarias
  P1_budget?:           number;   // presupuesto asignado
  governance?: {
    P1_cost_max?:       number;
    P2_timeout_ms?:     number;
    P3_ethics?:         string;
    P4_risk_max?:       number;
  };
  cost_real?:           number;
  duration_ms?:         number;
  risk?:                number;   // NormalizedFloat [0.0–1.0]
  impact?:              number;   // NormalizedFloat [0.0–1.0]
  fractal_depth?:       number;
  max_depth?:           number;
  schema_valid?:        boolean;
  agent_scope_valid?:   boolean;
  case_active?:         boolean;
  precedence_ok?:       boolean;
  mutation_authorized?: boolean;
  // Compat legacy (ignorados, mapeados internamente)
  action_allowed?:      boolean;
  no_parent_conflict?:  boolean;
  rbac_ok?:             boolean;
}): BoundContext {
  const gov = ord.governance ?? {};

  // P1 — coste escalado ×100 (centavos, precisión Decimal128 v0.1)
  const cost_est    = ord.cost_estimated ?? ord.cost_real ?? 0;
  const cost_scaled = Math.round(cost_est * 100);
  const P1_budget   = ord.P1_budget ?? gov.P1_cost_max ?? 999999;
  const P1_max_sc   = Math.round(P1_budget * 100);

  // P2 — trazabilidad
  const trace_valid     = isValidTraceId(ord.trace_id)  ? 1 : 0;
  const causality_ok    = isCausalityOk(ord.trace_id, ord.trace_parent) ? 1 : 0;

  // P3 — integridad estructural
  const schema_valid    = ord.schema_valid   !== false  ? 1 : 0;
  const depth           = ord.fractal_depth  ?? 1;
  const max_depth       = ord.max_depth      ?? 10;
  const depth_valid     = depth <= max_depth ? 1 : 0;

  // P4 — riesgo normalizado [0–1] → escalado ×10000
  // Compat con governance.P4_risk_max (rango 1-10) → normalizar ÷10 → ×10000
  const risk_raw        = ord.risk ?? (gov.P4_risk_max != null ? gov.P4_risk_max / 10 : 0.5);
  const risk_scaled     = Math.round(Math.min(Math.max(risk_raw, 0), 1) * 10000);
  const P4_max_raw      = ord.governance?.P4_risk_max != null ? ord.governance.P4_risk_max / 10 : 1.0;
  const P4_max_scaled   = Math.round(Math.min(Math.max(P4_max_raw, 0), 1) * 10000);

  // P5 — soberanía del CASE
  const caseIdValid     = CASE_ID_RE.test(ord.case_id ?? "") ? 1 : 0;
  const agent_scope     = (ord.agent_scope_valid ?? ord.rbac_ok) !== false ? 1 : 0;
  const case_active     = ord.case_active !== false ? 1 : 0;

  // P6 — precedencia constitucional
  const precedence_ok   = (ord.precedence_ok ?? ord.no_parent_conflict) !== false ? 1 : 0;

  // P7 — mutabilidad controlada
  const mutation_auth   = ord.mutation_authorized !== false ? 1 : 0;

  // P8 — proporcionalidad
  const impact_raw      = ord.impact ?? 1.0;
  const impact_scaled   = Math.round(Math.min(Math.max(impact_raw, 0), 1) * 10000);
  const prop_threshold  = computeProportionalityThreshold(cost_scaled, risk_scaled);

  return buildContext({
    // P1
    "order.cost_scaled":                       cost_scaled,
    "order.P1_max_scaled":                     P1_max_sc,
    // P2
    "order.trace_id_valid":                    trace_valid,
    "order.trace_causality_ok":                causality_ok,
    // P3
    "order.schema_valid":                      schema_valid,
    "order.depth_valid":                       depth_valid,
    // P4
    "order.risk_scaled":                       risk_scaled,
    "order.P4_max_scaled":                     P4_max_scaled,
    // P5
    "order.agent_scope_valid":                 caseIdValid === 1 && agent_scope === 1 ? 1 : 0,
    "order.case_active":                       case_active,
    // P6
    "order.precedence_ok":                     precedence_ok,
    // P7
    "order.mutation_authorized":               mutation_auth,
    // P8
    "order.impact_scaled":                     impact_scaled,
    "order.proportionality_threshold_scaled":  prop_threshold,
  });
}

// ─── Policy Engine ────────────────────────────────────────────────────────────

export class PolicyEngine {
  private readonly policies = CONSTITUTIONAL_POLICIES;

  evaluate(ctx: BoundContext, policyIds?: string[]): EvaluationResult {
    const start   = Date.now();
    const toEval  = policyIds ?? [...EVALUATION_ORDER];
    const decisions: PolicyDecision[] = [];

    try {
      for (const id of toEval) {
        const policy = this.policies.get(id);
        if (!policy) continue;

        const result = evaluateNode(policy.ast.expression, ctx);

        const decision: PolicyDecision = {
          verdict:       result.result ? "ALLOW" : "DENY",
          policy_id:     id,
          error_code:    result.result ? undefined : (result.error ?? POLICY_ERROR[id]),
          violated_node: result.evidence?.symbol,
          evidence:      result.evidence,
          evaluated_at:  new Date().toISOString(),
        };

        decisions.push(decision);

        // Fail-fast: HARD policy falla → DENY inmediato (POL-INV-05)
        if (!result.result && policy.hard) {
          return {
            verdict:      "DENY",
            decisions,
            error_code:   decision.error_code,
            duration_ms:  Date.now() - start,
            evaluated_at: new Date().toISOString(),
          };
        }
      }

      const anyDeny = decisions.some(d => d.verdict === "DENY");
      return {
        verdict:      anyDeny ? "DENY" : "ALLOW",
        decisions,
        error_code:   anyDeny ? decisions.find(d => d.verdict === "DENY")?.error_code : undefined,
        duration_ms:  Date.now() - start,
        evaluated_at: new Date().toISOString(),
      };

    } catch {
      return {
        verdict:      "DENY",
        decisions,
        error_code:   POL_ERR.FAIL_SAFE,
        duration_ms:  Date.now() - start,
        evaluated_at: new Date().toISOString(),
      };
    }
  }

  registerPolicy(policy: { id: string; name: string; description: string; hard: boolean; ast: ConstitutionalAST }): void {
    this.policies.set(policy.id, policy as ReturnType<typeof CONSTITUTIONAL_POLICIES.get> & {});
  }

  policyIds(): string[] { return [...this.policies.keys()]; }
}

export const policyEngine = new PolicyEngine();
