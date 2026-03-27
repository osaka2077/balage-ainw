#!/usr/bin/env node
/**
 * BALAGE MCP Server — Semantic Page Analysis for AI Agents
 *
 * Tools:
 *   analyze_page  — Detect endpoints (login, search, checkout) in HTML
 *   detect_framework — Identify web framework (React, Next.js, WordPress, etc.)
 *   infer_selector — Generate CSS selector from HTML element
 *
 * Usage with Claude Desktop:
 *   npx balage-mcp
 *
 * Config (claude_desktop_config.json):
 *   { "mcpServers": { "balage": { "command": "npx", "args": ["balage-mcp"] } } }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzeFromHTML, detectFramework, inferSelector, htmlToDomNode, verifyFromHTML, VERSION } from "balage-core";

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
      ? `\n\nFramework: ${result.framework.framework} (${(result.framework.confidence * 100).toFixed(0)}% confidence${result.framework.version ? `, v${result.framework.version}` : ""})`
      : "";

    const summary = result.endpoints.length === 0
      ? "No interactive endpoints detected in this HTML."
      : `Found ${result.endpoints.length} endpoint${result.endpoints.length > 1 ? "s" : ""} in ${result.timing.totalMs}ms:`;

    return {
      content: [{
        type: "text" as const,
        text: `${summary}\n\n${endpointList}${frameworkInfo}\n\n---\n_Analyzed by BALAGE v${VERSION} (heuristic mode, ${result.timing.totalMs}ms)_`,
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
    const result = detectFramework(html);

    if (!result) {
      return {
        content: [{ type: "text" as const, text: "No web framework detected." }],
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: [
          `**Framework:** ${result.framework}`,
          `**Confidence:** ${(result.confidence * 100).toFixed(0)}%`,
          result.version ? `**Version:** ${result.version}` : null,
          `**Evidence:** ${result.evidence.join(", ")}`,
        ].filter(Boolean).join("\n"),
      }],
    };
  },
);

// ============================================================================
// Tool: infer_selector
// ============================================================================

server.tool(
  "infer_selector",
  "Generate a CSS selector for an HTML element. Uses a 6-level priority chain: form action, element ID, ARIA role, structural patterns, semantic tags, class-based fallback.",
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
        text: selector
          ? `CSS Selector: \`${selector}\``
          : "Could not infer a stable CSS selector from the provided HTML.",
      }],
    };
  },
);

// ============================================================================
// Tool: verify_action
// ============================================================================

server.tool(
  "verify_action",
  "Verify whether a browser action (login, form submit, navigation, modal) was successful by comparing before/after HTML snapshots. Returns verdict (verified/failed/inconclusive), confidence score, and evidence.",
  {
    before_html: z.string().describe("HTML of the page BEFORE the action"),
    after_html: z.string().describe("HTML of the page AFTER the action"),
    before_url: z.string().describe("URL BEFORE the action"),
    after_url: z.string().describe("URL AFTER the action"),
    scenario: z.enum(["login", "form_submit", "navigation", "modal_open", "modal_close", "error"]).describe("What type of action to verify"),
    action_type: z.string().optional().describe("Action performed (e.g., 'click', 'submit')"),
    action_selector: z.string().optional().describe("CSS selector of the element that was acted upon"),
  },
  async ({ before_html, after_html, before_url, after_url, scenario, action_type, action_selector }) => {
    assertHtmlSize(before_html, "before_html");
    assertHtmlSize(after_html, "after_html");
    const now = Date.now();
    const result = await verifyFromHTML(
      {
        before: { html: before_html, url: before_url, timestamp: now - 1000 },
        after: { html: after_html, url: after_url, timestamp: now },
        action: { type: action_type ?? "click", selector: action_selector },
      },
      { type: scenario },
    );

    const checkDetails = result.checks
      .map(c => `  ${c.passed ? "✓" : "✗"} ${c.name}: ${c.evidence} (${(c.confidence * 100).toFixed(0)}%)`)
      .join("\n");

    const verdictEmoji = result.verdict === "verified" ? "✅" : result.verdict === "failed" ? "❌" : "⚠️";

    return {
      content: [{
        type: "text" as const,
        text: [
          `${verdictEmoji} **Verdict: ${result.verdict.toUpperCase()}** (${(result.confidence * 100).toFixed(0)}% confidence)`,
          "",
          `**Scenario:** ${scenario}`,
          `**URL:** ${before_url} → ${after_url}`,
          `**DOM Changes:** ${result.domDiff.significantChanges} significant`,
          "",
          "**Checks:**",
          checkDetails,
          "",
          `_Verified in ${result.timing.totalMs}ms by BALAGE v${VERSION}_`,
        ].join("\n"),
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
  console.error("BALAGE MCP Server failed to start:", err);
  process.exit(1);
});
