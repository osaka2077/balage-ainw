/**
 * Post-Processing: Deduplizierung
 *
 * Entfernt doppelte Candidates in 4 Passes:
 * 1. Label-Dedup: Gleicher Typ + labelSimilarity > 0.65 → hoechste Confidence
 * 2. Anchor-Overlap-Dedup: Gleicher Typ + ueberlappende Selectors/TextContent/AriaLabels
 *    → erkennt Cross-Segment Duplikate die Label-Dedup verpasst (z.B. "Sign In Form" vs "Account Login"
 *    die denselben physischen Button beschreiben)
 * 3. Commerce-Dedup: Mehrere "Add to Cart" = 1 Endpoint
 * 4. Per-Type-Cap: Max Anzahl pro Typ
 */

import type { EndpointCandidate } from "../types.js";

/** Commerce-Action-Pattern fuer Dedup */
const COMMERCE_ACTION_PATTERN = /add to cart|add to bag|in den warenkorb|zum warenkorb/i;

/** Synonym-Map: normalisiert gaengige Label-Varianten vor dem Vergleich */
const LABEL_SYNONYMS: Record<string, string> = {
  "login": "sign in",
  "log in": "sign in",
  "anmelden": "sign in",
  "einloggen": "sign in",
  "register": "sign up",
  "create account": "sign up",
  "registrieren": "sign up",
  "konto erstellen": "sign up",
  "shopping cart": "cart",
  "warenkorb": "cart",
  "basket": "cart",
  "einkaufswagen": "cart",
  "suche": "search",
  "hilfe": "help",
  "kontakt": "contact",
};

/**
 * Per-type cap: differenzierte Limits pro Typ.
 *
 * navigation: 4 → 3 — Die meisten Sites haben 1-2 echte Navigation-Endpoints.
 *   Cap 4 liess zu viele durch, besonders auf Login-Pages (GitHub P=25%, GitLab P=20%).
 * content: 3 → 2 — Content-Endpoints sind selten primaere Interaktionspunkte.
 *   Cap 3 erlaubte Over-Detection bei content-lastigen Sites.
 */
const TYPE_CAPS: Record<string, number> = {
  navigation: 3,
  auth: 4,
  search: 1,
  commerce: 2,
  checkout: 1,
  consent: 1,
  settings: 2,
  support: 2,
  content: 2,
  media: 2,
  social: 1,
  form: 2,
};

/**
 * Berechnet Jaccard-aehnliche Wort-Similarity zwischen zwei Labels.
 *
 * Wird auch extern benoetigt (z.B. Benchmark-Matching).
 */
/** Normalisiert einen Label-String: Synonyme ersetzen, Kleinbuchstaben, Wort-Set */
function normalizeLabel(label: string): Set<string> {
  let normalized = label.toLowerCase();
  // Laengere Synonyme zuerst ersetzen (multi-word vor single-word)
  const sortedSynonyms = Object.entries(LABEL_SYNONYMS)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sortedSynonyms) {
    normalized = normalized.replaceAll(from, to);
  }
  return new Set(normalized.split(/\s+/).filter(Boolean));
}

/**
 * Generische DOM-Selektoren die keinen Informationsgehalt fuer Dedup haben.
 * Wenn ein Anchor NUR aus einem dieser Selektoren besteht, wird er ignoriert.
 */
const GENERIC_SELECTORS = new Set([
  "div", "span", "button", "a", "li", "ul", "ol", "nav", "form",
  "section", "article", "header", "footer", "main", "aside", "p",
  "h1", "h2", "h3", "h4", "h5", "h6", "input", "select", "textarea",
  "label", "img", "table", "tr", "td", "th",
]);

/**
 * Prueft ob zwei Anchor-Strings ueberlappen (Substring-Match).
 *
 * Normalisiert beide auf Kleinbuchstaben und trimmt Whitespace.
 * Leere Strings matchen NICHT (vermeidet false positives bei fehlenden Anchors).
 * Minimum-Laenge: 4 Zeichen — verhindert Matches auf kurze Fragmente.
 * Generische Selektoren (div, span, button, etc.) werden ignoriert —
 * sie haben keinen Informationsgehalt fuer Cross-Segment Dedup.
 */
function anchorSubstringMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();
  if (normA.length < 4 || normB.length < 4) return false;
  // Generische Selektoren haben keinen Dedup-Wert
  if (GENERIC_SELECTORS.has(normA) || GENERIC_SELECTORS.has(normB)) return false;
  return normA.includes(normB) || normB.includes(normA);
}

/**
 * Prueft ob zwei Candidates ueberlappende Anchors haben.
 *
 * Ein Overlap liegt vor wenn mindestens ein Anchor-Paar in IRGENDEINEM Feld
 * (selector, textContent, ariaLabel) einen Substring-Match hat.
 *
 * Beispiele die matchen:
 * - selector: "a[href*='login']" vs "a[href='/login']" → Substring
 * - textContent: "Sign In" vs "Sign In / Register" → Substring
 * - ariaLabel: "Login button" vs "Login button - account" → Substring
 */
function hasAnchorOverlap(candidateA: EndpointCandidate, candidateB: EndpointCandidate): boolean {
  for (const anchorA of candidateA.anchors) {
    for (const anchorB of candidateB.anchors) {
      // Selector-Match
      if (anchorSubstringMatch(anchorA.selector, anchorB.selector)) return true;
      // TextContent-Match
      if (anchorSubstringMatch(anchorA.textContent, anchorB.textContent)) return true;
      // AriaLabel-Match
      if (anchorSubstringMatch(anchorA.ariaLabel, anchorB.ariaLabel)) return true;
    }
  }
  return false;
}

export function labelSimilarity(a: string, b: string): number {
  const wordsA = normalizeLabel(a);
  const wordsB = normalizeLabel(b);

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/**
 * Dedupliziert Candidates in 4 Passes.
 *
 * Schritte:
 * 1. Label-Dedup: Gleicher Typ + labelSimilarity > 0.65 → behalte hoechste Confidence
 * 2. Anchor-Overlap-Dedup: Gleicher Typ + ueberlappende Selectors/TextContent/AriaLabels
 *    → erkennt Cross-Segment Duplikate (z.B. gleicher Login-Button in Header + Modal)
 * 3. Commerce-Dedup: Mehrere "Add to Cart" = 1 Endpoint
 * 4. Per-Type-Cap: Max Anzahl pro Typ begrenzt
 */
export function deduplicateCandidates(
  candidates: EndpointCandidate[],
): EndpointCandidate[] {
  const result: EndpointCandidate[] = [];

  // 1. Fuzzy-Dedup
  for (const candidate of candidates) {
    const duplicate = result.find(
      (existing) =>
        existing.type === candidate.type &&
        labelSimilarity(existing.label, candidate.label) > 0.65,
    );

    if (duplicate) {
      // Behalte den mit hoeherer Confidence
      if (candidate.confidence > duplicate.confidence) {
        const idx = result.indexOf(duplicate);
        result[idx] = candidate;
      }
    } else {
      result.push(candidate);
    }
  }

  // 2. Anchor-Overlap-Dedup: Cross-Segment Duplikate erkennen
  //    Wenn zwei Candidates gleichen Typs ueberlappende Anchors haben (gleicher
  //    physischer Button/Link), behalte den mit hoeherer Confidence.
  //    Laeuft NACH Label-Dedup, findet also nur was Label-Dedup verpasst hat.
  const anchorDeduped: EndpointCandidate[] = [];
  for (const candidate of result) {
    const duplicate = anchorDeduped.find(
      (existing) =>
        existing.type === candidate.type &&
        hasAnchorOverlap(existing, candidate),
    );

    if (duplicate) {
      // Behalte den mit hoeherer Confidence
      if (candidate.confidence > duplicate.confidence) {
        const idx = anchorDeduped.indexOf(duplicate);
        anchorDeduped[idx] = candidate;
      }
    } else {
      anchorDeduped.push(candidate);
    }
  }

  // 3. Commerce-Dedup: Mehrere "Add to Cart" = 1 Endpoint
  const commerceDeduped = anchorDeduped.filter((candidate, index) => {
    if (candidate.type === "commerce" || candidate.type === "checkout") {
      if (COMMERCE_ACTION_PATTERN.test(candidate.label)) {
        const firstCommerce = anchorDeduped.findIndex(
          c => (c.type === "commerce" || c.type === "checkout") && COMMERCE_ACTION_PATTERN.test(c.label),
        );
        return index === firstCommerce;
      }
    }
    return true;
  });

  // 4. Per-type cap
  const typeCount = new Map<string, number>();
  return commerceDeduped.filter((c) => {
    const count = typeCount.get(c.type) ?? 0;
    if (count >= (TYPE_CAPS[c.type] ?? 2)) return false;
    typeCount.set(c.type, count + 1);
    return true;
  });
}
