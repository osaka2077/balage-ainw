/**
 * Action Routes — POST /actions/execute
 */

import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ActionExecuteRequestSchema } from "../schemas.js";
import { requirePermission } from "../middleware/auth.js";
import { NotFoundError, ValidationError, IdempotencyConflictError } from "../errors.js";
import type { ActionExecuteResponse, IdempotencyEntry } from "../types.js";
import { _getEndpointStore } from "./endpoints.js";

const actionIdempotencyStore = new Map<string, IdempotencyEntry>();

export function _getActionIdempotencyStore(): Map<string, IdempotencyEntry> {
  return actionIdempotencyStore;
}

function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export async function actionRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/actions/execute
  fastify.post("/api/v1/actions/execute", {
    preHandler: [requirePermission("actions:execute")],
  }, async (request, reply) => {
    const parsed = ActionExecuteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", {
        issues: parsed.error.issues,
      });
    }

    const { endpointId, action, parameters, options } = parsed.data;

    // Idempotency Key Handling
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey === "string") {
      const existing = actionIdempotencyStore.get(idempotencyKey);
      if (existing) {
        const currentHash = hashRequest(request.body);
        if (existing.requestHash !== currentHash) {
          throw new IdempotencyConflictError(idempotencyKey);
        }
        return reply.status(existing.statusCode).send(existing.response);
      }
    }

    const endpointStore = _getEndpointStore();
    const endpoint = endpointStore.get(endpointId);
    if (!endpoint) {
      throw new NotFoundError("Endpoint", endpointId);
    }

    const startTime = Date.now();

    const response: ActionExecuteResponse = {
      success: !options?.dryRun,
      action,
      endpointId,
      result: parameters ?? {},
      confidence: endpoint.confidence,
      gateDecision: "allow",
      evidence: endpoint.evidence,
      duration: Date.now() - startTime,
    };

    if (typeof idempotencyKey === "string") {
      actionIdempotencyStore.set(idempotencyKey, {
        key: idempotencyKey,
        requestHash: hashRequest(request.body),
        response,
        statusCode: 200,
        createdAt: new Date(),
      });
    }

    return reply.status(200).send(response);
  });
}
