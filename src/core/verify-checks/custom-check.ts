/**
 * verify() — Custom Selector-Based Checks
 *
 * Prueft benutzerdefinierte Selector-Bedingungen gegen den DOM.
 */

import type { DomNode } from "../types.js";
import type { CustomCheckDefinition, CheckResult } from "../verify-types.js";
import { htmlToDomNode } from "../html-to-dom.js";

// ============================================================================
// Simple Selector Matching
// ============================================================================

function matchesSelector(node: DomNode, selector: string): boolean {
  // ID: #my-id
  if (selector.startsWith("#")) {
    return node.attributes["id"] === selector.slice(1);
  }

  // Class: .my-class
  if (selector.startsWith(".")) {
    const classes = (node.attributes["class"] ?? "").split(/\s+/);
    return classes.includes(selector.slice(1));
  }

  // Attribute mit Wert: [attr="value"]
  const attrValueMatch = /^\[([^=]+)="([^"]*)"\]$/.exec(selector);
  if (attrValueMatch?.[1] !== undefined && attrValueMatch[2] !== undefined) {
    return node.attributes[attrValueMatch[1]] === attrValueMatch[2];
  }

  // Attribute Praesenz: [attr]
  const attrPresenceMatch = /^\[([^\]]+)\]$/.exec(selector);
  if (attrPresenceMatch?.[1] !== undefined) {
    return attrPresenceMatch[1] in node.attributes;
  }

  // Tag: div, form, etc.
  return node.tagName.toLowerCase() === selector.toLowerCase();
}

function findBySelector(node: DomNode, selector: string): DomNode[] {
  const results: DomNode[] = [];

  if (node.tagName !== "#text" && matchesSelector(node, selector)) {
    results.push(node);
  }

  for (const child of node.children) {
    results.push(...findBySelector(child, selector));
  }

  return results;
}

function getDeepText(node: DomNode): string {
  let text = node.textContent ?? "";
  for (const child of node.children) {
    const childText = getDeepText(child);
    if (childText) text += " " + childText;
  }
  return text.trim();
}

// ============================================================================
// Check Runner
// ============================================================================

export function runCustomCheck(
  definition: CustomCheckDefinition,
  afterHtml: string,
  beforeHtml?: string,
): CheckResult {
  const afterDom = htmlToDomNode(afterHtml);
  const matches = findBySelector(afterDom, definition.selector);

  switch (definition.expectation) {
    case "present":
      return {
        name: `custom:${definition.name}`,
        passed: matches.length > 0,
        confidence: matches.length > 0 ? 0.9 : 0.85,
        evidence:
          matches.length > 0
            ? `"${definition.selector}" found (${matches.length})`
            : `"${definition.selector}" not found`,
        source: "custom",
      };

    case "absent":
      return {
        name: `custom:${definition.name}`,
        passed: matches.length === 0,
        confidence: matches.length === 0 ? 0.9 : 0.85,
        evidence:
          matches.length === 0
            ? `"${definition.selector}" correctly absent`
            : `"${definition.selector}" still present (${matches.length})`,
        source: "custom",
      };

    case "visible": {
      const visible = matches.filter((m) => m.isVisible);
      return {
        name: `custom:${definition.name}`,
        passed: visible.length > 0,
        confidence: visible.length > 0 ? 0.85 : 0.8,
        evidence:
          visible.length > 0
            ? `"${definition.selector}" is visible`
            : matches.length > 0
              ? `"${definition.selector}" found but not visible`
              : `"${definition.selector}" not found`,
        source: "custom",
      };
    }

    case "hidden": {
      const allHidden =
        matches.length > 0 && matches.every((m) => !m.isVisible);
      return {
        name: `custom:${definition.name}`,
        passed: matches.length === 0 || allHidden,
        confidence: 0.85,
        evidence:
          matches.length === 0
            ? `"${definition.selector}" not in DOM (hidden)`
            : allHidden
              ? `"${definition.selector}" is hidden`
              : `"${definition.selector}" still visible`,
        source: "custom",
      };
    }

    case "text_contains": {
      if (!definition.value) {
        return {
          name: `custom:${definition.name}`,
          passed: false,
          confidence: 0,
          evidence: "text_contains requires a value",
          source: "custom",
        };
      }
      const needle = definition.value.toLowerCase();
      const found = matches.some((m) =>
        getDeepText(m).toLowerCase().includes(needle),
      );
      return {
        name: `custom:${definition.name}`,
        passed: found,
        confidence: found ? 0.9 : 0.8,
        evidence: found
          ? `"${definition.value}" found in "${definition.selector}"`
          : `"${definition.value}" not found in "${definition.selector}"`,
        source: "custom",
      };
    }

    case "text_changed": {
      if (!beforeHtml) {
        return {
          name: `custom:${definition.name}`,
          passed: false,
          confidence: 0,
          evidence: "text_changed requires before HTML",
          source: "custom",
        };
      }
      const beforeDom = htmlToDomNode(beforeHtml);
      const beforeMatches = findBySelector(beforeDom, definition.selector);
      const beforeTexts = beforeMatches.map((m) => getDeepText(m)).join("|");
      const afterTexts = matches.map((m) => getDeepText(m)).join("|");
      const changed = beforeTexts !== afterTexts;
      return {
        name: `custom:${definition.name}`,
        passed: changed,
        confidence: changed ? 0.85 : 0.8,
        evidence: changed
          ? `Text changed in "${definition.selector}"`
          : `Text unchanged in "${definition.selector}"`,
        source: "custom",
      };
    }
  }
}

export function runCustomChecks(
  definitions: CustomCheckDefinition[],
  afterHtml: string,
  beforeHtml?: string,
): CheckResult[] {
  return definitions.map((d) => runCustomCheck(d, afterHtml, beforeHtml));
}
