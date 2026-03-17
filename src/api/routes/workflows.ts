/**
 * Workflow Routes — POST /workflows/run, GET /workflows/:id, GET /workflows
 */

import { randomUUID, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { WorkflowRunRequestSchema, PaginationQuerySchema } from "../schemas.js";
import { requirePermission } from "../middleware/auth.js";
import { NotFoundError, IdempotencyConflictError, ValidationError } from "../errors.js";
import type {
  WorkflowStatusResponse,
  WorkflowSummary,
  IdempotencyEntry,
  WorkflowRunResponse,
  WorkflowState,
  ApiServerConfig,
} from "../types.js";

// In-Memory Stores
interface WorkflowRecord {
  id: string;
  status: WorkflowState;
  traceId: string;
  totalSteps: number;
  completedSteps: number;
  currentStep?: string;
  startedAt: string;
  completedAt?: string;
}

const workflowStore = new Map<string, WorkflowRecord>();
const idempotencyStore = new Map<string, IdempotencyEntry>();

function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function cleanupIdempotency(ttlMs: number): void {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore) {
    if (now - entry.createdAt.getTime() > ttlMs) {
      idempotencyStore.delete(key);
    }
  }
}

export function _getWorkflowStore(): Map<string, WorkflowRecord> {
  return workflowStore;
}

export function _getIdempotencyStore(): Map<string, IdempotencyEntry> {
  return idempotencyStore;
}

export async function workflowRoutes(fastify: FastifyInstance): Promise<void> {
  const srv = fastify as FastifyInstance & { apiConfig?: ApiServerConfig };
  const idempotencyTtlMs = srv.apiConfig?.idempotencyTtlMs ?? 86_400_000;

  // POST /api/v1/workflows/run
  fastify.post("/api/v1/workflows/run", {
    preHandler: [requirePermission("workflows:write")],
  }, async (request, reply) => {
    const parsed = WorkflowRunRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", {
        issues: parsed.error.issues,
      });
    }

    const { workflow, options } = parsed.data;

    // Idempotency Key Handling
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey === "string") {
      cleanupIdempotency(idempotencyTtlMs);
      const existing = idempotencyStore.get(idempotencyKey);
      if (existing) {
        const currentHash = hashRequest(request.body);
        if (existing.requestHash !== currentHash) {
          throw new IdempotencyConflictError(idempotencyKey);
        }
        return reply.status(existing.statusCode).send(existing.response);
      }
    }

    const workflowId = randomUUID();
    const traceId = randomUUID();

    workflowStore.set(workflowId, {
      id: workflowId,
      status: options?.dryRun ? "completed" : "pending",
      traceId,
      totalSteps: workflow.steps.length,
      completedSteps: 0,
      startedAt: new Date().toISOString(),
    });

    const response: WorkflowRunResponse = {
      id: workflowId,
      status: "accepted",
      traceId,
      estimatedDuration: options?.timeout,
    };

    if (typeof idempotencyKey === "string") {
      idempotencyStore.set(idempotencyKey, {
        key: idempotencyKey,
        requestHash: hashRequest(request.body),
        response,
        statusCode: 202,
        createdAt: new Date(),
      });
    }

    return reply.status(202).send(response);
  });

  // GET /api/v1/workflows/:id
  fastify.get<{ Params: { id: string } }>("/api/v1/workflows/:id", {
    preHandler: [requirePermission("workflows:read")],
  }, async (request, reply) => {
    const { id } = request.params;
    const record = workflowStore.get(id);

    if (!record) {
      throw new NotFoundError("Workflow", id);
    }

    const response: WorkflowStatusResponse = {
      id: record.id,
      status: record.status,
      traceId: record.traceId,
      progress: {
        totalSteps: record.totalSteps,
        completedSteps: record.completedSteps,
        currentStep: record.currentStep,
      },
      startedAt: record.startedAt,
      completedAt: record.completedAt,
    };

    return reply.status(200).send(response);
  });

  // GET /api/v1/workflows
  fastify.get<{ Querystring: Record<string, string> }>("/api/v1/workflows", {
    preHandler: [requirePermission("workflows:read")],
  }, async (request, reply) => {
    const queryParsed = PaginationQuerySchema.safeParse(request.query);
    const limit = queryParsed.success ? queryParsed.data.limit : 20;
    const offset = queryParsed.success ? queryParsed.data.offset : 0;
    const statusFilter = request.query["status"];

    let items = Array.from(workflowStore.values());

    if (statusFilter) {
      items = items.filter((w) => w.status === statusFilter);
    }

    const total = items.length;
    const paged = items.slice(offset, offset + limit);

    const summaries: WorkflowSummary[] = paged.map((w) => ({
      id: w.id,
      status: w.status,
      traceId: w.traceId,
      totalSteps: w.totalSteps,
      completedSteps: w.completedSteps,
      startedAt: w.startedAt,
    }));

    return reply.status(200).send({
      items: summaries,
      total,
      limit,
      offset,
    });
  });
}
