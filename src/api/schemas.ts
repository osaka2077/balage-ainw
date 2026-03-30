/**
 * Request/Response Zod Schemas fuer die API
 */

import { z } from "zod";
import { WorkflowDefinitionSchema, EvidenceSchema } from "../../shared_interfaces.js";
import { validateFetchUrl } from "../security/url-validator.js";

// ============================================================================
// SSRF Protection — Delegiert an src/security/url-validator.ts (SEC-002)
// ============================================================================

/** Zod-Refinement: URL darf nicht auf private/interne Adressen zeigen */
const PublicUrlSchema = z.string().url().refine(
  (url) => {
    const result = validateFetchUrl(url);
    return result.valid;
  },
  { message: "Callback URL must not point to private or internal addresses" },
);

// ============================================================================
// Request Schemas
// ============================================================================

export const WorkflowRunRequestSchema = z.object({
  workflow: WorkflowDefinitionSchema,
  options: z.object({
    dryRun: z.boolean().default(false),
    timeout: z.number().int().positive().optional(),
    callbackUrl: PublicUrlSchema.optional(),
  }).optional(),
});

export const ActionExecuteRequestSchema = z.object({
  endpointId: z.string().uuid(),
  action: z.string().min(1).max(256),
  parameters: z.record(z.unknown()).optional(),
  options: z.object({
    dryRun: z.boolean().default(false),
    timeout: z.number().int().positive().optional(),
  }).optional(),
});

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================================
// Response Schemas
// ============================================================================

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.record(z.unknown()).optional(),
});

export const WorkflowRunResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.literal("accepted"),
  traceId: z.string().uuid(),
  estimatedDuration: z.number().optional(),
});

export const WorkflowStatusResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  traceId: z.string().uuid(),
  progress: z.object({
    totalSteps: z.number().int().nonnegative(),
    completedSteps: z.number().int().nonnegative(),
    currentStep: z.string().optional(),
  }),
  result: z.record(z.unknown()).optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  duration: z.number().optional(),
});

export const ActionExecuteResponseSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  endpointId: z.string().uuid(),
  result: z.record(z.unknown()).optional(),
  confidence: z.number().min(0).max(1),
  gateDecision: z.enum(["allow", "deny", "escalate"]),
  evidence: z.array(EvidenceSchema),
  duration: z.number().nonnegative(),
});

export const HealthResponseSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  version: z.string(),
  uptime: z.number().nonnegative(),
  timestamp: z.string(),
  checks: z.object({
    orchestrator: z.enum(["ok", "error"]),
    browser: z.enum(["ok", "error", "not_configured"]),
    database: z.enum(["ok", "error", "not_configured"]),
  }),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
