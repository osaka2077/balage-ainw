/**
 * Global Error Handler — Strukturierte JSON Error Responses
 */

import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { ApiError } from "../errors.js";
import type { BalageLogger } from "../../observability/logger.js";

/** Erstellt den globalen Error-Handler */
export function createErrorHandler(logger: BalageLogger) {
  return function errorHandler(
    error: FastifyError | Error,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    // ApiError — nutze Status Code und Code aus Error
    if (error instanceof ApiError) {
      logger.warn("API error", {
        code: error.code,
        statusCode: error.statusCode,
        path: request.url,
        method: request.method,
      });

      void reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return;
    }

    // ZodError — Validation Error
    if (error instanceof ZodError) {
      logger.warn("Validation error", {
        path: request.url,
        issues: error.issues.length,
      });

      void reply.status(400).send({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: { issues: error.issues },
      });
      return;
    }

    // Fastify-eigene Validation Errors (kommt von schema validation)
    if ("validation" in error && error.validation) {
      void reply.status(400).send({
        error: error.message,
        code: "VALIDATION_ERROR",
        details: { validation: error.validation },
      });
      return;
    }

    // Rate Limit Errors von @fastify/rate-limit (thrown als Objekt mit statusCode)
    const errAny = error as unknown as Record<string, unknown>;
    if (errAny["statusCode"] === 429) {
      void reply.status(429).send({
        error: "Rate limit exceeded",
        code: "RATE_LIMIT_EXCEEDED",
        details: { retryAfter: 60 },
      });
      return;
    }

    // Unbekannte Errors — kein Detail exposen (Security)
    logger.error("Unhandled error", {
      error: error.message,
      path: request.url,
      method: request.method,
    });

    void reply.status(500).send({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  };
}
