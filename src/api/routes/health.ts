/**
 * Health Route — GET /api/v1/health (keine Auth noetig)
 */

import type { FastifyInstance } from "fastify";

const startTime = Date.now();

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/v1/health", async (_request, reply) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    const response = {
      status: "healthy" as const,
      version: "0.1.0",
      uptime,
      timestamp: new Date().toISOString(),
      checks: {
        orchestrator: "ok" as const,
        browser: "not_configured" as const,
        database: "not_configured" as const,
      },
    };

    return reply.status(200).send(response);
  });
}
