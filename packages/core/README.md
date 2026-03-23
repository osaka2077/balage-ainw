# @balage/core

> Semantic Verification Layer for Browser Agents

Identifies interactive endpoints on web pages (login forms, search bars, checkout flows, navigation) with confidence scores and evidence chains. Works with raw HTML — no browser needed.

**F1 = 66% across 20 real production websites** (GitHub, Amazon, Airbnb, Booking.com, eBay, LinkedIn, and more). [Full benchmark results](../../tests/real-world/).

## Quick Start

```bash
npm install @balage/core
```

### Heuristic Mode (no API key, instant)

```typescript
import { analyzeFromHTML } from "@balage/core";

const html = await fetch("https://github.com/login").then(r => r.text());
const result = await analyzeFromHTML(html, {
  url: "https://github.com/login",
  llm: false, // heuristic-only, no API key needed
});

console.log(result.endpoints);
// [{type: "form", label: "form", confidence: 0.7, affordances: ["fill", "submit"]}]
console.log(result.timing.totalMs); // ~50ms
```

### LLM Mode (higher accuracy)

```typescript
import { analyzeFromHTML } from "@balage/core";

const result = await analyzeFromHTML(html, {
  url: "https://github.com/login",
  llm: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini", // default
  },
});

console.log(result.endpoints);
// [{type: "auth", label: "Login Form", confidence: 0.93, ...}]
```

### Framework Detection

```typescript
import { detectFramework } from "@balage/core";

const fw = detectFramework(html);
// {framework: "wordpress", confidence: 0.85, version: "6.4", evidence: [...]}
```

## API

### `analyzeFromHTML(html, options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `"https://unknown"` | Page URL (used in LLM prompts) |
| `llm` | `boolean \| LLMConfig` | `true` | `false` for heuristic-only, or LLM config |
| `minConfidence` | `number` | `0.50` | Minimum confidence threshold |
| `maxEndpoints` | `number` | `10` | Maximum endpoints to return |

Returns `AnalysisResult`:
```typescript
{
  endpoints: DetectedEndpoint[];  // sorted by confidence
  framework?: FrameworkDetection; // detected web framework
  timing: { totalMs: number; llmCalls: number };
  meta: { url?: string; mode: "llm" | "heuristic"; version: string };
}
```

### `detectFramework(html)`

Detects: WordPress, Shopify, React, Next.js, Angular, Vue, Svelte, Salesforce.

### `htmlToDomNode(html)`

Parses raw HTML into BALAGE's `DomNode` format. No browser dependency.

## Benchmark Results (20 Sites)

| Metric | Score |
|--------|:-----:|
| **F1** | 66% |
| Precision | 69% |
| Recall | 68% |
| Type Accuracy | 85% |

**Best performers:** Google Accounts (91%), Zalando (89%), Typeform (83%), Hacker News (80%)

**Known limitations:** Angular Material SPAs (60%), Trello multi-step auth (29%), keyboard-shortcut search (Cmd+K)

## How It Works

1. **HTML Parsing** — Converts HTML to structured DOM tree (no browser needed)
2. **UI Segmentation** — Groups DOM elements into semantic segments (forms, navigation, etc.)
3. **Classification** — LLM + heuristics identify endpoint types and confidence
4. **Evidence Chain** — Every classification includes evidence for auditability

## Use Cases

- **Browser agent pre-flight**: Know what's on the page before your agent acts
- **Post-action verification**: Verify the agent clicked the right element
- **Compliance/audit**: Log what the agent saw and why it acted (EU AI Act ready)
- **Testing**: Detect UI regressions that break agent workflows

## License

Business Source License 1.1 (BSL). Converts to Apache 2.0 after 3 years. See [LICENSE](./LICENSE).
