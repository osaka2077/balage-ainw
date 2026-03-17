/**
 * Mock Agent-Ausfuehrung — Vordefinierte AgentResults fuer bekannte Tasks.
 *
 * Agents fuehren keine echten Browser-Aktionen aus.
 * Stattdessen: Fuer bekannte Tasks deterministische Ergebnisse.
 */
import { randomUUID } from "node:crypto";
import type { AgentResult, AgentTask, SubAgentType } from "../../../../shared_interfaces.js";

/** Erfolgreiche Navigation */
export function createNavigationResult(task: AgentTask, url: string = "https://example.com/contact"): AgentResult {
  return {
    taskId: task.id,
    agentId: randomUUID(),
    agentType: "navigator",
    success: true,
    output: { currentUrl: url, title: "Contact Page" },
    duration: 120,
    actionsPerformed: 2,
    llmTokensUsed: 100,
    llmCost: 0.002,
    stateChanges: [],
    endpointsDiscovered: [],
    evidence: [],
    completedAt: new Date(),
  };
}

/** Erfolgreiche Formular-Befuellung (KEINE Credentials im Output) */
export function createFormFillerResult(task: AgentTask): AgentResult {
  return {
    taskId: task.id,
    agentId: randomUUID(),
    agentType: "form_filler",
    success: true,
    output: {
      filledFields: ["firstname", "lastname", "email", "subject", "message"],
      fieldCount: 5,
    },
    duration: 250,
    actionsPerformed: 5,
    llmTokensUsed: 200,
    llmCost: 0.004,
    stateChanges: [],
    endpointsDiscovered: [],
    evidence: [],
    completedAt: new Date(),
  };
}

/** Erfolgreiche Authentifizierung (Credentials NICHT im Output) */
export function createAuthResult(task: AgentTask): AgentResult {
  return {
    taskId: task.id,
    agentId: randomUUID(),
    agentType: "authenticator",
    success: true,
    output: {
      authenticated: true,
      redirectUrl: "https://example.com/dashboard",
    },
    duration: 300,
    actionsPerformed: 4,
    llmTokensUsed: 150,
    llmCost: 0.003,
    stateChanges: [],
    endpointsDiscovered: [],
    evidence: [],
    completedAt: new Date(),
  };
}

/** Erfolgreiche Formular-Absendung */
export function createSubmitResult(task: AgentTask): AgentResult {
  return {
    taskId: task.id,
    agentId: randomUUID(),
    agentType: "action_executor",
    success: true,
    output: { submitted: true, confirmationId: "CONF-12345" },
    duration: 180,
    actionsPerformed: 1,
    llmTokensUsed: 50,
    llmCost: 0.001,
    stateChanges: [],
    endpointsDiscovered: [],
    evidence: [],
    completedAt: new Date(),
  };
}

/** Fehlgeschlagener Agent-Versuch (recoverable) */
export function createFailedResult(task: AgentTask, agentType: SubAgentType = "form_filler"): AgentResult {
  return {
    taskId: task.id,
    agentId: randomUUID(),
    agentType,
    success: false,
    output: {},
    error: {
      code: "FIELD_NOT_FOUND",
      message: "Could not locate form field 'email'",
      recoverable: true,
    },
    duration: 80,
    actionsPerformed: 1,
    llmTokensUsed: 100,
    llmCost: 0.002,
    stateChanges: [],
    endpointsDiscovered: [],
    evidence: [],
    completedAt: new Date(),
  };
}

/** Routing: Task → passender Mock-AgentResult basierend auf agentType */
export function routeToMockAgent(task: AgentTask): AgentResult {
  const agentType = (task.inputData["_agentType"] as string) ?? "navigator";

  switch (agentType) {
    case "navigator":
      return createNavigationResult(task);
    case "form_filler":
      return createFormFillerResult(task);
    case "authenticator":
      return createAuthResult(task);
    case "action_executor":
      return createSubmitResult(task);
    default:
      return createNavigationResult(task);
  }
}
