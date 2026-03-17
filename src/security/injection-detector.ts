/**
 * Security Hardening — Injection Detector
 * Erkennt Prompt Injection Versuche in DOM-Inhalten.
 */

import pino from "pino";
import type {
  InjectionDetectorConfig,
  InjectionDetectionResult,
  InjectionPattern,
} from "./types.js";

const logger = pino({ name: "security:injection-detector" });

const MAX_MATCHED_TEXT_LENGTH = 100;

const DEFAULT_CONFIG: InjectionDetectorConfig = {
  sensitivity: "medium",
  customPatterns: [],
  maxInputLength: 100_000,
};

// Vordefinierte Injection Patterns — alle ReDoS-sicher
const BUILTIN_PATTERNS: InjectionPattern[] = [
  {
    name: "ignore_instructions",
    pattern:
      /ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions/i,
    severity: 0.9,
    description: "Attempt to ignore previous instructions",
    category: "instruction_override",
  },
  {
    name: "disregard_instructions",
    pattern:
      /(?:disregard|forget|override|bypass)\s+(?:all\s+)?(?:previous|prior|above|your)\s+(?:instructions|rules|guidelines)/i,
    severity: 0.9,
    description: "Attempt to disregard/override instructions",
    category: "instruction_override",
  },
  {
    name: "do_not_follow",
    pattern:
      /do\s+not\s+follow\s+(?:the\s+)?(?:previous|above|prior|original)\s+(?:instructions|rules)/i,
    severity: 0.85,
    description: "Attempt to stop following instructions",
    category: "instruction_override",
  },
  {
    name: "you_are_now",
    pattern: /you\s+are\s+now\s+(?:a|an|the)\s+/i,
    severity: 0.7,
    description: "Role hijack: you are now...",
    category: "role_hijack",
  },
  {
    name: "act_as",
    pattern:
      /(?:act|behave|respond|function)\s+as\s+(?:a|an|if\s+you\s+were)\s+/i,
    severity: 0.7,
    description: "Role hijack: act as...",
    category: "role_hijack",
  },
  {
    name: "pretend_to_be",
    pattern: /pretend\s+(?:to\s+be|you\s+are|that\s+you)/i,
    severity: 0.7,
    description: "Role hijack: pretend to be...",
    category: "role_hijack",
  },
  {
    name: "system_delimiter",
    pattern:
      /(?:<\|im_start\|>|\[INST\]|\[\/INST\]|<\|system\|>|<\|user\|>|<\|assistant\|>)/i,
    severity: 0.95,
    description: "Prompt delimiter injection",
    category: "delimiter_injection",
  },
  {
    name: "new_instruction",
    pattern:
      /(?:new|updated|revised|additional)\s+(?:system\s+)?instruction(?:s)?\s*:/i,
    severity: 0.85,
    description: "New instruction injection",
    category: "instruction_override",
  },
  {
    name: "repeat_after_me",
    pattern:
      /(?:repeat\s+after\s+me|say\s+exactly|output\s+exactly|print\s+exactly)/i,
    severity: 0.75,
    description: "Output manipulation: repeat/say exactly",
    category: "output_manipulation",
  },
  {
    name: "base64_attack",
    pattern: /(?:atob|btoa|base64_decode|base64\.b64decode)\s*\(/i,
    severity: 0.6,
    description: "Base64 encoding attack",
    category: "encoding_attack",
  },
  {
    name: "unicode_bidi_override",
    pattern: /[\u202A-\u202E\u2066-\u2069]/,
    severity: 0.8,
    description: "Unicode bidirectional override",
    category: "unicode_trick",
  },
  {
    name: "admin_instruction",
    pattern:
      /(?:the\s+)?(?:following|this)\s+is\s+a\s+(?:new|special|secret|hidden)\s+(?:instruction|command|directive)\s+from\s+(?:the\s+)?(?:admin|administrator|system|developer)/i,
    severity: 0.65,
    description: "Fake admin instruction",
    category: "instruction_override",
  },
];

export class InjectionDetector {
  private readonly config: InjectionDetectorConfig;
  private readonly patterns: InjectionPattern[];

  constructor(config: Partial<InjectionDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patterns = [...BUILTIN_PATTERNS, ...this.config.customPatterns];
  }

  detect(input: string): InjectionDetectionResult {
    // Laengenlimit
    const text =
      input.length > this.config.maxInputLength
        ? input.slice(0, this.config.maxInputLength)
        : input;

    const matches: InjectionDetectionResult["matches"] = [];
    let maxScore = 0;

    // Pattern Matching
    for (const pattern of this.patterns) {
      pattern.pattern.lastIndex = 0;
      const match = pattern.pattern.exec(text);
      if (match) {
        const matchedText = match[0].slice(0, MAX_MATCHED_TEXT_LENGTH);
        const severity = this.adjustSeverity(pattern.severity);
        matches.push({
          pattern: pattern.name,
          position: match.index,
          matchedText,
          confidence: severity,
        });
        maxScore = Math.max(maxScore, severity);
      }
    }

    // Heuristische Erkennung
    const heuristicScore = this.runHeuristics(text);
    maxScore = Math.max(maxScore, heuristicScore);

    // Score: mehrere Matches erhoehen den Score leicht
    const score =
      matches.length > 1
        ? Math.min(1.0, maxScore + (matches.length - 1) * 0.05)
        : maxScore;

    const verdict = this.getVerdict(score);
    const recommendation = this.getRecommendation(verdict);

    if (verdict !== "clean") {
      logger.warn(
        { score, matchCount: matches.length, verdict },
        "Injection detection result",
      );
    }

    return {
      isClean: verdict === "clean",
      score,
      verdict,
      matches,
      recommendation,
    };
  }

  addPattern(pattern: InjectionPattern): void {
    this.patterns.push(pattern);
  }

  getPatterns(): InjectionPattern[] {
    return [...this.patterns];
  }

  private adjustSeverity(baseSeverity: number): number {
    const multiplier =
      this.config.sensitivity === "high"
        ? 1.2
        : this.config.sensitivity === "low"
          ? 0.7
          : 1.0;
    return Math.min(1.0, baseSeverity * multiplier);
  }

  private runHeuristics(text: string): number {
    let score = 0;

    // Langer versteckter Text (> 500 Zeichen in hidden Elements)
    if (/\[HIDDEN_CONTENT\]\s*.{500,}/.test(text)) {
      score = Math.max(score, 0.5);
    }

    // LLM-Prompt-Syntax (system/user/assistant Marker)
    const promptSyntaxCount = (
      text.match(/(?:^|\n)\s*(?:system|user|assistant)\s*:/gi) ?? []
    ).length;
    if (promptSyntaxCount >= 2) {
      score = Math.max(score, 0.6);
    }

    // Viele Imperativ-Saetze
    const imperativeCount = (
      text.match(
        /(?:^|\.\s+)(?:do|don't|never|always|must|shall|output|print|write|ignore|forget)\s+/gi,
      ) ?? []
    ).length;
    if (imperativeCount >= 3) {
      score = Math.max(score, 0.4);
    }

    return score;
  }

  private getVerdict(
    score: number,
  ): InjectionDetectionResult["verdict"] {
    if (score > 0.8) return "blocked";
    if (score > 0.6) return "suspicious";
    if (score > 0.3) return "warning";
    return "clean";
  }

  private getRecommendation(
    verdict: InjectionDetectionResult["verdict"],
  ): InjectionDetectionResult["recommendation"] {
    switch (verdict) {
      case "blocked":
        return "block";
      case "suspicious":
        return "sanitize";
      case "warning":
        return "sanitize";
      case "clean":
        return "allow";
    }
  }
}
