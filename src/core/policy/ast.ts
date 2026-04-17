/**
 * Policy Engine — AST Builder v0.1
 * Constructores fluidos para crear nodos del AST constitucional.
 * Garantiza ASTs bien formados sin posibilidad de construcción inválida.
 * Fuente: Sección 5.1.2, OCO v1.0.
 */

import { createHash } from "crypto";
import type {
  AstNode, OperandNode, ConstitutionalAST,
  ConstantNode, PlaceholderNode, ComparisonNode,
  LogicalNode, RangeNode, AggregateNode,
  ComparisonOperator, ValueType, AggregateOperator,
} from "./types";

// ─── Operand builders ─────────────────────────────────────────────────────────

export function int(value: number): ConstantNode {
  return { kind: "CONSTANT", type: "INT", value: Math.trunc(value) };
}

export function float(value: number): ConstantNode {
  return { kind: "CONSTANT", type: "FLOAT", value };
}

export function str(value: string): ConstantNode {
  return { kind: "CONSTANT", type: "STRING", value };
}

export function bool(value: boolean): ConstantNode {
  return { kind: "CONSTANT", type: "BOOL", value };
}

export function placeholder(symbol: string, type: ValueType = "INT"): PlaceholderNode {
  return { kind: "PLACEHOLDER", symbol, type };
}

export function aggregate(op: AggregateOperator, symbol: string): AggregateNode {
  return { kind: "AGGREGATE", op, symbol };
}

// ─── Comparison builders ──────────────────────────────────────────────────────

export function lte(left: OperandNode, right: OperandNode): ComparisonNode {
  return { kind: "COMPARISON", op: "≤", left, right };
}

export function gte(left: OperandNode, right: OperandNode): ComparisonNode {
  return { kind: "COMPARISON", op: "≥", left, right };
}

export function eq(left: OperandNode, right: OperandNode): ComparisonNode {
  return { kind: "COMPARISON", op: "==", left, right };
}

export function neq(left: OperandNode, right: OperandNode): ComparisonNode {
  return { kind: "COMPARISON", op: "≠", left, right };
}

export function lt(left: OperandNode, right: OperandNode): ComparisonNode {
  return { kind: "COMPARISON", op: "<", left, right };
}

export function gt(left: OperandNode, right: OperandNode): ComparisonNode {
  return { kind: "COMPARISON", op: ">", left, right };
}

// ─── Logical builders ─────────────────────────────────────────────────────────

export function and(left: AstNode, right: AstNode): LogicalNode {
  return { kind: "LOGICAL", op: "AND", left, right };
}

export function or(left: AstNode, right: AstNode): LogicalNode {
  return { kind: "LOGICAL", op: "OR", left, right };
}

export function not(expr: AstNode): LogicalNode {
  return { kind: "LOGICAL", op: "NOT", left: expr };
}

// ─── Range builder ────────────────────────────────────────────────────────────

export function between(value: OperandNode, low: OperandNode, high: OperandNode): RangeNode {
  return { kind: "RANGE", value, low, high };
}

// ─── ConstitutionalAST builder ───────────────────────────────────────────────

export function buildAST(
  policy_id: string,
  expression: AstNode,
  version = "1.0.0",
): ConstitutionalAST {
  const payload   = JSON.stringify({ policy_id, version, expression }, null, 0);
  const hash      = createHash("sha256").update(payload, "utf8").digest("hex");
  return { policy_id, version, expression, hash };
}
