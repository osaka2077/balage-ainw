/**
 * Request/Response Zod Schemas fuer die API
 */

import { z } from "zod";
import { WorkflowDefinitionSchema, EvidenceSchema } from "../../shared_interfaces.js";

// ============================================================================
// SSRF Protection — Blockt private/interne IP-Bereiche in URLs (SEC-002)
// ============================================================================

/** Prueft ob ein Hostname auf eine private/interne IP oder localhost zeigt */
function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Bekannte lokale Hostnamen
  if (lower === "localhost" || lower === "[::1]") return true;

  // Numerische IPv4 pruefen
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const [, a, b, c] = ipv4Match.map(Number) as [number, number, number, number];
    // 0.0.0.0/8
    if (a === 0) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 10.0.0.0/8 (RFC 1918)
    if (a === 10) return true;
    // 172.16.0.0/12 (RFC 1918)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (RFC 1918)
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 (Link-Local)
    if (a === 169 && b === 254) return true;
  }

  return false;
}

/** Zod-Refinement: URL darf nicht auf private/interne Adressen zeigen */
const PublicUrlSchema = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return !isPrivateHost(parsed.hostname);
    } catch {
      return false;
    }
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
