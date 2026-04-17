/**
 * CORE API — Router v0.1
 * Pattern matching de rutas con parámetros (:param).
 * Sin dependencias externas — Node.js built-in únicamente.
 */

import type { Route, ApiRequest, ApiResponse, Handler } from "./types";
import { ApiError } from "./types";

export class Router {
  private readonly routes: Route[] = [];

  get(pattern: string, handler: Handler):  this { return this._add("GET",    pattern, handler); }
  post(pattern: string, handler: Handler): this { return this._add("POST",   pattern, handler); }
  put(pattern: string, handler: Handler):  this { return this._add("PUT",    pattern, handler); }
  del(pattern: string, handler: Handler):  this { return this._add("DELETE", pattern, handler); }

  private _add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method, pattern, handler });
    return this;
  }

  /**
   * Despacha una petición. Devuelve la respuesta o lanza ApiError.
   */
  async dispatch(req: ApiRequest): Promise<ApiResponse> {
    // Buscar ruta coincidente
    for (const route of this.routes) {
      if (route.method !== req.method.toUpperCase()) continue;

      const params = matchPath(route.pattern, req.path);
      if (params === null) continue;

      try {
        return await route.handler({ ...req, params });
      } catch (err) {
        if (err instanceof ApiError) {
          return { status: err.status, body: { error_code: err.code, message: err.message } };
        }
        return {
          status: 500,
          body: { error_code: "INTERNAL_ERROR", message: (err as Error).message },
        };
      }
    }

    return { status: 404, body: { error_code: "NOT_FOUND", message: `${req.method} ${req.path} not found` } };
  }

  routes_list(): string[] {
    return this.routes.map(r => `${r.method} ${r.pattern}`);
  }
}

/**
 * Compara un path contra un patrón con :params.
 * Devuelve el mapa de parámetros o null si no coincide.
 */
export function matchPath(
  pattern: string,
  path:    string,
): Record<string, string> | null {
  const patParts  = pattern.split("/").filter(Boolean);
  const pathParts = path.split("?")[0].split("/").filter(Boolean);

  if (patParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(":")) {
      params[patParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patParts[i] !== pathParts[i]) {
      return null;
    }
  }

  return params;
}

/**
 * Parsea query string → objeto clave/valor.
 */
export function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf("?");
  if (idx === -1) return {};
  const qs     = url.slice(idx + 1);
  const result: Record<string, string> = {};
  for (const part of qs.split("&")) {
    const [k, v] = part.split("=");
    if (k) result[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return result;
}
