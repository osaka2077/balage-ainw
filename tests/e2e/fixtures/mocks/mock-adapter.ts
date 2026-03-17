/**
 * Mock Browser Adapter — Laedt HTML-Fixtures als DomNode/AccessibilityNode.
 *
 * Statt echtem Browser: URL → Fixture-Mapping, vorgefertigte DOM-Strukturen.
 */
import type { DomNode, AccessibilityNode } from "../../../../shared_interfaces.js";
import type { BrowserAdapterInterface } from "../../../../src/orchestrator/types.js";

type FixtureKey = "login" | "contact" | "search" | "checkout" | "navigation";

/** URL-Pfad auf Fixture-Key abbilden */
function resolveFixture(url: string): FixtureKey {
  if (url.includes("/login")) return "login";
  if (url.includes("/contact") || url.includes("/kontakt")) return "contact";
  if (url.includes("/search") || url.includes("/suche")) return "search";
  if (url.includes("/checkout") || url.includes("/kasse")) return "checkout";
  return "navigation";
}

// ============================================================================
// Vorgefertigte DomNode-Strukturen pro Fixture
// ============================================================================

const LOGIN_DOM: DomNode = {
  tagName: "form",
  attributes: { action: "/login", method: "POST", role: "form" },
  isVisible: true,
  isInteractive: true,
  children: [
    { tagName: "h1", attributes: {}, textContent: "Anmelden", isVisible: true, isInteractive: false, children: [] },
    { tagName: "input", attributes: { type: "email", name: "email", "aria-label": "E-Mail-Adresse" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "input", attributes: { type: "password", name: "password", "aria-label": "Passwort" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "button", attributes: { type: "submit" }, textContent: "Anmelden", isVisible: true, isInteractive: true, children: [] },
    { tagName: "a", attributes: { href: "/register" }, textContent: "Konto erstellen", isVisible: true, isInteractive: true, children: [] },
  ],
};

const CONTACT_DOM: DomNode = {
  tagName: "form",
  attributes: { action: "/contact", method: "POST", role: "form" },
  isVisible: true,
  isInteractive: true,
  children: [
    { tagName: "h1", attributes: {}, textContent: "Kontaktformular", isVisible: true, isInteractive: false, children: [] },
    { tagName: "input", attributes: { type: "text", name: "firstname", "aria-label": "Vorname" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "input", attributes: { type: "text", name: "lastname", "aria-label": "Nachname" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "input", attributes: { type: "email", name: "email", "aria-label": "E-Mail" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "input", attributes: { type: "text", name: "subject", "aria-label": "Betreff" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "textarea", attributes: { name: "message", "aria-label": "Nachricht" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "button", attributes: { type: "submit" }, textContent: "Nachricht senden", isVisible: true, isInteractive: true, children: [] },
  ],
};

const SEARCH_DOM: DomNode = {
  tagName: "main",
  attributes: {},
  isVisible: true,
  isInteractive: false,
  children: [
    {
      tagName: "form", attributes: { role: "search" }, isVisible: true, isInteractive: true,
      children: [
        { tagName: "input", attributes: { type: "search", name: "q", "aria-label": "Suchbegriff" }, isVisible: true, isInteractive: true, children: [] },
        { tagName: "button", attributes: { type: "submit" }, textContent: "Suchen", isVisible: true, isInteractive: true, children: [] },
      ],
    },
    {
      tagName: "ul", attributes: { role: "list" }, isVisible: true, isInteractive: false,
      children: [
        { tagName: "li", attributes: {}, children: [{ tagName: "a", attributes: { href: "/result/1" }, textContent: "Ergebnis 1", isVisible: true, isInteractive: true, children: [] }], isVisible: true, isInteractive: false },
        { tagName: "li", attributes: {}, children: [{ tagName: "a", attributes: { href: "/result/2" }, textContent: "Ergebnis 2", isVisible: true, isInteractive: true, children: [] }], isVisible: true, isInteractive: false },
      ],
    },
  ],
};

const CHECKOUT_DOM: DomNode = {
  tagName: "form",
  attributes: { action: "/checkout", method: "POST", role: "form" },
  isVisible: true,
  isInteractive: true,
  children: [
    { tagName: "input", attributes: { type: "text", name: "street", "aria-label": "Strasse" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "input", attributes: { type: "text", name: "zip", "aria-label": "PLZ" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "input", attributes: { type: "text", name: "city", "aria-label": "Stadt" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "input", attributes: { type: "text", name: "cardNumber", "aria-label": "Kartennummer" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "input", attributes: { type: "text", name: "expiry", "aria-label": "Ablaufdatum" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "input", attributes: { type: "text", name: "cvv", "aria-label": "CVV" }, isVisible: true, isInteractive: true, children: [] },
    { tagName: "button", attributes: { type: "submit" }, textContent: "Kostenpflichtig bestellen", isVisible: true, isInteractive: true, children: [] },
  ],
};

const NAVIGATION_DOM: DomNode = {
  tagName: "body",
  attributes: {},
  isVisible: true,
  isInteractive: false,
  children: [
    {
      tagName: "nav", attributes: { "aria-label": "Hauptnavigation" }, isVisible: true, isInteractive: false,
      children: [
        { tagName: "a", attributes: { href: "/" }, textContent: "Home", isVisible: true, isInteractive: true, children: [] },
        { tagName: "a", attributes: { href: "/produkte" }, textContent: "Produkte", isVisible: true, isInteractive: true, children: [] },
        { tagName: "a", attributes: { href: "/kontakt" }, textContent: "Kontakt", isVisible: true, isInteractive: true, children: [] },
      ],
    },
    { tagName: "main", attributes: {}, isVisible: true, isInteractive: false, children: [
      { tagName: "h1", attributes: {}, textContent: "Willkommen", isVisible: true, isInteractive: false, children: [] },
    ] },
  ],
};

const DOM_MAP: Record<FixtureKey, DomNode> = {
  login: LOGIN_DOM,
  contact: CONTACT_DOM,
  search: SEARCH_DOM,
  checkout: CHECKOUT_DOM,
  navigation: NAVIGATION_DOM,
};

// ============================================================================
// Vorgefertigte AccessibilityNode-Strukturen
// ============================================================================

const LOGIN_A11Y: AccessibilityNode = {
  role: "form", name: "Login", disabled: false, required: false,
  children: [
    { role: "textbox", name: "E-Mail-Adresse", disabled: false, required: true, children: [] },
    { role: "textbox", name: "Passwort", disabled: false, required: true, children: [] },
    { role: "button", name: "Anmelden", disabled: false, required: false, children: [] },
    { role: "link", name: "Konto erstellen", disabled: false, required: false, children: [] },
  ],
};

const CONTACT_A11Y: AccessibilityNode = {
  role: "form", name: "Kontaktformular", disabled: false, required: false,
  children: [
    { role: "textbox", name: "Vorname", disabled: false, required: true, children: [] },
    { role: "textbox", name: "Nachname", disabled: false, required: true, children: [] },
    { role: "textbox", name: "E-Mail", disabled: false, required: true, children: [] },
    { role: "textbox", name: "Betreff", disabled: false, required: true, children: [] },
    { role: "textbox", name: "Nachricht", disabled: false, required: true, children: [] },
    { role: "button", name: "Nachricht senden", disabled: false, required: false, children: [] },
  ],
};

const SEARCH_A11Y: AccessibilityNode = {
  role: "search", name: "Suchformular", disabled: false, required: false,
  children: [
    { role: "searchbox", name: "Suchbegriff", disabled: false, required: false, children: [] },
    { role: "button", name: "Suchen", disabled: false, required: false, children: [] },
    { role: "list", name: "Suchergebnisse", disabled: false, required: false, children: [
      { role: "link", name: "Ergebnis 1", disabled: false, required: false, children: [] },
      { role: "link", name: "Ergebnis 2", disabled: false, required: false, children: [] },
    ] },
  ],
};

const CHECKOUT_A11Y: AccessibilityNode = {
  role: "form", name: "Kasse", disabled: false, required: false,
  children: [
    { role: "group", name: "Lieferadresse", disabled: false, required: false, children: [
      { role: "textbox", name: "Strasse", disabled: false, required: true, children: [] },
      { role: "textbox", name: "PLZ", disabled: false, required: true, children: [] },
      { role: "textbox", name: "Stadt", disabled: false, required: true, children: [] },
      { role: "combobox", name: "Land", disabled: false, required: true, children: [] },
    ] },
    { role: "group", name: "Zahlungsinformationen", disabled: false, required: false, children: [
      { role: "textbox", name: "Kartennummer", disabled: false, required: true, children: [] },
      { role: "textbox", name: "Ablaufdatum", disabled: false, required: true, children: [] },
      { role: "textbox", name: "CVV", disabled: false, required: true, children: [] },
    ] },
    { role: "button", name: "Kostenpflichtig bestellen", disabled: false, required: false, children: [] },
  ],
};

const NAVIGATION_A11Y: AccessibilityNode = {
  role: "main", name: "Startseite", disabled: false, required: false,
  children: [
    { role: "navigation", name: "Hauptnavigation", disabled: false, required: false, children: [
      { role: "link", name: "Home", disabled: false, required: false, children: [] },
      { role: "link", name: "Produkte", disabled: false, required: false, children: [] },
      { role: "link", name: "Kontakt", disabled: false, required: false, children: [] },
    ] },
  ],
};

const A11Y_MAP: Record<FixtureKey, AccessibilityNode> = {
  login: LOGIN_A11Y,
  contact: CONTACT_A11Y,
  search: SEARCH_A11Y,
  checkout: CHECKOUT_A11Y,
  navigation: NAVIGATION_A11Y,
};

// ============================================================================
// Mock Browser Adapter
// ============================================================================

export class MockBrowserAdapter implements BrowserAdapterInterface {
  private currentFixture: FixtureKey = "navigation";
  readonly navigatedUrls: string[] = [];

  async navigate(url: string): Promise<void> {
    this.currentFixture = resolveFixture(url);
    this.navigatedUrls.push(url);
  }

  async extractDOM(): Promise<DomNode> {
    return structuredClone(DOM_MAP[this.currentFixture]);
  }

  async extractAccessibilityTree(): Promise<AccessibilityNode> {
    return structuredClone(A11Y_MAP[this.currentFixture]);
  }

  async close(): Promise<void> {
    // Kein Cleanup noetig im Mock
  }

  getCurrentFixture(): FixtureKey {
    return this.currentFixture;
  }
}
