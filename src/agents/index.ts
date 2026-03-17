/**
 * Sub-Agent System — Public API
 */

// Core
export { AgentRegistry } from "./agent-registry.js";
export { AgentRunner } from "./agent-runner.js";
export { Sandbox } from "./sandbox.js";

// Templates
export { FormFillerAgent } from "./templates/form-filler.js";
export { CheckoutHandlerAgent } from "./templates/checkout-handler.js";
export { NavigationAgentTemplate } from "./templates/navigation-agent.js";
export { SearchAgentTemplate } from "./templates/search-agent.js";
export { AuthHandlerAgent } from "./templates/auth-handler.js";

// Typen
export type {
  AgentTemplate,
  AgentCapabilities,
  AgentFactory,
  SandboxMetrics,
  AgentRunnerOptions,
  AgentMessage,
} from "./types.js";

// Error-Klassen
export {
  AgentError,
  AgentNotFoundError,
  AgentRegistrationError,
  AgentExecutionError,
  AgentTimeoutError,
  ActionBudgetExceededError,
  PermissionDeniedError,
  ResultValidationError,
  SandboxViolationError,
} from "./errors.js";
