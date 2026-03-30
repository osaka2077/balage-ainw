# Firecrawl Integration — Quick Start

Analyze any public web page with a single function call. BALAGE fetches the HTML
(via Firecrawl Cloud or Playwright as fallback) and runs semantic endpoint
detection on it.

## Prerequisites

- Node.js >= 20
- An OpenAI or Anthropic API key (only when using `llm: { ... }` mode)
- Optional: A [Firecrawl](https://firecrawl.dev) API key for cloud-based fetching

## Setup (< 2 minutes)

```bash
# 1. Clone and install
git clone https://github.com/sortexai/balage.git
cd balage
npm install

# 2. Configure environment
cp .env.example .env.local

# Minimum: one LLM key for full analysis (heuristic mode needs no key)
# BALAGE_OPENAI_API_KEY=sk-...

# Optional: Firecrawl for cloud-based page fetching
# BALAGE_FIRECRAWL_API_KEY=fc-...
# BALAGE_FIRECRAWL_ENABLED=true
```

## Run the examples

All examples run directly with `npx tsx` — no build step needed.

```bash
# Basic usage: analyze a URL with heuristic mode (no API keys required)
npx tsx examples/firecrawl-integration/basic-usage.ts

# Auto-detection demo: Firecrawl if configured, Playwright fallback otherwise
npx tsx examples/firecrawl-integration/with-playwright-fallback.ts
```

## How Provider Auto-Detection Works

BALAGE picks the best available fetcher automatically:

| Condition | Provider Used |
|-----------|---------------|
| `BALAGE_FIRECRAWL_API_KEY` set + `BALAGE_FIRECRAWL_ENABLED=true` | Firecrawl Cloud |
| No Firecrawl key or not enabled | Playwright (local headless browser) |
| Explicit `fetcherProvider: "firecrawl"` in options | Firecrawl (error if no key) |
| Explicit `fetcherProvider: "playwright"` in options | Playwright |

## What you get back

```typescript
{
  endpoints: [
    {
      type: "auth",
      label: "Sign in",
      description: "Login form submit button",
      selector: "#login-form button[type='submit']",
      confidence: 0.92,
      affordances: ["click", "submit"],
      evidence: ["form[action='/session']", "input[name='login']"],
    },
    // ...
  ],
  framework: { framework: "react", confidence: 0.85, version: "18.x", evidence: [...] },
  timing: { totalMs: 2340, llmCalls: 0 },
  meta: {
    url: "https://github.com/login",
    mode: "heuristic",
    fetcherType: "firecrawl",   // which provider fetched the page
    fetchTimingMs: 890,          // how long the fetch took
  },
}
```

## Security Notes

- All URLs are validated against SSRF attacks before fetching (private IPs, cloud metadata endpoints, internal TLDs are blocked).
- Firecrawl API keys are never logged or included in error messages.
- HTTP URLs are blocked by default. Set `BALAGE_ALLOW_HTTP=true` only for local development.
- See [Security Guide](../../docs/security/FIRECRAWL-SECURITY-GUIDE.md) for full details.
