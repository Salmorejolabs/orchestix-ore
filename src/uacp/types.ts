/**
 * UACP Types v0.1 — Unified Agent Coordination Protocol
 * Modelos de datos: ExecutionNode, ExecutionGraph.
 * Fuente: Sección 6.3, Volumen III.
 */

import type { ExecutionEnvelope } from "../oco/types";

// ─── NodeStatus ───────────────────────────────────────────────────────────────

export type NodeStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export const TERMINAL_STATUSES = new Set<NodeStatus>(["COMPLETED", "FAILED", "SKIPPED"]);

// ─── ExecutionNode ────────────────────────────────────────────────────────────

export interface ExecutionNode {
  node_id:      string;
  case_id:      string;
  action:       string;
  input:        Record<string, unknown>;
  policies:     Record<string, unknown>;   // P1–P8 aplicables a este nodo
  dependencies: string[];                  // node_ids de los que depende
  status:       NodeStatus;
  result?:      Record<string, unknown>;
  agent_id?:    string;
  started_at?:  string;                    // ISO 8601
  finished_at?: string;
  retry_count:  number;
  error?:       string;
}

// ─── ExecutionGraph ───────────────────────────────────────────────────────────

export interface GraphMetadata {
  trace_id:  string;
  token_id:  string;
  [key: string]: unknown;
}

export interface ExecutionGraph {
  case_id:  string;
  nodes:    Map<string, ExecutionNode>;
  metadata: GraphMetadata;
}

// ─── LedgerEvent ──────────────────────────────────────────────────────────────

export type LedgerEventType =
  | "CASE_STARTED"
  | "CASE_COMPLETED"
  | "CASE_FAILED"
  | "NODE_STARTED"
  | "NODE_COMPLETED"
  | "NODE_FAILED"
  | "BRANCH_FROZEN"
  | "DEADLOCK"
  | "HARD_POLICY_VIOLATION";

export interface LedgerEvent {
  event_type:  LedgerEventType;
  case_id:     string;
  node_id?:    string;
  timestamp:   string;
  extra:       Record<string, unknown>;
}

// ─── AgentDescriptor (stub para v0.1) ─────────────────────────────────────────

export interface AgentDescriptor {
  agent_id:   string;
  endpoint?:  string;
  capability: string;
}

// ─── UACPResult ───────────────────────────────────────────────────────────────

export interface UACPResult {
  case_id:       string;
  trace_id:      string;
  success:       boolean;
  nodes_total:   number;
  nodes_completed: number;
  nodes_failed:  number;
  nodes_skipped: number;
  events:        LedgerEvent[];
  duration_ms:   number;
}
