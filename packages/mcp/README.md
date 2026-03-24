# balage-mcp

> MCP server for semantic page analysis. Works with Claude Desktop, Cursor, and any MCP-compatible client.

[![npm](https://img.shields.io/npm/v/balage-mcp)](https://www.npmjs.com/package/balage-mcp)

## Setup

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

## Tools

### `analyze_page`

Analyze HTML and detect interactive endpoints (login forms, search bars, checkout flows, navigation, cookie banners).

**Parameters:**
- `html` (required) — Raw HTML of the page
- `url` (optional) — Page URL for context
- `min_confidence` (optional) — Minimum confidence threshold (0-1, default: 0.50)
- `max_endpoints` (optional) — Max endpoints to return (default: 10)

### `detect_framework`

Detect which web framework a page uses (React, Next.js, Angular, Vue, Svelte, Shopify, WordPress, Salesforce).

**Parameters:**
- `html` (required) — Raw HTML of the page

### `infer_selector`

Generate a CSS selector for an HTML element using a 6-level priority chain.

**Parameters:**
- `html` (required) — HTML snippet containing the element

## Requirements

- Node.js >= 18.0.0
- Uses [balage-core](https://www.npmjs.com/package/balage-core) for analysis

## License

MIT
