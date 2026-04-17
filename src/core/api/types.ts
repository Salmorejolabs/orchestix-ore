/**
 * CORE API — Types v0.1
 * Contratos internos del servidor HTTP sin dependencias externas.
 * Usa Node.js built-in http únicamente.
 */

// ─── Request / Response internos ─────────────────────────────────────────────

export interface ApiRequest {
  method:  string;                          // GET, POST, etc.
  path:    string;                          // /v1/core/orders
  params:  Record<string, string>;          // path params: { trace_id: "..." }
  query:   Record<string, string>;          // query string: { since: "..." }
  body:    Record<string, unknown> | null;  // parsed JSON body
  headers: Record<string, string>;
}

export interface ApiResponse {
  status:  number;
  body:    unknown;
  headers?: Record<string, string>;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export type Handler = (req: ApiRequest) => ApiResponse | Promise<ApiResponse>;

// ─── Route ────────────────────────────────────────────────────────────────────

export interface Route {
  method:  string;
  pattern: string;          // /v1/core/orders/:trace_id
  handler: Handler;
}

// ─── API Error ────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status:  number,
    public readonly code:    string,
    message:                 string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Helpers de respuesta ─────────────────────────────────────────────────────

export const ok         = (body: unknown):  ApiResponse => ({ status: 200, body });
export const created    = (body: unknown):  ApiResponse => ({ status: 201, body });
export const accepted   = (body: unknown):  ApiResponse => ({ status: 202, body });
export const notFound   = (msg:  string):   ApiResponse => ({ status: 404, body: { error_code: "NOT_FOUND",  message: msg } });
export const badRequest = (code: string, msg: string): ApiResponse =>
  ({ status: 400, body: { error_code: code, message: msg } });
export const forbidden  = (msg: string): ApiResponse =>
  ({ status: 403, body: { error_code: "FORBIDDEN", message: msg } });
export const conflict   = (code: string, msg: string): ApiResponse =>
  ({ status: 409, body: { error_code: code, message: msg } });
export const tooMany    = (msg: string): ApiResponse =>
  ({ status: 429, body: { error_code: "TOO_MANY_REQUESTS", message: msg } });
export const unavailable = (msg: string): ApiResponse =>
  ({ status: 503, body: { error_code: "SERVICE_UNAVAILABLE", message: msg } });
