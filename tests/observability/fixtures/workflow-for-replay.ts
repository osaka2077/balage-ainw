/**
 * Fixture: WorkflowDefinition fuer Replay-Tests
 * 2-Step Workflow: Navigate + Fill
 */

import type { WorkflowDefinition } from "../../../shared_interfaces.js";

export const replayTestWorkflow: WorkflowDefinition = {
  name: "Replay Test Workflow",
  startUrl: "https://example.com/contact",
  steps: [
    {
      id: "navigate",
      name: "Navigate to contact",
      agentType: "navigator",
      task: {
        objective: "Open contact page",
        acceptanceCriteria: ["Page loaded"],
        inputMapping: {},
        outputMapping: { url: "currentUrl" },
      },
      dependsOn: [],
    },
    {
      id: "fill-form",
      name: "Fill contact form",
      agentType: "form_filler",
      task: {
        objective: "Fill the contact form",
        acceptanceCriteria: ["All fields filled"],
        inputMapping: {},
        outputMapping: { filledFields: "fields" },
      },
      dependsOn: ["navigate"],
    },
  ],
};
