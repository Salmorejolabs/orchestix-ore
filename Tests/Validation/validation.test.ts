import { expect } from "chai";
import { createHash } from "crypto";
import {
  runPipeline,
  validateSyntax, validateTypes, validatePresence, validateLedgerContext,
  normalizeOrder, buildArtifact, serializeCanonical,
  SV_ERR,
} from "../../src/core/validation/index";
import type { LedgerContext } from "../../src/core/validation/index";
import { LedgerFractal } from "../../src/ledger/ledger";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function computeHash(ord: Record<string, unknown>): string {
  const { hash: _h, signature: _s, ...body } = ord;
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  return "sha256:" + createHash("sha256").update(canonical, "utf8").digest("hex");
}

function validRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    trace_id:     "ROOT.SO.ORD.20260416T120000Z.PIPE01",
    trace_parent: null,
    case_id:      "CASE-1",
    type:         "OA",
    priority:     7,
    source:       "did:example:agentA",
    target:       "did:example:agentB",
    payload:      { action: "analizar_documentos", params: {} },
    governance:   { P1_cost_max: 500, P2_timeout_ms: 30000, P3_ethics: "hard", P4_risk_max: 4 },
    signature:    "ed25519:stubSig",
    ...overrides,
  };
  base.hash = computeHash(base);
  return base;
}

const emptyLedger: LedgerContext = {
  activeCases:   new Set(),
  frozenCases:   new Set(),
  blockedAgents: new Set(),
};

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 1: SINTAXIS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Capa 1 — Sintaxis", () => {

  it("acepta objeto JSON válido con campos conocidos", () => {
    const r = validateSyntax(validRaw());
    expect(r.ok).to.equal(true);
  });

  it("rechaza null", () => {
    const r = validateSyntax(null);
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.SYNTAX_ROOT_TYPE);
  });

  it("rechaza array como raíz", () => {
    const r = validateSyntax([{ trace_id: "x" }]);
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.SYNTAX_ROOT_TYPE);
  });

  it("rechaza string como raíz", () => {
    const r = validateSyntax("hello");
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.SYNTAX_ROOT_TYPE);
  });

  it("rechaza campo desconocido (Schema Hard-Lock)", () => {
    const r = validateSyntax({ ...validRaw(), unknown_field: "x" });
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.SYNTAX_UNKNOWN_FIELD);
    expect(r.error?.field).to.equal("unknown_field");
  });

  it("rechaza múltiples campos desconocidos (primer fallo)", () => {
    const r = validateSyntax({ evil: 1, another: 2 });
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.SYNTAX_UNKNOWN_FIELD);
  });

  it("acepta objeto con todos los campos permitidos", () => {
    expect(validateSyntax(validRaw()).ok).to.equal(true);
  });

  it("indica la capa correcta en el error", () => {
    const r = validateSyntax(null);
    expect(r.layer).to.equal(1);
    expect(r.error?.layer).to.equal(1);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 2: TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Capa 2 — Tipos", () => {

  it("acepta tipos correctos", () => {
    expect(validateTypes(validRaw()).ok).to.equal(true);
  });

  it("rechaza trace_id con formato incorrecto", () => {
    const r = validateTypes({ ...validRaw(), trace_id: "BAD-ID" });
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.TYPE_FORMAT);
    expect(r.error?.field).to.equal("trace_id");
  });

  it("rechaza case_id con formato incorrecto", () => {
    const r = validateTypes({ ...validRaw(), case_id: "bad_case" });
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.TYPE_FORMAT);
  });

  it("rechaza priority=0 (fuera de rango 1-10)", () => {
    const r = validateTypes({ ...validRaw(), priority: 0 });
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.TYPE_RANGE);
  });

  it("rechaza priority=11 (fuera de rango)", () => {
    const r = validateTypes({ ...validRaw(), priority: 11 });
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.TYPE_RANGE);
  });

  it("rechaza type inválido", () => {
    const r = validateTypes({ ...validRaw(), type: "EVIL" });
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.TYPE_MISMATCH);
  });

  it("rechaza P3_ethics inválido", () => {
    const ord = validRaw();
    (ord.governance as Record<string,unknown>).P3_ethics = "medium";
    const r = validateTypes(ord);
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.TYPE_MISMATCH);
  });

  it("rechaza signature sin prefijo válido", () => {
    const r = validateTypes({ ...validRaw(), signature: "rsa:xxx" });
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.TYPE_FORMAT);
  });

  it("rechaza hash con formato incorrecto", () => {
    const r = validateTypes({ ...validRaw(), hash: "md5:abc" });
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.TYPE_FORMAT);
  });

  it("acepta trace_parent válido", () => {
    const r = validateTypes({ ...validRaw(), trace_parent: "ROOT.SO.ORD.20260416T110000Z.PAR01" });
    expect(r.ok).to.equal(true);
  });

  it("acepta trace_parent null", () => {
    expect(validateTypes(validRaw()).ok).to.equal(true);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 3: PRESENCIA
// ═══════════════════════════════════════════════════════════════════════════════

describe("Capa 3 — Presencia", () => {

  it("acepta orden completa", () => {
    expect(validatePresence(validRaw()).ok).to.equal(true);
  });

  it("rechaza trace_id faltante", () => {
    const { trace_id: _, ...bad } = validRaw();
    const r = validatePresence(bad as Record<string, unknown>);
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.FIELD_MISSING);
    expect(r.error?.field).to.equal("trace_id");
  });

  it("rechaza payload.action faltante", () => {
    const ord = { ...validRaw(), payload: { params: {} } };
    const r = validatePresence(ord);
    expect(r.ok).to.equal(false);
    expect(r.error?.field).to.equal("payload.action");
  });

  it("rechaza governance.P1_cost_max faltante", () => {
    const ord = { ...validRaw() };
    const gov = { ...(ord.governance as Record<string,unknown>) };
    delete gov.P1_cost_max;
    ord.governance = gov;
    const r = validatePresence(ord);
    expect(r.ok).to.equal(false);
    expect(r.error?.field).to.include("P1_cost_max");
  });

  it("indica capa 3 en el error", () => {
    const { trace_id: _, ...bad } = validRaw();
    expect(validatePresence(bad as Record<string, unknown>).error?.layer).to.equal(3);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 4: CONTEXTO LEDGER
// ═══════════════════════════════════════════════════════════════════════════════

describe("Capa 4 — Contexto Ledger", () => {

  it("acepta orden cuando CASE está activo", () => {
    const ledger: LedgerContext = {
      activeCases:   new Set(["CASE-1"]),
      frozenCases:   new Set(),
      blockedAgents: new Set(),
    };
    expect(validateLedgerContext(validRaw(), ledger).ok).to.equal(true);
  });

  it("rechaza si CASE está congelado", () => {
    const ledger: LedgerContext = {
      activeCases:   new Set(),
      frozenCases:   new Set(["CASE-1"]),
      blockedAgents: new Set(),
    };
    const r = validateLedgerContext(validRaw(), ledger);
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.LEDGER_CASE_FROZEN);
  });

  it("rechaza si agente está bloqueado", () => {
    const ledger: LedgerContext = {
      activeCases:   new Set(["CASE-1"]),
      frozenCases:   new Set(),
      blockedAgents: new Set(["did:example:agentA"]),
    };
    const r = validateLedgerContext(validRaw(), ledger);
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.LEDGER_AGENT_BLOCKED);
  });

  it("rechaza si CASE no existe en registry con entradas", () => {
    const ledger: LedgerContext = {
      activeCases:   new Set(["CASE-99"]),  // solo CASE-99 activo
      frozenCases:   new Set(),
      blockedAgents: new Set(),
    };
    const r = validateLedgerContext(validRaw(), ledger);  // ord usa CASE-1
    expect(r.ok).to.equal(false);
    expect(r.error?.code).to.equal(SV_ERR.LEDGER_CASE_NOT_FOUND);
  });

  it("acepta si activeCases vacío (modo permisivo)", () => {
    expect(validateLedgerContext(validRaw(), emptyLedger).ok).to.equal(true);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 5: NORMALIZEDORDER
// ═══════════════════════════════════════════════════════════════════════════════

describe("Capa 5 — NormalizedOrder", () => {

  it("normaliza correctamente una orden válida", () => {
    const n = normalizeOrder(validRaw());
    expect(n.trace_id).to.equal("ROOT.SO.ORD.20260416T120000Z.PIPE01");
    expect(n.priority).to.equal(7);
    expect(n.governance.P1_cost_max).to.equal(500);
    expect(n.schema_version).to.equal("1.0.0");
  });

  it("trace_parent null se preserva como null", () => {
    const n = normalizeOrder(validRaw());
    expect(n.trace_parent).to.equal(null);
  });

  it("campos numéricos son números, no strings", () => {
    const n = normalizeOrder(validRaw());
    expect(typeof n.priority).to.equal("number");
    expect(typeof n.governance.P1_cost_max).to.equal("number");
    expect(typeof n.governance.P2_timeout_ms).to.equal("number");
    expect(typeof n.governance.P4_risk_max).to.equal("number");
  });

  it("NormalizedOrder incluye normalized_at ISO", () => {
    const n = normalizeOrder(validRaw());
    expect(new Date(n.normalized_at).getTime()).to.be.greaterThan(0);
  });

  it("misma entrada produce misma estructura (determinismo)", () => {
    const r1 = validRaw();
    const r2 = { ...r1 }; // mismo contenido
    const n1 = normalizeOrder(r1);
    const n2 = normalizeOrder(r2);
    expect(n1.trace_id).to.equal(n2.trace_id);
    expect(n1.governance.P1_cost_max).to.equal(n2.governance.P1_cost_max);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA 6: ARTEFACTO DETERMINISTA
// ═══════════════════════════════════════════════════════════════════════════════

describe("Capa 6 — Artefacto Determinista", () => {

  it("genera artefacto con artifact_hash SHA-256", () => {
    const n = normalizeOrder(validRaw());
    const a = buildArtifact(n);
    expect(a.artifact_hash).to.match(/^sha256:[a-f0-9]{64}$/);
  });

  it("canonical_json tiene claves ordenadas", () => {
    const n = normalizeOrder(validRaw());
    const a = buildArtifact(n);
    const parsed = JSON.parse(a.canonical_json);
    const keys = Object.keys(parsed);
    expect(keys).to.deep.equal([...keys].sort());
  });

  it("artifact_hash es determinista para misma NormalizedOrder", () => {
    const raw = validRaw();
    const n1  = normalizeOrder(raw);
    const n2  = normalizeOrder({ ...raw });
    // normalized_at puede diferir por milisegundos — comparar hash del canonical_json base
    const a1  = buildArtifact({ ...n1, normalized_at: "2026-04-16T12:00:00.000Z" });
    const a2  = buildArtifact({ ...n2, normalized_at: "2026-04-16T12:00:00.000Z" });
    expect(a1.artifact_hash).to.equal(a2.artifact_hash);
  });

  it("artifact_id es UUID único", () => {
    const n  = normalizeOrder(validRaw());
    const a1 = buildArtifact(n);
    const a2 = buildArtifact(n);
    expect(a1.artifact_id).to.not.equal(a2.artifact_id);
  });

  it("serializeCanonical es puro y determinista", () => {
    const obj = { z: 3, a: 1, m: { y: 2, x: 1 } };
    const s1  = serializeCanonical(obj);
    const s2  = serializeCanonical(obj);
    expect(s1).to.equal(s2);
    expect(s1).to.include('"a":1');
    expect(s1.indexOf('"a"')).to.be.lessThan(s1.indexOf('"m"'));
  });

  it("serializeCanonical maneja null, boolean, number", () => {
    expect(serializeCanonical(null)).to.equal("null");
    expect(serializeCanonical(true)).to.equal("true");
    expect(serializeCanonical(42)).to.equal("42");
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE COMPLETO — 12 CAPAS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Pipeline Completo (Capas 1–12)", () => {

  it("ACCEPTED con orden completamente válida", () => {
    const r = runPipeline(validRaw(), { skipLedgerLayer: true, skipPolicyLayer: true });
    expect(r.verdict).to.equal("ACCEPTED");
    expect(r.normalized).to.exist;
    expect(r.artifact).to.exist;
  });

  it("REJECTED en capa 1 — campo desconocido", () => {
    const r = runPipeline({ ...validRaw(), evil_field: "x" }, { skipLedgerLayer: true });
    expect(r.verdict).to.equal("REJECTED");
    expect(r.layers_passed).to.equal(0);
    expect(r.error?.layer).to.equal(1);
    expect(r.error?.code).to.equal(SV_ERR.SYNTAX_UNKNOWN_FIELD);
  });

  it("REJECTED en capa 2 — priority fuera de rango", () => {
    const ord = validRaw({ priority: 15 });
    ord.hash  = computeHash({ ...ord, hash: "", signature: "" });
    const r   = runPipeline(ord, { skipLedgerLayer: true });
    expect(r.verdict).to.equal("REJECTED");
    expect(r.error?.layer).to.equal(2);
  });

  it("REJECTED en capa 3 — campo requerido faltante", () => {
    const { case_id: _, ...bad } = validRaw();
    const r = runPipeline(bad, { skipLedgerLayer: true });
    expect(r.verdict).to.equal("REJECTED");
    expect(r.error?.layer).to.equal(3);
  });

  it("REJECTED en capa 4 — CASE congelado", () => {
    const r = runPipeline(validRaw(), {
      ledgerContext: {
        activeCases:   new Set(["CASE-1"]),
        frozenCases:   new Set(["CASE-1"]),
        blockedAgents: new Set(),
      },
    });
    expect(r.verdict).to.equal("REJECTED");
    expect(r.error?.layer).to.equal(4);
    expect(r.error?.code).to.equal(SV_ERR.LEDGER_CASE_FROZEN);
  });

  it("ACCEPTED incluye NormalizedOrder y Artefacto", () => {
    const r = runPipeline(validRaw(), { skipLedgerLayer: true, skipPolicyLayer: true });
    expect(r.normalized?.trace_id).to.equal("ROOT.SO.ORD.20260416T120000Z.PIPE01");
    expect(r.artifact?.artifact_hash).to.match(/^sha256:[a-f0-9]{64}$/);
  });

  it("ACCEPTED registra evento en Ledger (capa 8)", () => {
    const ledger = new LedgerFractal();
    runPipeline(validRaw(), { skipLedgerLayer: true, skipPolicyLayer: true, ledger });
    const events = ledger.queryByCase("CASE-1");
    expect(events.some(e => e.event_type === "ORD_STRUCTURALLY_VALID")).to.equal(true);
  });

  it("pipeline con Policy Engine completo — ACCEPTED", () => {
    const r = runPipeline(validRaw(), { skipLedgerLayer: true });
    expect(r.verdict).to.equal("ACCEPTED");
    expect(r.policy_verdict).to.equal("ALLOW");
  });

  it("duration_ms es número positivo", () => {
    const r = runPipeline(validRaw(), { skipLedgerLayer: true });
    expect(r.duration_ms).to.be.a("number").and.greaterThanOrEqual(0);
  });

  it("SV-CASCADE-01: orden de capas es fijo (sintaxis antes que presencia)", () => {
    // Si hubiera un campo desconocido Y un campo faltante, el error debe ser de capa 1 (sintaxis)
    const bad = { evil_field: "x" };  // falta todo + campo desconocido
    const r   = runPipeline(bad, { skipLedgerLayer: true });
    expect(r.error?.layer).to.equal(1);
    expect(r.error?.code).to.equal(SV_ERR.SYNTAX_UNKNOWN_FIELD);
  });

  it("layers_passed refleja cuántas capas superó", () => {
    const r = runPipeline(validRaw(), { skipLedgerLayer: true, skipPolicyLayer: true });
    expect(r.layers_passed).to.equal(6);
  });

});
