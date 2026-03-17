/**
 * API Module — Public API / Re-Exports
 */

// Core
export { createServer, startServer } from "./server.js";
export { WebSocketManager } from "./websocket.js";

// Schemas
export {
  WorkflowRunRequestSchema,
  ActionExecuteRequestSchema,
  PaginationQuerySchema,
  ErrorResponseSchema,
} from "./schemas.js";

// Typen
export type {
  ApiServerConfig,
  ApiKeyConfig,
  ApiPermission,
  WorkflowRunRequest,
  WorkflowRunResponse,
  WorkflowStatusResponse,
  ActionExecuteRequest,
  ActionExecuteResponse,
  HealthResponse,
  PaginatedResponse,
  WorkflowProgressEvent,
} from "./types.js";

// Error-Klassen
export {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  IdempotencyConflictError,
  WorkflowExecutionApiError,
} from "./errors.js";
