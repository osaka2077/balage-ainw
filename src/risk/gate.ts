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
  PolicyResult,
} from "./types.js";
import { ConfidenceScoreSchema } from "./types.js";
import { classifyAction } from "./action-classifier.js";
import { ThresholdManager } from "./threshold-manager.js";
import { detectContradictions } from "./contradiction-detector.js";
import { PolicyEngine } from "./policy-engine.js";
import { AuditTrail } from "./audit-trail.js";
import { EscalationHandler } from "./escalation-handler.js";
import { GateEvaluationError } from "./errors.js";

const logger = pino({ name: "risk-gate:gate" });

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

      // 5. Confidence-Threshold pruefen
      const threshold = this.thresholdManager.getThreshold(riskLevel);
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

      // 6. Contradiction-Check
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

      // 7. Policy-Engine pruefen
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

      // 8. Alle Checks bestanden → ALLOW
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

    const gateDecision: GateDecision = {
      decision,
      reason,
      audit_id: auditId,
      confidence,
      threshold,
      contradictionScore,
      contradictionLimit,
      escalation,
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
