/**
 * BALAGE Confidence Calibration — Public API
 *
 * Platt Scaling, Brier Score Analyse, Reliability Diagrams
 * und Grid Search Optimierung fuer Confidence-Kalibrierung.
 */

// Core
export { PlattScaler } from "./platt-scaling.js";
export { analyzeBrierScore, compareBrierScores, meetsBrierTarget } from "./brier-score.js";
export { generateReliabilityDiagram, generateComparisonDiagram } from "./reliability-diagram.js";
export { GridSearchOptimizer } from "./grid-search.js";

// Typen
export type {
  PlattScalingParams,
  PlattScalingConfig,
  CalibrationDataPoint,
  BrierScoreAnalysis,
  ReliabilityDiagramData,
  ReliabilityBucket,
  WeightConfig,
  GridSearchConfig,
  GridSearchResult,
  GridSearchProgress,
} from "./types.js";

// Errors
export {
  CalibrationError,
  InsufficientDataError,
  PlattScalingConvergenceError,
  GridSearchExhaustedError,
  WeightConstraintError,
  BrierScoreTargetMissedError,
} from "./errors.js";
