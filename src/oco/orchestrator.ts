/**
 * OCO Orchestrator v0.1 — Punto de entrada de OCO
 *
 * Flujo: ApprovedOrder → validar → hash → token → envelope
 *
 * Interfaz pública:
 *   processApprovedOrder(order: ApprovedOrder): OcoResponse
 *
 * No lanza excepciones: todos los errores van en OcoResponse.
 * Referencia: Sección 3.7, Volumen II.
 */

import type { ApprovedOrder, OcoResponse } from "./types";
import { OcoValidationError, runAllValidations } from "./validators";
import {
  generateTraceId,
  hashApprovedOrder,
  buildIntentionToken,
  buildExecutionEnvelope,
  type BuildTokenOptions,
} from "./token-builder";

export class OcoOrchestrator {
  constructor(private readonly opts: BuildTokenOptions = {}) {}

  /**
   * Punto de entrada principal de OCO.
   * Recibe ApprovedOrder de ACI y devuelve OcoResponse.
   */
  processApprovedOrder(order: ApprovedOrder): OcoResponse {
    // 1–5. Validaciones deterministas (OCO_001–OCO_005)
    try {
      runAllValidations(order);
    } catch (e) {
      if (e instanceof OcoValidationError) {
        return { ok: false, code: e.code, message: e.message };
      }
      return { ok: false, code: "OCO_000", message: `Unexpected error: ${(e as Error).message}` };
    }

    // 6. Hash SHA-256 de ApprovedOrder (OCO_006)
    const approvedHash = hashApprovedOrder(order);

    // 7. Trace ID raíz
    const traceId = generateTraceId(order.case_id);

    // 8. IntentionToken
    const token = buildIntentionToken(order, approvedHash, traceId, this.opts);

    // 9. ExecutionEnvelope para UACP
    const envelope = buildExecutionEnvelope(token, order);

    return { ok: true, token, envelope };
  }
}

// Instancia singleton para uso directo
export const ocoOrchestrator = new OcoOrchestrator({ environment: "dev", priority: 5 });

// Re-export types para consumidores externos
export type { ApprovedOrder, OcoResponse, IntentionToken, ExecutionEnvelope } from "./types";
