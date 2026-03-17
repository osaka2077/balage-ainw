/**
 * ThresholdManager — Confidence-Thresholds pro Risk-Level verwalten.
 *
 * Absolute Minima koennen NICHT unterschritten werden, auch nicht per Config.
 */

import pino from "pino";
import type { RiskLevel } from "./types.js";
import type { ValidationStatus } from "../../shared_interfaces.js";
import { PROVENANCE_FACTORS } from "../../shared_interfaces.js";
import { ThresholdError } from "./errors.js";

const logger = pino({ name: "risk-gate:threshold-manager" });

/** Default-Thresholds pro Risk-Level */
const DEFAULT_THRESHOLDS: Record<RiskLevel, number> = {
  low: 0.6,
  medium: 0.75,
  high: 0.85,
  critical: 0.95,
};

/** Absolute Minima — koennen NICHT unterschritten werden */
const ABSOLUTE_MINIMA: Record<RiskLevel, number> = {
  low: 0.5,
  medium: 0.65,
  high: 0.80,
  critical: 0.90,
};

export class ThresholdManager {
  private readonly thresholds: Map<RiskLevel, number>;

  constructor(overrides?: Partial<Record<RiskLevel, number>>) {
    this.thresholds = new Map(
      Object.entries(DEFAULT_THRESHOLDS) as Array<[RiskLevel, number]>
    );

    if (overrides) {
      for (const [level, value] of Object.entries(overrides)) {
        if (value !== undefined) {
          this.setThreshold(level as RiskLevel, value);
        }
      }
    }
  }

  /**
   * Gibt den Threshold fuer ein Risk-Level zurueck.
   * Wenn validationStatus angegeben: effective_threshold = base / provenance_factor
   * Beispiel: submit_data base=0.85, inferred factor=0.85 → effective=1.0 (unerreichbar → DENY)
   */
  getThreshold(riskLevel: RiskLevel, validationStatus?: ValidationStatus): number {
    const threshold = this.thresholds.get(riskLevel);
    if (threshold === undefined) {
      logger.error({ riskLevel }, "Unknown risk level — using 1.0 as safe default");
      return 1.0;
    }

    if (validationStatus === undefined || validationStatus === "fully_verified") {
      return threshold;
    }

    const factor = PROVENANCE_FACTORS[validationStatus];
    const effective = Math.min(threshold / factor, 1.0);

    logger.debug(
      { riskLevel, validationStatus, baseThreshold: threshold, factor, effective },
      "Provenance-adjusted threshold"
    );

    return effective;
  }

  /**
   * Setzt einen neuen Threshold fuer ein Risk-Level.
   * Enforced absolute Minima — wirft ThresholdError bei Unterschreitung.
   */
  setThreshold(riskLevel: RiskLevel, value: number): void {
    const minimum = ABSOLUTE_MINIMA[riskLevel];
    if (minimum === undefined) {
      throw new ThresholdError(`Unknown risk level: ${riskLevel}`);
    }

    if (value < minimum) {
      throw new ThresholdError(
        `Threshold ${value} for ${riskLevel} is below absolute minimum ${minimum}`
      );
    }

    if (value > 1.0) {
      throw new ThresholdError(
        `Threshold ${value} for ${riskLevel} exceeds maximum 1.0`
      );
    }

    const previous = this.thresholds.get(riskLevel);
    this.thresholds.set(riskLevel, value);

    logger.info(
      { riskLevel, previous, newValue: value },
      "Threshold updated"
    );
  }

  /** Gibt alle aktuellen Thresholds zurueck */
  getAllThresholds(): Record<RiskLevel, number> {
    return Object.fromEntries(this.thresholds) as Record<RiskLevel, number>;
  }

  /** Setzt alle Thresholds auf Default-Werte zurueck */
  reset(): void {
    for (const [level, value] of Object.entries(DEFAULT_THRESHOLDS)) {
      this.thresholds.set(level as RiskLevel, value);
    }
    logger.info("Thresholds reset to defaults");
  }
}
