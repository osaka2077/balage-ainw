/**
 * verify() — DOM Diff Check
 *
 * Vergleicht before/after DOMs.
 * Noise-Filter: script, style, noscript, svg, data-reactid ignoriert.
 * Relevanz: class-Changes mit error|success, aria-*, display-Changes.
 *
 * Zwei APIs:
 *   diffDom(DomNode, DomNode) — low-level, arbeitet direkt auf DomNode-Baeumen
 *   computeDomDiff(html, html) — high-level, parst HTML via htmlToDomNode()
 */

import type { DomNode } from "../types.js";
import type {
  DomDiffResult,
  ElementChange,
  TextChange,
  AttributeChange,
} from "../verify-types.js";
import { htmlToDomNode } from "../html-to-dom.js";

// ============================================================================
// Noise Filter
// ============================================================================

const NOISE_ATTRIBUTE_PREFIXES = [
  "data-reactid",
  "data-react-",
  "data-v-",
  "data-testid",
  "data-test-",
  "data-cy",
];

function isNoiseAttribute(name: string): boolean {
  return NOISE_ATTRIBUTE_PREFIXES.some(prefix => name.startsWith(prefix));
}

// Klassen-Patterns die auf semantische Aenderungen hindeuten
const SIGNIFICANT_CLASS_RE =
  /\b(error|success|warning|info|active|inactive|disabled|enabled|hidden|visible|show|hide|open|close[d]?|collapsed|expanded|selected|checked|focused|loading|loaded|pending|valid|invalid|logged-?in|authenticated)\b/i;

// Attribute mit semantischer Bedeutung
const SIGNIFICANT_ATTRIBUTES = new Set([
  "role",
  "aria-hidden",
  "aria-expanded",
  "aria-modal",
  "aria-live",
  "aria-invalid",
  "aria-disabled",
  "aria-selected",
  "aria-checked",
  "aria-pressed",
  "disabled",
  "hidden",
  "required",
  "checked",
  "type",
  "href",
  "action",
  "method",
]);

// Tags die beim Diff komplett ignoriert werden (Noise)
const NOISE_TAGS = new Set(["script", "style", "noscript", "svg"]);

// ============================================================================
// Tree Flattening
// ============================================================================

interface FlatElement {
  path: string;
  tagName: string;
  id: string;
  classes: string[];
  attributes: Record<string, string>;
  textContent: string;
  isVisible: boolean;
}

function flattenDom(
  node: DomNode,
  parentPath: string,
  index: number,
): FlatElement[] {
  const result: FlatElement[] = [];

  // #text und Noise-Tags ueberspringen
  if (node.tagName === "#text" || NOISE_TAGS.has(node.tagName)) return result;

  const currentPath = `${parentPath}>${node.tagName}[${index}]`;

  const id = node.attributes["id"] ?? "";
  const classes = (node.attributes["class"] ?? "")
    .split(/\s+/)
    .filter(Boolean);

  // Noise-Attribute filtern
  const cleanAttributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(node.attributes)) {
    if (!isNoiseAttribute(key)) {
      cleanAttributes[key] = value;
    }
  }

  result.push({
    path: currentPath,
    tagName: node.tagName,
    id,
    classes,
    attributes: cleanAttributes,
    textContent: (node.textContent ?? "").trim(),
    isVisible: node.isVisible,
  });

  const childCounts: Record<string, number> = {};
  for (const child of node.children) {
    if (child.tagName === "#text") continue;
    const count = childCounts[child.tagName] ?? 0;
    childCounts[child.tagName] = count + 1;
    result.push(...flattenDom(child, currentPath, count));
  }

  return result;
}

// ============================================================================
// Element Comparison
// ============================================================================

function compareElements(
  before: FlatElement,
  after: FlatElement,
  textChanges: TextChange[],
  attributeChanges: AttributeChange[],
): void {
  // Text-Aenderungen
  if (
    before.textContent !== after.textContent &&
    (before.textContent || after.textContent)
  ) {
    textChanges.push({
      tagName: after.tagName,
      before: before.textContent,
      after: after.textContent,
    });
  }

  // Attribut-Aenderungen
  const allKeys = new Set([
    ...Object.keys(before.attributes),
    ...Object.keys(after.attributes),
  ]);

  for (const key of allKeys) {
    if (isNoiseAttribute(key)) continue;
    const beforeVal = before.attributes[key] ?? null;
    const afterVal = after.attributes[key] ?? null;
    if (beforeVal !== afterVal) {
      attributeChanges.push({
        tagName: after.tagName,
        id: after.id || undefined,
        attribute: key,
        before: beforeVal,
        after: afterVal,
      });
    }
  }
}

// ============================================================================
// Significance Scoring
// ============================================================================

function countSignificant(
  textChanges: TextChange[],
  attributeChanges: AttributeChange[],
  addedElements: ElementChange[],
  removedElements: ElementChange[],
): number {
  let count = 0;

  // Jede Text-Aenderung ist signifikant
  count += textChanges.length;

  // Semantische Attribut-Aenderungen
  for (const change of attributeChanges) {
    if (SIGNIFICANT_ATTRIBUTES.has(change.attribute)) {
      count++;
    }
    if (change.attribute === "class") {
      const before = change.before ?? "";
      const after = change.after ?? "";
      if (
        SIGNIFICANT_CLASS_RE.test(after) ||
        SIGNIFICANT_CLASS_RE.test(before)
      ) {
        count++;
      }
    }
  }

  // Strukturell wichtige hinzugefuegte Elemente
  count += addedElements.filter(
    (e) =>
      e.tagName === "dialog" ||
      e.tagName === "form" ||
      e.classes?.some((c) => SIGNIFICANT_CLASS_RE.test(c)),
  ).length;

  // Strukturell wichtige entfernte Elemente
  count += removedElements.filter(
    (e) => e.tagName === "form" || e.tagName === "dialog",
  ).length;

  return count;
}

// ============================================================================
// Public API
// ============================================================================

// ============================================================================
// Core Diff Engine (arbeitet auf DomNode-Baeumen)
// ============================================================================

function diffNodes(
  beforeDom: DomNode,
  afterDom: DomNode,
): {
  added: ElementChange[];
  removed: ElementChange[];
  text: TextChange[];
  attrs: AttributeChange[];
} {
  const beforeElements = flattenDom(beforeDom, "root", 0);
  const afterElements = flattenDom(afterDom, "root", 0);

  // Index fuer Matching
  const beforeById = new Map<string, FlatElement>();
  const afterById = new Map<string, FlatElement>();
  for (const el of beforeElements) {
    if (el.id) beforeById.set(el.id, el);
  }
  for (const el of afterElements) {
    if (el.id) afterById.set(el.id, el);
  }

  const beforeByPath = new Map<string, FlatElement>();
  const afterByPath = new Map<string, FlatElement>();
  for (const el of beforeElements) {
    beforeByPath.set(el.path, el);
  }
  for (const el of afterElements) {
    afterByPath.set(el.path, el);
  }

  const added: ElementChange[] = [];
  const removed: ElementChange[] = [];
  const text: TextChange[] = [];
  const attrs: AttributeChange[] = [];

  const matchedBefore = new Set<string>();
  const matchedAfter = new Set<string>();

  // Phase 1: Match by ID (staerkstes Signal)
  for (const [id, afterEl] of afterById) {
    const beforeEl = beforeById.get(id);
    if (beforeEl) {
      matchedBefore.add(beforeEl.path);
      matchedAfter.add(afterEl.path);
      compareElements(beforeEl, afterEl, text, attrs);
    }
  }

  // Phase 2: Match by Path (strukturell)
  for (const [path, afterEl] of afterByPath) {
    if (matchedAfter.has(path)) continue;
    const beforeEl = beforeByPath.get(path);
    if (beforeEl && !matchedBefore.has(path)) {
      matchedBefore.add(path);
      matchedAfter.add(path);
      compareElements(beforeEl, afterEl, text, attrs);
    }
  }

  // Phase 3: Neue Elemente
  for (const afterEl of afterElements) {
    if (matchedAfter.has(afterEl.path)) continue;
    added.push({
      tagName: afterEl.tagName,
      id: afterEl.id || undefined,
      classes: afterEl.classes.length > 0 ? afterEl.classes : undefined,
      textContent: afterEl.textContent || undefined,
    });
  }

  // Phase 4: Entfernte Elemente
  for (const beforeEl of beforeElements) {
    if (matchedBefore.has(beforeEl.path)) continue;
    removed.push({
      tagName: beforeEl.tagName,
      id: beforeEl.id || undefined,
      classes: beforeEl.classes.length > 0 ? beforeEl.classes : undefined,
      textContent: beforeEl.textContent || undefined,
    });
  }

  return { added, removed, text, attrs };
}

// ============================================================================
// Public API: diffDom (DomNode → DomNode)
// ============================================================================

export interface DiffDomResult {
  addedElements: number;
  removedElements: number;
  changedAttributes: Array<{ attribute: string; newValue: string }>;
  changedTexts: Array<{ newText: string }>;
  hasChanges: boolean;
}

/** Low-level: vergleicht zwei DomNode-Baeume direkt. */
export function diffDom(before: DomNode, after: DomNode): DiffDomResult {
  const { added, removed, text, attrs } = diffNodes(before, after);

  const changedAttributes = attrs.map((a) => ({
    attribute: a.attribute,
    newValue: a.after ?? "",
  }));

  const changedTexts = text.map((t) => ({
    newText: t.after,
  }));

  const hasChanges =
    added.length > 0 ||
    removed.length > 0 ||
    changedAttributes.length > 0 ||
    changedTexts.length > 0;

  return {
    addedElements: added.length,
    removedElements: removed.length,
    changedAttributes,
    changedTexts,
    hasChanges,
  };
}

// ============================================================================
// Public API: computeDomDiff (HTML → HTML)
// ============================================================================

/** High-level: parst HTML-Strings und berechnet strukturierten Diff. */
export function computeDomDiff(
  beforeHtml: string,
  afterHtml: string,
): DomDiffResult {
  const beforeDom = htmlToDomNode(beforeHtml);
  const afterDom = htmlToDomNode(afterHtml);
  return computeDomDiffFromNodes(beforeDom, afterDom);
}

/** Berechnet DomDiffResult direkt aus DomNode-Baeumen. */
export function computeDomDiffFromNodes(
  beforeDom: DomNode,
  afterDom: DomNode,
): DomDiffResult {
  const { added, removed, text, attrs } = diffNodes(beforeDom, afterDom);

  const significantChanges = countSignificant(text, attrs, added, removed);

  return {
    addedElements: added,
    removedElements: removed,
    textChanges: text,
    attributeChanges: attrs,
    significantChanges,
  };
}
