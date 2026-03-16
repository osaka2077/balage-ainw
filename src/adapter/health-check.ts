/**
 * Health Checks — Browser-Instanz und Pool Gesundheitspruefung.
 */

import type { Browser } from "playwright";
import pino from "pino";

import type { HealthCheckResult } from "./types.js";
import type { BrowserPool } from "./browser-pool.js";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}).child({ module: "health-check" });

/**
 * Browser-Instanz Health Check.
 * Prueft ob der Browser-Prozess alive ist und eine Page erstellt werden kann.
 */
export async function checkBrowser(
  browser: Browser | null
): Promise<HealthCheckResult> {
  if (!browser) {
    return {
      healthy: false,
      details: {
        error: "Browser instance is null",
        connected: false,
      },
    };
  }

  if (!browser.isConnected()) {
    return {
      healthy: false,
      details: {
        error: "Browser is disconnected",
        connected: false,
      },
    };
  }

  try {
    // Erstelle temporaere Page und fuehre JS aus — zuverlaessigster Test
    const page = await browser.newPage();
    try {
      const result = await page.evaluate(() => {
        return {
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
        };
      });

      return {
        healthy: true,
        details: {
          connected: true,
          timestamp: result.timestamp,
          userAgent: result.userAgent,
          contexts: browser.contexts().length,
        },
      };
    } finally {
      await page.close().catch(() => {});
    }
  } catch (err) {
    logger.error(
      { err },
      "Browser health check failed — browser may be internally broken"
    );

    return {
      healthy: false,
      details: {
        error: err instanceof Error ? err.message : String(err),
        connected: browser.isConnected(),
      },
    };
  }
}

/**
 * Pool Health Check.
 * Prueft Pool-Status, aktive/verfuegbare Browser, Circuit-Breaker-Status.
 */
export function checkPool(pool: BrowserPool): HealthCheckResult {
  const status = pool.status();

  const healthy =
    status.circuitBreakerState !== "open" && status.totalBrowsers > 0;

  return {
    healthy,
    details: {
      totalBrowsers: status.totalBrowsers,
      activeBrowsers: status.activeBrowsers,
      totalContexts: status.totalContexts,
      maxPoolSize: status.maxPoolSize,
      circuitBreakerState: status.circuitBreakerState,
      waitQueueLength: status.waitQueueLength,
      loadFactor: status.loadFactor,
      overloaded: status.loadFactor > 0.8,
    },
  };
}

/**
 * Connectivity Check — Kann der Browser eine Test-URL laden?
 */
export async function checkConnectivity(
  browser: Browser | null,
  testUrl = "data:text/html,<h1>health</h1>"
): Promise<HealthCheckResult> {
  if (!browser || !browser.isConnected()) {
    return {
      healthy: false,
      details: {
        error: "Browser not available",
        testUrl,
      },
    };
  }

  const startTime = Date.now();

  try {
    const page = await browser.newPage();
    try {
      await page.goto(testUrl, { timeout: 10_000 });

      const content = await page.content();
      const duration = Date.now() - startTime;

      return {
        healthy: content.length > 0,
        details: {
          testUrl,
          duration,
          contentLength: content.length,
          status: "ok",
        },
      };
    } finally {
      await page.close().catch(() => {});
    }
  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error({ err, testUrl, duration }, "Connectivity check failed");

    return {
      healthy: false,
      details: {
        testUrl,
        duration,
        error: err instanceof Error ? err.message : String(err),
        status: "failed",
      },
    };
  }
}
