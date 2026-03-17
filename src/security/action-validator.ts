/**
 * Security Hardening — Action Validator
 * Validiert geplante DOM-Aktionen bevor sie ausgefuehrt werden.
 */

import pino from "pino";
import type {
  ActionValidatorConfig,
  PlannedAction,
  ActionContext,
  ActionValidationResult,
  ValidationRule,
} from "./types.js";
import { CspAnalyzer } from "./csp-analyzer.js";

const logger = pino({ name: "security:action-validator" });

const DEFAULT_CONFIG: ActionValidatorConfig = {
  strictMode: true,
  blockInvisibleClicks: true,
  blockNonInteractive: true,
  warnOnDomainChange: true,
  customRules: [],
};

// Tags die als interaktiv gelten
const INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "details",
  "label",
  "option",
]);

// Tags fuer Submit-Aktionen
const SUBMIT_TAGS = new Set(["form", "button", "input"]);

// Tags fuer Input-Aktionen
const INPUT_TAGS = new Set(["input", "textarea", "select"]);

export class ActionValidator {
  private readonly config: ActionValidatorConfig;
  private readonly rules: ValidationRule[];
  private readonly cspAnalyzer: CspAnalyzer;

  constructor(config: Partial<ActionValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rules = [...this.config.customRules];
    this.cspAnalyzer = new CspAnalyzer();
  }

  validate(
    action: PlannedAction,
    context: ActionContext,
  ): ActionValidationResult {
    const issues: ActionValidationResult["issues"] = [];
    let score = 1.0;

    // Sichtbarkeits-Check
    if (!action.target.isVisible) {
      if (
        this.config.blockInvisibleClicks &&
        (action.type === "click" || action.type === "submit")
      ) {
        issues.push({
          type: "visibility",
          severity: "critical",
          message: `Action "${action.type}" on invisible element (${action.target.tagName})`,
        });
        score = 0;
      } else {
        issues.push({
          type: "visibility",
          severity: "high",
          message: "Target element is not visible",
        });
        score = Math.min(score, 0.3);
      }
    }

    // Zero-Dimension-Check
    if (action.target.boundingBox) {
      const bb = action.target.boundingBox;
      if (bb.width === 0 || bb.height === 0) {
        issues.push({
          type: "visibility",
          severity: "high",
          message: "Element has zero dimensions",
        });
        score = Math.min(score, 0.2);
      }
    }

    // Interaktivitaets-Check
    if (!action.target.isInteractive && this.config.blockNonInteractive) {
      const tagLower = action.target.tagName.toLowerCase();
      const hasClickHandler =
        action.target.attributes["onclick"] !== undefined;
      const hasRole = action.target.attributes["role"] !== undefined;

      if (!INTERACTIVE_TAGS.has(tagLower) && !hasClickHandler && !hasRole) {
        issues.push({
          type: "interactivity",
          severity: "high",
          message: `Element <${action.target.tagName}> is not interactive`,
        });
        score = Math.min(score, 0.3);
      }
    }

    // Typ-Konsistenz: fill/select auf Input-Element
    if (action.type === "fill" || action.type === "select") {
      const tagLower = action.target.tagName.toLowerCase();
      if (!INPUT_TAGS.has(tagLower)) {
        issues.push({
          type: "type_mismatch",
          severity: "medium",
          message: `Action "${action.type}" on non-input element <${action.target.tagName}>`,
        });
        score = Math.min(score, 0.5);
      }
    }

    // Typ-Konsistenz: submit auf Form/Button
    if (action.type === "submit") {
      const tagLower = action.target.tagName.toLowerCase();
      if (!SUBMIT_TAGS.has(tagLower)) {
        issues.push({
          type: "type_mismatch",
          severity: "medium",
          message: `Action "submit" on non-form element <${action.target.tagName}>`,
        });
        score = Math.min(score, 0.5);
      }
    }

    // Suspicious: role="presentation"
    if (action.target.attributes["role"] === "presentation") {
      issues.push({
        type: "suspicious_pattern",
        severity: "medium",
        message: "Action on element with role='presentation'",
      });
      score = Math.min(score, 0.4);
    }

    // Domain-Wechsel erkennen
    if (this.config.warnOnDomainChange && action.type === "navigate") {
      try {
        const currentDomain = new URL(context.currentUrl).hostname;
        const targetUrl = action.target.attributes["href"] ?? "";
        if (targetUrl.startsWith("http")) {
          const targetDomain = new URL(targetUrl).hostname;
          if (currentDomain !== targetDomain) {
            issues.push({
              type: "suspicious_pattern",
              severity: "low",
              message: `Navigation to different domain: ${targetDomain}`,
            });
            score = Math.min(score, 0.7);
          }
        }
      } catch {
        // URL-Parsing fehlgeschlagen
      }
    }

    // Mehrfacher Submit
    if (
      action.type === "submit" &&
      context.previousActions.some((a) => a.type === "submit")
    ) {
      issues.push({
        type: "suspicious_pattern",
        severity: "medium",
        message: "Multiple form submissions detected",
      });
      score = Math.min(score, 0.5);
    }

    // CSP-Check bei Submit-Aktionen
    if (context.cspPolicy && action.type === "submit") {
      const formAction =
        action.target.attributes["action"] ?? context.currentUrl;
      const cspResult = this.cspAnalyzer.isActionAllowed(context.cspPolicy, {
        type: "form_submit",
        target: formAction,
      });
      if (!cspResult.allowed && !cspResult.reportOnly) {
        issues.push({
          type: "csp_violation",
          severity: "critical",
          message: `CSP violation: ${cspResult.reason}`,
        });
        score = 0;
      }
    }

    // Custom Rules
    for (const rule of this.rules) {
      const result = rule.check(action, context);
      if (!result.valid) {
        issues.push({
          type: "suspicious_pattern",
          severity: result.severity,
          message: `[${rule.name}] ${result.message}`,
        });
        const severityPenalty =
          result.severity === "critical"
            ? 0
            : result.severity === "high"
              ? 0.3
              : result.severity === "medium"
                ? 0.5
                : 0.7;
        score = Math.min(score, severityPenalty);
      }
    }

    const verdict = this.getVerdict(score, issues);
    const recommendation = this.getRecommendation(verdict);

    if (verdict !== "valid") {
      logger.warn(
        {
          actionType: action.type,
          tagName: action.target.tagName,
          verdict,
          score,
          issueCount: issues.length,
        },
        "Action validation result",
      );
    }

    return { valid: verdict === "valid", score, verdict, issues, recommendation };
  }

  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  private getVerdict(
    score: number,
    issues: ActionValidationResult["issues"],
  ): ActionValidationResult["verdict"] {
    const hasCritical = issues.some((i) => i.severity === "critical");
    if (hasCritical || score === 0) return "blocked";
    if (score < 0.4) return "suspicious";
    if (score < 0.8) return "warning";
    return "valid";
  }

  private getRecommendation(
    verdict: ActionValidationResult["verdict"],
  ): ActionValidationResult["recommendation"] {
    switch (verdict) {
      case "blocked":
        return "block";
      case "suspicious":
        return "block";
      case "warning":
        return "proceed_with_caution";
      case "valid":
        return "proceed";
    }
  }
}
