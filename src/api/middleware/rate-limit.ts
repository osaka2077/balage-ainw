/**
 * Rate Limiting — Per-Key Rate Limiting Konfiguration
 *
 * Nutzt @fastify/rate-limit Plugin. Dieses Modul exportiert
 * die Konfiguration und einen Key-Generator.
 */

import type { FastifyRequest } from "fastify";
import type { ApiServerConfig } from "../types.js";

/** Erstellt die Rate-Limit Konfiguration fuer @fastify/rate-limit */
export function createRateLimitConfig(config: ApiServerConfig) {
  return {
    max: config.rateLimit.global,
    timeWindow: "1 minute",
    keyGenerator: (request: FastifyRequest): string => {
      const apiKey = request.apiKeyConfig;
      if (apiKey) {
        return `key:${apiKey.name}`;
      }
      return `ip:${request.ip}`;
    },
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
  };
}
