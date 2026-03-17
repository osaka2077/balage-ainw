/**
 * E2E Tests — Kompletter Flow
 *
 * Testet den gesamten BALAGE-Flow: Workflow definieren → Orchestrator startet →
 * Sub-Agents arbeiten → Ergebnis. Mit Mock-Dispatcher, keine echten API-Calls.
 *
 * Tests 1-3: Navigation, Form-Fill-Submit, Login-Flow
 */
import { describe, it, expect, vi } from "vitest";
import type { AgentTask } from "../../shared_interfaces.js";
import { simpleNavigationWorkflow } from "./fixtures/workflows/simple-navigation.js";
import { formFillSubmitWorkflow } from "./fixtures/workflows/form-fill-submit.js";
import { loginFlowWorkflow } from "./fixtures/workflows/login-flow.js";
import { routeToMockAgent } from "./fixtures/mocks/mock-agents.js";
import {
  buildE2ERunner,
  createSuccessResult,
} from "./helpers.js";

// ============================================================================
// Test 1-3: Kompletter Flow E2E
// ============================================================================

describe("E2E: Kompletter Flow", () => {

  it("1. Navigation-Workflow E2E — 1 Step, Orchestrator → Agent → Ergebnis", async () => {
    const { runner } = buildE2ERunner({
      dispatchFn: vi.fn(async (task: AgentTask) =>
        createSuccessResult(task.id, "navigator", {
          currentUrl: "https://example.com/contact",
          title: "Contact Page",
        }),
      ),
    });

    const result = await runner.run(simpleNavigationWorkflow);

    // Workflow erfolgreich
    expect(result.success).toBe(true);
    expect(result.state).toBe("completed");

    // 1 Step ausgefuehrt
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]!.success).toBe(true);

    // Metriken korrekt
    expect(result.metrics.stepsCompleted).toBe(1);
    expect(result.metrics.stepsFailed).toBe(0);

    // State Machine: pending → running → completed
    expect(runner.getState()).toBe("completed");

    // WorkflowResult hat traceId und workflowId
    expect(result.traceId).toBeDefined();
    expect(result.workflowId).toBeDefined();
  });

  it("2. Form-Fill-Submit E2E — 3 Steps sequentiell, Context-Propagation", async () => {
    const capturedInputs: Record<string, Record<string, unknown>> = {};

    const { runner } = buildE2ERunner({
      dispatchFn: vi.fn(async (task: AgentTask) => {
        capturedInputs[task.stepId] = { ...task.inputData };

        // Schritt-spezifische Ergebnisse zurueckgeben
        if (task.stepId === "nav") {
          return createSuccessResult(task.id, "navigator", {
            currentUrl: "https://example.com/contact",
          });
        }
        if (task.stepId === "fill") {
          return createSuccessResult(task.id, "form_filler", {
            filledFields: ["firstname", "lastname", "email", "subject", "message"],
            fieldCount: 5,
          });
        }
        // submit
        return createSuccessResult(task.id, "action_executor", {
          submitted: true,
          confirmationId: "CONF-42",
        });
      }),
    });

    const result = await runner.run(formFillSubmitWorkflow);

    // Workflow erfolgreich
    expect(result.success).toBe(true);
    expect(result.state).toBe("completed");

    // Alle 3 Steps erfolgreich
    expect(result.stepResults).toHaveLength(3);
    expect(result.metrics.stepsCompleted).toBe(3);
    expect(result.metrics.stepsFailed).toBe(0);

    // Context-Propagation: "fill" Step hat pageUrl aus "nav" erhalten
    expect(capturedInputs["fill"]!["url"]).toBe("https://example.com/contact");

    // Context-Propagation: "submit" Step hat formData aus "fill" erhalten
    expect(capturedInputs["submit"]!["formData"]).toEqual(["firstname", "lastname", "email", "subject", "message"]);

    // Jeder Step hat korrekten agentType
    expect(result.stepResults[0]!.agentType).toBe("navigator");
    expect(result.stepResults[1]!.agentType).toBe("form_filler");
    expect(result.stepResults[2]!.agentType).toBe("action_executor");
  });

  it("3. Login-Flow E2E — Credentials NICHT in Output oder Audit-Trail", async () => {
    const { runner, contextManager } = buildE2ERunner({
      dispatchFn: vi.fn(async (task: AgentTask) => {
        if (task.stepId === "nav-login") {
          return createSuccessResult(task.id, "navigator", {
            currentUrl: "https://example.com/login",
          });
        }
        // AuthHandler — Credentials duerfen NICHT im Output sein
        return createSuccessResult(task.id, "authenticator", {
          authenticated: true,
          redirectUrl: "https://example.com/dashboard",
        });
      }),
    });

    const result = await runner.run(loginFlowWorkflow);

    // Workflow erfolgreich
    expect(result.success).toBe(true);
    expect(result.state).toBe("completed");
    expect(result.stepResults).toHaveLength(2);

    // Auth-Step Output pruefen: KEINE Credentials
    const authStep = result.stepResults.find((s) => s.agentType === "authenticator");
    expect(authStep).toBeDefined();
    expect(authStep!.success).toBe(true);

    // Output darf KEIN Passwort/Email/Token enthalten
    const outputStr = JSON.stringify(authStep!.output).toLowerCase();
    expect(outputStr).not.toContain("password");
    expect(outputStr).not.toContain("passwort");
    expect(outputStr).not.toContain("secret");
    expect(outputStr).not.toContain("credential");

    // Audit-Trail (Context History) darf KEINE Credentials enthalten
    const history = contextManager.getHistory();
    const historyStr = JSON.stringify(history).toLowerCase();
    expect(historyStr).not.toContain("password");
    expect(historyStr).not.toContain("passwort");
    expect(historyStr).not.toContain("secret");
    expect(historyStr).not.toContain("credential");

    // Context-Propagation: isLoggedIn wurde gesetzt
    const snapshot = contextManager.getSnapshot();
    expect(snapshot.variables["isLoggedIn"]).toBe(true);
  });
});
