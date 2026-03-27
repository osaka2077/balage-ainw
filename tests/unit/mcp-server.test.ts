/**
 * MCP Server Tests — Vollstaendige Abdeckung des User-Facing Interface
 *
 * Strategie: McpServer und StdioServerTransport werden gemockt.
 * Die server.tool()-Aufrufe werden abgefangen, um die Handler direkt
 * testen zu koennen — ohne echten Stdio-Transport, ohne echte Core-Analyse.
 *
 * Core-Funktionen (analyzeFromHTML, detectFramework, inferSelector, htmlToDomNode)
 * werden mit vi.mock() ersetzt, damit diese Tests UNIT-Tests bleiben.
 */

import { describe, it, expect, vi, beforeAll, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Mock-Typen fuer registrierte Tools
// ---------------------------------------------------------------------------

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

// Speicher fuer registrierte Tools — wird beim Import von server.ts befuellt
const registeredTools: RegisteredTool[] = [];

// ---------------------------------------------------------------------------
// Mock: @modelcontextprotocol/sdk/server/mcp.js
// ---------------------------------------------------------------------------

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  return {
    McpServer: class FakeMcpServer {
      constructor(_opts: unknown) {
        // Nichts zu tun
      }
      tool(name: string, description: string, schema: Record<string, unknown>, handler: RegisteredTool["handler"]) {
        registeredTools.push({ name, description, schema, handler });
      }
      async connect(_transport: unknown) {
        // Kein echter Transport — Tests brauchen keinen Stdio
      }
    },
  };
});

// ---------------------------------------------------------------------------
// Mock: @modelcontextprotocol/sdk/server/stdio.js
// ---------------------------------------------------------------------------

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => {
  return {
    StdioServerTransport: class FakeStdioTransport {},
  };
});

// ---------------------------------------------------------------------------
// Mock: ../core/index.js — Alle Core-Funktionen
// ---------------------------------------------------------------------------

const mockAnalyzeFromHTML = vi.fn();
const mockDetectFramework = vi.fn();
const mockInferSelector = vi.fn();
const mockHtmlToDomNode = vi.fn();

vi.mock("../../src/core/index.js", () => {
  return {
    analyzeFromHTML: mockAnalyzeFromHTML,
    detectFramework: mockDetectFramework,
    inferSelector: mockInferSelector,
    htmlToDomNode: mockHtmlToDomNode,
    VERSION: "0.0.0-test",
  };
});

// ---------------------------------------------------------------------------
// Import Server — triggert die Tool-Registrierung in unseren Fake-McpServer
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Leere registeredTools vor dem Import (fuer re-runs)
  registeredTools.length = 0;
  await import("../../src/mcp/server.js");
});

// ---------------------------------------------------------------------------
// Helper: Tool nach Name finden
// ---------------------------------------------------------------------------

function findTool(name: string): RegisteredTool {
  const tool = registeredTools.find(t => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" nicht registriert. Verfuegbar: ${registeredTools.map(t => t.name).join(", ")}`);
  return tool;
}

// ===========================================================================
// Tool Registration
// ===========================================================================

describe("MCP Server — Tool Registration", () => {
  it("registriert genau 3 Tools", () => {
    expect(registeredTools).toHaveLength(3);
  });

  it("registriert analyze_page Tool", () => {
    const tool = findTool("analyze_page");
    expect(tool.description).toContain("endpoint");
  });

  it("registriert detect_framework Tool", () => {
    const tool = findTool("detect_framework");
    expect(tool.description).toContain("framework");
  });

  it("registriert infer_selector Tool", () => {
    const tool = findTool("infer_selector");
    expect(tool.description).toContain("selector");
  });

  it("alle Tools haben nicht-leere Beschreibungen", () => {
    for (const tool of registeredTools) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it("analyze_page Schema definiert html als required und optionale Felder", () => {
    const tool = findTool("analyze_page");
    // Zod-Schema wird als Objekt uebergeben — Schluessel muessen vorhanden sein
    expect(tool.schema).toHaveProperty("html");
    expect(tool.schema).toHaveProperty("url");
    expect(tool.schema).toHaveProperty("min_confidence");
    expect(tool.schema).toHaveProperty("max_endpoints");
  });

  it("detect_framework Schema definiert html als einziges Feld", () => {
    const tool = findTool("detect_framework");
    expect(tool.schema).toHaveProperty("html");
    expect(Object.keys(tool.schema)).toHaveLength(1);
  });

  it("infer_selector Schema definiert html als einziges Feld", () => {
    const tool = findTool("infer_selector");
    expect(tool.schema).toHaveProperty("html");
    expect(Object.keys(tool.schema)).toHaveLength(1);
  });
});

// ===========================================================================
// analyze_page — Tool Execution (mit Mocks)
// ===========================================================================

describe("MCP Server — analyze_page execution", () => {
  it("reicht analyzeFromHTML-Ergebnis korrekt durch (mit Endpoints)", async () => {
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [
        {
          type: "auth",
          label: "Login Form",
          description: "Login form with 2 inputs",
          confidence: 0.92,
          selector: "form[action='/login']",
          affordances: ["fill", "submit"],
          evidence: ["password input", "form action /login"],
        },
      ],
      framework: { framework: "react", confidence: 0.85, evidence: ["data-reactroot"] },
      timing: { totalMs: 12, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });

    const tool = findTool("analyze_page");
    const result = await tool.handler({ html: "<form>...</form>" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toContain("auth");
    expect(result.content[0]!.text).toContain("Login Form");
    expect(result.content[0]!.text).toContain("92%");
    expect(result.content[0]!.text).toContain("form[action='/login']");
    expect(result.content[0]!.text).toContain("fill, submit");
    expect(result.content[0]!.text).toContain("password input");
    expect(result.content[0]!.text).toContain("react");
  });

  it("gibt 'No interactive endpoints' bei leerem Ergebnis zurueck", async () => {
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [],
      framework: null,
      timing: { totalMs: 3, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });

    const tool = findTool("analyze_page");
    const result = await tool.handler({ html: "<p>No forms here</p>" });

    expect(result.content[0]!.text).toContain("No interactive endpoints");
  });

  it("uebergibt url, min_confidence und max_endpoints an analyzeFromHTML", async () => {
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [],
      framework: null,
      timing: { totalMs: 1, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });

    const tool = findTool("analyze_page");
    await tool.handler({
      html: "<html></html>",
      url: "https://example.com",
      min_confidence: 0.8,
      max_endpoints: 5,
    });

    expect(mockAnalyzeFromHTML).toHaveBeenCalledWith("<html></html>", {
      url: "https://example.com",
      minConfidence: 0.8,
      maxEndpoints: 5,
    });
  });

  it("formatiert mehrere Endpoints mit Nummerierung", async () => {
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [
        { type: "auth", label: "Login", description: "", confidence: 0.9, selector: "#login", affordances: ["fill"], evidence: ["pw"] },
        { type: "search", label: "Search Bar", description: "", confidence: 0.85, selector: "#search", affordances: ["fill", "submit"], evidence: ["role=search"] },
      ],
      framework: null,
      timing: { totalMs: 8, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });

    const tool = findTool("analyze_page");
    const result = await tool.handler({ html: "<html></html>" });
    const text = result.content[0]!.text;

    expect(text).toContain("Found 2 endpoints");
    expect(text).toContain("1. **auth**");
    expect(text).toContain("2. **search**");
  });

  it("zeigt Framework-Info mit Version wenn vorhanden", async () => {
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [],
      framework: { framework: "wordpress", confidence: 0.95, version: "6.4", evidence: ["meta generator"] },
      timing: { totalMs: 5, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });

    const tool = findTool("analyze_page");
    const result = await tool.handler({ html: "<html></html>" });
    const text = result.content[0]!.text;

    expect(text).toContain("Framework: wordpress");
    expect(text).toContain("95%");
    expect(text).toContain("v6.4");
  });

  it("zeigt singular 'endpoint' bei genau einem Treffer", async () => {
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [
        { type: "navigation", label: "Nav", description: "", confidence: 0.7, affordances: ["navigate"], evidence: ["nav tag"] },
      ],
      framework: null,
      timing: { totalMs: 4, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });

    const tool = findTool("analyze_page");
    const result = await tool.handler({ html: "<nav></nav>" });
    const text = result.content[0]!.text;

    // "Found 1 endpoint" — nicht "endpoints"
    expect(text).toMatch(/Found 1 endpoint\b/);
    expect(text).not.toContain("endpoints");
  });
});

// ===========================================================================
// detect_framework — Tool Execution (mit Mocks)
// ===========================================================================

describe("MCP Server — detect_framework execution", () => {
  it("gibt Framework-Name und Confidence zurueck", async () => {
    mockDetectFramework.mockReturnValueOnce({
      framework: "nextjs",
      confidence: 0.88,
      version: "14.0",
      evidence: ["__next div", "_next/static"],
    });

    const tool = findTool("detect_framework");
    const result = await tool.handler({ html: '<div id="__next"></div>' });
    const text = result.content[0]!.text;

    expect(text).toContain("nextjs");
    expect(text).toContain("88%");
  });

  it("gibt 'No web framework detected' bei null-Ergebnis zurueck", async () => {
    mockDetectFramework.mockReturnValueOnce(null);

    const tool = findTool("detect_framework");
    const result = await tool.handler({ html: "<p>plain</p>" });

    expect(result.content[0]!.text).toContain("No web framework detected");
  });

  it("uebergibt html direkt an detectFramework", async () => {
    mockDetectFramework.mockReturnValueOnce(null);

    const tool = findTool("detect_framework");
    await tool.handler({ html: "<div>test</div>" });

    expect(mockDetectFramework).toHaveBeenCalledWith("<div>test</div>");
  });
});

// ===========================================================================
// infer_selector — Tool Execution (mit Mocks)
// ===========================================================================

describe("MCP Server — infer_selector execution", () => {
  it("gibt CSS-Selector in Backticks zurueck", async () => {
    const fakeDomNode = { tagName: "form", attributes: { action: "/login" }, children: [] };
    mockHtmlToDomNode.mockReturnValueOnce(fakeDomNode);
    mockInferSelector.mockReturnValueOnce("form[action='/login']");

    const tool = findTool("infer_selector");
    const result = await tool.handler({ html: '<form action="/login"></form>' });

    expect(result.content[0]!.text).toContain("`form[action='/login']`");
  });

  it("gibt Fallback-Text wenn kein Selector ermittelt werden kann", async () => {
    const fakeDomNode = { tagName: "div", attributes: {}, children: [] };
    mockHtmlToDomNode.mockReturnValueOnce(fakeDomNode);
    mockInferSelector.mockReturnValueOnce(null);

    const tool = findTool("infer_selector");
    const result = await tool.handler({ html: "<div></div>" });

    expect(result.content[0]!.text).toContain("Could not infer");
  });

  it("uebergibt htmlToDomNode-Ergebnis an inferSelector", async () => {
    const fakeDomNode = { tagName: "input", attributes: { id: "email" }, children: [] };
    mockHtmlToDomNode.mockReturnValueOnce(fakeDomNode);
    mockInferSelector.mockReturnValueOnce("#email");

    const tool = findTool("infer_selector");
    await tool.handler({ html: '<input id="email">' });

    expect(mockHtmlToDomNode).toHaveBeenCalledWith('<input id="email">');
    expect(mockInferSelector).toHaveBeenCalledWith(fakeDomNode);
  });
});

// ===========================================================================
// Error Handling — MCP-konforme Error-Responses
// ===========================================================================

describe("MCP Server — Error Handling", () => {
  it("analyze_page: Exception in analyzeFromHTML wird als Error propagiert", async () => {
    mockAnalyzeFromHTML.mockRejectedValueOnce(new Error("Internal parse failure"));

    const tool = findTool("analyze_page");
    // MCP-Handler soll werfen — der MCP-Server faengt das und gibt Error zurueck
    await expect(tool.handler({ html: "<broken>" })).rejects.toThrow("Internal parse failure");
  });

  it("detect_framework: Exception in detectFramework wird als Error propagiert", async () => {
    mockDetectFramework.mockImplementationOnce(() => {
      throw new Error("Framework detection crashed");
    });

    const tool = findTool("detect_framework");
    await expect(tool.handler({ html: "<html>" })).rejects.toThrow("Framework detection crashed");
  });

  it("infer_selector: Exception in htmlToDomNode wird als Error propagiert", async () => {
    mockHtmlToDomNode.mockImplementationOnce(() => {
      throw new Error("DOM parse error");
    });

    const tool = findTool("infer_selector");
    await expect(tool.handler({ html: "<<<>>>" })).rejects.toThrow("DOM parse error");
  });

  it("infer_selector: Exception in inferSelector wird als Error propagiert", async () => {
    mockHtmlToDomNode.mockReturnValueOnce({ tagName: "div", attributes: {}, children: [] });
    mockInferSelector.mockImplementationOnce(() => {
      throw new Error("Selector inference failed");
    });

    const tool = findTool("infer_selector");
    await expect(tool.handler({ html: "<div></div>" })).rejects.toThrow("Selector inference failed");
  });
});

// ===========================================================================
// Edge Cases
// ===========================================================================

describe("MCP Server — Edge Cases", () => {
  it("analyze_page: Endpoint ohne optionale Felder (kein selector, leere arrays)", async () => {
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [
        { type: "content", label: "Text Block", description: "", confidence: 0.6, affordances: [], evidence: [] },
      ],
      framework: null,
      timing: { totalMs: 2, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });

    const tool = findTool("analyze_page");
    const result = await tool.handler({ html: "<article>...</article>" });
    const text = result.content[0]!.text;

    // Kein Selector-Feld, keine Actions, keine Evidence in der Ausgabe
    expect(text).toContain("content");
    expect(text).toContain("Text Block");
    expect(text).not.toContain("Selector:");
    expect(text).not.toContain("Actions:");
    expect(text).not.toContain("Evidence:");
  });

  it("analyze_page: Framework ohne Version wird korrekt formatiert", async () => {
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [],
      framework: { framework: "react", confidence: 0.7, evidence: ["data-reactroot"] },
      timing: { totalMs: 3, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });

    const tool = findTool("analyze_page");
    const result = await tool.handler({ html: "<div data-reactroot></div>" });
    const text = result.content[0]!.text;

    expect(text).toContain("Framework: react");
    expect(text).toContain("70%");
    // Framework-Zeile soll kein ", vX.Y" enthalten wenn keine Version vorhanden
    expect(text).toMatch(/Framework: react \(70% confidence\)/);
    expect(text).not.toMatch(/Framework: react \(70% confidence, v/)
  });

  it("alle Tools geben content-Array mit type 'text' zurueck (MCP-Konformitaet)", async () => {
    // analyze_page
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [],
      framework: null,
      timing: { totalMs: 1, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });
    const analyzeResult = await findTool("analyze_page").handler({ html: "" });
    expect(analyzeResult.content).toBeInstanceOf(Array);
    expect(analyzeResult.content[0]!.type).toBe("text");
    expect(typeof analyzeResult.content[0]!.text).toBe("string");

    // detect_framework
    mockDetectFramework.mockReturnValueOnce(null);
    const fwResult = await findTool("detect_framework").handler({ html: "" });
    expect(fwResult.content).toBeInstanceOf(Array);
    expect(fwResult.content[0]!.type).toBe("text");

    // infer_selector
    mockHtmlToDomNode.mockReturnValueOnce({ tagName: "body", attributes: {}, children: [] });
    mockInferSelector.mockReturnValueOnce(null);
    const selResult = await findTool("infer_selector").handler({ html: "" });
    expect(selResult.content).toBeInstanceOf(Array);
    expect(selResult.content[0]!.type).toBe("text");
  });

  it("analyze_page: BALAGE-Version wird im Footer angezeigt", async () => {
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [],
      framework: null,
      timing: { totalMs: 1, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });

    const tool = findTool("analyze_page");
    const result = await tool.handler({ html: "" });

    expect(result.content[0]!.text).toContain("BALAGE v0.0.0-test");
  });

  it("analyze_page: Timing wird im Footer und Summary korrekt angezeigt", async () => {
    mockAnalyzeFromHTML.mockResolvedValueOnce({
      endpoints: [
        { type: "auth", label: "Login", description: "", confidence: 0.9, affordances: ["fill"], evidence: ["pw"] },
      ],
      framework: null,
      timing: { totalMs: 42, llmCalls: 0 },
      meta: { mode: "heuristic" as const, version: "0.0.0-test" },
    });

    const tool = findTool("analyze_page");
    const result = await tool.handler({ html: "<form></form>" });
    const text = result.content[0]!.text;

    expect(text).toContain("42ms");
  });
});
