/**
 * Browser Adapter — Public API.
 * Exportiert nur was andere Layer brauchen.
 */

// Hauptklassen
export { BrowserAdapter } from "./browser-adapter.js";
export { BrowserPool } from "./browser-pool.js";

// DOM/AX-Tree Extraction
export {
  extractStructuredDOM,
  extractAccessibilityTree,
} from "./dom-extractor.js";

// State Detection
export { StateDetector } from "./state-detector.js";

// Health Checks
export { checkBrowser, checkPool, checkConnectivity } from "./health-check.js";

// Error-Klassen
export {
  BrowserLaunchError,
  BrowserTimeoutError,
  ContextCreationError,
  DomExtractionError,
  StateDetectionError,
  PoolExhaustedError,
  CircuitBreakerOpenError,
} from "./errors.js";

// Typen
export type {
  BrowserInstance,
  PoolStatus,
  HealthCheckResult,
  PoolConfig,
  CircuitBreakerState,
  CircuitBreakerConfig,
  ManagedContext,
} from "./types.js";

// Browser Config (Layer 1 — ADR-013)
export { BrowserAdapterConfigSchema } from "./config-schema.js";
export type { BrowserAdapterConfig } from "./config-schema.js";

// Shared Interface Re-Exports
export type {
  DomNode,
  AccessibilityNode,
  StateChangeEvent,
  StateChangeType,
  BoundingBox,
} from "./types.js";
