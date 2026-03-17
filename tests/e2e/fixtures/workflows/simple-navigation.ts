/**
 * Workflow Fixture: Simple Navigation — 1-Step
 */
import type { WorkflowDefinition } from "../../../../shared_interfaces.js";

export const simpleNavigationWorkflow: WorkflowDefinition = {
  name: "Simple Navigation",
  startUrl: "https://example.com",
  steps: [
    {
      id: "navigate",
      name: "Navigate to contact page",
      agentType: "navigator",
      task: {
        objective: "Navigate to the contact page",
        acceptanceCriteria: ["URL contains /contact"],
        outputMapping: { currentUrl: "url" },
      },
      dependsOn: [],
    },
  ],
};
