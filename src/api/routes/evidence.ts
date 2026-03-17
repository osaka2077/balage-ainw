/**
 * Evidence Routes — GET /evidence/:id, GET /evidence/chain/:traceId
 */

import type { FastifyInstance } from "fastify";
import { requirePermission } from "../middleware/auth.js";
import { NotFoundError } from "../errors.js";
import type { Evidence } from "../../../shared_interfaces.js";
import type { EvidenceChainEntry, EvidenceChainResponse } from "../types.js";

// In-Memory Store
interface EvidenceRecord {
  id: string;
  traceId: string;
  evidence: Evidence;
  timestamp: string;
}

const evidenceStore = new Map<string, EvidenceRecord>();

export function _getEvidenceStore(): Map<string, EvidenceRecord> {
  return evidenceStore;
}

export async function evidenceRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/evidence/:id
  fastify.get<{ Params: { id: string } }>("/api/v1/evidence/:id", {
    preHandler: [requirePermission("evidence:read")],
  }, async (request, reply) => {
    const { id } = request.params;
    const record = evidenceStore.get(id);

    if (!record) {
      throw new NotFoundError("Evidence", id);
    }

    return reply.status(200).send(record.evidence);
  });

  // GET /api/v1/evidence/chain/:traceId
  fastify.get<{ Params: { traceId: string } }>("/api/v1/evidence/chain/:traceId", {
    preHandler: [requirePermission("evidence:read")],
  }, async (request, reply) => {
    const { traceId } = request.params;

    const chain: EvidenceChainEntry[] = [];
    for (const record of evidenceStore.values()) {
      if (record.traceId === traceId) {
        chain.push({
          id: record.id,
          type: record.evidence.type,
          signal: record.evidence.signal,
          weight: record.evidence.weight,
          timestamp: record.timestamp,
        });
      }
    }

    if (chain.length === 0) {
      throw new NotFoundError("Evidence chain", traceId);
    }

    const response: EvidenceChainResponse = {
      traceId,
      chain,
      isComplete: true,
      totalEntries: chain.length,
    };

    return reply.status(200).send(response);
  });
}
