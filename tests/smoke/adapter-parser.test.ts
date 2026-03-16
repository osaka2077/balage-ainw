/**
 * Smoke Tests — Round 1, Wave 2
 *
 * Integration Tests: Browser Adapter + DOM Parser
 * Testet den kompletten Flow:
 *   BrowserAdapter -> DOM extrahieren -> AX-Tree -> Pruner -> DomParser -> AriaParser -> UISegmenter
 *
 * Benutzt lokale HTML-Fixtures via file:// Protokoll.
 * Kein Internet noetig.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BrowserAdapter, extractStructuredDOM, extractAccessibilityTree } from "../../src/adapter/index.js";
import { pruneDom, parseDom, parseAria, segmentUI, traverseShadowRoots } from "../../src/parser/index.js";
import type { DomNode, AccessibilityNode, UISegment } from "../../shared_interfaces.js";

// ============================================================================
// Hilfsfunktionen
// ============================================================================

/** Absoluter Pfad zu einer Test-Fixture */
function fixturePath(filename: string): string {
  return resolve(__dirname, "..", "fixtures", "test-pages", filename);
}

/** file:// URL zu einer Test-Fixture */
function fixtureUrl(filename: string): string {
  return pathToFileURL(fixturePath(filename)).href;
}

/** Zaehlt alle Nodes in einem DomNode-Baum rekursiv */
function countNodes(node: DomNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

/** Prueft ob ein Node im Baum einen bestimmten tagName hat (rekursiv) */
function hasTagInTree(node: DomNode, tagName: string): boolean {
  if (node.tagName.toLowerCase() === tagName.toLowerCase()) return true;
  return node.children.some((child) => hasTagInTree(child, tagName));
}

/** Sammelt alle tagNames im Baum */
function collectTags(node: DomNode, tags: Set<string> = new Set()): Set<string> {
  tags.add(node.tagName.toLowerCase());
  for (const child of node.children) {
    collectTags(child, tags);
  }
  return tags;
}

/** UUID v4 Format Regex */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ============================================================================
// Test-Setup: Browser-Adapter (ein Browser fuer alle Tests)
// ============================================================================

let adapter: BrowserAdapter;

beforeAll(async () => {
  adapter = new BrowserAdapter({ headless: true, browserType: "chromium" });
  await adapter.launch();
}, 30_000);

afterAll(async () => {
  await adapter.shutdown();
}, 15_000);

// ============================================================================
// Smoke Tests
// ============================================================================

describe("Smoke Tests: Adapter + Parser Integration", () => {

  // --------------------------------------------------------------------------
  // Test 1: Einfaches HTML — Grundstruktur erkennen
  // --------------------------------------------------------------------------
  it("Test 1: simple.html — erkennt Header, Navigation, Content und Footer", async () => {
    const contextId = await adapter.newContext();
    try {
      const page = adapter.getPage(contextId);
      const cdp = adapter.getCdpSession(contextId);

      // Seite laden
      await page.goto(fixtureUrl("simple.html"), { waitUntil: "domcontentloaded" });

      // DOM + AX-Tree extrahieren
      const rawDom = await extractStructuredDOM(page);
      const axTree = await extractAccessibilityTree(page, cdp);

      expect(rawDom).toBeDefined();
      expect(rawDom.tagName).toBe("html");
      expect(axTree).toBeDefined();

      // Prunen -> Parsen -> ARIA -> Segmentieren
      const { prunedDom } = pruneDom(rawDom);
      const parsed = parseDom(prunedDom);
      const aria = parseAria(parsed.root, axTree);
      const segments = segmentUI(parsed.root, aria);

      // Mindestens 3 Segmente (header, navigation, content/footer)
      expect(segments.length).toBeGreaterThanOrEqual(3);

      // Navigation-Segment vorhanden
      const navSegments = segments.filter((s) => s.type === "navigation");
      expect(navSegments.length).toBeGreaterThanOrEqual(1);

      // Kein Segment hat type "unknown" mit Confidence > 0.5
      const highConfUnknown = segments.filter(
        (s) => s.type === "unknown" && s.confidence > 0.5
      );
      expect(highConfUnknown.length).toBe(0);

      // Alle Segmente haben gueltige UUIDs
      for (const segment of segments) {
        expect(segment.id).toMatch(UUID_REGEX);
      }

      // Segment-Typen loggen fuer Debugging
      const types = segments.map((s) => `${s.type}(${s.confidence})`);
      console.log(`[Test 1] Segmente: ${types.join(", ")}`);
    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 2: Formular-Seite — Form Detection
  // --------------------------------------------------------------------------
  it("Test 2: form-page.html — erkennt Login-Formular mit interaktiven Elementen", async () => {
    const contextId = await adapter.newContext();
    try {
      const page = adapter.getPage(contextId);
      const cdp = adapter.getCdpSession(contextId);

      await page.goto(fixtureUrl("form-page.html"), { waitUntil: "domcontentloaded" });

      const rawDom = await extractStructuredDOM(page);
      const axTree = await extractAccessibilityTree(page, cdp);

      const { prunedDom } = pruneDom(rawDom);
      const parsed = parseDom(prunedDom);
      const aria = parseAria(parsed.root, axTree);
      const segments = segmentUI(parsed.root, aria);

      // Mindestens 1 Form-Segment
      const formSegments = segments.filter((s) => s.type === "form");
      expect(formSegments.length).toBeGreaterThanOrEqual(1);

      // Das Form-Segment mit der hoechsten Confidence ist die echte <form>
      const mainForm = formSegments.reduce((best, current) =>
        current.confidence > best.confidence ? current : best
      );

      // Form-Segment hat mindestens 3 interaktive Elemente (2 Inputs + 1 Button)
      expect(mainForm.interactiveElementCount).toBeGreaterThanOrEqual(3);

      // Form-Segment Confidence > 0.7 (echte <form>-Tags bekommen 0.9 vom Segmenter)
      expect(mainForm.confidence).toBeGreaterThan(0.7);

      // ARIA-Labels sind aufgeloest
      // Das Login-Formular hat id="login-form" mit aria-label
      expect(aria.labelMap.size).toBeGreaterThan(0);

      // Alle Segmente haben gueltige UUIDs
      for (const segment of segments) {
        expect(segment.id).toMatch(UUID_REGEX);
      }

      const types = segments.map((s) => `${s.type}(${s.confidence})[${s.interactiveElementCount}]`);
      console.log(`[Test 2] Segmente: ${types.join(", ")}`);
    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 3: SPA-Struktur — Pruning und Data-Attribute
  // --------------------------------------------------------------------------
  it("Test 3: spa-shell.html — Pruning entfernt Scripts, behaelt data-* Attribute", async () => {
    const contextId = await adapter.newContext();
    try {
      const page = adapter.getPage(contextId);
      const cdp = adapter.getCdpSession(contextId);

      await page.goto(fixtureUrl("spa-shell.html"), { waitUntil: "domcontentloaded" });

      const rawDom = await extractStructuredDOM(page);
      const axTree = await extractAccessibilityTree(page, cdp);

      // VOR Pruning: Script-Tags pruefen (DOM-Extractor markiert sie als leer, aber sie sind da)
      const rawTags = collectTags(rawDom);

      // Prunen
      const pruneResult = pruneDom(rawDom);
      const { prunedDom } = pruneResult;

      // NACH Pruning: Script-Tags entfernt
      const prunedTags = collectTags(prunedDom);
      expect(prunedTags.has("script")).toBe(false);

      // data-* Attribute sind erhalten
      const appNode = findNodeByAttribute(prunedDom, "id", "app");
      expect(appNode).toBeDefined();
      if (appNode) {
        expect(appNode.attributes["data-framework"]).toBe("react");
        expect(appNode.attributes["data-version"]).toBe("18.3");
      }

      // Parsen + Segmentieren
      const parsed = parseDom(prunedDom);
      const aria = parseAria(parsed.root, axTree);
      const segments = segmentUI(parsed.root, aria);

      // Mindestens 1 Segment gefunden
      expect(segments.length).toBeGreaterThanOrEqual(1);

      // Buttons als interaktive Elemente erkannt
      const totalInteractive = segments.reduce(
        (sum, s) => sum + s.interactiveElementCount, 0
      );
      expect(totalInteractive).toBeGreaterThanOrEqual(1);

      // Pruning hat Nodes entfernt
      expect(pruneResult.removedCount).toBeGreaterThan(0);

      const types = segments.map((s) => `${s.type}(${s.confidence})`);
      console.log(`[Test 3] Segmente: ${types.join(", ")}`);
      console.log(`[Test 3] Pruning entfernt: ${pruneResult.removedCount} Nodes, Gruende: ${JSON.stringify(pruneResult.removedByReason)}`);
    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 4: Komplexes Layout — Multi-Segment-Erkennung
  // --------------------------------------------------------------------------
  it("Test 4: complex-layout.html — erkennt mindestens 4 verschiedene Segment-Typen", async () => {
    const contextId = await adapter.newContext();
    try {
      const page = adapter.getPage(contextId);
      const cdp = adapter.getCdpSession(contextId);

      await page.goto(fixtureUrl("complex-layout.html"), { waitUntil: "domcontentloaded" });

      const rawDom = await extractStructuredDOM(page);
      const axTree = await extractAccessibilityTree(page, cdp);

      const { prunedDom } = pruneDom(rawDom);
      const parsed = parseDom(prunedDom);
      const aria = parseAria(parsed.root, axTree);

      // Segmentierung mit Zeitmessung
      const startTime = performance.now();
      const segments = segmentUI(parsed.root, aria);
      const segmentDuration = performance.now() - startTime;

      // Verschiedene Segment-Typen zaehlen
      const uniqueTypes = new Set(segments.map((s) => s.type));

      // Mindestens 4 verschiedene Segment-Typen
      expect(uniqueTypes.size).toBeGreaterThanOrEqual(4);

      // Header-Segment vorhanden
      expect(segments.some((s) => s.type === "header" || s.type === "banner")).toBe(true);

      // Navigation-Segment vorhanden
      expect(segments.some((s) => s.type === "navigation")).toBe(true);

      // Content-Segment vorhanden (content oder via main-tag)
      expect(segments.some((s) => s.type === "content")).toBe(true);

      // Sidebar-Segment vorhanden
      expect(segments.some((s) => s.type === "sidebar")).toBe(true);

      // Segmentierung unter 200ms
      expect(segmentDuration).toBeLessThan(200);

      // Alle Segmente haben gueltige UUIDs
      for (const segment of segments) {
        expect(segment.id).toMatch(UUID_REGEX);
      }

      const types = segments.map((s) => `${s.type}(${s.confidence})`);
      console.log(`[Test 4] Segmente (${segments.length}): ${types.join(", ")}`);
      console.log(`[Test 4] Verschiedene Typen: ${[...uniqueTypes].join(", ")}`);
      console.log(`[Test 4] Segmentierung: ${segmentDuration.toFixed(1)}ms`);
    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 5: Shadow DOM — Traversal funktioniert
  // --------------------------------------------------------------------------
  it("Test 5: shadow-dom.html — Shadow DOM Traversal integriert Shadow Content", async () => {
    const contextId = await adapter.newContext();
    try {
      const page = adapter.getPage(contextId);
      const cdp = adapter.getCdpSession(contextId);

      await page.goto(fixtureUrl("shadow-dom.html"), { waitUntil: "domcontentloaded" });

      const rawDom = await extractStructuredDOM(page);
      const axTree = await extractAccessibilityTree(page, cdp);

      expect(rawDom).toBeDefined();
      expect(axTree).toBeDefined();

      // Nodecount VOR Shadow-Traversal
      const nodeCountBefore = countNodes(rawDom);

      // Shadow DOM traversieren (kein Crash)
      const shadowTraversed = traverseShadowRoots(rawDom);
      expect(shadowTraversed).toBeDefined();

      // Nodecount NACH Shadow-Traversal — sollte gleich oder groesser sein
      // (bei open Shadow Roots wird Content integriert, bei normalem DOM bleibt es gleich)
      const nodeCountAfter = countNodes(shadowTraversed);
      expect(nodeCountAfter).toBeGreaterThanOrEqual(nodeCountBefore);

      // Der volle Flow soll ohne Crash durchlaufen
      const { prunedDom } = pruneDom(shadowTraversed);
      const parsed = parseDom(prunedDom);
      const aria = parseAria(parsed.root, axTree);
      const segments = segmentUI(parsed.root, aria);

      // Kein Crash — Ergebnis ist gueltig
      expect(segments).toBeDefined();
      expect(Array.isArray(segments)).toBe(true);

      // Custom Elements sind im DOM enthalten
      // (Playwright extrahiert den DOM inklusive Custom Elements als regulaere Tags)
      const allTags = collectTags(rawDom);
      // my-button und my-card sollten als Tags vorhanden sein
      expect(allTags.has("my-button") || allTags.has("my-card")).toBe(true);

      // Alle Segmente haben gueltige UUIDs
      for (const segment of segments) {
        expect(segment.id).toMatch(UUID_REGEX);
      }

      const types = segments.map((s) => `${s.type}(${s.confidence})`);
      console.log(`[Test 5] Segmente: ${types.join(", ")}`);
      console.log(`[Test 5] Nodes vorher: ${nodeCountBefore}, nachher: ${nodeCountAfter}`);
      console.log(`[Test 5] Tags: ${[...allTags].join(", ")}`);
    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 30_000);
});

// ============================================================================
// Hilfsfunktion: Node nach Attribut suchen
// ============================================================================

function findNodeByAttribute(
  node: DomNode,
  attrName: string,
  attrValue: string
): DomNode | undefined {
  if (node.attributes[attrName] === attrValue) return node;
  for (const child of node.children) {
    const found = findNodeByAttribute(child, attrName, attrValue);
    if (found) return found;
  }
  return undefined;
}
