import { expect } from "chai";
import { OcoOrchestrator } from "../../src/oco/orchestrator";
import { OcoValidationError, runAllValidations } from "../../src/oco/validators";
import { hashApprovedOrder, generateTraceId, buildGovernanceFingerprint } from "../../src/oco/token-builder";
import type { ApprovedOrder } from "../../src/oco/types";

// ─── Blueprint mínimo válido ──────────────────────────────────────────────────

const validOrder: ApprovedOrder = {
  intent_id: "INT-20260416-001",
  case_id:   "CASE-1",
  plan: {
    blueprint_ref:          "ccs://cases/CASE-1",
    estimated_cost:          1500,
    estimated_duration_days: 30,
    risk_score:              0.42,
  },
  governance_context: {
    root_policies: ["P1", "P2", "P3", "P4", "P6", "P7", "P8"],
    violations:    [],
  },
  created_at: "2026-04-16T00:00:00Z",
  created_by: "ACI",
};

const oco = new OcoOrchestrator({ environment: "dev", priority: 8 });

// ─── VALIDADORES ──────────────────────────────────────────────────────────────

describe("OCO Validators", () => {

  it("OCO_001: acepta ApprovedOrder válida", () => {
    expect(() => runAllValidations(validOrder)).to.not.throw();
  });

  it("OCO_001: falla si falta intent_id", () => {
    const bad = { ...validOrder, intent_id: undefined as unknown as string };
    expect(() => runAllValidations(bad)).to.throw(OcoValidationError).with.property("code", "OCO_001");
  });

  it("OCO_001: falla si falta plan", () => {
    const bad = { ...validOrder, plan: undefined as unknown as ApprovedOrder["plan"] };
    expect(() => runAllValidations(bad)).to.throw(OcoValidationError).with.property("code", "OCO_001");
  });

  it("OCO_002: falla si intent_id tiene formato incorrecto", () => {
    const bad = { ...validOrder, intent_id: "INTENT-001" };
    expect(() => runAllValidations(bad)).to.throw(OcoValidationError).with.property("code", "OCO_002");
  });

  it("OCO_002: falla si case_id tiene formato incorrecto", () => {
    const bad = { ...validOrder, case_id: "case_one" };
    expect(() => runAllValidations(bad)).to.throw(OcoValidationError).with.property("code", "OCO_002");
  });

  it("OCO_003: falla si hay violaciones de gobernanza", () => {
    const bad = {
      ...validOrder,
      governance_context: { ...validOrder.governance_context, violations: ["P5-violation"] }
    };
    expect(() => runAllValidations(bad)).to.throw(OcoValidationError).with.property("code", "OCO_003");
  });

  it("OCO_004: falla si falta una política HARD (P2)", () => {
    const bad = {
      ...validOrder,
      governance_context: {
        ...validOrder.governance_context,
        root_policies: ["P1", "P3", "P6", "P7", "P8"] // P2 eliminado
      }
    };
    expect(() => runAllValidations(bad)).to.throw(OcoValidationError).with.property("code", "OCO_004");
  });

  it("OCO_005: falla si risk_score > 1", () => {
    const bad = { ...validOrder, plan: { ...validOrder.plan, risk_score: 1.5 } };
    expect(() => runAllValidations(bad)).to.throw(OcoValidationError).with.property("code", "OCO_005");
  });

  it("OCO_005: falla si estimated_cost < 0", () => {
    const bad = { ...validOrder, plan: { ...validOrder.plan, estimated_cost: -100 } };
    expect(() => runAllValidations(bad)).to.throw(OcoValidationError).with.property("code", "OCO_005");
  });

});

// ─── TOKEN BUILDER ────────────────────────────────────────────────────────────

describe("OCO Token Builder", () => {

  it("hashApprovedOrder genera hash con prefijo sha256:", () => {
    const hash = hashApprovedOrder(validOrder);
    expect(hash).to.match(/^sha256:[a-f0-9]{64}$/);
  });

  it("hashApprovedOrder es determinista para el mismo input", () => {
    expect(hashApprovedOrder(validOrder)).to.equal(hashApprovedOrder(validOrder));
  });

  it("hashApprovedOrder cambia si cambia el input", () => {
    const modified = { ...validOrder, case_id: "CASE-2" };
    expect(hashApprovedOrder(validOrder)).to.not.equal(hashApprovedOrder(modified));
  });

  it("generateTraceId sigue el formato trace_{case}_{timestamp}", () => {
    const traceId = generateTraceId("CASE-1");
    expect(traceId).to.match(/^trace_case_1_\d{15}Z$/);
  });

  it("buildGovernanceFingerprint separa hard y soft policies", () => {
    const fp = buildGovernanceFingerprint(validOrder);
    expect(fp.hard_policies).to.include.members(["P2", "P3", "P6", "P7"]);
    expect(fp.soft_policies).to.not.include("P2");
    expect(fp.risk_score).to.equal(0.42);
  });

});

// ─── ORCHESTRATOR E2E ─────────────────────────────────────────────────────────

describe("OCO Orchestrator E2E", () => {

  it("procesa ApprovedOrder válida y devuelve ok: true", () => {
    const result = oco.processApprovedOrder(validOrder);
    expect(result.ok).to.equal(true);
  });

  it("token tiene los campos requeridos por UACP", () => {
    const result = oco.processApprovedOrder(validOrder);
    if (!result.ok) throw new Error(`OCO error: ${result.message}`);
    const { token } = result;
    expect(token.token_id).to.match(/^TOK-\d{8}-\d{6}$/);
    expect(token.case_id).to.equal("CASE-1");
    expect(token.intent_id).to.equal("INT-20260416-001");
    expect(token.approved_order_hash).to.match(/^sha256:[a-f0-9]{64}$/);
    expect(token.metadata.trace_id).to.match(/^trace_case_1_/);
    expect(token.issued_by).to.equal("OCO");
  });

  it("envelope tiene estructura correcta para UACP", () => {
    const result = oco.processApprovedOrder(validOrder);
    if (!result.ok) throw new Error(`OCO error: ${result.message}`);
    const { envelope } = result;
    expect(envelope.source).to.equal("OCO_QUEUE");
    expect(envelope.token.token_id).to.equal(result.token.token_id);
    expect(envelope.approved_order.case_id).to.equal("CASE-1");
  });

  it("devuelve ok: false si la orden falla validación", () => {
    const bad = { ...validOrder, governance_context: { ...validOrder.governance_context, violations: ["P5"] } };
    const result = oco.processApprovedOrder(bad);
    expect(result.ok).to.equal(false);
    if (result.ok) return;
    expect(result.code).to.equal("OCO_003");
  });

  it("token_id es único entre llamadas", () => {
    const r1 = oco.processApprovedOrder(validOrder);
    const r2 = oco.processApprovedOrder(validOrder);
    if (!r1.ok || !r2.ok) throw new Error("OCO error");
    expect(r1.token.token_id).to.not.equal(r2.token.token_id);
  });

  it("governance_fingerprint refleja las políticas del order", () => {
    const result = oco.processApprovedOrder(validOrder);
    if (!result.ok) throw new Error(`OCO error: ${result.message}`);
    const fp = result.token.governance_fingerprint;
    expect(fp.root_policies).to.include("P1");
    expect(fp.hard_policies).to.deep.equal(["P2", "P3", "P6", "P7"]);
    expect(fp.risk_score).to.equal(0.42);
  });

});
