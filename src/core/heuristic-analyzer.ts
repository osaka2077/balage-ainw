/**
 * Heuristic Endpoint Analysis — DOM-Signal-basierte Erkennung
 *
 * Extrahiert aus analyze.ts: Alle heuristischen Analysefunktionen,
 * DOM-Walking, Signal-Sammlung und Endpoint-Inferenz.
 */

import type { DomNode, UISegment } from "../../shared_interfaces.js";
import type { DetectedEndpoint, EndpointType, AffordanceType } from "./types.js";
import { inferSelector } from "./infer-selector.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DomSignals {
  hasPasswordInput: boolean;
  hasEmailInput: boolean;
  hasSearchInput: boolean;
  hasSearchRole: boolean;
  hasFileInput: boolean;
  hasCookieConsent: boolean;
  hasConsentButtons: boolean;
  hasAddToCart: boolean;
  hasProductData: boolean;
  hasSettingsElement: boolean;
  hasCartLink: boolean;
  inputCount: number;
  linkCount: number;
  buttonLabels: string[];
  headingTexts: string[];
  formAction: string | undefined;
  ariaLabel: string | undefined;
  placeholders: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SEGMENT_TYPE_LABELS: Record<string, string> = {
  form: "Interactive Form",
  navigation: "Navigation Menu",
  content: "Content Section",
  header: "Page Header",
  footer: "Page Footer",
  sidebar: "Sidebar",
  modal: "Modal Dialog",
  overlay: "Overlay",
  banner: "Banner",
  table: "Data Table",
  list: "List",
  media: "Media Section",
  search: "Search Form",
  checkout: "Checkout Form",
  unknown: "Interactive Section",
};

export const VALID_ENDPOINT_TYPES = new Set<EndpointType>(["auth","form","search","navigation","checkout","commerce","content","consent","support","media","social","settings"]);

// ---------------------------------------------------------------------------
// DOM Walking & Signal Collection
// ---------------------------------------------------------------------------

/** Durchsucht einen DomNode-Baum rekursiv */
export function walkDom(node: DomNode, visitor: (n: DomNode) => void): void {
  visitor(node);
  if (node.children) {
    for (const child of node.children) {
      walkDom(child, visitor);
    }
  }
}

export function collectDomSignals(root: DomNode): DomSignals {
  const signals: DomSignals = {
    hasPasswordInput: false,
    hasEmailInput: false,
    hasSearchInput: false,
    hasSearchRole: false,
    hasFileInput: false,
    hasCookieConsent: false,
    hasConsentButtons: false,
    hasAddToCart: false,
    hasProductData: false,
    hasSettingsElement: false,
    hasCartLink: false,
    inputCount: 0,
    linkCount: 0,
    buttonLabels: [],
    headingTexts: [],
    formAction: undefined,
    ariaLabel: undefined,
    placeholders: [],
  };

  walkDom(root, (node) => {
    const tag = node.tagName;
    const attrs = node.attributes ?? {};
    const type = (attrs["type"] ?? "").toLowerCase();
    const role = (attrs["role"] ?? "").toLowerCase();

    // Inputs
    if (tag === "input" || tag === "textarea" || tag === "select") {
      signals.inputCount++;
      const autocomplete = attrs["autocomplete"] ?? "";
      if (type === "password") signals.hasPasswordInput = true;
      // Password via autocomplete (zusaetzlich zum type="password" Check)
      if (autocomplete.includes("current-password") || autocomplete.includes("new-password")) {
        signals.hasPasswordInput = true;
      }
      if (
        type === "email"
        || (attrs["name"] ?? "").includes("email")
        || autocomplete.includes("email")
      ) {
        signals.hasEmailInput = true;
      }
      // Username via autocomplete → behandeln wie Email fuer Auth-Erkennung
      if (autocomplete.includes("username")) {
        signals.hasEmailInput = true;
      }
      if (type === "search" || role === "searchbox" || role === "combobox") {
        signals.hasSearchInput = true;
      }
      // Name-Attribut als Search-Signal (q, query, s sind typische Suchfeld-Namen)
      const inputName = (attrs["name"] ?? "").toLowerCase();
      if (inputName === "q" || inputName === "query" || inputName === "s" || inputName === "search") {
        signals.hasSearchInput = true;
      }
      if (type === "file") signals.hasFileInput = true;
      if (attrs["placeholder"]) {
        signals.placeholders.push(attrs["placeholder"]);
      }
    }

    // Links
    if (tag === "a") signals.linkCount++;

    // Buttons — Label sammeln
    if (
      tag === "button"
      || (tag === "input" && (type === "submit" || type === "button"))
    ) {
      const label = node.textContent
        ?? attrs["value"]
        ?? attrs["aria-label"]
        ?? "";
      if (label.trim()) signals.buttonLabels.push(label.trim().toLowerCase());
    }

    // Headings
    if (/^h[1-6]$/.test(tag) && node.textContent) {
      signals.headingTexts.push(node.textContent.trim().toLowerCase());
    }

    // Form-Level Signale
    if (tag === "form") {
      signals.formAction = attrs["action"];
      if (role === "search") signals.hasSearchRole = true;
      if (attrs["aria-label"]) signals.ariaLabel = attrs["aria-label"];
    }

    // Search-Role auf jedem Element
    if (role === "search") signals.hasSearchRole = true;

    // Cookie-Consent / GDPR-Banner Erkennung
    const consentPattern = /cookie|consent|gdpr|privacy|datenschutz/i;
    const hasConsentRole = role === "dialog" || role === "alertdialog";
    const hasConsentId = consentPattern.test(attrs["id"] ?? "");
    const hasConsentClass = consentPattern.test(attrs["class"] ?? "");

    if (
      (hasConsentRole || hasConsentId || hasConsentClass)
      && consentPattern.test(
        [attrs["aria-label"] ?? "", node.textContent ?? ""].join(" "),
      )
    ) {
      signals.hasCookieConsent = true;
    }

    // Consent-Buttons allein reichen als Signal (ohne role/id/class Kontext)
    if (signals.hasConsentButtons && !signals.hasCookieConsent) {
      signals.hasCookieConsent = true;
    }

    // Consent-Buttons: "accept all", "reject", "alle akzeptieren" etc.
    if (
      tag === "button"
      || (tag === "input" && (type === "submit" || type === "button"))
    ) {
      const btnLabel = (node.textContent ?? attrs["value"] ?? attrs["aria-label"] ?? "").toLowerCase();
      if (/accept\s*all|reject\s*all?|alle\s*akzeptieren|alle\s*ablehnen|cookie\s*settings/i.test(btnLabel)) {
        signals.hasConsentButtons = true;
      }
    }

    // Commerce: Add-to-Cart Buttons
    if (
      tag === "button"
      || (tag === "input" && (type === "submit" || type === "button"))
    ) {
      const btnLabel = (node.textContent ?? attrs["value"] ?? attrs["aria-label"] ?? "").toLowerCase();
      if (/add\s*to\s*cart|in\s*den\s*warenkorb|buy\s*now|jetzt\s*kaufen|kaufen|jetzt\s*bestellen|zur\s*kasse/i.test(btnLabel)) {
        signals.hasAddToCart = true;
      }
    }

    // Commerce: Product-Data Attribute und Schema.org
    if (
      attrs["data-product"] !== undefined
      || attrs["data-sku"] !== undefined
      || attrs["data-price"] !== undefined
      || (attrs["itemtype"] ?? "").toLowerCase().includes("product")
    ) {
      signals.hasProductData = true;
    }

    // Settings: select/radio/checkbox/switch mit Settings-bezogenem Text
    if (
      tag === "select"
      || (tag === "input" && (type === "radio" || type === "checkbox"))
      || role === "switch"
    ) {
      const settingsText = [attrs["aria-label"] ?? "", node.textContent ?? "", attrs["name"] ?? ""].join(" ");
      if (/font[\s-]?size|theme|dark[\s-]?mode|light[\s-]?mode|appearance|language|sprache|locale|color[\s-]?scheme|accessibility/i.test(settingsText)) {
        signals.hasSettingsElement = true;
      }
    }

    // Commerce: Cart-Links (href zu cart/bag/basket)
    if (tag === "a" && attrs["href"]) {
      if (/\/(cart|bag|basket|warenkorb)\b/i.test(attrs["href"])) {
        signals.hasCartLink = true;
      }
    }

    // Commerce: Cart-Icons (img/svg mit cart-bezogenem alt/class/aria-label)
    if (
      (tag === "img" || tag === "svg")
      && /cart|bag|basket|warenkorb/i.test(
        [attrs["alt"] ?? "", attrs["class"] ?? "", attrs["aria-label"] ?? ""].join(" "),
      )
    ) {
      signals.hasCartLink = true;
    }
  });

  return signals;
}

// ---------------------------------------------------------------------------
// Label / Type / Description Inference
// ---------------------------------------------------------------------------

export function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generiert ein menschenlesbares Label aus DOM-Signalen.
 * FIX #1: Statt generischem "form" kommt z.B. "Login / Sign-In Form".
 */
export function inferLabel(segmentType: string, signals: DomSignals): string {
  // Cookie-Consent / GDPR-Banner (vor Auth, da Consent-Dialoge Password-Felder ueberlagern koennen)
  if (signals.hasCookieConsent) {
    return "Cookie Consent Dialog";
  }

  // Auth / Login
  if (signals.hasPasswordInput) {
    if (signals.hasEmailInput || signals.inputCount <= 3) {
      return "Login / Sign-In Form";
    }
    return "Authentication Form";
  }

  // Search
  if (signals.hasSearchRole || signals.hasSearchInput) {
    return "Search Form";
  }
  if (signals.placeholders.some(p => /search|such|find|query/i.test(p))) {
    return "Search Form";
  }

  // Registration / Signup
  const allText = [
    ...signals.buttonLabels,
    ...signals.headingTexts,
    ...signals.placeholders,
  ].join(" ");
  if (/sign\s*up|register|create\s*account|registrier/i.test(allText)) {
    return "Registration / Sign-Up Form";
  }

  // Contact
  if (/contact|kontakt|message|nachricht/i.test(allText)) {
    return "Contact Form";
  }

  // Newsletter / Subscribe
  if (/subscri|newsletter|abonnier/i.test(allText)) {
    return "Newsletter / Subscribe Form";
  }

  // File Upload
  if (signals.hasFileInput) {
    return "File Upload Form";
  }

  // Checkout
  if (/checkout|payment|bezahl|kasse|cart|warenkorb|jetzt\s*bestellen|zur\s*kasse/i.test(allText)) {
    return "Checkout Form";
  }

  // Commerce: Add to Cart / Product Page
  if (signals.hasAddToCart || signals.hasProductData) {
    return "Product / Add to Cart";
  }

  // Commerce: Cart Link/Icon
  if (signals.hasCartLink) {
    return "Shopping Cart";
  }

  // Settings / Preferences
  if (signals.hasSettingsElement) {
    return "Settings / Preferences";
  }

  // Navigation
  if (segmentType === "navigation") {
    if (signals.linkCount > 5) return "Main Navigation Menu";
    return "Navigation Menu";
  }

  // Form Action URL als Hinweis
  if (signals.formAction) {
    const action = signals.formAction.toLowerCase();
    if (/login|signin|sign-in|auth/i.test(action)) return "Login / Sign-In Form";
    if (/search/i.test(action)) return "Search Form";
    if (/register|signup|sign-up/i.test(action)) return "Registration / Sign-Up Form";
    if (/contact/i.test(action)) return "Contact Form";
    if (/checkout|payment/i.test(action)) return "Checkout Form";
    if (/subscribe/i.test(action)) return "Newsletter / Subscribe Form";
  }

  // Aria-Label
  if (signals.ariaLabel) {
    return capitalizeFirst(signals.ariaLabel);
  }

  // Heading als Kontext
  if (signals.headingTexts.length > 0) {
    return capitalizeFirst(signals.headingTexts[0]!);
  }

  // Fallback: beschreibender Typ
  return SEGMENT_TYPE_LABELS[segmentType] ?? capitalizeFirst(segmentType);
}

/** Bestimmt den Endpoint-Typ aus DOM-Signalen (verbessert den Segment-Typ). */
export function inferEndpointType(
  segmentType: string,
  signals: DomSignals,
): EndpointType {
  // Consent-Banner hat hoechste Prioritaet (ueberlagert andere Elemente)
  if (signals.hasCookieConsent) return "consent";

  if (signals.hasPasswordInput) return "auth";
  // Settings VOR search: verhindert Fehlklassifizierung von Dropdowns als search
  // Guard: wenn auch Consent-Signale vorhanden → consent hat Vorrang vor settings
  if (signals.hasSettingsElement && !signals.hasSearchInput && !signals.hasSearchRole && !signals.hasCookieConsent && !signals.hasConsentButtons) return "settings";
  if (signals.hasSearchRole || signals.hasSearchInput) return "search";
  if (signals.placeholders.some(p => /search|such|find|query/i.test(p))) {
    return "search";
  }

  const allText = [
    ...signals.buttonLabels,
    ...signals.headingTexts,
  ].join(" ");
  if (/checkout|payment|bezahl|kasse|warenkorb|jetzt\s*bestellen/i.test(allText)) return "checkout";

  // Commerce: Add-to-Cart, Product-Daten oder Cart-Links/Icons
  if (signals.hasAddToCart || signals.hasProductData || signals.hasCartLink) return "commerce";

  if (signals.formAction) {
    const action = signals.formAction.toLowerCase();
    if (/login|signin|sign-in|auth/i.test(action)) return "auth";
    if (/register|signup|sign-up/i.test(action)) return "auth";
    if (/search/i.test(action)) return "search";
    if (/checkout|payment/i.test(action)) return "checkout";
    if (/contact/i.test(action)) return "form";
    if (/subscribe/i.test(action)) return "form";
  }

  // Footer/Header/Sidebar mit vielen Links → navigation statt content
  if (["footer", "header", "sidebar"].includes(segmentType) && signals.linkCount >= 3) {
    return "navigation";
  }

  return VALID_ENDPOINT_TYPES.has(segmentType as EndpointType) ? segmentType as EndpointType : "content";
}

export function inferDescription(
  label: string,
  signals: DomSignals,
  endpointType: string,
): string {
  const parts: string[] = [label];
  if (signals.inputCount > 0) {
    parts.push(
      `with ${signals.inputCount} input field${signals.inputCount > 1 ? "s" : ""}`,
    );
  }
  if (signals.linkCount > 0 && endpointType === "navigation") {
    parts.push(
      `containing ${signals.linkCount} link${signals.linkCount > 1 ? "s" : ""}`,
    );
  }
  if (signals.buttonLabels.length > 0) {
    parts.push(`(action: "${signals.buttonLabels[0]}")`);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Affordances & Evidence
// ---------------------------------------------------------------------------

export function inferAffordances(
  endpointType: string,
  signals: DomSignals,
): AffordanceType[] {
  const affordances: AffordanceType[] = [];
  switch (endpointType) {
    case "auth":
      affordances.push("fill", "submit", "click");
      break;
    case "search":
      affordances.push("fill", "submit");
      break;
    case "form":
      affordances.push("fill", "submit");
      if (signals.hasFileInput) affordances.push("upload");
      break;
    case "navigation":
      affordances.push("click", "navigate");
      break;
    case "checkout":
      affordances.push("click", "fill", "submit");
      break;
    case "consent":
      affordances.push("click", "toggle");
      break;
    case "settings":
      affordances.push("click", "toggle", "select");
      break;
    case "commerce":
      affordances.push("click", "scroll");
      break;
    default:
      affordances.push("click");
  }
  return affordances;
}

export function buildEvidence(
  originalType: string,
  inferredType: string,
  signals: DomSignals,
): string[] {
  const evidence: string[] = [];
  evidence.push(`Segment type: ${originalType}`);
  if (inferredType !== originalType) {
    evidence.push(`Refined to: ${inferredType}`);
  }
  if (signals.hasPasswordInput) evidence.push("Contains password input");
  if (signals.hasSearchRole) evidence.push("Has role=search");
  if (signals.hasSearchInput) evidence.push("Contains search input");
  if (signals.hasEmailInput) evidence.push("Contains email input");
  if (signals.hasCookieConsent) evidence.push("Contains cookie/consent dialog");
  if (signals.hasConsentButtons) evidence.push("Contains consent action buttons");
  if (signals.hasAddToCart) evidence.push("Contains add-to-cart button");
  if (signals.hasProductData) evidence.push("Contains product data attributes");
  if (signals.hasSettingsElement) evidence.push("Contains settings controls (select/radio/toggle)");
  if (signals.hasCartLink) evidence.push("Contains cart/commerce link or icon");
  if (signals.formAction) evidence.push(`Form action: ${signals.formAction}`);
  evidence.push(
    `Interactive elements: ${signals.inputCount} inputs, ${signals.linkCount} links`,
  );
  return evidence;
}

// ---------------------------------------------------------------------------
// Main Heuristic Analysis
// ---------------------------------------------------------------------------

export function runHeuristicAnalysis(
  segments: UISegment[],
  fullDom: DomNode,
  minConfidence: number,
  maxEndpoints: number,
): DetectedEndpoint[] {
  return segments
    .filter((s: UISegment) => s.interactiveElementCount > 0)
    .map((s: UISegment) => {
      // Segment-Nodes fuer DOM-Signal-Analyse nutzen
      const segmentRoot: DomNode = (s.nodes && s.nodes.length > 0)
        ? {
            tagName: "div",
            attributes: {},
            isVisible: true,
            isInteractive: false,
            children: s.nodes,
          }
        : fullDom;

      const signals = collectDomSignals(segmentRoot);
      const endpointType = inferEndpointType(s.type, signals);
      const label = inferLabel(s.type, signals);
      const description = inferDescription(label, signals, endpointType);

      // Confidence: Signal-staerke-basiert mit korroborierenden Bonus-Signalen
      const typeConfidence: Record<string, number> = {
        auth: 0.80,
        search: 0.75,
        consent: 0.60,
        checkout: 0.55,
        commerce: 0.55,
        navigation: 0.50,
        form: 0.40,
        content: 0.30,
      };
      let confidence = typeConfidence[endpointType] ?? 0.30;
      // Korroborierende Signale erhoehen Confidence
      if (signals.hasPasswordInput && signals.hasEmailInput) confidence += 0.15;
      if (signals.formAction && /login|auth|search/.test(signals.formAction)) confidence += 0.10;
      if (signals.hasSearchRole && signals.hasSearchInput) confidence += 0.10;
      if (signals.hasCookieConsent && signals.hasConsentButtons) confidence += 0.10;
      // Interaktive Elemente erhoehen die Basis-Confidence leicht (max +0.15)
      confidence += Math.min(0.15, s.interactiveElementCount * 0.05);
      confidence = Math.round(Math.min(0.90, confidence) * 100) / 100;

      // Selektor-Inferenz: generiert CSS-Selektoren aus DOM-Struktur
      const selector = inferSelector(segmentRoot);

      return {
        type: endpointType,
        label,
        description,
        confidence,
        selector,
        affordances: inferAffordances(endpointType, signals),
        evidence: buildEvidence(s.type, endpointType, signals),
      } satisfies DetectedEndpoint;
    })
    .filter((e: DetectedEndpoint) => e.confidence >= minConfidence)
    .sort((a: DetectedEndpoint, b: DetectedEndpoint) => b.confidence - a.confidence)
    .reduce((deduped: DetectedEndpoint[], ep) => {
      // Navigation: bis zu 5 DISTINCT Endpoints erlauben
      if (ep.type === "navigation") {
        const navCount = deduped.filter(d => d.type === "navigation").length;
        const labelExists = deduped.some(d => d.type === "navigation" && d.label === ep.label);
        if (navCount < 5 && !labelExists) {
          deduped.push(ep);
        }
        return deduped;
      }
      // Auth: bis zu 4 DISTINCT Endpoints (Login Form, SSO, OAuth, Passkey)
      if (ep.type === "auth") {
        const authCount = deduped.filter(d => d.type === "auth").length;
        const labelExists = deduped.some(d => d.type === "auth" && d.label === ep.label);
        if (authCount < 4 && !labelExists) {
          deduped.push(ep);
        }
        return deduped;
      }
      // Andere Typen: Deduplicate by type+label — keep highest confidence
      const key = `${ep.type}:${ep.label}`;
      if (!deduped.some(d => `${d.type}:${d.label}` === key)) {
        deduped.push(ep);
      }
      return deduped;
    }, [])
    .slice(0, maxEndpoints);
}
