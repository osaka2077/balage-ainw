/**
 * inferSelector — CSS-Selektor-Inferenz aus DomNode-Baeumen
 *
 * Generiert praezise, stabile CSS-Selektoren fuer den Heuristic-Mode.
 * Priorisiert Selektoren nach Stabilitaet und Spezifitaet:
 *
 *   1. form[action="..."]       — Stabiler API-Hinweis
 *   2. #element-id              — Eindeutig, wenn nicht dynamisch
 *   3. [role="..."]             — ARIA-semantisch, framework-agnostisch
 *   4. form:has(input[type=...])— Strukturell, content-basiert
 *   5. nav, header, footer, ... — Semantische HTML5-Tags
 *   6. tag.class                — Fallback, am wenigsten stabil
 *
 * Dynamische IDs (React, Angular, Ember, etc.) werden gefiltert.
 */

import type { DomNode } from "./types.js";

/**
 * Generiert einen CSS-Selektor aus einem DomNode-Teilbaum.
 *
 * @param segmentRoot - Wurzelknoten des UI-Segments (oder synthetischer Wrapper)
 * @returns CSS-Selektor oder undefined wenn kein sinnvoller Selektor ableitbar
 */
export function inferSelector(segmentRoot: DomNode): string | undefined {
  // Synthetischer Wrapper? Erstes relevantes Kind suchen.
  const target = findTargetNode(segmentRoot);
  if (!target) return undefined;

  // Prioritaet 1: form mit action-Attribut
  const formAction = tryFormActionSelector(target);
  if (formAction) return formAction;

  // Prioritaet 2: Element mit stabiler ID
  const idSelector = tryIdSelector(target);
  if (idSelector) return idSelector;

  // Prioritaet 3: Element mit ARIA role
  const roleSelector = tryRoleSelector(target);
  if (roleSelector) return roleSelector;

  // Prioritaet 4: form mit spezifischem Input-Typ (password, search, file)
  const formHasSelector = tryFormHasSelector(target);
  if (formHasSelector) return formHasSelector;

  // Prioritaet 5: Semantische HTML5-Tags (nav, header, footer, main, aside, section)
  const semanticSelector = trySemanticTagSelector(target);
  if (semanticSelector) return semanticSelector;

  // Prioritaet 6: Fallback — tag + class
  const fallbackSelector = tryTagClassSelector(target);
  if (fallbackSelector) return fallbackSelector;

  return undefined;
}

// ---------------------------------------------------------------------------
// Target-Node finden
// ---------------------------------------------------------------------------

/** Semantische Tags die als Segment-Root relevant sind */
const SEMANTIC_ROOT_TAGS = new Set([
  "form", "nav", "header", "footer", "main", "aside",
  "section", "article", "dialog", "search",
]);

/**
 * Findet den relevantesten Node im Teilbaum.
 * Bei synthetischen Wrappern (div ohne Attribute) wird das erste
 * semantisch relevante Kind gesucht.
 */
function findTargetNode(root: DomNode): DomNode | undefined {
  // Root ist selbst semantisch relevant
  if (SEMANTIC_ROOT_TAGS.has(root.tagName)) return root;

  // Root hat eine ID oder role — direkt verwenden
  if (root.attributes["id"] || root.attributes["role"]) return root;

  // Root hat Klassen (z.B. div.search-container) — als Fallback merken
  const rootHasClasses = hasStableClasses(root);

  // Synthetischer Wrapper: rekursiv erstes relevantes Kind suchen (max 3 Ebenen)
  const childTarget = findFirstRelevantChild(root, 0);

  // Wenn ein semantisch relevantes Kind gefunden: das verwenden
  if (childTarget) return childTarget;

  // Wenn Root Klassen hat und kein besseres Kind existiert: Root verwenden
  if (rootHasClasses) return root;

  return undefined;
}

/** Preuft ob ein Node stabile CSS-Klassen hat */
function hasStableClasses(node: DomNode): boolean {
  const className = node.attributes["class"];
  if (!className) return false;
  return className.split(/\s+/).some(cls => cls.length > 0 && isStableClass(cls));
}

function findFirstRelevantChild(node: DomNode, depth: number): DomNode | undefined {
  if (depth > 3) return undefined;

  // Runde 1: Stark semantische Kinder (form, nav, id, role)
  for (const child of node.children) {
    if (SEMANTIC_ROOT_TAGS.has(child.tagName)) return child;
    if (child.attributes["id"] && !isDynamicId(child.attributes["id"])) return child;
    if (child.attributes["role"] && SELECTABLE_ROLES.has(child.attributes["role"])) return child;
  }

  // Runde 2: Kinder mit stabilen Klassen (auf den ersten 2 Ebenen)
  if (depth <= 1) {
    for (const child of node.children) {
      if (hasStableClasses(child)) return child;
    }
  }

  // Runde 3: rekursiv in Kinder schauen
  for (const child of node.children) {
    const found = findFirstRelevantChild(child, depth + 1);
    if (found) return found;
  }

  // Absoluter Fallback: erstes sichtbares Kind mit Tag != #text / div / span
  for (const child of node.children) {
    if (child.isVisible && !GENERIC_TAGS.has(child.tagName)) {
      return child;
    }
  }

  return node.children[0];
}

// ---------------------------------------------------------------------------
// Selektor-Strategien
// ---------------------------------------------------------------------------

/**
 * Prioritaet 1: form[action="/login"]
 * Stabil weil Backend-Routen sich selten aendern.
 */
function tryFormActionSelector(node: DomNode): string | undefined {
  if (node.tagName !== "form") return undefined;

  const action = node.attributes["action"];
  if (!action) return undefined;

  // Nur relative oder kurze Pfade — keine vollen URLs mit Query-Parametern
  if (action.length > 128) return undefined;
  if (action.includes("?") || action.includes("#")) {
    // Nur den Pfad vor Query/Fragment verwenden
    const cleanAction = action.split(/[?#]/)[0];
    if (!cleanAction || cleanAction === "/") return undefined;
    return `form[action="${escapeAttrValue(cleanAction)}"]`;
  }

  if (action === "/" || action === "") return undefined;

  return `form[action="${escapeAttrValue(action)}"]`;
}

/**
 * Prioritaet 2: #element-id
 * Gefiltert: dynamische IDs von React, Angular, Ember, etc.
 */
function tryIdSelector(node: DomNode): string | undefined {
  const id = node.attributes["id"];
  if (!id) return undefined;
  if (isDynamicId(id)) return undefined;

  return `#${escapeCssIdentifier(id)}`;
}

/** Dynamische ID-Patterns von gaengigen Frameworks */
const DYNAMIC_ID_PATTERNS = [
  /^:r[0-9a-z]+:$/,            // React 18+ useId
  /^react-/i,                   // React Portals
  /^ng-/,                       // Angular
  /^ember\d+$/,                 // Ember
  /^__next/,                    // Next.js interne IDs
  /^radix-/,                    // Radix UI
  /^headlessui-/,               // Headless UI
  /^downshift-/,                // Downshift
  /^[a-f0-9]{8,}$/,            // Hex-Hashes (z.B. CSS Modules, Webpack)
  /^[a-z]{1,3}-[a-f0-9]{4,}$/, // Kurzprefixe mit Hash (MUI, Styled Components)
  /^\d+$/,                      // Rein numerische IDs
  /^ext-gen\d+$/,               // ExtJS
  /^yui_/,                      // YUI
];

function isDynamicId(id: string): boolean {
  return DYNAMIC_ID_PATTERNS.some(pattern => pattern.test(id));
}

/**
 * Prioritaet 3: [role="search"], [role="navigation"], etc.
 * ARIA-Rollen sind framework-agnostisch und semantisch stabil.
 */
function tryRoleSelector(node: DomNode): string | undefined {
  const role = node.attributes["role"];
  if (!role) return undefined;

  // Nur Landmark- und Widget-Rollen die als Selektor sinnvoll sind
  if (!SELECTABLE_ROLES.has(role)) return undefined;

  // Tag + role fuer hoehere Spezifitaet, falls nicht generisch
  if (!GENERIC_TAGS.has(node.tagName)) {
    return `${node.tagName}[role="${escapeAttrValue(role)}"]`;
  }

  return `[role="${escapeAttrValue(role)}"]`;
}

const SELECTABLE_ROLES = new Set([
  "search", "navigation", "banner", "main", "complementary",
  "contentinfo", "form", "region", "dialog", "alertdialog",
  "tablist", "toolbar", "menu", "menubar", "tree",
]);

/**
 * Prioritaet 4: form:has(input[type="password"])
 * Strukturelle Selektoren basierend auf Inhalt.
 */
function tryFormHasSelector(node: DomNode): string | undefined {
  if (node.tagName !== "form") return undefined;

  // Kinder nach spezifischen Input-Typen durchsuchen
  const inputType = findDistinctiveInputType(node);
  if (inputType) {
    return `form:has(input[type="${escapeAttrValue(inputType)}"])`;
  }

  return undefined;
}

/** Sucht rekursiv nach einem markanten Input-Typ */
function findDistinctiveInputType(node: DomNode): string | undefined {
  // Prioritaet: password > search > file (absteigend nach Eindeutigkeit)
  const DISTINCTIVE_TYPES = ["password", "search", "file"];

  for (const type of DISTINCTIVE_TYPES) {
    if (hasInputOfType(node, type)) return type;
  }
  return undefined;
}

function hasInputOfType(node: DomNode, type: string): boolean {
  if (node.tagName === "input" && (node.attributes["type"] ?? "").toLowerCase() === type) {
    return true;
  }
  return node.children.some(child => hasInputOfType(child, type));
}

/**
 * Prioritaet 5: nav, header, footer, main, aside
 * Semantische HTML5-Tags sind per Definition eindeutig pro Seite (meistens).
 */
function trySemanticTagSelector(node: DomNode): string | undefined {
  if (!SEMANTIC_STANDALONE_TAGS.has(node.tagName)) return undefined;

  // aria-label fuer Disambiguierung wenn vorhanden
  const ariaLabel = node.attributes["aria-label"];
  if (ariaLabel && ariaLabel.length <= 64) {
    return `${node.tagName}[aria-label="${escapeAttrValue(ariaLabel)}"]`;
  }

  return node.tagName;
}

const SEMANTIC_STANDALONE_TAGS = new Set([
  "nav", "header", "footer", "main", "aside", "search", "dialog",
]);

/**
 * Prioritaet 6: tag.class (Fallback)
 * Am wenigsten stabil — Klassen aendern sich haeufig.
 * Filtert dynamische Klassen (CSS Modules, Tailwind-Hashes).
 */
function tryTagClassSelector(node: DomNode): string | undefined {
  const className = node.attributes["class"];
  if (!className) return undefined;

  const stableClasses = className
    .split(/\s+/)
    .filter(cls => cls.length > 0 && isStableClass(cls))
    .slice(0, 2); // Maximal 2 Klassen fuer Lesbarkeit

  if (stableClasses.length === 0) return undefined;

  const tag = GENERIC_TAGS.has(node.tagName) ? "" : node.tagName;
  const classStr = stableClasses.map(c => `.${escapeCssIdentifier(c)}`).join("");

  return `${tag}${classStr}`;
}

/** Erkennt dynamisch generierte CSS-Klassennamen */
function isStableClass(cls: string): boolean {
  // Zu kurz (z.B. "a", "x1") — oft generiert
  if (cls.length < 3) return false;

  // Hash-basierte Klassen (CSS Modules, Styled Components)
  if (/^[a-z]{1,4}-[a-f0-9]{4,}$/i.test(cls)) return false;
  if (/^[a-f0-9]{6,}$/i.test(cls)) return false;

  // Tailwind-artige Utility-Klassen (z.B. "mt-4", "px-2") sind ok,
  // aber unspezifisch — nur akzeptieren wenn sie semantisch sind
  if (/^(bg|text|font|border|rounded|shadow|ring|outline|cursor)-/i.test(cls)) return false;

  // Framework-spezifische Prefixe
  if (/^(css-|sc-|emotion-|jss|_[A-Z])/.test(cls)) return false;

  // Sieht nach einem verstaendlichen Klassennamen aus
  return true;
}

// ---------------------------------------------------------------------------
// Escape-Helfer
// ---------------------------------------------------------------------------

const GENERIC_TAGS = new Set(["div", "span", "#text"]);

/** Escaped einen Wert fuer CSS-Attribut-Selektoren */
function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Escaped einen Wert fuer CSS-Identifikatoren (z.B. IDs, Klassen) */
function escapeCssIdentifier(value: string): string {
  // CSS Identifiers: escape alles was nicht [a-zA-Z0-9_-] ist
  return value.replace(/([^\w-])/g, "\\$1");
}
