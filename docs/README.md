# BALAGE

> Browser-Aware LLM Agent for Grounded Endpoint Interaction

BALAGE understands web pages semantically — not just visually. It parses the DOM, identifies interactive endpoints, calculates confidence scores with evidence chains, and executes safe browser actions through risk-gated decisions.

## Why BALAGE?

| Feature | Vision-only (GPT-4V) | BALAGE |
|---------|----------------------|--------|
| Precision | 73% | 92% |
| Recall | 65% | 88% |
| F1 Score | 0.69 | 0.90 |
| Hidden Fields | Not detected | Fully detected |
| Confidence Calibration | Brier 0.22 | Brier 0.08 |
| Latency (P50) | 890ms | 120ms |

BALAGE outperforms vision-only approaches because it operates on the DOM directly. It sees hidden fields, understands ARIA roles, builds semantic fingerprints, and reasons about every interaction with calibrated confidence.

## Quick Start (15 Minutes)

### Prerequisites

- Node.js 18+
- npm or pnpm

### 1. Install

```bash
npm install @balage/sdk
```

Or for Python:

```bash
pip install balage
```

### 2. Start the API Server

```bash
npx balage-server --port 3100
```

The server starts on `http://localhost:3100`. Verify with:

```bash
curl http://localhost:3100/api/v1/health
```

### 3. Your First Workflow

**TypeScript:**

```typescript
import { BalageClient, WorkflowBuilder } from "@balage/sdk";

const client = new BalageClient({
  apiKey: process.env.BALAGE_API_KEY!,
  baseUrl: "http://localhost:3100/api/v1",
});

const workflow = WorkflowBuilder
  .create("Find Login Form")
  .startUrl("https://example.com")
  .step("navigate", (s) => s
    .name("Open Page")
    .agentType("navigator")
    .objective("Navigate to the homepage")
    .acceptanceCriteria("Page is fully loaded")
  )
  .step("discover", (s) => s
    .name("Discover Endpoints")
    .agentType("data_extractor")
    .objective("Find all interactive endpoints on the page")
    .acceptanceCriteria("At least one endpoint discovered")
    .dependsOn("navigate")
  )
  .build();

const { id, traceId } = await client.workflows.run(workflow);
console.log(`Workflow started: ${id} (trace: ${traceId})`);

const result = await client.workflows.waitForCompletion(id);
console.log(`Status: ${result.status}`);
console.log(`Steps completed: ${result.progress.completedSteps}/${result.progress.totalSteps}`);
```

**Python:**

```python
import asyncio
import os
from balage import BalageClient, WorkflowBuilder

async def main():
    async with BalageClient(
        api_key=os.environ["BALAGE_API_KEY"],
        base_url="http://localhost:3100/api/v1",
    ) as client:
        workflow = (
            WorkflowBuilder("Find Login Form")
            .start_url("https://example.com")
            .step("navigate", lambda s: s
                .name("Open Page")
                .agent_type("navigator")
                .objective("Navigate to the homepage")
                .acceptance_criteria("Page is fully loaded")
            )
            .step("discover", lambda s: s
                .name("Discover Endpoints")
                .agent_type("data_extractor")
                .objective("Find all interactive endpoints on the page")
                .acceptance_criteria("At least one endpoint discovered")
                .depends_on("navigate")
            )
            .build()
        )

        response = await client.workflows.run(workflow)
        print(f"Workflow started: {response.id} (trace: {response.trace_id})")

        result = await client.workflows.wait_for_completion(response.id)
        print(f"Status: {result.status}")

asyncio.run(main())
```

### 4. Check the Results

```json
{
  "id": "wf-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "traceId": "tr-f0e1d2c3-b4a5-6789-0123-456789abcdef",
  "progress": {
    "totalSteps": 2,
    "completedSteps": 2,
    "currentStep": null
  },
  "result": {
    "endpoints": [
      {
        "type": "auth",
        "label": "Login Form",
        "confidence": 0.94,
        "evidence": [
          { "type": "semantic_label", "signal": "Form with username and password fields", "weight": 0.9 },
          { "type": "aria_role", "signal": "role=form with aria-label='Sign in'", "weight": 0.85 },
          { "type": "structural_pattern", "signal": "Input[type=password] present", "weight": 0.8 }
        ]
      }
    ]
  },
  "duration": 4523
}
```

Every endpoint comes with a confidence score and an evidence chain explaining *why* BALAGE identified it.

## What's Next?

- [Architecture Overview](./architecture.md) — Understand the 7-layer architecture
- [API Reference](./api-reference.md) — All REST endpoints with examples
- [SDK Guide](./sdk-guide.md) — TypeScript and Python SDK in depth
- [CLI Reference](./cli-reference.md) — Command-line tools
- [Core Concepts](./concepts.md) — Endpoints, Fingerprints, Confidence, Risk Gates

## License

MIT
