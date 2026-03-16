/**
 * BrowserPool — Verwaltet mehrere Browser-Instanzen.
 * WICHTIG: Contexts werden NIEMALS recycelt. Immer Kill + Neuerstellung.
 * Implementiert Circuit Breaker Pattern fuer Browser-Launches.
 */

import { chromium, type Browser, type BrowserType } from "playwright";
import pino from "pino";
import { randomUUID } from "node:crypto";

import type {
  BrowserInstance,
  PoolConfig,
  PoolStatus,
  PoolWaiter,
  CircuitBreakerState,
} from "./types.js";
import {
  BrowserLaunchError,
  PoolExhaustedError,
  CircuitBreakerOpenError,
} from "./errors.js";

const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxSize: 3,
  acquireTimeoutMs: 10_000,
  healthCheckIntervalMs: 30_000,
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeoutMs: 60_000,
    halfOpenMaxAttempts: 1,
  },
};

/**
 * BrowserPool — Pool fuer Browser-Instanzen mit Circuit Breaker.
 *
 * Design-Prinzip: Contexts werden nach jeder Nutzung getoetet, niemals recycelt.
 * Recycling hinterlaesst V8 Heap Fragmentation, Blink-interne Layout-Caches,
 * retained DOM-Referenzen und nicht-terminierte Web Workers.
 */
export class BrowserPool {
  private readonly instances: Map<string, BrowserInstance> = new Map();
  private readonly available: string[] = [];
  private readonly waitQueue: PoolWaiter[] = [];
  private readonly config: PoolConfig;
  private readonly logger: pino.Logger;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  // Circuit Breaker State
  private cbState: CircuitBreakerState = "closed";
  private cbFailureCount = 0;
  private cbLastFailureTime = 0;
  private cbHalfOpenAttempts = 0;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.logger = pino({
      level: process.env.LOG_LEVEL ?? "info",
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    }).child({ module: "browser-pool" });

    this.startHealthChecks();
  }

  /**
   * Browser-Instanz aus dem Pool holen oder neue starten.
   * Wirft PoolExhaustedError bei Timeout, CircuitBreakerOpenError wenn CB offen.
   */
  async acquire(): Promise<BrowserInstance> {
    // Circuit Breaker pruefen
    this.checkCircuitBreaker();

    // Verfuegbare Instanz aus Pool nehmen
    if (this.available.length > 0) {
      const id = this.available.shift()!;
      const instance = this.instances.get(id);
      if (instance && instance.healthy) {
        this.logger.debug(
          { browserId: id, poolSize: this.instances.size },
          "Acquired existing browser from pool"
        );
        return instance;
      }
      // Nicht mehr healthy — entfernen
      if (instance) {
        await this.destroyInstance(id);
      }
    }

    // Unter Limit: Neue Instanz starten
    if (this.instances.size < this.config.maxSize) {
      return this.createInstance();
    }

    // Pool voll — mit Timeout warten
    return new Promise<BrowserInstance>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waitQueue.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) this.waitQueue.splice(idx, 1);
        reject(
          new PoolExhaustedError(
            `Pool exhausted — max size ${this.config.maxSize} reached, timeout after ${this.config.acquireTimeoutMs}ms`
          )
        );
      }, this.config.acquireTimeoutMs);

      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  /**
   * Browser zurueck in den Pool. Alle Contexts werden GEKILLT.
   */
  async release(browserId: string): Promise<void> {
    const instance = this.instances.get(browserId);
    if (!instance) {
      this.logger.warn({ browserId }, "Unknown browser ID for release");
      return;
    }

    // Alle Contexts KILLEN — kein Recycling
    for (const [ctxId, managed] of instance.contexts.entries()) {
      try {
        if (managed.cdpSession) {
          await managed.cdpSession.detach().catch(() => {});
        }
        await managed.context.close();
      } catch {
        // Context schon geschlossen
      }
      instance.contexts.delete(ctxId);
    }

    this.logger.debug(
      { browserId, waitQueueLen: this.waitQueue.length },
      "Browser released, contexts killed"
    );

    // Wartende bedienen
    if (this.waitQueue.length > 0 && instance.healthy) {
      const next = this.waitQueue.shift()!;
      clearTimeout(next.timer);
      next.resolve(instance);
    } else {
      this.available.push(browserId);
    }
  }

  /**
   * Pool leeren — alle Browser herunterfahren.
   */
  async drain(): Promise<void> {
    this.logger.info(
      { poolSize: this.instances.size },
      "Draining browser pool"
    );

    // Health-Checks stoppen
    this.stopHealthChecks();

    // Alle Wartenden ablehnen
    for (const waiter of this.waitQueue) {
      clearTimeout(waiter.timer);
      waiter.reject(new PoolExhaustedError("Pool is draining"));
    }
    this.waitQueue.length = 0;
    this.available.length = 0;

    // Alle Instanzen zerstoeren
    const ids = [...this.instances.keys()];
    for (const id of ids) {
      await this.destroyInstance(id);
    }

    this.logger.info("Browser pool drained");
  }

  /**
   * Aktuelle Pool-Groesse (Anzahl Browser-Instanzen).
   */
  size(): number {
    return this.instances.size;
  }

  /**
   * Pool-Status fuer Monitoring/Health-Checks.
   */
  status(): PoolStatus {
    let totalContexts = 0;
    for (const instance of this.instances.values()) {
      totalContexts += instance.contexts.size;
    }

    return {
      totalBrowsers: this.instances.size,
      activeBrowsers: this.instances.size - this.available.length,
      totalContexts,
      maxPoolSize: this.config.maxSize,
      circuitBreakerState: this.cbState,
      waitQueueLength: this.waitQueue.length,
      loadFactor:
        this.config.maxSize > 0
          ? this.instances.size / this.config.maxSize
          : 0,
    };
  }

  // ============================================================================
  // Circuit Breaker
  // ============================================================================

  private checkCircuitBreaker(): void {
    if (this.cbState === "open") {
      const elapsed = Date.now() - this.cbLastFailureTime;
      if (elapsed >= this.config.circuitBreaker.resetTimeoutMs) {
        // Transition: open -> half_open
        this.cbState = "half_open";
        this.cbHalfOpenAttempts = 0;
        this.logger.info("Circuit breaker transitioning to half-open");
      } else {
        throw new CircuitBreakerOpenError(
          `Circuit breaker is open — ${this.cbFailureCount} failures in last ${this.config.circuitBreaker.resetTimeoutMs}ms. Reset in ${this.config.circuitBreaker.resetTimeoutMs - elapsed}ms`
        );
      }
    }

    if (this.cbState === "half_open") {
      if (
        this.cbHalfOpenAttempts >=
        this.config.circuitBreaker.halfOpenMaxAttempts
      ) {
        // Noch nicht genug Erfolge — wieder open
        this.cbState = "open";
        this.cbLastFailureTime = Date.now();
        throw new CircuitBreakerOpenError(
          "Circuit breaker tripped again during half-open probe"
        );
      }
      this.cbHalfOpenAttempts++;
    }
  }

  private recordFailure(): void {
    this.cbFailureCount++;
    this.cbLastFailureTime = Date.now();

    if (this.cbFailureCount >= this.config.circuitBreaker.failureThreshold) {
      this.cbState = "open";
      this.logger.error(
        {
          failureCount: this.cbFailureCount,
          threshold: this.config.circuitBreaker.failureThreshold,
        },
        "Circuit breaker OPEN — too many launch failures"
      );
    }
  }

  private recordSuccess(): void {
    if (this.cbState === "half_open") {
      // Erfolg waehrend half-open -> closed
      this.cbState = "closed";
      this.cbFailureCount = 0;
      this.logger.info("Circuit breaker recovered — state: closed");
    }
    // Bei "closed" nur Reset wenn laenger als resetTimeout her
    if (
      this.cbState === "closed" &&
      Date.now() - this.cbLastFailureTime >
        this.config.circuitBreaker.resetTimeoutMs
    ) {
      this.cbFailureCount = 0;
    }
  }

  // ============================================================================
  // Instance Management
  // ============================================================================

  private async createInstance(): Promise<BrowserInstance> {
    const id = randomUUID();

    try {
      this.logger.info({ browserId: id }, "Launching new browser instance");

      const browser = await (chromium as BrowserType).launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-gpu",
          "--disable-setuid-sandbox",
          "--disk-cache-size=0",
        ],
      });

      const instance: BrowserInstance = {
        id,
        browser,
        createdAt: new Date(),
        contexts: new Map(),
        healthy: true,
      };

      // Disconnect-Handler
      browser.on("disconnected", () => {
        this.logger.error(
          { browserId: id },
          "Browser instance disconnected unexpectedly"
        );
        instance.healthy = false;
        instance.contexts.clear();
        this.instances.delete(id);
        const availIdx = this.available.indexOf(id);
        if (availIdx >= 0) this.available.splice(availIdx, 1);
      });

      this.instances.set(id, instance);
      this.recordSuccess();

      this.logger.info(
        { browserId: id, poolSize: this.instances.size },
        "Browser instance launched"
      );

      return instance;
    } catch (err) {
      this.recordFailure();
      throw new BrowserLaunchError(
        `Failed to launch browser instance: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err instanceof Error ? err : new Error(String(err)) }
      );
    }
  }

  private async destroyInstance(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) return;

    // Contexts killen
    for (const managed of instance.contexts.values()) {
      try {
        if (managed.cdpSession) {
          await managed.cdpSession.detach().catch(() => {});
        }
        await managed.context.close();
      } catch {
        // Context schon geschlossen
      }
    }
    instance.contexts.clear();

    // Browser schliessen
    try {
      await instance.browser.close();
    } catch {
      // Browser schon tot
    }

    this.instances.delete(id);
    const availIdx = this.available.indexOf(id);
    if (availIdx >= 0) this.available.splice(availIdx, 1);

    this.logger.info(
      { browserId: id, poolSize: this.instances.size },
      "Browser instance destroyed"
    );
  }

  // ============================================================================
  // Health Checks
  // ============================================================================

  private startHealthChecks(): void {
    if (this.config.healthCheckIntervalMs <= 0) return;

    this.healthCheckTimer = setInterval(() => {
      void this.runHealthChecks();
    }, this.config.healthCheckIntervalMs);

    // Timer darf Prozess nicht am Leben halten
    if (this.healthCheckTimer && "unref" in this.healthCheckTimer) {
      (this.healthCheckTimer as NodeJS.Timeout).unref();
    }
  }

  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async runHealthChecks(): Promise<void> {
    for (const [id, instance] of this.instances.entries()) {
      try {
        // Temporaere Page erstellen und JS ausfuehren
        const page = await instance.browser.newPage();
        await page.evaluate(() => 1 + 1);
        await page.close();
        instance.healthy = true;
      } catch {
        this.logger.error(
          { browserId: id },
          "Health check failed — marking instance unhealthy"
        );
        instance.healthy = false;
        // Unhealthy Instanzen aus Available-Liste entfernen
        const availIdx = this.available.indexOf(id);
        if (availIdx >= 0) this.available.splice(availIdx, 1);
      }
    }
  }
}
