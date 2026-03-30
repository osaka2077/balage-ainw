# balage-core

Detect login forms, search bars, and checkout flows from URLs or HTML. Firecrawl + Playwright auto-detection. No browser required.

[![npm version](https://img.shields.io/npm/v/balage-core)](https://www.npmjs.com/package/balage-core)
[![license](https://img.shields.io/npm/l/balage-core)](https://github.com/osaka2077/balage-ainw/blob/main/LICENSE)
[![tests](https://img.shields.io/badge/tests-1323%20passed-brightgreen)]()

## Quick Start

```bash
npm install balage-core
```

### Analyze a URL (NEW in v0.7.0)

```typescript
import { analyzeFromURL } from "balage-core";

const result = await analyzeFromURL("https://github.com/login");

console.log(result.endpoints);
// [{type: "auth", label: "Login Form", confidence: 0.92,
//   affordances: ["fill", "submit"],
//   evidence: ["Contains password input", "Contains email input"]}]
```

Auto-detects the best fetcher: Firecrawl (if `FIRECRAWL_API_KEY` set) or Playwright (if installed).

### Analyze raw HTML (no fetcher needed)

```typescript
import { analyzeFromHTML } from "balage-core";

const result = await analyzeFromHTML(`
  <form action="/login">
    <input type="email" placeholder="Email">
    <input type="password" placeholder="Password">
    <button type="submit">Sign In</button>
  </form>
`);

console.log(result.endpoints[0].type); // "auth"
console.log(result.endpoints[0].confidence); // 0.75
```

### LLM Mode (higher accuracy)

```typescript
const result = await analyzeFromURL("https://github.com/login", {
  llm: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini",
  },
});
// F1 ~77% across 50 real-world production sites
```

## Why balage-core?

- **URL or HTML.** `analyzeFromURL()` fetches + analyzes in one call. `analyzeFromHTML()` works on raw strings. Your choice.
- **No browser required.** With Firecrawl, analysis runs serverless (Lambda, Edge, Cloudflare Workers). Playwright is optional fallback.
- **Confidence scores.** Every endpoint has a 0-1 confidence score and evidence chain. Your agent makes informed decisions.
- **77% F1 on 50 real-world sites.** Benchmarked against GitHub, Amazon, Airbnb, Booking.com, IKEA, BBC, and 44 more. Not toy examples.
- **5-10x cheaper than Computer Use.** One analysis per page ($0.005), then deterministic CSS selectors. No screenshot per action.

## API Reference

### `analyzeFromURL(url, options?): Promise<AnalysisResult>`

Fetch HTML from a URL, then analyze it. Auto-detects Firecrawl or Playwright.

```typescript
// Firecrawl (serverless, no browser)
FIRECRAWL_API_KEY=fc-xxx node app.js

// Playwright (self-contained, local browser)
npm install playwright
node app.js

// Explicit provider
const result = await analyzeFromURL(url, { fetcher: "firecrawl" });
const result = await analyzeFromURL(url, { fetcher: "playwright" });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fetcher` | `"auto" \| "firecrawl" \| "playwright"` | `"auto"` | Which fetcher to use |
| `llm` | `false \| LLMConfig` | `false` | Heuristic-only by default |
| `firecrawlApiKey` | `string` | env var | Firecrawl API key |

### `analyzeFromHTML(html, options?): Promise<AnalysisResult>`

Analyze raw HTML directly. No fetcher needed.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `"https://unknown"` | Page URL (for LLM context) |
| `llm` | `false \| LLMConfig` | `false` | Heuristic-only by default |
| `minConfidence` | `number` | `0.50` | Minimum confidence threshold |
| `maxEndpoints` | `number` | `8` | Maximum endpoints to return |

### Result Types

```typescript
interface AnalysisResult {
  endpoints: DetectedEndpoint[];
  framework?: FrameworkDetection;
  timing: { totalMs: number; llmCalls: number };
  meta: { url?: string; mode: "llm" | "heuristic"; version: string };
}

interface DetectedEndpoint {
  type: "auth" | "search" | "navigation" | "checkout" | "commerce"
      | "content" | "consent" | "settings" | "support" | "form"
      | "media" | "social";
  label: string;
  confidence: number;          // 0.0 - 1.0
  affordances: string[];       // ["fill", "submit", "click", ...]
  evidence: string[];          // human-readable reasoning
  selector?: string;           // CSS selector (when inferable)
}
```

### `verify(input): VerifyOutput`

Post-action verification. Compares before/after DOM state.

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

### `detectFramework(html): FrameworkDetection | null`

Detects web framework from HTML. Supports WordPress, Shopify, React, Next.js, Angular, Vue, Svelte, Salesforce.

## Benchmark Results

Tested against 50 real-world production websites using `gpt-4o-mini`.

| Category | Sites | Avg F1 |
|----------|:-----:|:------:|
| Login pages | 8 | 89% |
| E-Commerce | 12 | 78% |
| SaaS | 6 | 76% |
| Media/News | 5 | 72% |
| Developer tools | 8 | 71% |
| Other | 11 | 74% |
| **Total (50 sites)** | **50** | **77%** |

Full results in [`tests/real-world/`](../../tests/real-world/).

## Security

- SSRF protection (17 bypass vectors blocked)
- API key redaction in all error paths
- Response size limits (5MB default)
- HTML comment stripping before LLM calls
- Credential scanning on endpoint output

See [Security Guide](../../docs/security/FIRECRAWL-SECURITY-GUIDE.md).

## License

MIT
