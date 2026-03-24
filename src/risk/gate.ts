/**
 * Gate — Zentrale Entscheidungsfunktion (Risk Gate).
 *
 * Default-Deny: Wenn irgendein Check fehlschlaegt oder unsicher ist → DENY.
 * SI-01: Keine Aktion mit Risk-Level CRITICAL ohne menschliche Freigabe.
 * SI-05: Jede Aktion wird im Audit-Trail protokolliert — ausnahmslos.
 *
 * Die Gate-Funktion hat KEINE Seiteneffekte ausser Audit-Logging.
 */

import { randomUUID } from "node:crypto";
import pino from "pino";
import { z } from "zod";
import type {
  ConfidenceScore,
  Endpoint,
  GateDecision,
  AuditEntry,
  RiskLevel,
  GateContext,
} from "./types.js";
import { ConfidenceScoreSchema } from "./types.js";
import type { ValidationStatus } from "../../shared_interfaces.js";
import { classifyAction } from "./action-classifier.js";
import { ThresholdManager } from "./threshold-manager.js";
import { detectContradictions } from "./contradiction-detector.js";
import { PolicyEngine } from "./policy-engine.js";
import { AuditTrail } from "./audit-trail.js";
import { EscalationHandler } from "./escalation-handler.js";
import { GateEvaluationError } from "./errors.js";

const logger = pino({ name: "risk-gate:gate" });

/** Endpoint-Typen die bei form_fill eine Eskalation erfordern (ADR-014) */
const SENSITIVE_FORM_FILL_ENDPOINTS = new Set(["auth", "checkout", "settings"]);

/** Max Contradiction pro Risk-Level */
const MAX_CONTRADICTION: Record<RiskLevel, number> = {
  low: 0.4,
  medium: 0.3,
  high: 0.2,
  critical: 0.05,
};

export interface RiskGateOptions {
  thresholdOverrides?: Partial<Record<RiskLevel, number>>;
  escalationTimeoutMs?: number;
  auditRetentionMs?: number;
}

export class RiskGate {
  readonly thresholdManager: ThresholdManager;
  readonly policyEngine: PolicyEngine;
  readonly auditTrail: AuditTrail;
  readonly escalationHandler: EscalationHandler;

  constructor(options?: RiskGateOptions) {
    this.thresholdManager = new ThresholdManager(options?.thresholdOverrides);
    this.policyEngine = new PolicyEngine();
    this.auditTrail = new AuditTrail({ retentionMs: options?.auditRetentionMs });
    this.escalationHandler = new EscalationHandler({
      timeoutMs: options?.escalationTimeoutMs,
    });
  }

  /**
   * Zentrale Entscheidungsfunktion.
   *
   * Prueft: Confidence >= Threshold UND Contradiction < Max UND Policy = OK
   * Ergebnis: ALLOW, DENY, oder ESCALATE.
   * JEDE Entscheidung wird im Audit-Trail protokolliert.
   */
  async evaluate(
    action: string,
    endpoint: Endpoint,
    confidence: ConfidenceScore,
    context: GateContext
  ): Promise<GateDecision> {
    const auditId = randomUUID();
    const startTime = Date.now();

    try {
      // 1. Input-Validation mit Zod
      const validatedConfidence = this.validateConfidence(confidence);

      // 2. NaN-Check
      if (Number.isNaN(validatedConfidence.score)) {
        logger.error({ action, auditId }, "NaN confidence score — DENY");
        return this.createDecision(
          "deny",
          "Invalid confidence score: NaN",
          auditId,
          0,
          0,
          0,
          0,
          action,
          endpoint,
          context,
          startTime
        );
      }

      // 3. Action klassifizieren
      const riskLevel = classifyAction(action, endpoint);
      logger.debug({ action, riskLevel, auditId }, "Action classified");

      // 4. SI-01: CRITICAL → immer ESCALATE
      if (riskLevel === "critical") {
        logger.info(
          { action, riskLevel, auditId },
          "SI-01: CRITICAL action — ESCALATE required"
        );
        return this.createDecision(
          "escalate",
          `SI-01: Action "${action}" classified as CRITICAL — requires human approval`,
          auditId,
          validatedConfidence.score,
          this.thresholdManager.getThreshold(riskLevel),
          0,
          MAX_CONTRADICTION[riskLevel],
          action,
          endpoint,
          context,
          startTime,
          {
            type: "human_review",
            message: `CRITICAL action "${action}" requires human review. Risk level: ${riskLevel}, Confidence: ${validatedConfidence.score.toFixed(3)}`,
          }
        );
      }

      // 5. Provenance-Check (ADR-014, SI-07)
      const validationStatus: ValidationStatus = endpoint.validation_status ?? "unvalidated";
      const provenanceDecision = this.checkProvenance(
        validationStatus,
        riskLevel,
        action,
        endpoint,
        auditId,
        validatedConfidence.score,
        context,
        startTime
      );
      if (provenanceDecision) {
        return provenanceDecision;
      }

      // 6. Confidence-Threshold pruefen (mit Provenance-Faktor)
      const threshold = this.thresholdManager.getThreshold(riskLevel, validationStatus);
      if (validatedConfidence.score < threshold) {
        logger.info(
          {
            action,
            riskLevel,
            confidence: validatedConfidence.score,
            threshold,
            auditId,
          },
          "Confidence below threshold — DENY"
        );
        return this.createDecision(
          "deny",
          `Confidence ${validatedConfidence.score.toFixed(3)} below threshold ${threshold} for risk level ${riskLevel}`,
          auditId,
          validatedConfidence.score,
          threshold,
          0,
          MAX_CONTRADICTION[riskLevel],
          action,
          endpoint,
          context,
          startTime
        );
      }

      // 7. Contradiction-Check
      const contradictionResult = detectContradictions(context.evidence);
      const maxContradiction = MAX_CONTRADICTION[riskLevel];
      if (contradictionResult.score > maxContradiction) {
        logger.info(
          {
            action,
            contradictionScore: contradictionResult.score,
            maxContradiction,
            auditId,
          },
          "Contradiction exceeds limit — DENY"
        );
        return this.createDecision(
          "deny",
          `Contradiction score ${contradictionResult.score.toFixed(3)} exceeds limit ${maxContradiction} for risk level ${riskLevel}`,
          auditId,
          validatedConfidence.score,
          threshold,
          contradictionResult.score,
          maxContradiction,
          action,
          endpoint,
          context,
          startTime
        );
      }

      // 8. Policy-Engine pruefen
      const policyResult = this.policyEngine.evaluatePolicy(
        action,
        endpoint,
        validatedConfidence.score,
        contradictionResult.score,
        context.evidence.length,
        context
      );

      if (policyResult.decision !== "allow") {
        logger.info(
          { action, policyDecision: policyResult.decision, reason: policyResult.reason, auditId },
          "Policy denied — " + policyResult.decision.toUpperCase()
        );
        return this.createDecision(
          policyResult.decision,
          policyResult.reason,
          auditId,
          validatedConfidence.score,
          threshold,
          contradictionResult.score,
          maxContradiction,
          action,
          endpoint,
          context,
          startTime,
          policyResult.decision === "escalate"
            ? { type: "human_review", message: policyResult.reason }
            : undefined
        );
      }

      // 9. Alle Checks bestanden → ALLOW
      logger.info(
        { action, riskLevel, confidence: validatedConfidence.score, auditId },
        "All checks passed — ALLOW"
      );
      return this.createDecision(
        "allow",
        `Action "${action}" allowed: confidence ${validatedConfidence.score.toFixed(3)} >= ${threshold}, contradiction ${contradictionResult.score.toFixed(3)} <= ${maxContradiction}, policy OK`,
        auditId,
        validatedConfidence.score,
        threshold,
        contradictionResult.score,
        maxContradiction,
        action,
        endpoint,
        context,
        startTime
      );
    } catch (error) {
      // Bei JEDEM Fehler: DEFAULT DENY
      logger.error(
        { action, auditId, error },
        "Gate evaluation error — DEFAULT DENY"
      );
      return this.createDecision(
        "deny",
        `Gate evaluation error: ${error instanceof Error ? error.message : "unknown error"}`,
        auditId,
        0,
        1,
        0,
        0,
        action,
        endpoint,
        context,
        startTime
      );
    }
  }

  /**
   * Provenance-Check (ADR-014, SI-07).
   * Prueft ob der Validation-Status des Endpoints fuer die Aktion ausreicht.
   * Gibt eine GateDecision zurueck wenn DENY/ESCALATE, sonst null.
   */
  private checkProvenance(
    validationStatus: ValidationStatus,
    riskLevel: RiskLevel,
    action: string,
    endpoint: Endpoint,
    auditId: string,
    confidence: number,
    context: GateContext,
    startTime: number
  ): GateDecision | null {
    const isHighRisk = riskLevel === "high" || riskLevel === "critical";

    // Unvalidated + high/critical → DENY
    if (validationStatus === "unvalidated" && isHighRisk) {
      logger.info(
        { action, validationStatus, riskLevel, auditId },
        "SI-07: Unvalidated endpoint — DENY for high-risk action"
      );
      return this.createDecision(
        "deny",
        `SI-07: Unvalidated endpoint cannot perform ${riskLevel}-risk action "${action}"`,
        auditId,
        confidence,
        this.thresholdManager.getThreshold(riskLevel),
        0,
        MAX_CONTRADICTION[riskLevel],
        action,
        endpoint,
        context,
        startTime
      );
    }

    // Inferred + high/critical → check policy
    if (validationStatus === "inferred" && isHighRisk) {
      // Pruefe ob allow_inferred_with_confirmation in passender PolicyRule gesetzt
      const actionClass = this.getActionClassForAction(action);
      const matchedRule = this.policyEngine.getRules().find(
        (r) => r.enabled && r.action_class === actionClass &&
          (!r.endpoint_types || r.endpoint_types.length === 0 || r.endpoint_types.includes(endpoint.type))
      );
      const allowWithConfirmation = matchedRule?.allow_inferred_with_confirmation ?? false;

      if (allowWithConfirmation) {
        logger.info(
          { action, validationStatus, riskLevel, auditId },
          "SI-07: Inferred endpoint requires confirmation — ESCALATE"
        );
        return this.createDecision(
          "escalate",
          `SI-07: Inferred endpoint requires confirmation for ${riskLevel}-risk action "${action}"`,
          auditId,
          confidence,
          this.thresholdManager.getThreshold(riskLevel),
          0,
          MAX_CONTRADICTION[riskLevel],
          action,
          endpoint,
          context,
          startTime,
          {
            type: "human_review",
            message: `Inferred endpoint requires confirmation for ${riskLevel}-risk action "${action}"`,
          }
        );
      }

      // Nicht erlaubt → DENY
      logger.info(
        { action, validationStatus, riskLevel, auditId },
        "SI-07: Inferred endpoint — DENY for high-risk action"
      );
      return this.createDecision(
        "deny",
        `SI-07: High-risk action "${action}" requires verified endpoint`,
        auditId,
        confidence,
        this.thresholdManager.getThreshold(riskLevel),
        0,
        MAX_CONTRADICTION[riskLevel],
        action,
        endpoint,
        context,
        startTime
      );
    }

    // Inferred + form_fill auf auth/checkout/settings → ESCALATE
    if (
      validationStatus === "inferred" &&
      action === "form_fill" &&
      SENSITIVE_FORM_FILL_ENDPOINTS.has(endpoint.type)
    ) {
      logger.info(
        { action, validationStatus, endpointType: endpoint.type, auditId },
        "SI-07: Inferred endpoint + sensitive form_fill — ESCALATE"
      );
      return this.createDecision(
        "escalate",
        `SI-07: Form fill on ${endpoint.type} endpoint requires verified endpoint (currently inferred)`,
        auditId,
        confidence,
        this.thresholdManager.getThreshold(riskLevel),
        0,
        MAX_CONTRADICTION[riskLevel],
        action,
        endpoint,
        context,
        startTime,
        {
          type: "human_review",
          message: `Inferred endpoint: form_fill on sensitive ${endpoint.type} endpoint requires confirmation`,
        }
      );
    }

    return null;
  }

  /** Hilfsfunktion: Action → ActionClass mapping fuer Provenance-Check */
  private getActionClassForAction(action: string): string {
    const map: Record<string, string> = {
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
    return map[action] ?? "submit_data";
  }

  /** Validiert den ConfidenceScore mit Zod */
  private validateConfidence(confidence: ConfidenceScore): ConfidenceScore {
    try {
      return ConfidenceScoreSchema.parse(confidence);
    } catch (error) {
      throw new GateEvaluationError(
        `Invalid confidence score: ${error instanceof z.ZodError ? error.issues.map(i => i.message).join(", ") : "validation failed"}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /** Erstellt eine GateDecision und loggt sie im Audit-Trail */
  private createDecision(
    decision: "allow" | "deny" | "escalate",
    reason: string,
    auditId: string,
    confidence: number,
    threshold: number,
    contradictionScore: number,
    contradictionLimit: number,
    action: string,
    endpoint: Endpoint,
    context: GateContext,
    startTime: number,
    escalation?: { type: "human_review" | "retry_with_more_data" | "abort"; message: string }
  ): GateDecision {
    const now = new Date();
    const duration = Date.now() - startTime;

    const endpointValidationStatus = (endpoint.validation_status ?? "unvalidated") as ValidationStatus;
    const requiresVerification = decision !== "allow" &&
      (endpointValidationStatus === "unvalidated" || endpointValidationStatus === "inferred");

    const gateDecision: GateDecision = {
      decision,
      reason,
      audit_id: auditId,
      confidence,
      threshold,
      contradictionScore,
      contradictionLimit,
      escalation,
      endpoint_validation_status: endpointValidationStatus,
      required_verification_for_action: requiresVerification,
      timestamp: now,
    };

    // SI-05: Jede Entscheidung im Audit-Trail protokollieren
    const decisionMap = {
      allow: "allowed" as const,
      deny: "denied" as const,
      escalate: "escalated" as const,
    };

    const auditEntry: AuditEntry = {
      id: auditId,
      traceId: context.traceId,
      timestamp: now,
      actor: "system",
      actorId: context.sessionId,
      action,
      endpoint_id: endpoint.id,
      siteId: endpoint.siteId,
      decision: decisionMap[decision],
      confidence,
      riskGateResult: decisionMap[decision],
      evidence_chain: context.evidence,
      input: { action, endpointId: endpoint.id },
      output: { decision, reason },
      duration,
      success: decision === "allow",
    };

    this.auditTrail.logDecision(auditEntry);

    return gateDecision;
  }
}
