#!/usr/bin/env node
/**
 * BALAGE MCP Server — Semantic Page Analysis for AI Agents
 *
 * Tools:
 *   analyze_page     — Detect endpoints (login, search, checkout) in HTML
 *   detect_framework — Identify web framework (React, Next.js, WordPress, etc.)
 *   infer_selector   — Generate CSS selector from HTML element
 *
 * Usage:
 *   npx tsx src/mcp/server.ts
 *
 * Claude Desktop config:
 *   { "mcpServers": { "balage": { "command": "npx", "args": ["tsx", "src/mcp/server.ts"] } } }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzeFromHTML, detectFramework, inferSelector, htmlToDomNode, VERSION } from "../core/index.js";

/** Max HTML input size: 2 MB (schuetzt vor OOM bei uebergrossen Payloads) */
const MAX_HTML_BYTES = 2 * 1024 * 1024;

function assertHtmlSize(html: string, paramName = "html"): void {
  const byteLen = Buffer.byteLength(html, "utf-8");
  if (byteLen > MAX_HTML_BYTES) {
    throw new Error(
      `${paramName} exceeds maximum size (${(byteLen / 1024 / 1024).toFixed(1)} MB > 2 MB limit). ` +
      "Truncate the HTML or pass a smaller page.",
    );
  }
}

const server = new McpServer({
  name: "balage",
  version: VERSION,
});

// ============================================================================
// Tool: analyze_page
// ============================================================================

server.tool(
  "analyze_page",
  "Analyze an HTML page and detect interactive endpoints (login forms, search bars, checkout flows, navigation, cookie banners). Returns endpoint type, label, confidence score, CSS selector, and evidence.",
  {
    html: z.string().describe("Raw HTML of the page to analyze"),
    url: z.string().optional().describe("URL of the page (for context)"),
    min_confidence: z.number().min(0).max(1).optional().describe("Minimum confidence threshold (default: 0.50)"),
    max_endpoints: z.number().int().min(1).max(50).optional().describe("Maximum endpoints to return (default: 10)"),
  },
  async ({ html, url, min_confidence, max_endpoints }) => {
    assertHtmlSize(html);
    const result = await analyzeFromHTML(html, {
      url,
      minConfidence: min_confidence,
      maxEndpoints: max_endpoints,
    });

    const endpointList = result.endpoints
      .map((ep, i) => {
        const parts = [
          `${i + 1}. **${ep.type}**: ${ep.label}`,
          `   Confidence: ${(ep.confidence * 100).toFixed(0)}%`,
        ];
        if (ep.selector) parts.push(`   Selector: \`${ep.selector}\``);
        if (ep.affordances.length > 0) parts.push(`   Actions: ${ep.affordances.join(", ")}`);
        if (ep.evidence.length > 0) parts.push(`   Evidence: ${ep.evidence.join("; ")}`);
        return parts.join("\n");
      })
      .join("\n\n");

    const frameworkInfo = result.framework
      ? `\nFramework: ${result.framework.framework} (${(result.framework.confidence * 100).toFixed(0)}% confidence${result.framework.version ? `, v${result.framework.version}` : ""})`
      : "";

    const summary = result.endpoints.length === 0
      ? "No interactive endpoints detected in this HTML."
      : `Found ${result.endpoints.length} endpoint${result.endpoints.length > 1 ? "s" : ""} in ${result.timing.totalMs}ms:`;

    return {
      content: [{
        type: "text" as const,
        text: `${summary}\n\n${endpointList}${frameworkInfo}\n\n---\n_BALAGE v${VERSION} | heuristic mode | ${result.timing.totalMs}ms_`,
      }],
    };
  },
);

// ============================================================================
// Tool: detect_framework
// ============================================================================

server.tool(
  "detect_framework",
  "Detect which web framework a page uses (React, Next.js, Angular, Vue, Svelte, Shopify, WordPress, Salesforce).",
  {
    html: z.string().describe("Raw HTML of the page"),
  },
  async ({ html }) => {
    assertHtmlSize(html);
    const fw = detectFramework(html);
    if (!fw) {
      return { content: [{ type: "text" as const, text: "No web framework detected." }] };
    }
    return {
      content: [{
        type: "text" as const,
        text: `**${fw.framework}** (${(fw.confidence * 100).toFixed(0)}% confidence${fw.version ? `, v${fw.version}` : ""})\nEvidence: ${fw.evidence.join(", ")}`,
      }],
    };
  },
);

// ============================================================================
// Tool: infer_selector
// ============================================================================

server.tool(
  "infer_selector",
  "Generate a CSS selector for an HTML element. Uses ID, ARIA role, form action, structural patterns, and class-based fallback.",
  {
    html: z.string().describe("HTML snippet containing the element"),
  },
  async ({ html }) => {
    assertHtmlSize(html);
    const dom = htmlToDomNode(html);
    const selector = inferSelector(dom);
    return {
      content: [{
        type: "text" as const,
        text: selector ? `\`${selector}\`` : "Could not infer a stable CSS selector.",
      }],
    };
  },
);

// ============================================================================
// Start
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`BALAGE MCP Server error: ${err}\n`);
  process.exit(1);
});
