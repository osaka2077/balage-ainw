/**
 * Workflow Fixture: Form Fill + Submit — 3 Steps sequentiell
 *
 * Step 1: Navigate → Kontaktseite oeffnen
 * Step 2: Fill → 5 Felder ausfuellen (depends on Step 1)
 * Step 3: Submit → Formular absenden (depends on Step 2)
 */
import type { WorkflowDefinition } from "../../../../shared_interfaces.js";

export const formFillSubmitWorkflow: WorkflowDefinition = {
  name: "Contact Form Submission",
  startUrl: "https://example.com",
  steps: [
    {
      id: "nav",
      name: "Navigate to contact page",
      agentType: "navigator",
      task: {
        objective: "Navigate to the contact page",
        acceptanceCriteria: ["Contact form visible"],
        outputMapping: { currentUrl: "pageUrl" },
      },
      dependsOn: [],
    },
    {
      id: "fill",
      name: "Fill contact form",
      agentType: "form_filler",
      task: {
        objective: "Fill all 5 fields of the contact form",
        acceptanceCriteria: ["All fields filled"],
        inputMapping: { url: "pageUrl" },
        outputMapping: { filledFields: "formData" },
      },
      dependsOn: ["nav"],
    },
    {
      id: "submit",
      name: "Submit form",
      agentType: "action_executor",
      task: {
        objective: "Submit the contact form",
        acceptanceCriteria: ["Form submitted successfully"],
        inputMapping: { formData: "formData" },
      },
      dependsOn: ["fill"],
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
