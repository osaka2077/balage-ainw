# BALAGE — Semantic Page Analysis for Browser Agents

> Detect login forms, search bars, checkout flows in raw HTML. Confidence scores + evidence chains. No browser needed.

[![npm](https://img.shields.io/npm/v/balage-core)](https://www.npmjs.com/package/balage-core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## Quick Start

```bash
npm install balage-core
```

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
console.log(result.timing.totalMs); // ~4ms (heuristic mode, no API key needed)
```

---

## What It Does

**BALAGE analyzes HTML and tells your browser agent what's on the page — before it acts.**

- **Endpoint Detection** — Identifies interactive elements semantically (auth, search, checkout, navigation, consent banners)
- **Confidence Scores** — Every detection has a calibrated score backed by evidence from DOM, ARIA, text content
- **Framework Detection** — Detects WordPress, Shopify, React, Next.js, Angular, Vue, Svelte, Salesforce
- **Selector Inference** — Generates stable CSS selectors using a 6-level priority chain
- **Two Modes** — Heuristic (~4ms, no API key) or LLM-enhanced (~24s, higher accuracy)

## What It's NOT

BALAGE is **not** a browser agent. It doesn't navigate, click, or fill forms.
It's a **verification layer** that sits between your agent and the web.

Complementary to: [browser-use](https://github.com/browser-use/browser-use), [Stagehand](https://github.com/browserbase/stagehand), [Skyvern](https://github.com/Skyvern-AI/skyvern).

---

## Benchmark (20 Real Production Sites)

Tested on GitHub, Amazon, Airbnb, Booking.com, eBay, LinkedIn, Stripe, and more.

| Metric | Score |
|--------|:-----:|
| **F1** | **66%** |
| Precision | 71% |
| Recall | 68% |
| Type Accuracy | 83% |

**Best:** Google Accounts (91%), Zalando (89%), Typeform (83%), Hacker News (80%)
**Known limits:** Angular Material SPAs, multi-step auth flows, keyboard-shortcut search (Cmd+K)

---

## MCP Server (Claude Desktop / Cursor)

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "balage": {
      "command": "npx",
      "args": ["-y", "balage-mcp"]
    }
  }
}
```

**Tools:** `analyze_page`, `detect_framework`, `infer_selector`

---

## API

### `analyzeFromHTML(html, options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `"https://unknown"` | Page URL (used in LLM prompts) |
| `llm` | `false \| LLMConfig` | `false` | Heuristic-only (no API key). Pass LLM config for higher accuracy |
| `minConfidence` | `number` | `0.50` | Minimum confidence threshold |
| `maxEndpoints` | `number` | `10` | Maximum endpoints to return |

### `detectFramework(html)`

Detects: WordPress, Shopify, React, Next.js, Angular, Vue, Svelte, Salesforce.

### `inferSelector(domNode)`

Generates CSS selectors with 6 priority levels: form action > element ID > ARIA > structural > semantic > class-based.

---

## Use Cases

- **Browser agent pre-flight** — Know what's on the page before your agent acts
- **Post-action verification** — Verify the agent interacted with the right element
- **Compliance/audit** — Log what the agent saw and why it acted
- **Testing** — Detect UI regressions that break agent workflows

---

## Status

This is an **alpha release**. The API may change. F1=66% means it works well on common patterns but has known gaps.

- [Benchmark details](./tests/real-world/)
- [Core library docs](./packages/core/README.md)

---

## License

MIT
