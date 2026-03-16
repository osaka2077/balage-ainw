/**
 * FeatureExtractor — Extrahiert semantische, strukturelle, visuelle
 * und textuelle Features aus UISegments fuer den Fingerprint.
 */

import { createHash } from "node:crypto";
import pino from "pino";
import type {
  UISegment,
  DomNode,
  FingerprintFeatures,
  FormFieldSignature,
  ActionSignature,
} from "./types.js";
import { FeatureExtractionError } from "./errors.js";

const logger = pino({ name: "fingerprint:feature-extractor" });

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

const INPUT_TYPE_MAP: Record<string, FormFieldSignature["type"]> = {
  text: "text",
  email: "email",
  password: "password",
  number: "number",
  tel: "tel",
  checkbox: "checkbox",
  radio: "radio",
  date: "date",
  file: "file",
  hidden: "hidden",
};

// ============================================================================
// Hilfsfunktionen (pure, keine Side-Effects)
// ============================================================================

function collectAllNodes(node: DomNode): DomNode[] {
  const result: DomNode[] = [node];
  for (const child of node.children) {
    result.push(...collectAllNodes(child));
  }
  return result;
}

function calculateDomDepth(node: DomNode, depth = 0): number {
  if (node.children.length === 0) return depth;
  let maxDepth = depth;
  for (const child of node.children) {
    const childDepth = calculateDomDepth(child, depth + 1);
    if (childDepth > maxDepth) maxDepth = childDepth;
  }
  return maxDepth;
}

function collectVisibleText(nodes: DomNode[]): string {
  const texts: string[] = [];
  for (const node of nodes) {
    if (node.isVisible && node.textContent) {
      texts.push(node.textContent);
    }
    if (node.children.length > 0) {
      texts.push(collectVisibleText(node.children));
    }
  }
  return texts.join(" ");
}

function inferLayoutRegion(
  segment: UISegment,
): FingerprintFeatures["layoutRegion"] {
  const typeMap: Partial<
    Record<string, FingerprintFeatures["layoutRegion"]>
  > = {
    header: "header",
    footer: "footer",
    sidebar: "sidebar",
    modal: "modal",
    overlay: "overlay",
  };

  const mapped = typeMap[segment.type];
  if (mapped) return mapped;

  const topPercent = (segment.boundingBox.y / VIEWPORT_HEIGHT) * 100;
  if (topPercent <= 10) return "header";
  if (topPercent >= 85) return "footer";

  if (
    segment.boundingBox.x === 0 &&
    segment.boundingBox.width < VIEWPORT_WIDTH * 0.25
  ) {
    return "sidebar";
  }

  return "main";
}

function inferSemanticRole(segment: UISegment): string {
  if (segment.semanticRole) return segment.semanticRole;

  const typeRoles: Record<string, string> = {
    form: "form",
    navigation: "navigation",
    header: "banner",
    footer: "contentinfo",
    sidebar: "complementary",
    modal: "dialog",
    overlay: "dialog",
    content: "main",
    table: "table",
    list: "list",
    media: "media",
    banner: "banner",
  };

  return typeRoles[segment.type] ?? "region";
}

function extractIntentSignals(allNodes: DomNode[]): string[] {
  const signals: string[] = [];

  for (const node of allNodes) {
    if (!node.isVisible) continue;

    const tag = node.tagName.toLowerCase();

    if ((tag === "button" || tag === "a") && node.textContent) {
      const text = node.textContent.trim().toLowerCase();
      if (text.length > 0 && text.length <= 128) {
        signals.push(text);
      }
    }

    if (/^h[1-6]$/.test(tag) && node.textContent) {
      const text = node.textContent.trim().toLowerCase();
      if (text.length > 0 && text.length <= 128) {
        signals.push(text);
      }
    }

    const placeholder = node.attributes["placeholder"];
    if (placeholder) {
      signals.push(placeholder.trim().toLowerCase());
    }

    const ariaLabel = node.attributes["aria-label"];
    if (ariaLabel) {
      signals.push(ariaLabel.trim().toLowerCase());
    }
  }

  return [...new Set(signals)].slice(0, 32);
}

function extractHeadings(allNodes: DomNode[]): string[] {
  const headings: string[] = [];

  for (const node of allNodes) {
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag) && node.textContent && node.isVisible) {
      headings.push(node.textContent.trim());
    }
    if (headings.length >= 16) break;
  }

  return headings;
}

function collectLabelTexts(allNodes: DomNode[]): string[] {
  const labels: string[] = [];

  for (const node of allNodes) {
    const tag = node.tagName.toLowerCase();

    if (tag === "label" && node.textContent) {
      labels.push(node.textContent.trim());
    }

    const ariaLabel = node.attributes["aria-label"];
    if (ariaLabel) {
      labels.push(ariaLabel.trim());
    }

    const placeholder = node.attributes["placeholder"];
    if (placeholder) {
      labels.push(placeholder.trim());
    }
  }

  return [...new Set(labels)].slice(0, 64);
}

function collectButtonTexts(allNodes: DomNode[]): string[] {
  const texts: string[] = [];

  for (const node of allNodes) {
    const tag = node.tagName.toLowerCase();
    if (tag === "button" && node.textContent) {
      texts.push(node.textContent.trim());
    }
    if (
      tag === "input" &&
      (node.attributes["type"] === "submit" ||
        node.attributes["type"] === "button")
    ) {
      const val = node.attributes["value"];
      if (val) texts.push(val.trim());
    }
  }

  return [...new Set(texts)].slice(0, 32);
}

// ============================================================================
// Public API
// ============================================================================

export function extractFormFields(nodes: DomNode[]): FormFieldSignature[] {
  const fields: FormFieldSignature[] = [];
  let position = 0;

  const allNodes = nodes.flatMap((n) => collectAllNodes(n));

  for (const node of allNodes) {
    const tag = node.tagName.toLowerCase();

    if (tag === "input" || tag === "select" || tag === "textarea") {
      let fieldType: FormFieldSignature["type"];

      if (tag === "select") {
        fieldType = "select";
      } else if (tag === "textarea") {
        fieldType = "textarea";
      } else {
        const inputType = (
          node.attributes["type"] ?? "text"
        ).toLowerCase();
        fieldType = INPUT_TYPE_MAP[inputType] ?? "unknown";
      }

      const purpose =
        node.attributes["aria-label"] ??
        node.attributes["placeholder"] ??
        node.attributes["name"] ??
        node.attributes["id"] ??
        "unknown";

      const isRequired =
        node.attributes["required"] !== undefined ||
        node.attributes["aria-required"] === "true";

      fields.push({
        type: fieldType,
        semanticPurpose: purpose.slice(0, 256),
        required: isRequired,
        position,
      });

      position++;
    }
  }

  return fields.slice(0, 64);
}

export function extractActionElements(
  nodes: DomNode[],
): ActionSignature[] {
  const actions: ActionSignature[] = [];
  const allNodes = nodes.flatMap((n) => collectAllNodes(n));

  const buttons: DomNode[] = [];
  const links: DomNode[] = [];

  for (const node of allNodes) {
    const tag = node.tagName.toLowerCase();
    if (
      tag === "button" ||
      (tag === "input" &&
        (node.attributes["type"] === "submit" ||
          node.attributes["type"] === "button"))
    ) {
      buttons.push(node);
    } else if (tag === "a") {
      links.push(node);
    }
  }

  // Primaer-Button bestimmen
  let primaryIndex = -1;
  if (buttons.length === 1) {
    primaryIndex = 0;
  } else {
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i]!;
      if (btn.attributes["type"] === "submit") {
        primaryIndex = i;
        break;
      }
    }
    if (primaryIndex === -1 && buttons.length > 0) {
      let maxArea = -1;
      for (let i = 0; i < buttons.length; i++) {
        const bb = buttons[i]!.boundingBox;
        if (bb) {
          const area = bb.width * bb.height;
          if (area > maxArea) {
            maxArea = area;
            primaryIndex = i;
          }
        }
      }
    }
  }

  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i]!;
    const label =
      btn.textContent?.trim() ?? btn.attributes["value"] ?? "";
    const lowerLabel = label.toLowerCase();

    let actionType: ActionSignature["type"] = "submit";
    if (
      lowerLabel.includes("cancel") ||
      lowerLabel.includes("abbrechen")
    ) {
      actionType = "cancel";
    } else if (
      lowerLabel.includes("delete") ||
      lowerLabel.includes("remove") ||
      lowerLabel.includes("loeschen")
    ) {
      actionType = "delete";
    } else if (lowerLabel.includes("download")) {
      actionType = "download";
    } else if (lowerLabel.includes("toggle")) {
      actionType = "toggle";
    }

    actions.push({
      type: actionType,
      label: label.slice(0, 256),
      isPrimary: i === primaryIndex,
    });
  }

  for (const link of links) {
    const label = link.textContent?.trim() ?? "";
    actions.push({
      type: "navigate",
      label: label.slice(0, 256),
      isPrimary: false,
    });
  }

  return actions.slice(0, 32);
}

export function extractFeatures(segment: UISegment): FingerprintFeatures {
  try {
    const allNodes = segment.nodes.flatMap((n) => collectAllNodes(n));

    // Semantische Features
    const semanticRole = inferSemanticRole(segment);
    const intentSignals = extractIntentSignals(allNodes);
    const formFields = extractFormFields(segment.nodes);
    const actionElements = extractActionElements(segment.nodes);

    // Strukturelle Features
    const domDepth = segment.nodes.reduce((max, node) => {
      const depth = calculateDomDepth(node);
      return depth > max ? depth : max;
    }, 0);
    const childCount =
      segment.nodes.length > 0
        ? (segment.nodes[0]?.children.length ?? 0)
        : 0;
    const interactiveElementCount = segment.interactiveElementCount;
    const headingHierarchy = extractHeadings(allNodes);

    // Visuelle Features
    const layoutRegion = inferLayoutRegion(segment);
    const approximatePosition = {
      top: Math.round(
        Math.min(
          100,
          Math.max(0, (segment.boundingBox.y / VIEWPORT_HEIGHT) * 100),
        ) * 10000,
      ) / 10000,
      left: Math.round(
        Math.min(
          100,
          Math.max(0, (segment.boundingBox.x / VIEWPORT_WIDTH) * 100),
        ) * 10000,
      ) / 10000,
    };

    // Textuelle Features
    const visibleText = collectVisibleText(segment.nodes);
    const normalizedText = visibleText.toLowerCase().replace(/\s+/g, " ").trim();
    const visibleTextHash = createHash("sha256")
      .update(normalizedText)
      .digest("hex");
    const labelTexts = collectLabelTexts(allNodes);
    const buttonTexts = collectButtonTexts(allNodes);

    const features: FingerprintFeatures = {
      semanticRole,
      intentSignals,
      formFields,
      actionElements,
      domDepth,
      childCount,
      interactiveElementCount,
      headingHierarchy,
      layoutRegion,
      approximatePosition,
      visibleTextHash,
      labelTexts,
      buttonTexts,
    };

    logger.debug(
      { segmentId: segment.id, featureCount: Object.keys(features).length },
      "features extracted",
    );

    return features;
  } catch (error) {
    if (error instanceof FeatureExtractionError) throw error;
    throw new FeatureExtractionError(
      `Failed to extract features from segment ${segment.id}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}
