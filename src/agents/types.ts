/**
 * Lokale Typen fuer das Sub-Agent System.
 * Re-Exports aus shared_interfaces + agent-spezifische Typen.
 */

// Re-Exports aus shared_interfaces
export type {
  SubAgent,
  SubAgentType,
  AgentTask,
  AgentResult,
  Endpoint,
  Evidence,
  StateChangeEvent,
  DomNode,
  UISegment,
  DomAnchor,
  Affordance,
} from "../../shared_interfaces.js";

import type { SubAgentType, AgentTask, AgentResult } from "../../shared_interfaces.js";
import type { Sandbox } from "./sandbox.js";

/** Agent-Template Interface — alle Templates implementieren dies */
export interface AgentTemplate {
  type: SubAgentType;
  capabilities: AgentCapabilities;
  execute(task: AgentTask, sandbox: Sandbox): Promise<AgentResult>;
}

/** Agent-Capabilities — Least Privilege Permissions */
export interface AgentCapabilities {
  canNavigate: boolean;
  canFill: boolean;
  canSubmit: boolean;
  canClick: boolean;
  canReadSensitive: boolean;
  canMakePayment: boolean;
}

/** Agent-Factory — erzeugt SubAgent-Instanzen */
export type AgentFactory = () => Promise<import("../../shared_interfaces.js").SubAgent>;

/** Sandbox-Metriken */
export interface SandboxMetrics {
  actionsPerformed: number;
  budgetRemaining: number;
  elapsedMs: number;
  timeoutMs: number;
  permissionDenials: number;
  isTimedOut: boolean;
  isBudgetExceeded: boolean;
}

/** Runner-Optionen */
export interface AgentRunnerOptions {
  enableRetry: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

/** Inter-Agent Message (fuer zukuenftige Erweiterung) */
export interface AgentMessage {
  fromAgentId: string;
  toAgentId: string;
  type: "request" | "response" | "notification";
  payload: Record<string, unknown>;
  timestamp: Date;
}
