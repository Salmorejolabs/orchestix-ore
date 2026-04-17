/**
 * Policy Engine — Predicate Engine v0.1
 * Evaluador puro del AST constitucional contra BoundContext.
 *
 * Invariantes aplicados:
 *   POL-INV-01: Determinismo — misma entrada → misma salida
 *   POL-INV-02: Pureza funcional — sin efectos secundarios
 *   POL-INV-05: Fail-safe — ante error interno → DENY
 *
 * La evaluación es:
 *   - Completamente sin estado (no modifica ningún objeto externo)
 *   - Sin accesos a red, reloj o aleatoriedad
 *   - Short-circuit en AND/OR (igual que JavaScript nativo)
 *   - Enteros 64-bit para comparaciones críticas (POL-INV-01)
 *
 * Fuente: Sección 5.1.1.1.3, OCO v1.0.
 */

import type {
  AstNode, BoundContext, ContextValue,
  PolicyEvidence, ComparisonOperator,
} from "./types";
import { POL_ERR } from "./types";

// ─── Resultado de evaluación de un nodo ──────────────────────────────────────

export interface PredicateResult {
  result:    boolean;
  evidence?: PolicyEvidence;
  error?:    string;
}

// ─── Resolvedor de operandos ──────────────────────────────────────────────────

function resolveOperand(node: AstNode, ctx: BoundContext): ContextValue {
  if (node.kind === "CONSTANT") {
    return node.value;
  }

  if (node.kind === "PLACEHOLDER") {
    const val = ctx.bindings[node.symbol];
    if (val === undefined) {
      throw new Error(`${POL_ERR.CONTEXT_MISSING}:${node.symbol}`);
    }
    return val;
  }

  if (node.kind === "AGGREGATE") {
    const list = ctx.bindings[node.symbol];
    if (!Array.isArray(list)) {
      throw new Error(`${POL_ERR.CONTEXT_TYPE}:${node.symbol} expected array`);
    }
    switch (node.op) {
      case "SUM":   return list.reduce((a: number, b: number) => a + b, 0);
      case "AVG":   return list.length === 0 ? 0 : list.reduce((a: number, b: number) => a + b, 0) / list.length;
      case "COUNT": return list.length;
      case "MIN":   return list.length === 0 ? 0 : Math.min(...list);
      case "MAX":   return list.length === 0 ? 0 : Math.max(...list);
    }
  }

  throw new Error(`${POL_ERR.PIPELINE_EVAL}: unknown operand kind`);
}

// ─── Comparadores (enteros 64-bit para determinismo) ─────────────────────────

function compare(
  left:  ContextValue,
  op:    ComparisonOperator,
  right: ContextValue,
): boolean {
  // Normalizar: usar números para comparaciones numéricas
  const l = typeof left  === "boolean" ? (left  ? 1 : 0) : left;
  const r = typeof right === "boolean" ? (right ? 1 : 0) : right;

  switch (op) {
    case "≤": case "lte": return (l as number) <= (r as number);
    case "≥": case "gte": return (l as number) >= (r as number);
    case "<": case "lt":  return (l as number) <  (r as number);
    case ">": case "gt":  return (l as number) >  (r as number);
    case "==": case "eq": return l === r;
    case "≠": case "neq": return l !== r;
    default:              return false;
  }
}

// ─── Evaluador principal ──────────────────────────────────────────────────────

export function evaluateNode(node: AstNode, ctx: BoundContext): PredicateResult {
  try {
    return _evalNode(node, ctx);
  } catch (err) {
    // POL-INV-05: fail-safe — cualquier error interno → DENY
    return {
      result: false,
      error:  (err as Error).message ?? POL_ERR.FAIL_SAFE,
    };
  }
}

function _evalNode(node: AstNode, ctx: BoundContext): PredicateResult {
  // ── COMPARISON ────────────────────────────────────────────────────────────
  if (node.kind === "COMPARISON") {
    const leftVal  = resolveOperand(node.left,  ctx);
    const rightVal = resolveOperand(node.right, ctx);
    const result   = compare(leftVal, node.op, rightVal);

    const evidence: PolicyEvidence = {
      symbol:   node.left.kind  === "PLACEHOLDER" ? node.left.symbol :
                node.right.kind === "PLACEHOLDER" ? node.right.symbol : "literal",
      expected: rightVal,
      actual:   leftVal,
      operator: node.op,
    };

    return { result, evidence };
  }

  // ── LOGICAL ───────────────────────────────────────────────────────────────
  if (node.kind === "LOGICAL") {
    if (node.op === "NOT") {
      const inner = _evalNode(node.left, ctx);
      return { result: !inner.result, evidence: inner.evidence };
    }

    // Short-circuit AND/OR (determinista — evaluación izquierda primero)
    const leftRes = _evalNode(node.left, ctx);

    if (node.op === "AND" && !leftRes.result) {
      return { result: false, evidence: leftRes.evidence };
    }
    if (node.op === "OR" && leftRes.result) {
      return { result: true, evidence: leftRes.evidence };
    }

    const rightRes = _evalNode(node.right!, ctx);

    if (node.op === "AND") {
      return rightRes.result
        ? { result: true }
        : { result: false, evidence: rightRes.evidence };
    }

    // OR: ambos falsos
    return { result: rightRes.result, evidence: rightRes.evidence };
  }

  // ── RANGE (value BETWEEN low AND high) ────────────────────────────────────
  if (node.kind === "RANGE") {
    const val  = resolveOperand(node.value, ctx) as number;
    const low  = resolveOperand(node.low,   ctx) as number;
    const high = resolveOperand(node.high,  ctx) as number;
    const result = val >= low && val <= high;

    return {
      result,
      evidence: {
        symbol:   node.value.kind === "PLACEHOLDER" ? node.value.symbol : "value",
        expected: `[${low}, ${high}]` as unknown as ContextValue,
        actual:   val,
        operator: "BETWEEN",
      },
    };
  }

  // ── CONSTANT / PLACEHOLDER / AGGREGATE — evaluados como booleano ─────────
  if (node.kind === "CONSTANT") {
    return { result: Boolean(node.value) };
  }
  if (node.kind === "PLACEHOLDER" || node.kind === "AGGREGATE") {
    const val = resolveOperand(node, ctx);
    return { result: Boolean(val) };
  }

  // Nodo desconocido — fail-safe
  return { result: false, error: POL_ERR.FAIL_SAFE };
}
