/**
 * Endpoint Routes — GET /endpoints, GET /endpoints/:id, GET /fingerprints/:endpointId
 */

import type { FastifyInstance } from "fastify";
import { PaginationQuerySchema } from "../schemas.js";
import { requirePermission } from "../middleware/auth.js";
import { NotFoundError } from "../errors.js";
import type { Endpoint, SemanticFingerprint } from "../../../shared_interfaces.js";

// In-Memory Stores
const endpointStore = new Map<string, Endpoint>();
const fingerprintStore = new Map<string, SemanticFingerprint>();

export function _getEndpointStore(): Map<string, Endpoint> {
  return endpointStore;
}

export function _getFingerprintStore(): Map<string, SemanticFingerprint> {
  return fingerprintStore;
}

export async function endpointRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/endpoints
  fastify.get<{ Querystring: Record<string, string> }>("/api/v1/endpoints", {
    preHandler: [requirePermission("endpoints:read")],
  }, async (request, reply) => {
    const queryParsed = PaginationQuerySchema.safeParse(request.query);
    const limit = queryParsed.success ? queryParsed.data.limit : 20;
    const offset = queryParsed.success ? queryParsed.data.offset : 0;

    const query = request.query;
    let items = Array.from(endpointStore.values());

    if (query["siteId"]) {
      items = items.filter((e) => e.siteId === query["siteId"]);
    }
    if (query["type"]) {
      items = items.filter((e) => e.type === query["type"]);
    }
    if (query["status"]) {
      items = items.filter((e) => e.status === query["status"]);
    }
    if (query["minConfidence"]) {
      const minConf = parseFloat(query["minConfidence"]);
      if (!isNaN(minConf)) {
        items = items.filter((e) => e.confidence >= minConf);
      }
    }

    const total = items.length;
    const paged = items.slice(offset, offset + limit);

    return reply.status(200).send({
      items: paged,
      total,
      limit,
      offset,
    });
  });

  // GET /api/v1/endpoints/:id
  fastify.get<{ Params: { id: string } }>("/api/v1/endpoints/:id", {
    preHandler: [requirePermission("endpoints:read")],
  }, async (request, reply) => {
    const { id } = request.params;
    const endpoint = endpointStore.get(id);

    if (!endpoint) {
      throw new NotFoundError("Endpoint", id);
    }

    return reply.status(200).send(endpoint);
  });

  // GET /api/v1/fingerprints/:endpointId
  fastify.get<{ Params: { endpointId: string } }>("/api/v1/fingerprints/:endpointId", {
    preHandler: [requirePermission("endpoints:read")],
  }, async (request, reply) => {
    const { endpointId } = request.params;
    const fingerprint = fingerprintStore.get(endpointId);

    if (!fingerprint) {
      throw new NotFoundError("Fingerprint", endpointId);
    }

    return reply.status(200).send(fingerprint);
  });
}
