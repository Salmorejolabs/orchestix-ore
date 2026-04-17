import { expect } from "chai";
import {
  PolicyEngine, buildContext, ordToContext,
  evaluateNode,
  CONSTITUTIONAL_POLICIES, EVALUATION_ORDER,
  buildAST, int, placeholder, lte, gte, eq, and, or, not, between,
  POL_ERR,
} from "../../src/core/policy/index";
import type { BoundContext } from "../../src/core/policy/types";

function ctx(b: Record<string, number|string|boolean|number[]>): BoundContext {
  return buildContext(b);
}

function validOrdCtx(overrides: Record<string, unknown> = {}): BoundContext {
  return ordToContext({
    trace_id:     "ROOT.SO.ORD.20260416T120000Z.VALID1",
    trace_parent: null,
    case_id:      "CASE-1",
    cost_estimated:      100,
    P1_budget:           1000,
    risk:                0.3,
    impact:              0.8,
    fractal_depth:       2,
    max_depth:           10,
    schema_valid:        true,
    agent_scope_valid:   true,
    case_active:         true,
    precedence_ok:       true,
    mutation_authorized: true,
    ...overrides,
  } as Parameters<typeof ordToContext>[0]);
}

describe("AST Builder", () => {
  it("int() trunca decimales", () => { expect(int(3.9).value).to.equal(3); });
  it("buildAST() hash SHA-256 64 chars", () => {
    expect(buildAST("P1", lte(placeholder("x"), int(100))).hash).to.match(/^[a-f0-9]{64}$/);
  });
  it("buildAST() determinista", () => {
    const h1 = buildAST("P1", lte(placeholder("x"), int(100))).hash;
    const h2 = buildAST("P1", lte(placeholder("x"), int(100))).hash;
    expect(h1).to.equal(h2);
  });
  it("buildAST() hash cambia si expresión cambia", () => {
    const h1 = buildAST("P1", lte(placeholder("x"), int(100))).hash;
    const h2 = buildAST("P1", lte(placeholder("x"), int(999))).hash;
    expect(h1).to.not.equal(h2);
  });
  it("lte() crea ComparisonNode ≤", () => {
    const n = lte(placeholder("x"), int(10));
    expect(n.op).to.equal("≤");
  });
  it("and() crea LogicalNode AND", () => {
    const n = and(eq(int(1),int(1)), eq(int(2),int(2)));
    expect(n.op).to.equal("AND");
  });
});

describe("Predicate Engine", () => {
  it("≤ true cuando left ≤ right",  () => { expect(evaluateNode(lte(int(5), int(10)), ctx({})).result).to.equal(true); });
  it("≤ false cuando left > right", () => { expect(evaluateNode(lte(int(15),int(10)), ctx({})).result).to.equal(false); });
  it("placeholder resuelve desde contexto", () => {
    expect(evaluateNode(lte(placeholder("c"),int(100)), ctx({c:50})).result).to.equal(true);
  });
  it("placeholder faltante → fail-safe false", () => {
    const r = evaluateNode(lte(placeholder("missing"),int(100)), ctx({}));
    expect(r.result).to.equal(false);
    expect(r.error).to.include("POL_ERR_CONTEXT_MISSING");
  });
  it("AND short-circuit izquierda false", () => {
    expect(evaluateNode(and(eq(int(1),int(2)), eq(int(1),int(1))), ctx({})).result).to.equal(false);
  });
  it("OR true||false = true", () => {
    expect(evaluateNode(or(eq(int(1),int(1)), eq(int(1),int(2))), ctx({})).result).to.equal(true);
  });
  it("NOT !false = true", () => {
    expect(evaluateNode(not(eq(int(1),int(2))), ctx({})).result).to.equal(true);
  });
  it("RANGE: valor en rango → true",  () => {
    expect(evaluateNode(between(int(5), int(1), int(10)), ctx({})).result).to.equal(true);
  });
  it("RANGE: límites inclusivos", () => {
    expect(evaluateNode(between(int(1),  int(1), int(10)), ctx({})).result).to.equal(true);
    expect(evaluateNode(between(int(10), int(1), int(10)), ctx({})).result).to.equal(true);
  });
  it("RANGE: fuera de rango → false", () => {
    expect(evaluateNode(between(int(0),  int(1), int(10)), ctx({})).result).to.equal(false);
    expect(evaluateNode(between(int(11), int(1), int(10)), ctx({})).result).to.equal(false);
  });
  it("evidencia contiene actual y expected", () => {
    const r = evaluateNode(lte(placeholder("c"),int(100)), ctx({c:150}));
    expect(r.evidence?.actual).to.equal(150);
    expect(r.evidence?.expected).to.equal(100);
  });
});

describe("P1: Economía", () => {
  it("ALLOW cost_scaled ≤ P1_max_scaled", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.cost_scaled":10000,"order.P1_max_scaled":100000}), ["P1"]);
    expect(r.verdict).to.equal("ALLOW");
  });
  it("DENY cost_scaled > P1_max_scaled", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.cost_scaled":200000,"order.P1_max_scaled":100000}), ["P1"]);
    expect(r.verdict).to.equal("DENY");
    expect(r.error_code).to.equal(POL_ERR.CONS_P1);
  });
  it("ordToContext escala ×100", () => {
    const c = ordToContext({cost_estimated:150, P1_budget:1000});
    expect(c.bindings["order.cost_scaled"]).to.equal(15000);
    expect(c.bindings["order.P1_max_scaled"]).to.equal(100000);
  });
  it("coste igual al presupuesto → ALLOW (≤ inclusivo)", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.cost_scaled":1000,"order.P1_max_scaled":1000}), ["P1"]);
    expect(r.verdict).to.equal("ALLOW");
  });
});

describe("P2: Trazabilidad", () => {
  it("ALLOW trace válido y causalidad OK", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.trace_id_valid":1,"order.trace_causality_ok":1}), ["P2"]);
    expect(r.verdict).to.equal("ALLOW");
  });
  it("DENY trace_id_valid = 0", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.trace_id_valid":0,"order.trace_causality_ok":1}), ["P2"]);
    expect(r.verdict).to.equal("DENY"); expect(r.error_code).to.equal(POL_ERR.CONS_P2);
  });
  it("DENY causality_ok = 0", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.trace_id_valid":1,"order.trace_causality_ok":0}), ["P2"]);
    expect(r.verdict).to.equal("DENY");
  });
  it("ordToContext: trace válido → 1", () => {
    const c = ordToContext({trace_id:"ROOT.SO.ORD.20260416T120000Z.ABC1"});
    expect(c.bindings["order.trace_id_valid"]).to.equal(1);
  });
  it("ordToContext: trace inválido → 0", () => {
    const c = ordToContext({trace_id:"INVALID"});
    expect(c.bindings["order.trace_id_valid"]).to.equal(0);
  });
  it("ordToContext: sin parent → causality OK", () => {
    const c = ordToContext({trace_id:"ROOT.SO.ORD.20260416T120000Z.T1", trace_parent:null});
    expect(c.bindings["order.trace_causality_ok"]).to.equal(1);
  });
  it("ordToContext: hijo posterior al padre → causality OK", () => {
    const c = ordToContext({
      trace_id:     "ROOT.SO.ORD.20260416T130000Z.T2",
      trace_parent: "ROOT.SO.ORD.20260416T120000Z.T1",
    });
    expect(c.bindings["order.trace_causality_ok"]).to.equal(1);
  });
  it("ordToContext: hijo anterior al padre → causality FAIL", () => {
    const c = ordToContext({
      trace_id:     "ROOT.SO.ORD.20260416T110000Z.T2",
      trace_parent: "ROOT.SO.ORD.20260416T120000Z.T1",
    });
    expect(c.bindings["order.trace_causality_ok"]).to.equal(0);
  });
});

describe("P3: Integridad Estructural", () => {
  it("ALLOW schema válido y depth OK", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.schema_valid":1,"order.depth_valid":1}), ["P3"]);
    expect(r.verdict).to.equal("ALLOW");
  });
  it("DENY schema_valid = 0", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.schema_valid":0,"order.depth_valid":1}), ["P3"]);
    expect(r.verdict).to.equal("DENY"); expect(r.error_code).to.equal(POL_ERR.CONS_P3);
  });
  it("DENY depth_valid = 0", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.schema_valid":1,"order.depth_valid":0}), ["P3"]);
    expect(r.verdict).to.equal("DENY");
  });
  it("ordToContext: depth 2/10 → valid", () => {
    const c = ordToContext({fractal_depth:2, max_depth:10});
    expect(c.bindings["order.depth_valid"]).to.equal(1);
  });
  it("ordToContext: depth 11/10 → invalid", () => {
    const c = ordToContext({fractal_depth:11, max_depth:10});
    expect(c.bindings["order.depth_valid"]).to.equal(0);
  });
});

describe("P4: Riesgo", () => {
  it("ALLOW risk_scaled ≤ P4_max_scaled", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.risk_scaled":3000,"order.P4_max_scaled":5000}), ["P4"]);
    expect(r.verdict).to.equal("ALLOW");
  });
  it("DENY risk_scaled > P4_max_scaled", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.risk_scaled":8000,"order.P4_max_scaled":5000}), ["P4"]);
    expect(r.verdict).to.equal("DENY"); expect(r.error_code).to.equal(POL_ERR.CONS_P4);
  });
  it("DENY risk_scaled > 10000", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.risk_scaled":10001,"order.P4_max_scaled":10000}), ["P4"]);
    expect(r.verdict).to.equal("DENY");
  });
  it("ordToContext: risk 0.3 → scaled 3000", () => {
    const c = ordToContext({risk:0.3});
    expect(c.bindings["order.risk_scaled"]).to.equal(3000);
  });
  it("ordToContext: risk clamped ≥ 0", () => {
    expect(ordToContext({risk:-0.5}).bindings["order.risk_scaled"]).to.equal(0);
  });
  it("ordToContext: risk clamped ≤ 10000", () => {
    expect(ordToContext({risk:1.5}).bindings["order.risk_scaled"]).to.equal(10000);
  });
});

describe("P5: Soberanía del CASE", () => {
  it("ALLOW agente vinculado y CASE activo", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.agent_scope_valid":1,"order.case_active":1}), ["P5"]);
    expect(r.verdict).to.equal("ALLOW");
  });
  it("DENY agent_scope_valid = 0", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.agent_scope_valid":0,"order.case_active":1}), ["P5"]);
    expect(r.verdict).to.equal("DENY"); expect(r.error_code).to.equal(POL_ERR.CONS_P5);
  });
  it("DENY case_active = 0", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.agent_scope_valid":1,"order.case_active":0}), ["P5"]);
    expect(r.verdict).to.equal("DENY");
  });
  it("ordToContext: CASE-1.2 válido + scope → 1", () => {
    const c = ordToContext({case_id:"CASE-1.2", agent_scope_valid:true});
    expect(c.bindings["order.agent_scope_valid"]).to.equal(1);
  });
  it("ordToContext: case_id inválido → scope 0", () => {
    const c = ordToContext({case_id:"bad-case", agent_scope_valid:true});
    expect(c.bindings["order.agent_scope_valid"]).to.equal(0);
  });
});

describe("P6: Precedencia Constitucional", () => {
  it("ALLOW precedence_ok = 1", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.precedence_ok":1}), ["P6"]);
    expect(r.verdict).to.equal("ALLOW");
  });
  it("DENY precedence_ok = 0", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.precedence_ok":0}), ["P6"]);
    expect(r.verdict).to.equal("DENY"); expect(r.error_code).to.equal(POL_ERR.CONS_P6);
  });
});

describe("P7: Mutabilidad Controlada", () => {
  it("ALLOW mutation_authorized = 1", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.mutation_authorized":1}), ["P7"]);
    expect(r.verdict).to.equal("ALLOW");
  });
  it("DENY mutation_authorized = 0", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.mutation_authorized":0}), ["P7"]);
    expect(r.verdict).to.equal("DENY"); expect(r.error_code).to.equal(POL_ERR.CONS_P7);
  });
});

describe("P8: Proporcionalidad f(c,r)=α·c+β·r", () => {
  it("ALLOW impacto suficiente", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.impact_scaled":10000,"order.proportionality_threshold_scaled":2100}), ["P8"]);
    expect(r.verdict).to.equal("ALLOW");
  });
  it("DENY impacto insuficiente", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.impact_scaled":100,"order.proportionality_threshold_scaled":5000}), ["P8"]);
    expect(r.verdict).to.equal("DENY"); expect(r.error_code).to.equal(POL_ERR.CONS_P8);
  });
  it("ordToContext: impact 1.0 con risk 0.3 → ALLOW", () => {
    const c = ordToContext({risk:0.3, impact:1.0, cost_estimated:100, P1_budget:1000});
    const r = new PolicyEngine().evaluate(c, ["P8"]);
    expect(r.verdict).to.equal("ALLOW");
  });
  it("ordToContext: impact 0.0 con risk 0.8 → DENY", () => {
    const c = ordToContext({risk:0.8, impact:0.0});
    const r = new PolicyEngine().evaluate(c, ["P8"]);
    expect(r.verdict).to.equal("DENY");
  });
});

describe("Pipeline P1→P8", () => {
  it("ALLOW contexto completamente válido", () => {
    const r = new PolicyEngine().evaluate(validOrdCtx());
    expect(r.verdict).to.equal("ALLOW");
    expect(r.decisions).to.have.length(8);
  });
  it("DENY en P1 para el pipeline (fail-fast)", () => {
    const c = ordToContext({
      trace_id:"ROOT.SO.ORD.20260416T120000Z.V1",
      cost_estimated:5000, P1_budget:100,
    });
    const r = new PolicyEngine().evaluate(c);
    expect(r.verdict).to.equal("DENY");
    expect(r.error_code).to.equal(POL_ERR.CONS_P1);
    expect(r.decisions.length).to.equal(1);
  });
  it("DENY en P2 para el pipeline", () => {
    const c = ordToContext({trace_id:"INVALID", cost_estimated:10, P1_budget:1000});
    const r = new PolicyEngine().evaluate(c);
    expect(r.verdict).to.equal("DENY");
    expect(r.error_code).to.equal(POL_ERR.CONS_P2);
  });
});

describe("Invariantes POL-INV", () => {
  it("POL-INV-01: 100 evaluaciones → mismo veredicto", () => {
    const e = new PolicyEngine();
    const c = validOrdCtx();
    const vs = Array.from({length:100}, () => e.evaluate(c).verdict);
    expect(new Set(vs).size).to.equal(1);
  });
  it("POL-INV-02: contexto no se modifica", () => {
    const e = new PolicyEngine();
    const c = validOrdCtx();
    const before = JSON.stringify(c.bindings);
    e.evaluate(c);
    expect(JSON.stringify(c.bindings)).to.equal(before);
  });
  it("POL-INV-04: snapshot tiene snapshot_id y captured_at", () => {
    const c = validOrdCtx();
    expect(c.snapshot_id).to.match(/^CTX-\d+$/);
    expect(c.captured_at).to.be.a("string");
  });
  it("POL-INV-05: contexto vacío → DENY sin crash", () => {
    const r = new PolicyEngine().evaluate(buildContext({}));
    expect(r.verdict).to.equal("DENY");
  });
  it("EVALUATION_ORDER hardcoded P1→P8", () => {
    expect(EVALUATION_ORDER).to.deep.equal(["P1","P2","P3","P4","P5","P6","P7","P8"]);
  });
  it("registry tiene 8 políticas", () => {
    expect(CONSTITUTIONAL_POLICIES.size).to.equal(8);
  });
  it("todas las políticas son hard=true", () => {
    for (const [,p] of CONSTITUTIONAL_POLICIES) expect(p.hard).to.equal(true);
  });
  it("fail-fast: primera violación para el pipeline", () => {
    const r = new PolicyEngine().evaluate(ctx({"order.cost_scaled":999999,"order.P1_max_scaled":1}), ["P1","P2","P3"]);
    expect(r.decisions.length).to.equal(1);
  });
  it("AST hash tiene 64 chars hex", () => {
    const p1 = CONSTITUTIONAL_POLICIES.get("P1")!;
    expect(p1.ast.hash).to.match(/^[a-f0-9]{64}$/);
  });
});
