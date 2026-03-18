# BALAGE -- Semantic Verification Layer for AI-Browser Interaction

> Trust layer for browser automation agents. Confidence scores, evidence chains, risk gates.

[![Technical Preview](https://img.shields.io/badge/status-technical%20preview-blue)](https://github.com/osaka2077/balage-ainw)
[![npm](https://img.shields.io/npm/v/@balage-osaka/sdk)](https://www.npmjs.com/package/@balage-osaka/sdk)

---

## Quick Start (under 5 minutes)

```bash
npm install @balage-osaka/sdk
```

```typescript
import { BalageClient } from "@balage-osaka/sdk";

const client = new BalageClient({ apiKey: "your-key" });
const result = await client.analyze("https://example.com/login");
console.log(result.endpoints);
// [{type: "auth", label: "Login Form", confidence: 0.93}]
```

---

## What BALAGE Does

- **Semantic Endpoint Detection** -- Identifies what interactive elements mean (login form, search bar, checkout button), not where they are in the DOM. Survives redesigns.
- **Confidence Scores with Evidence** -- Every detection includes a calibrated confidence score backed by evidence from DOM, ARIA, text content, layout, and LLM inference. A score of 0.85 means "correct 85% of the time."
- **Risk Gates with Default-Deny** -- Every action must pass through a risk gate before execution. Higher-risk actions (financial, destructive) require higher evidence thresholds. Blocked by default.
- **Verified Endpoints as Trust Network** -- Endpoints build a trust graph across pages. Verified interactions increase confidence for future visits to the same site.

## What BALAGE is NOT

BALAGE is **not** a browser agent. It does not navigate, click, or fill forms on its own.
BALAGE is **not** a scraper. It does not extract data from pages.

BALAGE is a **verification layer** that sits between your browser agent and the web. It tells your agent *what* is on the page and *how confident* it is. Your agent decides what to do.

Complementary to: [browser-use](https://github.com/browser-use/browser-use), [Stagehand](https://github.com/browserbase/stagehand), [Skyvern](https://github.com/Skyvern-AI/skyvern).

---

## Benchmark

Tested on 20 real production websites (GitHub, Airbnb, Booking.com, Amazon, LinkedIn, Stripe, Hacker News, Wikipedia, and more).

| Metric | BALAGE (gpt-4o-mini) | Vision-Only (gpt-4o) |
|--------|----------------------|----------------------|
| Precision | 56% | 11% |
| Recall | 57% | 13% |
| **F1 Score** | **53%** | **12%** |
| Model cost | cheap (gpt-4o-mini) | expensive (gpt-4o) |

**BALAGE achieves 4.4x the F1 score of vision-only approaches, using a cheaper model.**

Per-site highlights: GitHub Login F1=80%, Hacker News F1=91%, Airbnb F1=80%, Zendesk F1=71%.

---

## Architecture: 7-Layer Stack

| Layer | Name | Responsibility |
|-------|------|---------------|
| L7 | Developer Experience | REST API, TypeScript SDK, Python SDK, CLI |
| L6 | Observability | Structured logs, traces, metrics, audit trail |
| L5 | Orchestration | DAG executor, Navigator, FormFiller, Verifier |
| L4 | Decision Engine | Confidence engine, risk gates, contradiction detection |
| L3 | Semantic Engine | Endpoint generator, fingerprints, evidence collector |
| L2 | Parsing Engine | DOM parser, ARIA extractor, UI segmenter |
| L1 | Browser Adapter | Playwright/CDP, session manager, anti-detection |

---

## Installation

### TypeScript / JavaScript

```bash
npm install @balage-osaka/sdk
```

Requires Node.js 18+. See [SDK Guide](./docs/sdk-guide.md) for full API reference.

### Python

```bash
pip install balage
```

Requires Python 3.10+. See [SDK Guide](./docs/sdk-guide.md#python-sdk) for async client usage.

### CLI

```bash
npm install -g @balage-osaka/cli
```

See [CLI Reference](./docs/cli-reference.md) for all commands and options.

---

## Links

- [Landing Page](./packages/landing/index.html)
- [SDK Guide](./docs/sdk-guide.md)
- [CLI Reference](./docs/cli-reference.md)
- [Architecture](./docs/architecture.md)
- [API Reference](./docs/api-reference.md)

---

## License

MIT
