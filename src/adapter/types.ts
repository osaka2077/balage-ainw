/**
 * Adapter Types — Re-Exports aus shared_interfaces + lokale Typen.
 */

import type { Browser, BrowserContext, Page, CDPSession } from "playwright";

// Re-Exports aus shared_interfaces
export type {
  BrowserAdapterConfig,
  DomNode,
  AccessibilityNode,
  StateChangeEvent,
  StateChangeType,
  BoundingBox,
} from "../../shared_interfaces.js";

export {
  BrowserAdapterConfigSchema,
  DomNodeSchema,
  AccessibilityNodeSchema,
  StateChangeEventSchema,
  StateChangeTypeSchema,
  BoundingBoxSchema,
} from "../../shared_interfaces.js";

// ============================================================================
// Lokale Typen — nur fuer den Adapter
// ============================================================================

/** Einzelne Browser-Instanz im Pool */
export interface BrowserInstance {
  id: string;
  browser: Browser;
  createdAt: Date;
  contexts: Map<string, ManagedContext>;
  healthy: boolean;
}

/** Verwalteter BrowserContext mit Metadaten */
export interface ManagedContext {
  id: string;
  context: BrowserContext;
  page: Page;
  cdpSession: CDPSession | null;
  createdAt: Date;
}

/** Pool-Status fuer Monitoring */
export interface PoolStatus {
  totalBrowsers: number;
  activeBrowsers: number;
  totalContexts: number;
  maxPoolSize: number;
  circuitBreakerState: CircuitBreakerState;
  waitQueueLength: number;
  loadFactor: number;
}

/** Health-Check Ergebnis */
export interface HealthCheckResult {
  healthy: boolean;
  details: Record<string, unknown>;
}

/** Circuit Breaker Zustaende */
export type CircuitBreakerState = "closed" | "open" | "half_open";

/** Circuit Breaker Konfiguration */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

/** Pool-Konfiguration */
export interface PoolConfig {
  maxSize: number;
  acquireTimeoutMs: number;
  healthCheckIntervalMs: number;
  circuitBreaker: CircuitBreakerConfig;
}

/** Interner Waiter in der Acquire-Queue */
export interface PoolWaiter {
  resolve: (instance: BrowserInstance) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
