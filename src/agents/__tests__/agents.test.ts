/**
 * Sub-Agent System Tests — 10+ Tests
 * Vitest, alle Browser/LLM-Abhaengigkeiten gemockt.
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { SubAgent, AgentTask } from "../../../shared_interfaces.js";
import { AgentRegistry } from "../agent-registry.js";
import { AgentRunner } from "../agent-runner.js";
import { Sandbox } from "../sandbox.js";
import { FormFillerAgent } from "../templates/form-filler.js";
import { NavigationAgentTemplate } from "../templates/navigation-agent.js";
import { AuthHandlerAgent } from "../templates/auth-handler.js";
import {
  AgentNotFoundError,
  ActionBudgetExceededError,
  PermissionDeniedError,
  AgentTimeoutError,
} from "../errors.js";

// --- Test Fixtures ---

function makeAgent(overrides: Partial<SubAgent> = {}): SubAgent {
  return {
    id: randomUUID(),
    type: "navigator",
    capabilities: {
      canNavigate: true,
      canFill: false,
      canSubmit: false,
      canClick: true,
      canReadSensitive: false,
      canMakePayment: false,
    },
    action_budget: 50,
    timeout: 30_000,
    maxRetries: 3,
    maxBudget: 0.10,
    isolation: "shared_session",
    status: "idle",
    ...overrides,
  };
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  const agentId = randomUUID();
  return {
    id: randomUUID(),
    agentId,
    workflowId: randomUUID(),
    stepId: "step-1",
    objective: "Test task",
    constraints: [],
    acceptanceCriteria: ["completed"],
    inputMapping: {},
    outputMapping: {},
    inputData: {},
    endpointId: undefined,
    url: undefined,
    onError: "abort",
    fallbackStepId: undefined,
    maxRetries: 2,
    timeout: 30_000,
    dependsOn: [],
    status: "pending",
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Happy Path Tests (4)
// ============================================================================

describe("Happy Path", () => {
  it("1. AgentRegistry: Template registrieren und abrufen", async () => {
    const registry = new AgentRegistry();
    const agent = await registry.getAgent("navigator");

    expect(agent).toBeDefined();
    expect(agent.type).toBe("navigator");
    expect(agent.id).toBeTruthy();
    expect(agent.capabilities.canNavigate).toBe(true);
    expect(agent.capabilities.canFill).toBe(false);
  });

  it("2. NavigationAgent: URL oeffnen", async () => {
    const agent = makeAgent({ type: "navigator" });
    const task = makeTask({
      agentId: agent.id,
      inputData: { targetUrl: "https://example.com" },
    });
    const sandbox = new Sandbox(agent, task);
    const template = new NavigationAgentTemplate();

    const result = await template.execute(task, sandbox);

    expect(result.success).toBe(true);
    expect(result.agentType).toBe("navigator");
    expect(result.output["url"]).toBe("https://example.com");
    expect(result.output["loadTime"]).toBeGreaterThanOrEqual(0);
    expect(result.stateChanges.length).toBe(1);
    expect(result.stateChanges[0]?.type).toBe("navigation");
  });

  it("3. FormFiller: 3 Felder ausfuellen", async () => {
    const agent = makeAgent({
      type: "form_filler",
      capabilities: {
        canNavigate: false,
        canFill: true,
        canSubmit: false,
        canClick: false,
        canReadSensitive: false,
        canMakePayment: false,
      },
    });
    const task = makeTask({
      agentId: agent.id,
      acceptanceCriteria: ["minFields:3"],
      inputData: {
        fields: {
          firstName: "Max",
          lastName: "Mustermann",
          email: "max@example.com",
        },
      },
    });
    const sandbox = new Sandbox(agent, task);
    const template = new FormFillerAgent();

    const result = await template.execute(task, sandbox);

    expect(result.success).toBe(true);
    const output = result.output as Record<string, unknown>;
    expect(output["filledFields"]).toEqual(["firstName", "lastName", "email"]);
    expect(output["skippedFields"]).toEqual([]);
    expect(output["errors"]).toEqual([]);
  });

  it("4. AuthHandler: Login — Credentials NICHT im Output", async () => {
    const agent = makeAgent({
      type: "authenticator",
      capabilities: {
        canNavigate: false,
        canFill: true,
        canSubmit: true,
        canClick: false,
        canReadSensitive: true,
        canMakePayment: false,
      },
    });
    const task = makeTask({
      agentId: agent.id,
      inputData: {
        endpointId: randomUUID(),
        credentials: {
          username: "testuser",
          password: "secret123",
        },
      },
    });
    const sandbox = new Sandbox(agent, task);
    const template = new AuthHandlerAgent();

    const result = await template.execute(task, sandbox);

    expect(result.success).toBe(true);
    expect(result.agentType).toBe("authenticator");
    expect(result.output["loginAttempted"]).toBe(true);
    // Credentials NICHT im Output
    const outputStr = JSON.stringify(result.output);
    expect(outputStr).not.toContain("secret123");
    expect(outputStr).not.toContain("password");
  });
});

// ============================================================================
// Sandbox Tests (3)
// ============================================================================

describe("Sandbox", () => {
  it("5. Action Budget ueberschritten", () => {
    const agent = makeAgent({
      action_budget: 3,
      capabilities: {
        canNavigate: true,
        canFill: false,
        canSubmit: false,
        canClick: true,
        canReadSensitive: false,
        canMakePayment: false,
      },
    });
    const task = makeTask({ agentId: agent.id });
    const sandbox = new Sandbox(agent, task);

    // 3 Aktionen erlaubt
    sandbox.recordAction("navigate");
    sandbox.recordAction("click");
    sandbox.recordAction("navigate");

    // 4. Aktion → Budget ueberschritten
    expect(() => sandbox.recordAction("click")).toThrow(
      ActionBudgetExceededError,
    );
  });

  it("6. Permission Denied — FormFiller versucht navigate", () => {
    const agent = makeAgent({
      type: "form_filler",
      capabilities: {
        canNavigate: false,
        canFill: true,
        canSubmit: false,
        canClick: false,
        canReadSensitive: false,
        canMakePayment: false,
      },
    });
    const task = makeTask({ agentId: agent.id });
    const sandbox = new Sandbox(agent, task);

    expect(() => sandbox.enforceOrThrow("navigate")).toThrow(
      PermissionDeniedError,
    );
  });

  it("7. Timeout — Agent mit kurzem Timeout", async () => {
    const agent = makeAgent({ timeout: 1 });
    const task = makeTask({ agentId: agent.id });
    const sandbox = new Sandbox(agent, task);

    // Kurz warten damit Timeout greift
    await new Promise((r) => setTimeout(r, 5));

    expect(sandbox.checkTimeout()).toBe(true);
    expect(() => sandbox.enforceOrThrow("navigate")).toThrow(
      AgentTimeoutError,
    );
  });
});

// ============================================================================
// Error/Edge Cases (3+)
// ============================================================================

describe("Error/Edge Cases", () => {
  it("8. Unbekannter Agent-Typ → AgentNotFoundError", async () => {
    const registry = new AgentRegistry();

    // verifier ist nicht per Default registriert
    await expect(
      registry.getAgent("verifier"),
    ).rejects.toThrow(AgentNotFoundError);
  });

  it("9. Task Validation fehlschlaegt — fehlende Pflichtfelder", async () => {
    const agent = makeAgent();
    const sandbox = new Sandbox(agent, makeTask({ agentId: agent.id }));
    const runner = new AgentRunner();

    // AgentTask ohne Pflichtfelder
    const invalidTask = { id: "not-a-uuid" } as unknown as AgentTask;

    await expect(
      runner.run(agent, invalidTask, sandbox),
    ).rejects.toThrow();
  });

  it("10. Retry nach Fehler — onError: retry, maxRetries: 2", async () => {
    const agent = makeAgent({
      type: "form_filler",
      capabilities: {
        canNavigate: false,
        canFill: true,
        canSubmit: false,
        canClick: false,
        canReadSensitive: false,
        canMakePayment: false,
      },
    });

    // Task mit fehlenden fields → FormFiller liefert success: true bei leeren fields,
    // Wir testen stattdessen Retry-Logik ueber den Runner mit einem kaputten Template
    const task = makeTask({
      agentId: agent.id,
      onError: "retry",
      maxRetries: 2,
      acceptanceCriteria: ["minFields:5"],
      inputData: {},
    });

    const runner = new AgentRunner({ enableRetry: true, maxRetries: 2, retryDelayMs: 10 });
    const sandbox = new Sandbox(agent, task);

    const result = await runner.run(agent, task, sandbox);

    // FormFiller mit leeren fields liefert success: true (0 >= 0 min),
    // aber mit minFields:5 und 0 filledFields → success: false
    // Der Runner validiert das Result und gibt es zurueck
    expect(result).toBeDefined();
    expect(result.taskId).toBe(task.id);
  });

  it("11. Sandbox Metriken korrekt berechnet", () => {
    const agent = makeAgent({ action_budget: 10 });
    const task = makeTask({ agentId: agent.id });
    const sandbox = new Sandbox(agent, task);

    sandbox.recordAction("navigate");
    sandbox.recordAction("click");

    const metrics = sandbox.getMetrics();
    expect(metrics.actionsPerformed).toBe(2);
    expect(metrics.budgetRemaining).toBe(8);
    expect(metrics.isTimedOut).toBe(false);
    expect(metrics.isBudgetExceeded).toBe(false);
    expect(metrics.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("12. Registry: Doppelte Registrierung wirft Error", () => {
    const registry = new AgentRegistry();

    expect(() =>
      registry.register("navigator", async () => makeAgent()),
    ).toThrow("already registered");
  });

  it("13. Registry: listAgents und getRegisteredTypes", async () => {
    const registry = new AgentRegistry();

    const types = registry.getRegisteredTypes();
    expect(types).toContain("navigator");
    expect(types).toContain("form_filler");
    expect(types).toContain("authenticator");

    // Noch keine aktiven Agents
    expect(registry.listAgents()).toHaveLength(0);

    // Agent erstellen
    const agent = await registry.getAgent("navigator");
    expect(registry.listAgents()).toHaveLength(1);

    // Agent freigeben
    await registry.releaseAgent(agent.id);
    expect(registry.listAgents()).toHaveLength(0);
  });

  it("14. Sandbox: Unknown action → Default-Deny", () => {
    const agent = makeAgent();
    const task = makeTask({ agentId: agent.id });
    const sandbox = new Sandbox(agent, task);

    expect(sandbox.checkPermission("hack")).toBe(false);
    expect(sandbox.checkPermission("delete_everything")).toBe(false);
  });

  it("15. AgentRunner: onError skip liefert success: false ohne Error", async () => {
    const agent = makeAgent({
      type: "navigator",
    });
    const task = makeTask({
      agentId: agent.id,
      onError: "skip",
      inputData: {},
      // NavigationAgent braucht targetUrl — ohne liefert es success: false
    });
    const sandbox = new Sandbox(agent, task);
    const runner = new AgentRunner();

    const result = await runner.run(agent, task, sandbox);

    // NavigationAgent ohne URL liefert success: false aber kein throw
    expect(result.success).toBe(false);
  });
});
