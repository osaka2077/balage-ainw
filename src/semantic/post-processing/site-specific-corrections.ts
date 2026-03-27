/**
 * Post-Processing: Site-Specific Corrections
 *
 * Zusaetzliche Type-Corrections die NACH der generischen type-corrector.ts laufen.
 * Behandelt bekannte Fehlklassifizierungen auf spezifischen Site-Patterns:
 *
 * - Booking.com: checkout -> search (Travel-Search ohne echte Cart-Evidence)
 * - Booking.com: settings -> consent (OneTrust/CookieLaw im Segment)
 * - Zendesk: auth -> support (Support-Labels ohne Auth-Feld-Evidence)
 *
 * Separate Datei um Konflikte mit parallel laufenden Agenten zu vermeiden.
 */

import type { EndpointCandidate } from "../types.js";

// ============================================================================
// Regexes
// ============================================================================

/** Labels die eindeutig Support-Endpoints bezeichnen (nicht nur navigation) */
const STRONG_SUPPORT_LABEL = /submit.?a?.?request|contact.?support|open.?ticket|support.*ticket|anfrage.?einreichen/i;

/** Auth-Evidence: Felder die nur auf echten Auth-Endpoints vorhanden sind */
const AUTH_FIELD_EVIDENCE = /type="?password|type="?email|autocomplete="?(username|email|current-password|new-password)/i;

/** OneTrust/CookieLaw Consent-Evidence (haeufig nur als CSS/Script im HTML) */
const ONETRUST_EVIDENCE = /onetrust|cookielaw|cookie.?consent|ot-sdk-cookie/i;

/** Consent-Label-Pattern */
const CONSENT_LABEL_PATTERN = /cookie|consent|gdpr|privacy|datenschutz|tracking/i;

/**
 * Travel-Label das faelschlich als checkout erkannt wird
 * (Booking.com "Accommodation Search" als checkout statt search)
 */
const TRAVEL_SEARCH_LABEL = /\b(accommodat|hotel|flight|booking|reserv|reise|flug|unterkunft|destination|check.?in|check.?out.?date|travel|trip|guest|passenger)/i;

/**
 * Echte Cart-Evidence (praeziser als der generische Check)
 * "bag" allein reicht NICHT — muss im Kontext "shopping bag" oder "add to bag" stehen.
 * "checkout" allein reicht NICHT — muss "checkout form" sein.
 */
const PRECISE_CART_EVIDENCE = /\bcart\b|basket|warenkorb|shopping.?bag|add.to.bag|add.to.cart|add.to.basket|checkout.?form|einkaufswagen|zur.?kasse/i;

/** Deutsche Support-Patterns */
const GERMAN_SUPPORT_LABEL = /anfrage.?einreichen|kundenservice|hilfe.?center|kontakt.?support/i;

// ============================================================================
// Main Function
// ============================================================================

/**
 * Wendet site-spezifische Korrekturen an (in-place Mutation).
 * Laeuft NACH applyTypeCorrections().
 *
 * Regeln:
 * 1. auth -> support (starkes Support-Label ohne Auth-Felder)
 * 2. checkout -> search (Travel-Label ohne praezise Cart-Evidence)
 * 3. settings/navigation -> consent (OneTrust/CookieLaw Evidence)
 * 4. navigation/content -> support (Deutsche Support-Patterns)
 */
export function applySiteSpecificCorrections(
  candidates: EndpointCandidate[],
  segmentText: string,
): void {
  const segText = segmentText.toLowerCase();
  const hasAuthFields = AUTH_FIELD_EVIDENCE.test(segText);
  const hasPreciseCart = PRECISE_CART_EVIDENCE.test(segText);
  const hasOnetrust = ONETRUST_EVIDENCE.test(segText);

  for (const candidate of candidates) {
    // Rule 1: auth -> support (Zendesk-Pattern)
    // Nav-Segment mit Sign-In + Support-Links wird als auth erkannt,
    // aber der Candidate-Label zeigt eindeutig einen Support-Endpoint.
    if (candidate.type === "auth" && !hasAuthFields) {
      const candidateText = `${candidate.label} ${candidate.description}`.toLowerCase();
      if (STRONG_SUPPORT_LABEL.test(candidateText)) {
        candidate.type = "support";
        candidate.confidence *= 0.90;
      }
    }

    // Rule 2: checkout -> search (Booking.com Travel-Search-Pattern)
    // Das LLM erkennt "Accommodation Search" als checkout.
    // Die generische type-corrector wird durch false-positive Cart-Evidence blockiert
    // (z.B. "bag" in CSS-Klassen). Wir nutzen praezisere Cart-Erkennung.
    if (candidate.type === "checkout" && !hasPreciseCart) {
      const labelDesc = `${candidate.label} ${candidate.description}`;
      if (TRAVEL_SEARCH_LABEL.test(labelDesc)) {
        candidate.type = "search";
        candidate.confidence *= 0.95;
      }
    }

    // Rule 3: settings/navigation -> consent (OneTrust Pattern)
    // Booking.com hat OneTrust-Consent-Banner die vom LLM als "settings" erkannt werden.
    if ((candidate.type === "settings" || candidate.type === "navigation") && hasOnetrust) {
      const candidateText = `${candidate.label} ${candidate.description}`.toLowerCase();
      if (CONSENT_LABEL_PATTERN.test(candidateText)) {
        candidate.type = "consent";
      }
    }

    // Rule 4: navigation/content -> support (Deutsche Patterns)
    // Zendesk DE hat "Anfrage einreichen" statt "Submit a Request"
    if (candidate.type === "navigation" || candidate.type === "content") {
      const candidateText = `${candidate.label} ${candidate.description}`.toLowerCase();
      if (GERMAN_SUPPORT_LABEL.test(candidateText)) {
        candidate.type = "support";
        candidate.confidence *= 0.95;
      }
    }
  }
}
