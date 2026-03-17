/**
 * EscalationHandler — Human-in-the-Loop Eskalation.
 *
 * Timeout: Wenn Mensch nicht innerhalb von 5 Minuten antwortet → DENY.
 */

import pino from "pino";
import type { EscalationRequest, EscalationResponse, PendingEscalation } from "./types.js";
import { EscalationTimeoutError } from "./errors.js";

const logger = pino({ name: "risk-gate:escalation-handler" });

/** Default Timeout: 5 Minuten */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface EscalationHandlerOptions {
  timeoutMs?: number;
}

export class EscalationHandler {
  private readonly timeoutMs: number;
  private readonly pending: Map<string, PendingEscalation> = new Map();

  constructor(options?: EscalationHandlerOptions) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Eskaliert eine Entscheidung an den menschlichen Nutzer.
   * Gibt ein Promise zurueck das resolved wenn der Mensch antwortet oder der Timeout ablaeuft.
   */
  async escalate(request: EscalationRequest): Promise<EscalationResponse> {
    const escalationId = request.context.traceId;

    logger.info(
      {
        escalationId,
        action: request.action,
        riskLevel: request.riskLevel,
        confidence: request.confidence,
        reason: request.reason,
      },
      "Escalation requested — waiting for human response"
    );

    return new Promise<EscalationResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(escalationId);

        const timeoutError = new EscalationTimeoutError(this.timeoutMs);
        logger.warn(
          { escalationId, timeoutMs: this.timeoutMs },
          timeoutError.message
        );

        resolve({
          decision: "deny",
          respondedBy: "timeout",
          respondedAt: new Date(),
          reason: `Escalation timed out after ${this.timeoutMs}ms — automatic DENY`,
        });
      }, this.timeoutMs);

      const wrappedResolve = (response: EscalationResponse): void => {
        clearTimeout(timer);
        this.pending.delete(escalationId);
        resolve(response);
      };

      this.pending.set(escalationId, {
        request,
        createdAt: new Date(),
        timeoutMs: this.timeoutMs,
        resolve: wrappedResolve,
      });
    });
  }

  /**
   * Beantwortet eine haengende Eskalation (von aussen, z.B. UI oder API).
   * Gibt true zurueck wenn die Eskalation gefunden und beantwortet wurde.
   */
  respond(escalationId: string, decision: "allow" | "deny", reason: string): boolean {
    const pending = this.pending.get(escalationId);
    if (!pending) {
      logger.warn({ escalationId }, "No pending escalation found");
      return false;
    }

    logger.info(
      { escalationId, decision, reason },
      "Escalation responded by human"
    );

    pending.resolve({
      decision,
      respondedBy: "human",
      respondedAt: new Date(),
      reason,
    });

    return true;
  }

  /** Gibt die Anzahl haengender Eskalationen zurueck */
  pendingCount(): number {
    return this.pending.size;
  }

  /** Prueft ob eine Eskalation haengend ist */
  isPending(escalationId: string): boolean {
    return this.pending.has(escalationId);
  }
}
