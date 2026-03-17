/**
 * BALAGE Confidence Calibration — Error Classes
 */

export class CalibrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CalibrationError";
  }
}

export class InsufficientDataError extends CalibrationError {
  constructor(required: number, actual: number) {
    super(
      `Insufficient data for calibration: need ${required}, got ${actual}`,
      "INSUFFICIENT_DATA",
      { required, actual },
    );
  }
}

export class PlattScalingConvergenceError extends CalibrationError {
  constructor(iterations: number, tolerance: number) {
    super(
      `Platt Scaling did not converge after ${iterations} iterations (tolerance: ${tolerance})`,
      "PLATT_CONVERGENCE_ERROR",
      { iterations, tolerance },
    );
  }
}

export class GridSearchExhaustedError extends CalibrationError {
  constructor(maxCombinations: number) {
    super(
      `Grid search reached max combinations limit: ${maxCombinations}`,
      "GRID_SEARCH_EXHAUSTED",
      { maxCombinations },
    );
  }
}

export class WeightConstraintError extends CalibrationError {
  constructor(weightSum: number, target: number, tolerance: number) {
    super(
      `Weight sum ${weightSum.toFixed(4)} outside tolerance of target ${target} (±${tolerance})`,
      "WEIGHT_CONSTRAINT_ERROR",
      { weightSum, target, tolerance },
    );
  }
}

export class BrierScoreTargetMissedError extends CalibrationError {
  constructor(actual: number, target: number) {
    super(
      `Brier score ${actual.toFixed(4)} exceeds target ${target}`,
      "BRIER_TARGET_MISSED",
      { actual, target },
    );
  }
}
