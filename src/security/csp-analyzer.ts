/**
 * Security Hardening — CSP Analyzer
 * Parst und analysiert Content Security Policy Header der Zielseite.
 */

import pino from "pino";
import type {
  CspPolicy,
  CspAction,
  CspCheckResult,
  CspSecurityLevel,
} from "./types.js";

const logger = pino({ name: "security:csp-analyzer" });

const ACTION_TO_DIRECTIVE: Record<CspAction["type"], string[]> = {
  form_submit: ["form-action"],
  navigate: ["navigate-to", "default-src"],
  script_execute: ["script-src", "default-src"],
  frame_embed: ["frame-ancestors", "frame-src", "child-src", "default-src"],
  connect: ["connect-src", "default-src"],
};

export class CspAnalyzer {
  parse(cspHeader: string): CspPolicy {
    const directives: Record<string, string[]> = {};

    // Laengenlimit fuer Parsing-Schutz
    const header = cspHeader.slice(0, 4000);
    const parts = header.split(";");

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const tokens = trimmed.split(/\s+/);
      const directive = tokens[0]?.toLowerCase();
      if (!directive) continue;

      directives[directive] = tokens.slice(1);
    }

    return {
      directives,
      reportOnly: false,
      raw: cspHeader,
    };
  }

  isActionAllowed(policy: CspPolicy, action: CspAction): CspCheckResult {
    const directiveNames = ACTION_TO_DIRECTIVE[action.type] ?? [
      "default-src",
    ];

    for (const directiveName of directiveNames) {
      const values = policy.directives[directiveName];
      if (!values) continue;

      // 'none' blockt alles
      if (values.includes("'none'")) {
        logger.info(
          {
            directive: directiveName,
            target: action.target,
            action: action.type,
          },
          "CSP: action blocked by 'none'",
        );
        return {
          allowed: false,
          directive: directiveName,
          reason: `Directive ${directiveName} is set to 'none'`,
          reportOnly: policy.reportOnly,
        };
      }

      // Pruefen ob das Ziel durch die Sources erlaubt ist
      const isAllowed = this.matchesSources(values, action.target);
      if (!isAllowed) {
        logger.info(
          { directive: directiveName, target: action.target },
          "CSP: action blocked",
        );
        return {
          allowed: false,
          directive: directiveName,
          reason: `Target ${action.target} not allowed by ${directiveName}`,
          reportOnly: policy.reportOnly,
        };
      }

      return {
        allowed: true,
        directive: directiveName,
        reason: `Target allowed by ${directiveName}`,
        reportOnly: policy.reportOnly,
      };
    }

    // Kein CSP gesetzt → Browser-Verhalten: alles erlaubt
    if (Object.keys(policy.directives).length === 0) {
      return {
        allowed: true,
        directive: "none",
        reason: "No CSP policy present",
        reportOnly: false,
      };
    }

    // Fallback auf default-src
    const defaultSrc = policy.directives["default-src"];
    if (defaultSrc) {
      const isAllowed = this.matchesSources(defaultSrc, action.target);
      return {
        allowed: isAllowed,
        directive: "default-src",
        reason: isAllowed
          ? "Allowed by default-src"
          : `Target ${action.target} not allowed by default-src`,
        reportOnly: policy.reportOnly,
      };
    }

    // Keine default-src, keine spezifische Direktive → erlauben
    return {
      allowed: true,
      directive: "none",
      reason: "No matching directive found",
      reportOnly: false,
    };
  }

  getSecurityLevel(policy: CspPolicy): CspSecurityLevel {
    if (Object.keys(policy.directives).length === 0) {
      return "none";
    }

    const scriptSrc =
      policy.directives["script-src"] ??
      policy.directives["default-src"] ??
      [];
    const hasUnsafeInline = scriptSrc.includes("'unsafe-inline'");
    const hasUnsafeEval = scriptSrc.includes("'unsafe-eval'");
    const hasNonce = scriptSrc.some((v) => v.startsWith("'nonce-"));
    const hasHash = scriptSrc.some(
      (v) =>
        v.startsWith("'sha256-") ||
        v.startsWith("'sha384-") ||
        v.startsWith("'sha512-"),
    );

    if (!hasUnsafeInline && !hasUnsafeEval && (hasNonce || hasHash)) {
      return "strict";
    }
    if (!hasUnsafeEval) {
      return "moderate";
    }
    return "permissive";
  }

  private matchesSources(sources: string[], target: string): boolean {
    let targetOrigin: string;
    try {
      const url = new URL(target);
      targetOrigin = url.origin;
    } catch {
      targetOrigin = target;
    }

    for (const source of sources) {
      if (source === "*") return true;

      // 'self' — ohne eigenen Origin nicht verifizierbar, ueberspringen
      if (source === "'self'") continue;

      // HTTPS-Schema
      if (source === "https:" && target.startsWith("https://")) {
        return true;
      }

      // Wildcard-Domain
      if (source.startsWith("*.")) {
        const baseDomain = source.slice(2);
        try {
          const url = new URL(target);
          if (
            url.hostname.endsWith(baseDomain) ||
            url.hostname === baseDomain
          ) {
            return true;
          }
        } catch {
          // Keine gueltige URL
        }
      }

      // Exakter URL/Origin-Match
      if (target.startsWith(source) || targetOrigin === source) {
        return true;
      }
    }

    // Nur 'self' vorhanden → Default-Deny (kein eigener Origin bekannt)
    if (sources.includes("'self'") && sources.length === 1) {
      return false;
    }

    return false;
  }
}
