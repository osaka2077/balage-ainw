/**
 * DOM Extractor — Extrahiert strukturierten DOM und Accessibility Tree.
 * Sanitization: Script-Tags und Event-Handler werden entfernt.
 * Hidden Elements werden markiert aber NICHT entfernt.
 * Max-Tiefe: 50 Level, danach Marker-Node.
 */

/// <reference lib="dom" />

import type { Page, CDPSession } from "playwright";
import pino from "pino";

import type { DomNode, AccessibilityNode } from "./types.js";
import { DomNodeSchema, AccessibilityNodeSchema } from "./types.js";
import { DomExtractionError } from "./errors.js";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}).child({ module: "dom-extractor" });

/** Max DOM-Tiefe: 50 Level, danach Marker-Node */
const MAX_DOM_DEPTH = 50;

/** Interaktive Elemente Tags */
const INTERACTIVE_TAGS = new Set([
  "input",
  "select",
  "textarea",
  "button",
  "a",
]);

/** Interaktive ARIA-Rollen */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "menuitem",
  "tab",
  "switch",
  "slider",
  "spinbutton",
  "searchbox",
]);

/**
 * Extrahiert den kompletten DOM als DomNode-Baum.
 *
 * - Script-Tags und Event-Handler werden entfernt (Sanitization)
 * - Hidden Elements werden markiert (isVisible: false) aber NICHT entfernt
 * - Computed Styles fuer Sichtbarkeit (display, visibility, opacity)
 * - BoundingBox pro Element
 * - domPath als CSS-Selektor-Pfad
 * - Max-Tiefe: 50 Level
 * - Ergebnis wird mit DomNodeSchema.parse() validiert
 */
export async function extractStructuredDOM(page: Page): Promise<DomNode> {
  try {
    const rawDom = await page.evaluate(
      (params: { maxDepth: number; interactiveTags: string[]; interactiveRoles: string[] }) => {
        // Polyfill: esbuild/tsx fuegt __name() Aufrufe ein (keepNames),
        // die im Browser page.evaluate Kontext nicht definiert sind.
        // Dieser Polyfill verhindert den ReferenceError.
        if (typeof (globalThis as unknown as Record<string, unknown>).__name === "undefined") {
          (globalThis as unknown as Record<string, unknown>).__name = (target: unknown) => target;
        }

        const buildDomPath = (el: Element): string => {
          const parts: string[] = [];
          let current: Element | null = el;
          while (current && current !== document.documentElement) {
            let selector = current.tagName.toLowerCase();
            if (current.id) {
              selector += `#${current.id}`;
              parts.unshift(selector);
              break;
            }
            const parent: Element | null = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(
                (s: Element) => s.tagName === current!.tagName
              );
              if (siblings.length > 1) {
                const idx = siblings.indexOf(current) + 1;
                selector += `:nth-of-type(${idx})`;
              }
            }
            parts.unshift(selector);
            current = parent;
          }
          return parts.join(" > ");
        };

        const checkVisible = (el: Element): {
          visible: boolean;
          styles: { display: string; visibility: string; opacity: number };
        } => {
          const style = getComputedStyle(el);
          const display = style.display;
          const visibility = style.visibility;
          const opacity = parseFloat(style.opacity);
          const rect = el.getBoundingClientRect();

          // Explizit versteckt via CSS
          const cssHidden = display === "none" || visibility === "hidden" || opacity <= 0;

          // BoundingBox-Check: width/height > 0
          const hasSize = rect.width > 0 && rect.height > 0;

          // Interaktive Elemente (input, button, a, select, textarea)
          // werden als sichtbar betrachtet auch wenn sie keine Groesse haben,
          // solange sie nicht explizit per CSS versteckt sind.
          // Grund: Bei page.setContent() ohne externe Stylesheets haben viele
          // Elemente BoundingBox 0x0, obwohl sie semantisch relevant sind.
          const tag = el.tagName.toLowerCase();
          const isInteractiveTag = params.interactiveTags.includes(tag);
          const hasInteractiveRole = el.getAttribute("role") !== null
            && params.interactiveRoles.includes(el.getAttribute("role")!);
          const isSemanticLandmark = ["section", "main", "nav", "header",
            "footer", "form", "aside", "dialog", "article"].includes(tag);

          const visible = !cssHidden && (hasSize || isInteractiveTag || hasInteractiveRole || isSemanticLandmark);

          return { visible, styles: { display, visibility, opacity } };
        };

        const checkInteractive = (el: Element): boolean => {
          const tag = el.tagName.toLowerCase();
          if (params.interactiveTags.includes(tag)) return true;
          if (el.hasAttribute("onclick") || el.hasAttribute("tabindex"))
            return true;
          const role = el.getAttribute("role");
          if (role && params.interactiveRoles.includes(role)) return true;
          const style = getComputedStyle(el);
          if (style.cursor === "pointer") return true;
          return false;
        };

        type ExtractedNode = {
          tagName: string;
          attributes: Record<string, string>;
          textContent?: string;
          isVisible: boolean;
          isInteractive: boolean;
          boundingBox?: { x: number; y: number; width: number; height: number };
          computedStyles?: {
            display: string;
            visibility: string;
            opacity: number;
          };
          domPath?: string;
          children: ExtractedNode[];
        };

        const extractNode = (
          el: Element,
          depth: number
        ): ExtractedNode => {
          // Max-Tiefe: Marker-Node
          if (depth >= params.maxDepth) {
            return {
              tagName: "balage-depth-limit",
              attributes: { "data-depth": String(depth) },
              textContent: `[DOM truncated at depth ${depth}]`,
              isVisible: false,
              isInteractive: false,
              children: [],
            };
          }

          // Script-Tags ueberspringen (Sanitization)
          const tag = el.tagName.toLowerCase();
          if (tag === "script" || tag === "noscript") {
            return {
              tagName: tag,
              attributes: {},
              isVisible: false,
              isInteractive: false,
              children: [],
            };
          }

          // Attribute extrahieren — Event-Handler entfernen
          const attrs: Record<string, string> = {};
          for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i]!;
            // Event-Handler wie onclick, onload etc. entfernen
            if (!attr.name.startsWith("on")) {
              attrs[attr.name] = attr.value;
            }
          }

          // Sichtbarkeit & Styles
          const { visible, styles } = checkVisible(el);

          // BoundingBox
          const rect = el.getBoundingClientRect();
          const boundingBox =
            rect.width > 0 && rect.height > 0
              ? {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                }
              : undefined;

          // Text-Content (nur direkte Text-Nodes)
          let textContent: string | undefined;
          const textNodes = Array.from(el.childNodes).filter(
            (n) => n.nodeType === 3
          );
          if (textNodes.length > 0) {
            const text = textNodes
              .map((n) => n.textContent?.trim() ?? "")
              .filter(Boolean)
              .join(" ");
            if (text.length > 0) {
              textContent = text.slice(0, 4096);
            }
          }

          // Kinder rekursiv extrahieren (Script-Tags und Style-Tags filtern)
          const children = Array.from(el.children)
            .filter((child) => {
              const childTag = child.tagName.toLowerCase();
              return childTag !== "style";
            })
            .map((child) => extractNode(child, depth + 1));

          return {
            tagName: tag,
            attributes: attrs,
            textContent,
            isVisible: visible,
            isInteractive: checkInteractive(el),
            boundingBox,
            computedStyles: styles,
            domPath: buildDomPath(el),
            children,
          };
        };

        const root = document.documentElement;
        return extractNode(root, 0);
      },
      {
        maxDepth: MAX_DOM_DEPTH,
        interactiveTags: [...INTERACTIVE_TAGS],
        interactiveRoles: [...INTERACTIVE_ROLES],
      }
    );

    // Zod-Validierung
    const validated = DomNodeSchema.parse(rawDom);

    logger.debug(
      { tagName: validated.tagName, childCount: validated.children.length },
      "DOM extraction completed"
    );

    return validated;
  } catch (err) {
    if (err instanceof DomExtractionError) throw err;
    throw new DomExtractionError(
      `DOM extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err instanceof Error ? err : new Error(String(err)) }
    );
  }
}

/**
 * Accessibility Tree extrahieren.
 *
 * Strategie:
 * 1. CDP Accessibility.getFullAXTree fuer detaillierte Daten (bevorzugt)
 * 2. Falls kein CDP-Session: Erstelle ad-hoc CDP-Session (Chromium)
 * 3. Falls auch das nicht geht: Fallback via page.evaluate mit ARIA-Attributen
 * 4. Leere/dekorative Nodes filtern (role="presentation", role="none")
 * 5. Ergebnis mit AccessibilityNodeSchema.parse() validieren
 */
export async function extractAccessibilityTree(
  page: Page,
  cdpSession?: CDPSession | null
): Promise<AccessibilityNode> {
  try {
    // Versuch 1: Vorhandene CDP-Session nutzen
    if (cdpSession) {
      try {
        return await extractViaCdp(cdpSession);
      } catch (cdpErr) {
        logger.warn(
          { err: cdpErr },
          "CDP AX-Tree extraction failed, trying ad-hoc session"
        );
      }
    }

    // Versuch 2: Ad-hoc CDP-Session erstellen
    try {
      const context = page.context();
      const adHocCdp = await context.newCDPSession(page);
      try {
        return await extractViaCdp(adHocCdp);
      } finally {
        await adHocCdp.detach().catch(() => {});
      }
    } catch (cdpErr) {
      logger.warn(
        { err: cdpErr },
        "Ad-hoc CDP session failed, falling back to DOM-based extraction"
      );
    }

    // Versuch 3: DOM-basierter Fallback (fuer Firefox/WebKit)
    return await extractViaEvaluate(page);
  } catch (err) {
    if (err instanceof DomExtractionError) throw err;
    throw new DomExtractionError(
      `Accessibility tree extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err instanceof Error ? err : new Error(String(err)) }
    );
  }
}

/**
 * AX-Tree ueber CDP extrahieren.
 *
 * Verwendet childIds-basierte Baumkonstruktion. Ignored/dekorative Nodes
 * werden uebersprungen und deren Kinder an den naechsten nicht-ignorierten
 * Elternteil angehaengt.
 */
async function extractViaCdp(cdp: CDPSession): Promise<AccessibilityNode> {
  await cdp.send("Accessibility.enable");

  try {
    const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
      nodes: CdpAxNode[];
    };

    // Phase 1: Alle Nodes in einer Map speichern (inkl. ignored)
    const rawMap = new Map<string, CdpAxNode>();
    for (const node of nodes) {
      rawMap.set(node.nodeId, node);
    }

    // Phase 2: AccessibilityNode fuer nicht-ignorierte/nicht-dekorative erstellen
    const axMap = new Map<string, AccessibilityNode>();

    for (const node of nodes) {
      const role = node.role?.value as string | undefined;
      if (role === "presentation" || role === "none") continue;
      if (node.ignored) continue;

      const axNode: AccessibilityNode = {
        role: role ?? "unknown",
        name: ((node.name?.value as string) ?? "").slice(0, 512),
        value: node.value?.value as string | undefined,
        description: node.description?.value as string | undefined,
        checked: extractCheckedState(node),
        disabled: extractBooleanProperty(node, "disabled"),
        required: extractBooleanProperty(node, "required"),
        expanded: extractOptionalBoolean(node, "expanded"),
        selected: extractOptionalBoolean(node, "selected"),
        level: extractLevel(node),
        children: [],
      };

      axMap.set(node.nodeId, axNode);
    }

    // Phase 3: Baum aufbauen ueber childIds — Ignorierte Nodes transparent durchreichen
    function collectVisibleChildren(nodeId: string): AccessibilityNode[] {
      const raw = rawMap.get(nodeId);
      if (!raw?.childIds) return [];

      const result: AccessibilityNode[] = [];
      for (const childId of raw.childIds) {
        const axChild = axMap.get(childId);
        if (axChild) {
          // Sichtbarer Node — direkt anhaengen
          result.push(axChild);
        } else {
          // Ignorierter/dekorativer Node — seine Kinder durchreichen
          result.push(...collectVisibleChildren(childId));
        }
      }
      return result;
    }

    // Children zuordnen
    for (const [nodeId, axNode] of axMap.entries()) {
      axNode.children = collectVisibleChildren(nodeId);
    }

    // Root finden (erster Node ohne parentId oder erster in axMap)
    let root: AccessibilityNode | null = null;
    for (const node of nodes) {
      if (!node.parentId && axMap.has(node.nodeId)) {
        root = axMap.get(node.nodeId) ?? null;
        break;
      }
    }

    if (!root) {
      // Fallback: Ersten sichtbaren Node als Root nehmen
      const firstEntry = axMap.values().next();
      root = firstEntry.done
        ? {
            role: "RootWebArea",
            name: "",
            disabled: false,
            required: false,
            children: [],
          }
        : firstEntry.value;
    }

    const validated = AccessibilityNodeSchema.parse(root);

    logger.debug(
      { role: validated.role, childCount: validated.children.length },
      "CDP AX-Tree extraction completed"
    );

    return validated;
  } finally {
    await cdp.send("Accessibility.disable").catch(() => {});
  }
}

/**
 * DOM-basierter Fallback fuer AX-Tree Extraktion.
 * Verwendet page.evaluate um ARIA-Attribute und semantische Rollen auszulesen.
 * Weniger detailliert als CDP, aber funktioniert mit allen Browser-Engines.
 */
async function extractViaEvaluate(page: Page): Promise<AccessibilityNode> {
  const rawTree = await page.evaluate(() => {
    // Polyfill: esbuild __name() im Browser-Kontext
    if (typeof (globalThis as unknown as Record<string, unknown>).__name === "undefined") {
      (globalThis as unknown as Record<string, unknown>).__name = (target: unknown) => target;
    }

    // Mapping von HTML-Tags zu impliziten ARIA-Rollen
    const TAG_ROLE_MAP: Record<string, string> = {
      a: "link",
      button: "button",
      h1: "heading",
      h2: "heading",
      h3: "heading",
      h4: "heading",
      h5: "heading",
      h6: "heading",
      input: "textbox",
      select: "combobox",
      textarea: "textbox",
      img: "img",
      nav: "navigation",
      main: "main",
      header: "banner",
      footer: "contentinfo",
      form: "form",
      table: "table",
      ul: "list",
      ol: "list",
      li: "listitem",
    };

    // Arrow-Functions statt benannter Funktionen: verhindert esbuild __name()
    // Injection die im Browser-Kontext einen ReferenceError verursacht.
    const getRole = (el: Element): string => {
      const explicit = el.getAttribute("role");
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      const inputType = el.getAttribute("type");
      if (tag === "input") {
        if (inputType === "checkbox") return "checkbox";
        if (inputType === "radio") return "radio";
        if (inputType === "submit" || inputType === "button") return "button";
        return "textbox";
      }
      return TAG_ROLE_MAP[tag] ?? "generic";
    };

    const getName = (el: Element): string => {
      // aria-label hat hoechste Prio
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel;
      // aria-labelledby
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent?.trim() ?? "";
      }
      // Label-Element fuer Inputs
      const id = el.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent?.trim() ?? "";
      }
      // alt fuer Images
      const alt = el.getAttribute("alt");
      if (alt) return alt;
      // title
      const title = el.getAttribute("title");
      if (title) return title;
      // Direkte Text-Nodes
      const tag = el.tagName.toLowerCase();
      if (["button", "a", "h1", "h2", "h3", "h4", "h5", "h6", "label"].includes(tag)) {
        return el.textContent?.trim().slice(0, 512) ?? "";
      }
      return "";
    };

    const getLevel = (el: Element): number | undefined => {
      const tag = el.tagName.toLowerCase();
      const match = tag.match(/^h(\d)$/);
      if (match) return parseInt(match[1]!, 10);
      const ariaLevel = el.getAttribute("aria-level");
      if (ariaLevel) return parseInt(ariaLevel, 10) || undefined;
      return undefined;
    };

    interface RawNode {
      role: string;
      name: string;
      value?: string;
      description?: string;
      checked?: string;
      disabled: boolean;
      required: boolean;
      expanded?: boolean;
      selected?: boolean;
      level?: number;
      children: RawNode[];
    }

    const extractNode = (el: Element, depth: number): RawNode | null => {
      if (depth > 30) return null;
      const role = getRole(el);

      // Dekorative Nodes filtern
      if (role === "presentation" || role === "none") return null;
      // Script/Style ueberspringen
      const tag = el.tagName.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "noscript") return null;

      const node: RawNode = {
        role,
        name: getName(el).slice(0, 512),
        disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
        required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
        children: [],
      };

      // Value
      if ("value" in el && typeof (el as HTMLInputElement).value === "string") {
        const val = (el as HTMLInputElement).value;
        if (val) node.value = val.slice(0, 2048);
      }

      // Description
      const describedBy = el.getAttribute("aria-describedby");
      if (describedBy) {
        const descEl = document.getElementById(describedBy);
        if (descEl) node.description = descEl.textContent?.trim().slice(0, 1024);
      }

      // Checked
      const ariaChecked = el.getAttribute("aria-checked");
      if (ariaChecked === "true") node.checked = "true";
      else if (ariaChecked === "false") node.checked = "false";
      else if (ariaChecked === "mixed") node.checked = "mixed";
      else if ((el as HTMLInputElement).checked === true) node.checked = "true";
      else if ((el as HTMLInputElement).checked === false && (tag === "input" && (el.getAttribute("type") === "checkbox" || el.getAttribute("type") === "radio"))) node.checked = "false";

      // Expanded
      const ariaExpanded = el.getAttribute("aria-expanded");
      if (ariaExpanded === "true") node.expanded = true;
      else if (ariaExpanded === "false") node.expanded = false;

      // Selected
      const ariaSelected = el.getAttribute("aria-selected");
      if (ariaSelected === "true") node.selected = true;
      else if (ariaSelected === "false") node.selected = false;

      // Level
      node.level = getLevel(el);

      // Kinder
      for (let i = 0; i < el.children.length; i++) {
        const child = el.children[i]!;
        const childNode = extractNode(child, depth + 1);
        if (childNode) node.children.push(childNode);
      }

      return node;
    };

    const root = extractNode(document.documentElement, 0);
    return root ?? {
      role: "RootWebArea",
      name: "",
      disabled: false,
      required: false,
      children: [],
    };
  });

  const validated = AccessibilityNodeSchema.parse(rawTree);

  logger.debug(
    { role: validated.role, childCount: validated.children.length },
    "DOM-based AX-Tree extraction completed"
  );

  return validated;
}

// ============================================================================
// CDP-Typ-Helfer
// ============================================================================

interface CdpAxNode {
  nodeId: string;
  parentId?: string;
  childIds?: string[];
  ignored?: boolean;
  role?: { value: unknown };
  name?: { value: unknown };
  value?: { value: unknown };
  description?: { value: unknown };
  properties?: CdpAxProperty[];
  backendDOMNodeId?: number;
}

interface CdpAxProperty {
  name: string;
  value: { value: unknown };
}

function extractCheckedState(
  node: CdpAxNode
): "true" | "false" | "mixed" | undefined {
  const prop = node.properties?.find((p) => p.name === "checked");
  if (!prop) return undefined;
  const val = prop.value.value;
  if (val === true || val === "true") return "true";
  if (val === false || val === "false") return "false";
  if (val === "mixed") return "mixed";
  return undefined;
}

function extractBooleanProperty(node: CdpAxNode, name: string): boolean {
  const prop = node.properties?.find((p) => p.name === name);
  return prop?.value.value === true;
}

function extractOptionalBoolean(
  node: CdpAxNode,
  name: string
): boolean | undefined {
  const prop = node.properties?.find((p) => p.name === name);
  if (!prop) return undefined;
  return prop.value.value === true;
}

function extractLevel(node: CdpAxNode): number | undefined {
  const prop = node.properties?.find((p) => p.name === "level");
  if (!prop) return undefined;
  const val = Number(prop.value.value);
  return Number.isInteger(val) && val > 0 ? val : undefined;
}

