# balage-core

Detect login forms, search bars, and checkout flows in raw HTML. Confidence scores for browser agents. No browser needed.

[![npm version](https://img.shields.io/npm/v/balage-core)](https://www.npmjs.com/package/balage-core)
[![license](https://img.shields.io/npm/l/balage-core)](https://github.com/osaka2077/balage-ainw/blob/main/LICENSE)
[![tests](https://img.shields.io/badge/tests-922%20passed-brightgreen)]()

## Quick Start

```bash
npm install balage-core
```

### Detect a Login Form (heuristic-only, no API key)

```typescript
import { analyzeFromHTML } from "balage-core";

const result = await analyzeFromHTML(`
  <form action="/login">
    <input type="email" placeholder="Email">
    <input type="password" placeholder="Password">
    <button type="submit">Sign In</button>
  </form>
`);

console.log(result.endpoints);
// [{type: "auth", label: "Login / Sign-In Form", confidence: 0.75,
//   affordances: ["fill", "submit", "click"],
//   evidence: ["Contains password input", "Contains email input"]}]
```

### Find a Search Bar

```typescript
import { analyzeFromHTML } from "balage-core";

const result = await analyzeFromHTML(`
  <form role="search" action="/search">
    <input type="search" name="q" placeholder="Search...">
    <button type="submit">Go</button>
  </form>
`);

console.log(result.endpoints[0].type); // "search"
console.log(result.endpoints[0].confidence); // 0.80
```

### LLM Mode (higher accuracy)

```typescript
const result = await analyzeFromHTML(html, {
  url: "https://github.com/login",
  llm: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini",
  },
});
// F1 ~78% across 20 real-world production sites
```

## Why balage-core?

- **Works on raw HTML.** No browser, no Playwright, no headless Chrome. Feed it an HTML string, get structured results in milliseconds. Heuristic mode needs zero API keys.
- **Confidence scores, not just detection.** Every endpoint comes with a 0-1 confidence score and an evidence chain explaining why it was classified. Your agent can make informed decisions.
- **78% F1 on 20 real-world sites.** Benchmarked against GitHub, Amazon, Airbnb, Booking.com, eBay, LinkedIn, and 14 more production websites. Not toy examples.

## API Reference

### `analyzeFromHTML(html: string, options?: AnalyzeOptions): Promise<AnalysisResult>`

Primary analysis function. Identifies interactive endpoints in HTML.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `"https://unknown"` | Page URL (used in LLM prompts) |
| `llm` | `false \| LLMConfig` | `false` | Heuristic-only by default. Pass LLM config for higher accuracy. |
| `minConfidence` | `number` | `0.50` | Minimum confidence threshold |
| `maxEndpoints` | `number` | `8` | Maximum endpoints to return |

Returns:

```typescript
interface AnalysisResult {
  endpoints: DetectedEndpoint[];  // sorted by confidence desc
  framework?: FrameworkDetection;
  timing: { totalMs: number; llmCalls: number };
  meta: { url?: string; mode: "llm" | "heuristic"; version: string };
}

interface DetectedEndpoint {
  type: "auth" | "search" | "navigation" | "commerce" | "content"
      | "consent" | "settings" | "support";
  label: string;
  confidence: number;          // 0.0 - 1.0
  affordances: string[];       // ["fill", "submit", "click", ...]
  evidence: string[];          // human-readable reasoning
  selector?: string;           // CSS selector (when inferable)
}
```

### `verify(input: VerifyInput): VerifyOutput`

Synchronous post-action verification. Compares before/after DOM state to determine if a browser agent's action succeeded.

```typescript
import { verify } from "balage-core";

const result = verify({
  endpointType: "auth",
  beforeUrl: "https://example.com/login",
  afterUrl: "https://example.com/dashboard",
  beforeHtml: loginPageHtml,
  afterHtml: dashboardHtml,
});
// { verdict: "success", confidence: 0.92, checks: [...] }
```

### `verifyFromHTML(snapshot: ActionSnapshot, expectation: VerificationExpectation, options?: VerifyOptions): Promise<VerificationResult>`

Async verification with full DOM diff analysis, cookie checks, and network request correlation.

### `detectFramework(html: string): FrameworkDetection | null`

Detects the web framework from HTML markup. Supports WordPress, Shopify, React, Next.js, Angular, Vue, Svelte, and Salesforce.

```typescript
import { detectFramework } from "balage-core";

const fw = detectFramework(html);
// {framework: "wordpress", confidence: 0.85, version: "6.4", evidence: [...]}
```

## Benchmark Results

Tested against 20 real-world production websites using `gpt-4o-mini` as LLM backend.

| Site | F1 | Precision | Recall |
|------|:--:|:---------:|:------:|
| github.com | 1.000 | 1.000 | 1.000 |
| ebay.de | 0.941 | 0.889 | 1.000 |
| target.com | 0.923 | 1.000 | 0.857 |
| stackoverflow.com | 0.909 | 1.000 | 0.833 |
| trello.com | 0.909 | 1.000 | 0.833 |
| linkedin.com | 0.833 | 0.833 | 0.833 |
| google.com | 0.833 | 0.833 | 0.833 |
| angular.io | 0.800 | 1.000 | 0.667 |
| notion.so | 0.800 | 1.000 | 0.667 |
| zalando.de | 0.778 | 0.778 | 0.778 |
| **Average (20 sites)** | **0.784** | **0.814** | **0.782** |

Full results for all 20 sites in [`tests/real-world/`](../../tests/real-world/).

Heuristic-only mode (no LLM): ~4ms per page, deterministic, zero cost. LLM mode: ~2-15s depending on page complexity, ~$0.005-0.01 per analysis.

## MCP Server

[balage-mcp](https://www.npmjs.com/package/balage-mcp) exposes `analyzeFromHTML`, `verify`, and `detectFramework` as MCP tools for AI agent frameworks. Install separately:

```bash
npm install balage-mcp
```

## License

MIT
