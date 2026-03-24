/**
 * PolicyEngine — Regelwerk laden und auswerten.
 *
 * Regeln werden in Reihenfolge (nach Prioritaet sortiert) ausgewertet.
 * Erste passende Regel gewinnt. Letzte Regel: Default-Deny.
 * Policy-Reload zur Laufzeit moeglich (ohne Restart).
 */

import pino from "pino";
import type { PolicyRule, Endpoint } from "./types.js";
import type { GateContext, PolicyResult } from "./types.js";
import { getActionClass } from "./action-classifier.js";
import { getDefaultRules } from "./policy-rules/default-rules.js";
import { getCommerceRules } from "./policy-rules/commerce-rules.js";
import { getAuthRules } from "./policy-rules/auth-rules.js";

const logger = pino({ name: "risk-gate:policy-engine" });

export class PolicyEngine {
  private rules: PolicyRule[];

  constructor(customRules?: PolicyRule[]) {
    if (customRules) {
      this.rules = this.sortByPriority(customRules);
    } else {
      this.rules = this.loadDefaultRules();
    }

    logger.info(
      { ruleCount: this.rules.length },
      "PolicyEngine initialized"
    );
  }

  /**
   * Wertet das Regelwerk fuer eine Aktion aus.
   * Erste passende Regel gewinnt. Keine Regel passt → DENY.
   */
  evaluatePolicy(
    action: string,
    endpoint: Endpoint,
    confidence: number,
    contradictionScore: number,
    evidenceCount: number,
    _context: GateContext
  ): PolicyResult {
    const actionClass = getActionClass(action);

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      // Pruefe ob die Regel zur Aktionsklasse passt
      if (rule.action_class !== actionClass) continue;

      // Pruefe ob die Regel zum Endpoint-Typ passt
      if (
        rule.endpoint_types &&
        rule.endpoint_types.length > 0 &&
        !rule.endpoint_types.includes(endpoint.type)
      ) {
        continue;
      }

      // Regel passt — jetzt Bedingungen pruefen
      logger.debug(
        { ruleName: rule.name, actionClass, endpointType: endpoint.type },
        "Rule matched — evaluating conditions"
      );

      // Pruefe alle Bedingungen
      if (confidence < rule.min_confidence) {
        return {
          decision: "deny",
          matchedRule: rule,
          reason: `Confidence ${confidence.toFixed(3)} below required ${rule.min_confidence} (rule: ${rule.name})`,
        };
      }

      if (contradictionScore > rule.max_contradiction) {
        return {
          decision: "deny",
          matchedRule: rule,
          reason: `Contradiction score ${contradictionScore.toFixed(3)} exceeds limit ${rule.max_contradiction} (rule: ${rule.name})`,
        };
      }

      if (evidenceCount < rule.require_evidence) {
        return {
          decision: "deny",
          matchedRule: rule,
          reason: `Evidence count ${evidenceCount} below required ${rule.require_evidence} (rule: ${rule.name})`,
        };
      }

      // Alle Bedingungen erfuellt → ALLOW
      return {
        decision: "allow",
        matchedRule: rule,
        reason: `All conditions met (rule: ${rule.name})`,
      };
    }

    // Keine Regel hat gematcht → DEFAULT DENY
    logger.warn(
      { action, actionClass, endpointType: endpoint.type },
      "No matching policy rule — DEFAULT DENY"
    );

    return {
      decision: "deny",
      matchedRule: null,
      reason: "No matching policy rule — default deny",
    };
  }

  /** Laedt die Default-Regeln (Auth + Commerce + Default) */
  private loadDefaultRules(): PolicyRule[] {
    const all = [
      ...getAuthRules(),
      ...getCommerceRules(),
      ...getDefaultRules(),
    ];
    return this.sortByPriority(all);
  }

  /** Sortiert Regeln nach Prioritaet (hoechste zuerst) */
  private sortByPriority(rules: PolicyRule[]): PolicyRule[] {
    return [...rules].sort((a, b) => b.priority - a.priority);
  }

  /** Laedt neue Regeln zur Laufzeit (Policy-Reload ohne Restart) */
  reloadRules(rules: PolicyRule[]): void {
    this.rules = this.sortByPriority(rules);
    logger.info(
      { ruleCount: this.rules.length },
      "Policy rules reloaded"
    );
  }

  /** Fuegt Regeln hinzu (werden nach Prioritaet einsortiert) */
  addRules(rules: PolicyRule[]): void {
    this.rules = this.sortByPriority([...this.rules, ...rules]);
    logger.info(
      { addedCount: rules.length, totalCount: this.rules.length },
      "Policy rules added"
    );
  }

  /** Gibt die aktuelle Anzahl der Regeln zurueck */
  ruleCount(): number {
    return this.rules.length;
  }

  /** Gibt alle aktiven Regeln zurueck (Kopie) */
  getRules(): PolicyRule[] {
    return [...this.rules];
  }

  /** Entfernt alle Regeln — ACHTUNG: Default-Deny greift dann fuer ALLES */
  clearRules(): void {
    this.rules = [];
    logger.warn("All policy rules cleared — default deny applies to everything");
  }
}
