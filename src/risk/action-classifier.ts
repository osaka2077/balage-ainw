/**
 * ActionClassifier — Aktionen nach Risk-Level einordnen.
 *
 * Unbekannte Aktionen sind IMMER HIGH (nicht MEDIUM, nicht LOW).
 */

import pino from "pino";
import type { RiskLevel, Endpoint, ActionType, ActionClass } from "./types.js";

const logger = pino({ name: "risk-gate:action-classifier" });

/** Mapping: ActionType → RiskLevel */
const ACTION_RISK_MAP: Record<ActionType, RiskLevel> = {
  read: "low",
  navigate: "low",
  scroll: "low",
  toggle: "medium",
  form_fill: "medium",
  form_submit: "high",
  account_change: "high",
  file_upload: "high",
  payment: "critical",
  password_change: "critical",
  account_delete: "critical",
  legal_action: "critical",
};

/** Mapping: ActionType → ActionClass (fuer PolicyRule-Matching) */
const ACTION_CLASS_MAP: Record<ActionType, ActionClass> = {
  read: "read_only",
  navigate: "read_only",
  scroll: "read_only",
  toggle: "reversible_action",
  form_fill: "form_fill",
  form_submit: "submit_data",
  account_change: "submit_data",
  file_upload: "submit_data",
  payment: "financial_action",
  password_change: "destructive_action",
  account_delete: "destructive_action",
  legal_action: "destructive_action",
};

/** Endpoint-Typen die das Risk-Level erhoehen */
const HIGH_RISK_ENDPOINT_TYPES = new Set(["checkout", "auth", "settings"]);
const CRITICAL_RISK_ENDPOINT_TYPES = new Set(["checkout"]);

/**
 * Klassifiziert eine Aktion nach Risk-Level.
 * Beruecksichtigt sowohl den Aktionstyp als auch den Endpoint-Kontext.
 */
export function classifyAction(action: string, endpoint: Endpoint): RiskLevel {
  const baseRisk = ACTION_RISK_MAP[action as ActionType];

  if (baseRisk === undefined) {
    logger.warn({ action }, "Unknown action type — classifying as HIGH");
    return "high";
  }

  // Endpoint-Kontext kann das Risk-Level erhoehen (nie senken)
  let effectiveRisk = baseRisk;

  if (
    baseRisk === "medium" &&
    HIGH_RISK_ENDPOINT_TYPES.has(endpoint.type)
  ) {
    effectiveRisk = "high";
    logger.info(
      { action, endpointType: endpoint.type },
      "Risk elevated from MEDIUM to HIGH due to endpoint type"
    );
  }

  if (
    baseRisk === "high" &&
    CRITICAL_RISK_ENDPOINT_TYPES.has(endpoint.type)
  ) {
    effectiveRisk = "critical";
    logger.info(
      { action, endpointType: endpoint.type },
      "Risk elevated from HIGH to CRITICAL due to endpoint type"
    );
  }

  return effectiveRisk;
}

/**
 * Gibt die ActionClass fuer eine Aktion zurueck (fuer PolicyRule-Matching).
 * Unbekannte Aktionen → "submit_data" (konservativ).
 */
export function getActionClass(action: string): ActionClass {
  const actionClass = ACTION_CLASS_MAP[action as ActionType];

  if (actionClass === undefined) {
    logger.warn({ action }, "Unknown action type — using submit_data class");
    return "submit_data";
  }

  return actionClass;
}
