/**
 * Faktor 1 — Semantic Match (w1 = 0.25)
 *
 * Prueft Konsistenz zwischen endpoint.type und den tatsaechlichen
 * Anchors/Affordances. Pure Function.
 */

import pino from "pino";
import type { Endpoint } from "../../../shared_interfaces.js";

const logger = pino({ name: "confidence:semantic-match" });

/** Erwartete Anchor-Signale pro Endpoint-Typ */
const EXPECTED_SIGNALS: Record<string, string[]> = {
  auth: ["password", "login", "sign in", "email", "username"],
  form: ["input", "textarea", "select", "form"],
  checkout: ["price", "cart", "buy", "payment", "total", "order"],
  commerce: ["price", "add to cart", "buy", "shop"],
  search: ["search", "query", "find"],
  navigation: ["nav", "menu", "link", "href"],
  content: ["article", "text", "paragraph", "heading"],
  support: ["chat", "help", "support", "contact"],
  consent: ["cookie", "consent", "accept", "privacy"],
  media: ["video", "audio", "player", "image"],
  social: ["share", "like", "comment", "follow"],
  settings: ["settings", "preferences", "config", "account"],
};

/**
 * Berechnet den Semantic Match Score.
 * Vergleicht endpoint.type mit den tatsaechlichen Anchor-Inhalten.
 */
export function computeSemanticMatch(endpoint: Endpoint): number {
  const expectedSignals = EXPECTED_SIGNALS[endpoint.type] ?? [];
  if (expectedSignals.length === 0) {
    logger.warn({ type: endpoint.type }, "Kein erwartetes Signal-Set fuer Endpoint-Typ");
    return 0.5;
  }

  // Alle Anchor-Texte und Attribute sammeln
  const anchorTexts: string[] = [];
  for (const anchor of endpoint.anchors) {
    if (anchor.selector) anchorTexts.push(anchor.selector.toLowerCase());
    if (anchor.ariaRole) anchorTexts.push(anchor.ariaRole.toLowerCase());
    if (anchor.ariaLabel) anchorTexts.push(anchor.ariaLabel.toLowerCase());
    if (anchor.textContent) anchorTexts.push(anchor.textContent.toLowerCase());
  }

  // Affordance-Typen sammeln
  const affordanceTypes = endpoint.affordances.map((a) => a.type);

  // Label-Texte
  const labelText = [
    endpoint.label.primary.toLowerCase(),
    endpoint.label.display.toLowerCase(),
    ...endpoint.label.synonyms.map((s) => s.toLowerCase()),
  ].join(" ");

  const allText = [...anchorTexts, labelText].join(" ");

  // Signal-Matching: wie viele erwartete Signale sind in den Texten?
  let matchCount = 0;
  for (const signal of expectedSignals) {
    if (allText.includes(signal)) {
      matchCount++;
    }
  }

  const signalScore = matchCount / expectedSignals.length;

  // Affordance-Konsistenz-Bonus (leichter Bonus wenn Affordances zum Typ passen)
  let affordanceBonus = 0;
  if (endpoint.type === "auth" || endpoint.type === "form" || endpoint.type === "search") {
    if (affordanceTypes.includes("fill") && affordanceTypes.includes("submit")) {
      affordanceBonus = 0.15;
    }
  } else if (endpoint.type === "navigation") {
    if (affordanceTypes.includes("click") || affordanceTypes.includes("navigate")) {
      affordanceBonus = 0.15;
    }
  }

  const raw = signalScore * 0.85 + affordanceBonus;
  return Math.min(1.0, Math.max(0.0, raw));
}
