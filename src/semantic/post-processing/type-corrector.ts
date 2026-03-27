/**
 * Post-Processing: Type-Corrections
 *
 * Korrigiert LLM-Fehlklassifizierungen basierend auf DOM-Evidence und Labels.
 * Laeuft VOR den Confidence-Penalties (PHASE 1).
 */

import type { EndpointCandidate } from "../types.js";

// Evidence-Pattern Regexes (Modul-Level fuer Performance)
const CART_EVIDENCE = /cart|basket|warenkorb|bag|checkout|einkaufswagen/i;

const SEARCH_EVIDENCE_DOM = /type="?search|role="?search|placeholder="[^"]*search|aria-label="[^"]*search|name="?q"?|name="?query"?|name="?s"?|placeholder="[^"]*such|placeholder="[^"]*find/i;
const SEARCH_EVIDENCE_INPUT = /input.*search|search.*input|searchbar|search-bar|search_bar/i;
const SEARCH_EVIDENCE_BUTTON = /button[^>]*>.*?search|aria-label="[^"]*search|data-testid="[^"]*search|>search<|>suche</i;
const SEARCH_EVIDENCE_ACTION = /action="[^"]*search|action='[^']*search/i;
const SEARCH_EVIDENCE_BOOKING = /check.?in|check.?out|departure|arrival|destination|where.*going|reiseziel|anreise|abreise/i;
const SEARCH_EVIDENCE_GUESTS = /guests?|rooms?|travelers?|passengers?|adults?|children|reisende/i;
const SEARCH_EVIDENCE_METHOD = /method="?get/i;

const BOOKING_STYLE_DATE = /check.?in|departure|arrival/i;
const BOOKING_STYLE_DEST = /destination|where.*going|guests?|rooms?|reiseziel/i;

const CONSENT_LABEL = /cookie|consent|gdpr|privacy|datenschutz|tracking/;
const CONSENT_SEGMENT = /cookie|consent|gdpr|datenschutz|accept\s*all|reject\s*all|alle\s*akzeptieren/i;

const LANGUAGE_LABEL = /language|locale|sprache|idioma|langue/i;
const REAL_SETTINGS_UI = /toggle|switch|checkbox|radio|slider|preference|einstellung/i;

const LINK_EVIDENCE = /<a[\s>]|href=/i;

const SUPPORT_LABEL = /submit.?a?.?request|contact.?support|help.?center|get.?help|kundenservice|hilfe|support.*ticket|open.?ticket|community.?forum|knowledge.?base|faq/i;

const SUPPORT_SEGMENT = /submit.*request|contact.*support|help.*center|get.*help|kundenservice|hilfe|support.*ticket|open.*ticket|community.*forum|knowledge.*base|faq/i;

const SEARCH_LABEL = /search|property|destination|reise|suche|find|lookup|filter|explore/i;

const TRAVEL_LABEL = /\b(accommodat|hotel|flight|booking|reserv|reise|flug|unterkunft|destination|check.?in|check.?out.?date|travel|trip|guest|passenger)/i;
const CART_LABEL_EVIDENCE = /\b(cart|warenkorb|basket|bag|add.to)/i;

/**
 * Prueft ob Segment DOM-Evidence fuer Search enthalt.
 */
export function hasSearchEvidence(segText: string): boolean {
  return SEARCH_EVIDENCE_DOM.test(segText)
    || SEARCH_EVIDENCE_INPUT.test(segText)
    || SEARCH_EVIDENCE_BUTTON.test(segText)
    || SEARCH_EVIDENCE_ACTION.test(segText)
    || SEARCH_EVIDENCE_BOOKING.test(segText)
    || SEARCH_EVIDENCE_GUESTS.test(segText)
    || SEARCH_EVIDENCE_METHOD.test(segText);
}

/**
 * Prueft ob Segment Booking-Style-Search-Pattern hat.
 */
export function isBookingStyleSearch(segText: string): boolean {
  return BOOKING_STYLE_DATE.test(segText) && BOOKING_STYLE_DEST.test(segText);
}

/**
 * Prueft ob Segment Cart/Checkout-Evidence enthalt.
 */
export function hasCartEvidence(segText: string): boolean {
  return CART_EVIDENCE.test(segText);
}

/**
 * Wendet Type-Corrections auf Candidates an (in-place Mutation).
 *
 * Reihenfolge der Regeln:
 * 1. checkout -> search (Booking/Travel ohne Cart via DOM)
 * 2. checkout -> search (Label-basiert ohne Cart)
 * 3. checkout/commerce -> search (Travel/Booking Label ohne Cart)
 * 4. settings -> consent (Cookie/GDPR Keywords)
 * 5. settings -> navigation (Language-Only ohne Settings-UI)
 * 6. content -> navigation (Footer/Header mit Links)
 * 7. navigation/content -> support (Support Keywords in Label oder Segment)
 */
export function applyTypeCorrections(
  candidates: EndpointCandidate[],
  segmentText: string,
  segmentType?: string,
): void {
  const segText = segmentText.toLowerCase();
  const cartEv = hasCartEvidence(segText);
  const searchEv = hasSearchEvidence(segText);
  const bookingSearch = isBookingStyleSearch(segText);

  for (const candidate of candidates) {
    // checkout -> search (Booking/Travel)
    if (candidate.type === "checkout" && !cartEv) {
      if (searchEv || bookingSearch) {
        candidate.type = "search";
      }
    }
    // checkout -> search (label-based)
    if (candidate.type === "checkout") {
      const hasSearchLabel = SEARCH_LABEL.test(
        `${candidate.label} ${candidate.description}`,
      );
      if (hasSearchLabel && !cartEv) {
        candidate.type = "search";
        candidate.confidence *= 0.95;
      }
    }
    // checkout/commerce -> search (Travel/Booking label without cart)
    if (candidate.type === "checkout" || candidate.type === "commerce") {
      const labelDesc = `${candidate.label} ${candidate.description}`;
      const hasTravel = TRAVEL_LABEL.test(labelDesc);
      const hasCartLabel = CART_LABEL_EVIDENCE.test(segText);
      if (hasTravel && !hasCartLabel) {
        candidate.type = "search";
      }
    }
    // settings -> consent
    if (candidate.type === "settings") {
      const candidateText = `${candidate.label} ${candidate.description}`.toLowerCase();
      const hasConsentInLabel = CONSENT_LABEL.test(candidateText);
      const hasConsentInSegment = CONSENT_SEGMENT.test(segText);
      if (hasConsentInLabel || hasConsentInSegment) {
        candidate.type = "consent";
      }
    }
    // settings -> navigation (language-only)
    if (candidate.type === "settings") {
      const isLanguageOnly = LANGUAGE_LABEL.test(
        `${candidate.label} ${candidate.description}`,
      );
      const hasRealSettingsUI = REAL_SETTINGS_UI.test(segText);
      if (isLanguageOnly && !hasRealSettingsUI) {
        candidate.type = "navigation";
        candidate.confidence *= 0.9;
      }
    }
    // content -> navigation (footer/header with links)
    if (candidate.type === "content" && segmentType && ["footer", "header", "navigation"].includes(segmentType)) {
      if (LINK_EVIDENCE.test(segText)) {
        candidate.type = "navigation";
        candidate.confidence *= 0.95;
      }
    }
    // navigation/content -> support (support keywords in label or segment)
    if (candidate.type === "navigation" || candidate.type === "content") {
      const candidateText = `${candidate.label} ${candidate.description}`.toLowerCase();
      const isSupportLabeled = SUPPORT_LABEL.test(candidateText);
      const isSupportSegment = SUPPORT_SEGMENT.test(segText);
      if (isSupportLabeled || isSupportSegment) {
        candidate.type = "support";
        candidate.confidence *= 0.95;
      }
    }
  }
}
