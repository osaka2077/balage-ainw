/**
 * Orchestrator — Pipeline
 *
 * Volle BALAGE-Pipeline: Adapter → Parser → Semantic → Confidence → Risk Gate → Action.
 * Jeder Schritt operiert auf Interfaces (Dependency Injection).
 */

import pino from "pino";
import type {
  PipelineAction,
  PipelineResult,
  PipelineDependencies,
  PipelineInterface,
  WorkflowContext,
} from "./types.js";
import type { Endpoint, Evidence, StateChangeEvent } from "../../shared_interfaces.js";
import { PipelineStepError } from "./errors.js";

const logger = pino({ name: "orchestrator:pipeline" });

export class Pipeline implements PipelineInterface {
  private readonly deps: PipelineDependencies;

  constructor(deps: PipelineDependencies) {
    this.deps = deps;
  }

  async execute(
    url: string,
    action: PipelineAction,
    _context: WorkflowContext,
  ): Promise<PipelineResult> {
    const timing: Record<string, number> = {};
    const stateChanges: StateChangeEvent[] = [];
    let endpoints: Endpoint[] = [];

    // Schritt 1 — Adapt: Browser oeffnen / Seite laden
    const adaptStart = Date.now();
    try {
      await this.deps.adapter.navigate(url);
      timing["adapt"] = Date.now() - adaptStart;
      logger.debug({ url, duration: timing["adapt"] }, "Adapt completed");
    } catch (err) {
      return this.stepError("adapt", err, timing);
    }

    // Schritt 2 — Parse: DOM + A11y extrahieren, UI segmentieren
    const parseStart = Date.now();
    try {
      const dom = await this.deps.adapter.extractDOM();
      const accessibility = await this.deps.adapter.extractAccessibilityTree();
      const segments = this.deps.parser.segmentUI(dom, accessibility);
      timing["parse"] = Date.now() - parseStart;
      logger.debug(
        { segmentCount: segments.length, duration: timing["parse"] },
        "Parse completed",
      );

      // Schritt 3 — Semantic: Endpoints generieren + Fingerprints
      const semanticStart = Date.now();
      try {
        endpoints = await this.deps.semantic.generateEndpoints(segments, url);

        for (const ep of endpoints) {
          this.deps.fingerprint.calculateFingerprint(ep);
        }

        timing["semantic"] = Date.now() - semanticStart;
        logger.debug(
          { endpointCount: endpoints.length, duration: timing["semantic"] },
          "Semantic completed",
        );
      } catch (err) {
        return this.stepError("semantic", err, timing);
      }
    } catch (err) {
      return this.stepError("parse", err, timing);
    }

    // Schritt 4 — Confidence: Scores berechnen
    const confidenceStart = Date.now();
    try {
      for (const ep of endpoints) {
        const evidence: Evidence[] = ep.evidence ?? [];
        this.deps.confidence.calculateScore(ep, evidence);
      }
      timing["confidence"] = Date.now() - confidenceStart;
      logger.debug({ duration: timing["confidence"] }, "Confidence completed");
    } catch (err) {
      return this.stepError("confidence", err, timing);
    }

    // Schritt 5 — Risk Gate: Entscheidung fuer geplante Aktion
    const riskStart = Date.now();
    try {
      // Relevantesten Endpoint fuer die Action finden
      const targetEndpoint = endpoints[0];
      if (!targetEndpoint) {
        return {
          success: false,
          gateDecision: null,
          endpoints,
          stateChanges,
          error: {
            step: "risk_gate",
            code: "NO_ENDPOINTS",
            message: "No endpoints discovered to evaluate",
          },
          timing,
        };
      }

      const confidenceScore = this.deps.confidence.calculateScore(
        targetEndpoint,
        targetEndpoint.evidence,
      );

      const gateDecision = this.deps.riskGate.evaluate(
        action.type,
        targetEndpoint,
        confidenceScore,
        { url, action },
      );

      timing["risk_gate"] = Date.now() - riskStart;
      logger.debug(
        { decision: gateDecision.decision, duration: timing["risk_gate"] },
        "Risk gate completed",
      );

      // Schritt 6 — Action: Bei ALLOW ausfuehren, bei DENY stoppen
      if (gateDecision.decision === "allow") {
        logger.info({ action: action.type }, "Action allowed by risk gate");
        return {
          success: true,
          gateDecision,
          endpoints,
          stateChanges,
          timing,
        };
      }

      if (gateDecision.decision === "escalate") {
        logger.warn({ action: action.type }, "Action escalated by risk gate");
        return {
          success: false,
          gateDecision,
          endpoints,
          stateChanges,
          error: {
            step: "risk_gate",
            code: "ESCALATED",
            message: gateDecision.reason,
          },
          timing,
        };
      }

      // DENY
      logger.warn({ action: action.type }, "Action denied by risk gate");
      return {
        success: false,
        gateDecision,
        endpoints,
        stateChanges,
        error: {
          step: "risk_gate",
          code: "DENIED",
          message: gateDecision.reason,
        },
        timing,
      };
    } catch (err) {
      return this.stepError("risk_gate", err, timing);
    }
  }

  private stepError(
    step: string,
    err: unknown,
    timing: Record<string, number>,
  ): PipelineResult {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof PipelineStepError
        ? err.code
        : "STEP_FAILED";

    logger.error({ step, error: message }, "Pipeline step failed");

    return {
      success: false,
      gateDecision: null,
      endpoints: [],
      stateChanges: [],
      error: { step, code, message },
      timing,
    };
  }
}
