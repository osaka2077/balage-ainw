/**
 * Security Hardening — Input Sanitizer
 * Bereinigt DOM-Inhalte bevor sie an das LLM gesendet werden.
 */

import pino from "pino";
import type { SanitizerConfig, SanitizeResult, DomNode } from "./types.js";

const logger = pino({ name: "security:input-sanitizer" });

const DEFAULT_CONFIG: SanitizerConfig = {
  maxLength: 50_000,
  removeScripts: true,
  removeStyles: true,
  removeEventHandlers: true,
  removeHiddenContent: false,
  removeControlChars: true,
  removeDataUris: true,
};

// ReDoS-sichere Patterns: keine verschachtelten Quantifizierer
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const NOSCRIPT_TAG_RE = /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi;
const STYLE_TAG_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const EVENT_HANDLER_RE =
  /\s+on[a-z]{2,20}\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const CONTROL_CHAR_RE =
  /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD\u034F\u180E]/g;
const DATA_URI_SCRIPT_RE =
  /data:\s*(?:text\/html|image\/svg\+xml)[^"'\s>]*/gi;
const HIDDEN_STYLE_RE =
  /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?(?:\s|;|"|$)|font-size\s*:\s*0(?:px|em|rem)?(?:\s|;|"|$))/gi;

export class InputSanitizer {
  private readonly config: SanitizerConfig;

  constructor(config: Partial<SanitizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  sanitize(input: string): SanitizeResult {
    const originalLength = input.length;
    let text = input;
    const removedElements: SanitizeResult["removedElements"] = [];

    // Laengenlimit als ReDoS-Schutz
    if (text.length > this.config.maxLength * 2) {
      text = text.slice(0, this.config.maxLength * 2);
    }

    // Script-Tags entfernen
    if (this.config.removeScripts) {
      const scriptCount =
        (text.match(SCRIPT_TAG_RE)?.length ?? 0) +
        (text.match(NOSCRIPT_TAG_RE)?.length ?? 0);
      if (scriptCount > 0) {
        text = text.replace(SCRIPT_TAG_RE, "");
        text = text.replace(NOSCRIPT_TAG_RE, "");
        removedElements.push({ type: "script", count: scriptCount });
      }
    }

    // Style-Tags entfernen
    if (this.config.removeStyles) {
      const styleMatches = text.match(STYLE_TAG_RE);
      if (styleMatches && styleMatches.length > 0) {
        text = text.replace(STYLE_TAG_RE, "");
        removedElements.push({ type: "style", count: styleMatches.length });
      }
    }

    // Event-Handler entfernen
    if (this.config.removeEventHandlers) {
      const eventMatches = text.match(EVENT_HANDLER_RE);
      if (eventMatches && eventMatches.length > 0) {
        text = text.replace(EVENT_HANDLER_RE, "");
        removedElements.push({
          type: "event_handler",
          count: eventMatches.length,
        });
      }
    }

    // Unsichtbare Zeichen entfernen
    if (this.config.removeControlChars) {
      const controlMatches = text.match(CONTROL_CHAR_RE);
      if (controlMatches && controlMatches.length > 0) {
        text = text.replace(CONTROL_CHAR_RE, "");
        removedElements.push({
          type: "control_char",
          count: controlMatches.length,
        });
      }
    }

    // Data-URIs mit Script-Inhalten entfernen
    if (this.config.removeDataUris) {
      const dataUriMatches = text.match(DATA_URI_SCRIPT_RE);
      if (dataUriMatches && dataUriMatches.length > 0) {
        text = text.replace(DATA_URI_SCRIPT_RE, "[DATA_URI_REMOVED]");
        removedElements.push({
          type: "data_uri",
          count: dataUriMatches.length,
        });
      }
    }

    // Hidden Content markieren (nicht entfernen)
    if (!this.config.removeHiddenContent) {
      const hiddenMatches = text.match(HIDDEN_STYLE_RE);
      if (hiddenMatches && hiddenMatches.length > 0) {
        removedElements.push({
          type: "hidden_content",
          count: hiddenMatches.length,
          details: "marked",
        });
      }
    }

    // Laenge begrenzen
    let wasTruncated = false;
    if (text.length > this.config.maxLength) {
      text = text.slice(0, this.config.maxLength);
      wasTruncated = true;
    }

    if (removedElements.length > 0) {
      logger.info(
        {
          removedCount: removedElements.length,
          types: removedElements.map((e) => e.type),
        },
        "Sanitized input",
      );
    }

    return {
      sanitized: text,
      removedElements,
      originalLength,
      sanitizedLength: text.length,
      wasTruncated,
    };
  }

  sanitizeDomNode(node: DomNode): DomNode {
    const tagLower = node.tagName.toLowerCase();

    // Script/Noscript-Knoten leeren
    if (
      this.config.removeScripts &&
      (tagLower === "script" || tagLower === "noscript")
    ) {
      return { ...node, textContent: "", attributes: {}, children: [] };
    }

    // Style-Knoten leeren
    if (this.config.removeStyles && tagLower === "style") {
      return { ...node, textContent: "", attributes: {}, children: [] };
    }

    // Textinhalt sanitizen
    const sanitizedText = node.textContent
      ? this.sanitize(node.textContent).sanitized
      : undefined;

    // Event-Handler und Data-URIs aus Attributen entfernen
    const sanitizedAttributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(node.attributes)) {
      if (this.config.removeEventHandlers && /^on[a-z]/i.test(key)) {
        continue;
      }
      if (this.config.removeDataUris && DATA_URI_SCRIPT_RE.test(value)) {
        DATA_URI_SCRIPT_RE.lastIndex = 0;
        continue;
      }
      sanitizedAttributes[key] = value;
    }

    // Unsichtbare Knoten markieren (nicht entfernen)
    const isHidden =
      node.computedStyles &&
      (node.computedStyles.display === "none" ||
        node.computedStyles.visibility === "hidden" ||
        node.computedStyles.opacity === 0);
    const processedText =
      isHidden && sanitizedText
        ? `[HIDDEN_CONTENT] ${sanitizedText}`
        : sanitizedText;

    // Kinder rekursiv sanitizen
    const sanitizedChildren = node.children.map((child) =>
      this.sanitizeDomNode(child),
    );

    return {
      ...node,
      textContent: processedText,
      attributes: sanitizedAttributes,
      children: sanitizedChildren,
    };
  }

  /**
   * Entfernt HTML-Kommentare aus einem String (FC-020).
   *
   * Security-first: ALLE Kommentare werden entfernt, auch harmlose wie
   * `<!-- copyright 2024 -->`, weil Kommentare ein Injection-Vektor sind
   * (z.B. `<!-- ignore previous instructions -->`).
   */
  stripHtmlComments(html: string): string {
    HTML_COMMENT_RE.lastIndex = 0;
    const matches = html.match(HTML_COMMENT_RE);
    if (!matches || matches.length === 0) {
      return html;
    }
    logger.info(
      { count: matches.length },
      "Stripped HTML comments",
    );
    return html.replace(HTML_COMMENT_RE, "");
  }

  sanitizeForLLM(input: string): string {
    // FC-020: HTML-Kommentare VOR allem anderen entfernen
    let text = this.stripHtmlComments(input);

    const result = this.sanitize(text);
    text = result.sanitized;

    // Verdaechtige Code-Bloecke die wie Prompt Injections aussehen markieren
    text = text.replace(
      /```(?:system|user|assistant)\b[^`]*```/gi,
      "[SUSPICIOUS_CODE_BLOCK_REMOVED]",
    );

    // LLM-Context-Limit (konservativ)
    const llmLimit = Math.min(this.config.maxLength, 30_000);
    if (text.length > llmLimit) {
      text = text.slice(0, llmLimit);
    }

    return text;
  }
}
