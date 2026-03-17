/**
 * Workflow Fixture: Search Flow — 2 Steps
 *
 * Step 1: Navigate → Suchseite oeffnen
 * Step 2: Search → Suche ausfuehren (depends on Step 1)
 */
import type { WorkflowDefinition } from "../../../../shared_interfaces.js";

export const searchFlowWorkflow: WorkflowDefinition = {
  name: "Search Flow",
  startUrl: "https://example.com",
  steps: [
    {
      id: "nav-search",
      name: "Navigate to search page",
      agentType: "navigator",
      task: {
        objective: "Navigate to the search page",
        acceptanceCriteria: ["Search form visible"],
        outputMapping: { currentUrl: "searchUrl" },
      },
      dependsOn: [],
    },
    {
      id: "search",
      name: "Search for BALAGE",
      agentType: "data_extractor",
      task: {
        objective: "Search for BALAGE and collect results",
        acceptanceCriteria: ["Search results displayed"],
        inputMapping: { url: "searchUrl" },
        outputMapping: { results: "searchResults" },
      },
      dependsOn: ["nav-search"],
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
