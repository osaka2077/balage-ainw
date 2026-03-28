/**
 * Auth Middleware — API Key Validation mit Timing-Safe Comparison
 */

import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { ApiKeyConfig, ApiPermission } from "../types.js";
import { AuthenticationError, AuthorizationError } from "../errors.js";

// Erweiterte Request-Typen fuer Auth-Kontext
declare module "fastify" {
  interface FastifyRequest {
    apiKeyConfig?: ApiKeyConfig;
  }
}

/** Vergleicht zwei Strings timing-safe */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  return timingSafeEqual(bufA, bufB);
}

/** Erstellt den Auth-Hook als preHandler */
export function createAuthHook(apiKeys: ApiKeyConfig[]) {
  return async function authHook(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    // Health-Endpoint ist von Auth ausgenommen
    if (request.url === "/api/v1/health") {
      return;
    }

    const apiKeyHeader = request.headers["x-api-key"];
    if (!apiKeyHeader || typeof apiKeyHeader !== "string") {
      throw new AuthenticationError("API key required", "AUTH_MISSING_KEY");
    }

    const matchedKey = apiKeys.find((k) => safeCompare(k.key, apiKeyHeader));
    if (!matchedKey) {
      throw new AuthenticationError("Invalid API key", "AUTH_INVALID_KEY");
    }

    // Speichere Key-Config im Request fuer spaetere Nutzung
    request.apiKeyConfig = matchedKey;
  };
}

/** Erstellt einen Permission-Check-Hook */
export function requirePermission(permission: ApiPermission) {
  return async function permissionHook(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const keyConfig = request.apiKeyConfig;
    if (!keyConfig) {
      throw new AuthenticationError("API key required", "AUTH_MISSING_KEY");
    }

    // admin hat Zugriff auf alles
    if (keyConfig.permissions.includes("admin")) {
      return;
    }

    if (!keyConfig.permissions.includes(permission)) {
      throw new AuthorizationError(
        "Insufficient permissions",
        "AUTH_FORBIDDEN",
      );
    }
  };
}
