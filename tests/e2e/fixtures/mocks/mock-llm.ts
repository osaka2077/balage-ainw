/**
 * Mock LLM — Deterministische Responses fuer Endpoint-Klassifikation.
 *
 * Kein echter LLM-Call. Basierend auf DOM-Merkmalen wird der Endpoint-Typ abgeleitet.
 */
import type { EndpointType } from "../../../../shared_interfaces.js";

/** Regelbasierte Klassifikation anhand von DOM-Attributen */
export function classifyFixtureEndpoint(
  formAction?: string,
  formRole?: string,
  buttonTexts?: string[],
): { type: EndpointType; confidenceHint: number } {
  // Login-Formular erkennen
  if (formAction?.includes("/login") || formAction?.includes("/auth")) {
    return { type: "auth", confidenceHint: 0.92 };
  }

  // Checkout/Payment erkennen
  if (formAction?.includes("/checkout") || formAction?.includes("/payment")) {
    return { type: "checkout", confidenceHint: 0.88 };
  }

  // Such-Formular erkennen
  if (formRole === "search") {
    return { type: "search", confidenceHint: 0.90 };
  }

  // Kontakt/Allgemeines Formular erkennen
  if (formAction?.includes("/contact") || formRole === "form") {
    return { type: "form", confidenceHint: 0.85 };
  }

  // Navigation erkennen anhand von Button-Texten
  if (buttonTexts?.some((t) => t.toLowerCase().includes("bestellen"))) {
    return { type: "checkout", confidenceHint: 0.88 };
  }

  return { type: "navigation", confidenceHint: 0.80 };
}

/** Deterministische LLM-Response fuer bekannten Fixture-Typ */
export function getMockLLMResponse(fixtureType: string): {
  endpointType: EndpointType;
  confidence: number;
  reasoning: string;
} {
  const responses: Record<string, { endpointType: EndpointType; confidence: number; reasoning: string }> = {
    login: {
      endpointType: "auth",
      confidence: 0.92,
      reasoning: "Form with email and password fields, submit button labeled 'Anmelden'. Authentication endpoint.",
    },
    contact: {
      endpointType: "form",
      confidence: 0.85,
      reasoning: "Contact form with name, email, subject, message fields. Data submission endpoint.",
    },
    search: {
      endpointType: "search",
      confidence: 0.90,
      reasoning: "Search form with search input and results list. Search endpoint.",
    },
    checkout: {
      endpointType: "checkout",
      confidence: 0.88,
      reasoning: "Checkout form with address and payment fields. Financial action endpoint.",
    },
    navigation: {
      endpointType: "navigation",
      confidence: 0.80,
      reasoning: "Navigation links with main content area. Navigation endpoint.",
    },
  };

  return responses[fixtureType] ?? responses["navigation"]!;
}
