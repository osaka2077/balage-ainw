/**
 * Markdown-Context fuer LLM-Prompt (FC-018)
 *
 * Content-aware Markdown-Summarization und regelbasierte Page-Type-Klassifikation.
 * Wird nur aktiviert wenn BALAGE_MARKDOWN_CONTEXT=1 gesetzt ist.
 *
 * Design-Entscheidungen:
 * - Token-basiertes Limit (500 Tokens ≈ 2000 Chars), nicht starres Char-Limit
 * - Priorisierung: Headings > interaktive Keywords > erste Paragraphen
 * - Footer/Navigation-Links werden ignoriert
 * - Regelbasierter Page-Type-Classifier (kein ML, deterministisch)
 */

import pino from "pino";

const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "silent",
  name: "semantic:markdown-context",
});

// ============================================================================
// Feature-Flag
// ============================================================================

export function isMarkdownContextEnabled(): boolean {
  return process.env["BALAGE_MARKDOWN_CONTEXT"] === "1";
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Grobe Token-Schaetzung: ~4 Chars pro Token (GPT/Claude Durchschnitt fuer Englisch).
 * Fuer ein Limit-Feature reicht eine Approximation — wir brauchen kein tiktoken.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function charsForTokens(tokens: number): number {
  return tokens * 4;
}

// ============================================================================
// Markdown Summary Extraction
// ============================================================================

/** Interaktive Keywords die auf relevante UI-Bereiche hindeuten. */
const INTERACTIVE_KEYWORDS =
  /\b(login|sign[- ]?in|sign[- ]?up|register|search|cart|checkout|add to cart|buy|subscribe|download|upload|submit|contact|pricing|free trial|get started|book|reserve|order)\b/i;

/** Patterns die auf Footer/Navigation-Boilerplate hindeuten. */
const FOOTER_NAV_PATTERNS =
  /^(?:\s*[-*]\s*\[.*?\]\(.*?\)\s*$)|(?:^\s*(?:privacy|terms|imprint|impressum|sitemap|cookie|copyright)\b)|(?:©\s*\d{4})/im;

/** Line ist wahrscheinlich ein Heading. */
function isHeading(line: string): boolean {
  return /^#{1,4}\s+\S/.test(line);
}

/** Line ist ein leerer Block oder nur Whitespace. */
function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** Line sieht nach Footer/Nav-Boilerplate aus. */
function isFooterOrNavLink(line: string): boolean {
  return FOOTER_NAV_PATTERNS.test(line);
}

/** Line enthaelt interaktive Keywords. */
function hasInteractiveKeyword(line: string): boolean {
  return INTERACTIVE_KEYWORDS.test(line);
}

interface ScoredLine {
  text: string;
  score: number;
  index: number;
}

/**
 * Extrahiert eine content-aware Zusammenfassung aus Markdown.
 *
 * Strategie:
 * 1. Parse Markdown zeilenweise
 * 2. Score jede Zeile: Headings > interaktive Keywords > erste Paragraphen
 * 3. Ignoriere Footer/Navigation-Links
 * 4. Nehme die besten Zeilen bis max 500 Tokens
 *
 * @param markdown - Rohes Markdown von Firecrawl
 * @param maxTokens - Max Token-Limit fuer die Summary (default: 500)
 * @returns Gekuerzte Markdown-Summary
 */
export function extractMarkdownSummary(
  markdown: string,
  maxTokens: number = 500,
): string {
  if (!markdown || markdown.trim().length === 0) {
    return "";
  }

  const lines = markdown.split("\n");
  const scored: ScoredLine[] = [];
  let lastHeadingIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Skip leere Zeilen und Footer/Nav-Boilerplate
    if (isBlank(line)) continue;
    if (isFooterOrNavLink(line)) continue;

    let score = 0;

    // Headings bekommen hoechste Prioritaet
    if (isHeading(line)) {
      score = 100;
      lastHeadingIdx = i;
    }
    // Paragraphen direkt nach Headings sind wichtig
    else if (lastHeadingIdx >= 0 && i - lastHeadingIdx <= 2) {
      score = 80;
    }
    // Zeilen mit interaktiven Keywords
    else if (hasInteractiveKeyword(line)) {
      score = 70;
    }
    // Fruehe Zeilen (erste 20% des Dokuments) sind relevanter
    else if (i < lines.length * 0.2) {
      score = 40;
    }
    // Rest
    else {
      score = 10;
    }

    scored.push({ text: line, score, index: i });
  }

  // Sortiere nach Score (hoch → niedrig), bei Gleichstand nach Position (frueh → spaet)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  // Nehme Zeilen bis Token-Limit erreicht
  const maxChars = charsForTokens(maxTokens);
  const selected: ScoredLine[] = [];
  let totalChars = 0;

  for (const line of scored) {
    const lineChars = line.text.length + 1; // +1 fuer Newline
    if (totalChars + lineChars > maxChars) {
      // Wenn noch nichts drin ist, nehme wenigstens eine gekuerzte Zeile
      if (selected.length === 0) {
        selected.push({
          ...line,
          text: line.text.slice(0, maxChars),
        });
      }
      break;
    }
    selected.push(line);
    totalChars += lineChars;
  }

  // Sortiere zurueck in Original-Reihenfolge fuer lesbares Output
  selected.sort((a, b) => a.index - b.index);

  const summary = selected.map((l) => l.text).join("\n");

  logger.debug(
    {
      inputLines: lines.length,
      selectedLines: selected.length,
      estimatedTokens: estimateTokens(summary),
    },
    "Markdown summary extracted",
  );

  return summary;
}

// ============================================================================
// Page-Type Classifier (regelbasiert)
// ============================================================================

/** Page-Type-Definition mit Keywords und Gewichtung. */
interface PageTypeRule {
  type: string;
  /** Keywords die auf diesen Typ hindeuten (case-insensitive). */
  keywords: RegExp;
  /** Mindest-Anzahl Matches fuer Klassifikation. */
  minMatches: number;
}

const PAGE_TYPE_RULES: PageTypeRule[] = [
  {
    type: "login-page",
    keywords:
      /\b(sign[- ]?in|log[- ]?in|password|sso|single sign[- ]?on|forgot password|reset password|authentication)\b/gi,
    minMatches: 2,
  },
  {
    type: "e-commerce",
    keywords:
      /\b(add to cart|price|€|\$|£|product|shop|buy now|checkout|wishlist|warenkorb|in den warenkorb|produktkatalog)\b/gi,
    minMatches: 2,
  },
  {
    type: "travel",
    keywords:
      /\b(check[- ]?in|check[- ]?out|destination|flight|hotel|booking|travel|reservation|departure|arrival|passenger)\b/gi,
    minMatches: 2,
  },
  {
    type: "saas",
    keywords:
      /\b(pricing|free trial|dashboard|workspace|plan|enterprise|subscribe|monthly|annual|feature|integration)\b/gi,
    minMatches: 2,
  },
  {
    type: "documentation",
    keywords:
      /\b(api reference|getting started|installation|quickstart|documentation|tutorial|guide|sdk|endpoint|parameter|response)\b/gi,
    minMatches: 2,
  },
  {
    type: "news",
    keywords:
      /\b(published|author|article|breaking|headline|editorial|opinion|reporter|journalist|byline)\b/gi,
    minMatches: 2,
  },
];

/**
 * Regelbasierte Page-Type-Klassifikation.
 *
 * Kein ML, nur Keyword-Matching mit Schwellwerten.
 * Deterministisch und kostenlos.
 *
 * @param markdown - Markdown-Content der Seite
 * @returns Page-Type-String (z.B. "e-commerce", "login-page", "generic")
 */
export function classifyPageType(markdown: string): string {
  if (!markdown || markdown.trim().length === 0) {
    return "generic";
  }

  const text = markdown.toLowerCase();
  let bestType = "generic";
  let bestScore = 0;

  for (const rule of PAGE_TYPE_RULES) {
    // Reset lastIndex fuer globale RegExp
    rule.keywords.lastIndex = 0;
    const matches = text.match(rule.keywords);
    const matchCount = matches?.length ?? 0;

    if (matchCount >= rule.minMatches && matchCount > bestScore) {
      bestScore = matchCount;
      bestType = rule.type;
    }
  }

  logger.debug({ pageType: bestType, bestScore }, "Page type classified");

  return bestType;
}
