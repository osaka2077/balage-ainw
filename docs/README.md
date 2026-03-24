# BALAGE Documentation

> Semantic page analysis for browser agents.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [balage-core](../packages/core/README.md) | `npm install balage-core` | Core library — endpoint detection, framework detection, selector inference |
| [balage-mcp](../packages/mcp/README.md) | `npx -y balage-mcp` | MCP server for Claude Desktop, Cursor, and MCP-compatible clients |

## How It Works

1. **HTML Parsing** — Converts raw HTML to a structured DOM tree (no browser needed)
2. **UI Segmentation** — Groups DOM elements into semantic segments (forms, navigation, etc.)
3. **Classification** — Heuristics + optional LLM identify endpoint types and confidence
4. **Evidence Chain** — Every classification includes evidence for auditability

## Concepts

- **Endpoints** — Semantic representations of interactive elements (auth forms, search bars, checkout buttons)
- **Confidence Scores** — Calibrated 0-1 scores backed by evidence from DOM, ARIA, text, and layout signals
- **Framework Detection** — Identifies WordPress, Shopify, React, Next.js, Angular, Vue, Svelte, Salesforce
- **Selector Inference** — Generates stable CSS selectors using a 6-level priority chain

## Development

```bash
git clone https://github.com/osaka2077/balage-ainw
cd balage-ainw
npm install
npm test                    # Unit tests
npx tsc --noEmit            # Type check
npm run lint                # ESLint
```

## Architecture

```
balage-ainw/
  src/
    core/         — Core analysis engine (analyzeFromHTML, detectFramework)
    parser/       — HTML-to-DOM parsing, ARIA extraction
    semantic/     — Endpoint classification, LLM client, DOM pruning
  packages/
    core/         — npm package config + build (balage-core)
    mcp/          — MCP server package (balage-mcp)
  tests/
    real-world/   — Benchmark suite (20 production websites)
```

## Further Reading

- [Core Concepts](./concepts.md) — Endpoints, Fingerprints, Confidence engine internals
- [Architecture Details](./architecture.md) — Full system architecture

## License

MIT
