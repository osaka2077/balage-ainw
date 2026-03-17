/**
 * Workflow Fixture: Login Flow — 2 Steps
 *
 * Step 1: Navigate → Login-Seite oeffnen
 * Step 2: Auth → Login durchfuehren (depends on Step 1)
 */
import type { WorkflowDefinition } from "../../../../shared_interfaces.js";

export const loginFlowWorkflow: WorkflowDefinition = {
  name: "Login Flow",
  startUrl: "https://example.com",
  steps: [
    {
      id: "nav-login",
      name: "Navigate to login page",
      agentType: "navigator",
      task: {
        objective: "Navigate to the login page",
        acceptanceCriteria: ["Login form visible"],
        outputMapping: { currentUrl: "loginUrl" },
      },
      dependsOn: [],
    },
    {
      id: "auth",
      name: "Perform login",
      agentType: "authenticator",
      task: {
        objective: "Log in with provided credentials",
        acceptanceCriteria: ["User authenticated"],
        inputMapping: { url: "loginUrl" },
        outputMapping: { authenticated: "isLoggedIn" },
      },
      dependsOn: ["nav-login"],
    },
  ],
  settings: {
    requireAllStepsSuccess: true,
    continueOnStepFailure: false,
    parallelExecution: true,
    maxTotalDuration: 60_000,
    maxTotalBudget: 0.5,
  },
};
