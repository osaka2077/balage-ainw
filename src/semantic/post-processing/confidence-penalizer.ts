/**
 * Post-Processing: Confidence-Penalties
 *
 * Bestraft Candidates mit niedrigem DOM-Evidence fuer ihren Typ.
 * Laeuft NACH den Type-Corrections (PHASE 2).
 */

import type { EndpointCandidate } from "../types.js";
import { hasSearchEvidence, hasCartEvidence } from "./type-corrector.js";

// Evidence-Pattern Regexes
const CREDENTIAL_FIELDS = /type="?password|type="?email|autocomplete="?(username|email|current-password)/;
const AUTH_LINKS = /sign[\s_-]?in|log[\s_-]?in|sign[\s_-]?up|register|anmelden|einloggen|konto|account/i;
const COMMERCE_EVIDENCE = /price|product|add.to.cart|buy|purchase|kaufen|in\s*den\s*warenkorb|warenkorb|bestellen|jetzt\s*bestellen|zur\s*kasse|\$|€|£/i;
const CONSENT_EVIDENCE = /cookie|consent|gdpr|privacy|datenschutz|tracking|accept.*all|reject.*all/i;
const SETTINGS_EVIDENCE_TEXT = /toggle|switch|preference|setting|einstellung|theme|dark.?mode/i;
const SETTINGS_EVIDENCE_DOM = /type="?checkbox|type="?radio|role="?switch/i;
const NAV_EVIDENCE = /<nav|role="?navigation|role="?menubar|role="?menu[^i]/i;
const SUPPORT_EVIDENCE = /submit.?a?.?request|contact.?support|help.?center|get.?help|support.?ticket|open.?ticket|live.?chat|kundenservice/i;

/**
 * Berechnet tiers Penalty: starker Abzug bei niedriger Base-Confidence, milder bei hoher.
 */
function tieredPenalty(confidence: number, highFactor: number, lowFactor: number): number {
  return confidence >= 0.7 ? highFactor : lowFactor;
}

/**
 * Wendet Confidence-Penalties auf Candidates an (in-place Mutation).
 *
 * Penalties:
 * 1. Search ohne DOM-Evidence
 * 2. Auth aus Nav-Segment ohne Credential-Fields/Links
 * 3. Checkout ohne Cart-Evidence
 * 4. Commerce ohne Commerce-Evidence
 * 5. Consent ohne Consent-Evidence
 * 6. Settings ohne Settings-Evidence
 * 7. Navigation aus Non-Nav-Segment ohne Nav-Evidence
 */
export function applyConfidencePenalties(
  candidates: EndpointCandidate[],
  segmentText: string,
  segmentType?: string,
): void {
  const segText = segmentText.toLowerCase();
  const searchEv = hasSearchEvidence(segText);
  const cartEv = hasCartEvidence(segText);

  for (const candidate of candidates) {
    // Search without evidence
    if (candidate.type === "search" && !searchEv) {
      candidate.confidence *= 0.55;
    }
    // Auth from nav segment without credential fields
    if (candidate.type === "auth" && segmentType === "navigation" && !CREDENTIAL_FIELDS.test(segText) && !AUTH_LINKS.test(segText)) {
      candidate.confidence *= 0.85;
    }
    // Checkout without cart evidence
    if (candidate.type === "checkout" && !cartEv) {
      candidate.confidence *= 0.55;
    }
    // Commerce without evidence
    if (candidate.type === "commerce" && !COMMERCE_EVIDENCE.test(segText)) {
      candidate.confidence *= tieredPenalty(candidate.confidence, 0.8, 0.6);
    }
    // Consent without evidence
    if (candidate.type === "consent" && !CONSENT_EVIDENCE.test(segText)) {
      candidate.confidence *= tieredPenalty(candidate.confidence, 0.8, 0.6);
    }
    // Settings without evidence
    if (candidate.type === "settings" && !SETTINGS_EVIDENCE_TEXT.test(segText) && !SETTINGS_EVIDENCE_DOM.test(segText)) {
      candidate.confidence *= tieredPenalty(candidate.confidence, 0.8, 0.6);
    }
    // Navigation from non-nav segment without nav evidence
    if (candidate.type === "navigation" && segmentType !== "navigation" && !NAV_EVIDENCE.test(segText)) {
      candidate.confidence *= tieredPenalty(candidate.confidence, 0.8, 0.6);
    }
    // Support without evidence — model over-detects support
    if (candidate.type === "support" && !SUPPORT_EVIDENCE.test(segText)) {
      candidate.confidence *= 0.5;
    }
    // Media without evidence — rarely a real endpoint
    if (candidate.type === "media" && !/video|audio|player|stream|podcast|play.*button/i.test(segText)) {
      candidate.confidence *= 0.5;
    }
    // Social without evidence — share buttons are rarely primary endpoints
    if (candidate.type === "social" && !/share|tweet|facebook|linkedin|social.*button/i.test(segText)) {
      candidate.confidence *= 0.5;
    }
  }
}
