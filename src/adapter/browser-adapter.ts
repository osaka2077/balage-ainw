/**
 * BrowserAdapter — Hauptklasse fuer Browser-Steuerung.
 * Orchestriert Playwright + CDP, Context-Management, Graceful Shutdown.
 */

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
  type CDPSession,
  type BrowserType,
} from "playwright";
import pino from "pino";

import type { BrowserAdapterConfig, ManagedContext } from "./types.js";
import { BrowserAdapterConfigSchema } from "./types.js";
import {
  BrowserLaunchError,
  BrowserTimeoutError,
  ContextCreationError,
} from "./errors.js";

const BROWSER_TYPES: Record<string, BrowserType> = {
  chromium,
  firefox,
  webkit,
};

/**
 * BrowserAdapter — Primaere Schnittstelle zum Browser.
 * Verwendet Playwright als Abstraktion mit selektivem CDP-Zugriff.
 */
export class BrowserAdapter {
  private browser: Browser | null = null;
  private readonly contexts: Map<string, ManagedContext> = new Map();
  private readonly config: BrowserAdapterConfig;
  private readonly logger: pino.Logger;
  private shutdownInProgress = false;
  private contextCounter = 0;
  private shutdownHandlersRegistered = false;

  constructor(config: Partial<BrowserAdapterConfig> = {}) {
    this.config = BrowserAdapterConfigSchema.parse(config);
    this.logger = pino({
      level: process.env.LOG_LEVEL ?? "info",
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    }).child({ module: "browser-adapter" });
  }

  /**
   * Browser starten. Registriert Shutdown-Handler und Disconnect-Recovery.
   */
  async launch(): Promise<void> {
    if (this.browser) {
      this.logger.warn("Browser already launched, skipping");
      return;
    }

    const browserType = BROWSER_TYPES[this.config.browserType];
    if (!browserType) {
      throw new BrowserLaunchError(
        `Unsupported browser type: ${this.config.browserType}`
      );
    }

    try {
      this.logger.info(
        { browserType: this.config.browserType, headless: this.config.headless },
        "Launching browser"
      );

      const launchArgs =
        this.config.browserType === "chromium"
          ? [
              "--disable-blink-features=AutomationControlled",
              "--no-sandbox",
              "--disable-gpu",
              "--disable-setuid-sandbox",
              "--dns-prefetch-disable",
              "--disk-cache-size=0",
              `--window-size=${this.config.viewport.width},${this.config.viewport.height}`,
            ]
          : [];

      this.browser = await browserType.launch({
        headless: this.config.headless,
        args: launchArgs,
      });

      // Browser-Disconnect-Handler
      this.browser.on("disconnected", () => {
        this.handleBrowserDisconnect();
      });

      this.registerShutdownHandlers();

      this.logger.info("Browser launched successfully");
    } catch (err) {
      throw new BrowserLaunchError("Failed to launch browser", {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  /**
   * Graceful Shutdown — alle Contexts schliessen, dann Browser.
   * Timeout 5s, danach force-kill.
   */
  async shutdown(): Promise<void> {
    if (this.shutdownInProgress) return;
    this.shutdownInProgress = true;

    this.logger.info("Shutting down browser adapter");

    const shutdownPromise = this.performShutdown();
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(
        () => reject(new BrowserTimeoutError("Shutdown timeout after 5000ms")),
        5000
      );
    });

    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
    } catch (err) {
      this.logger.error({ err }, "Shutdown timeout — forcing close");
      // Force close
      if (this.browser) {
        try {
          await this.browser.close();
        } catch {
          // Browser-Prozess schon tot
        }
        this.browser = null;
      }
    }

    this.contexts.clear();
    this.shutdownInProgress = false;
    this.logger.info("Browser adapter shutdown complete");
  }

  /**
   * Neuen isolierten BrowserContext erstellen.
   * KEIN Recycling — immer fresh Context.
   */
  async newContext(): Promise<string> {
    if (!this.browser) {
      throw new ContextCreationError("Browser not launched");
    }
    if (this.shutdownInProgress) {
      throw new ContextCreationError("Shutdown in progress — no new contexts");
    }

    try {
      const contextId = `ctx-${++this.contextCounter}-${Date.now()}`;

      const proxyConfig =
        this.config.proxy.enabled && this.config.proxy.server
          ? { server: this.config.proxy.server }
          : undefined;

      const context = await this.browser.newContext({
        viewport: this.config.viewport,
        locale: this.config.locale,
        timezoneId: this.config.timezone,
        extraHTTPHeaders: this.config.extraHTTPHeaders,
        proxy: proxyConfig,
      });

      context.setDefaultTimeout(this.config.actionTimeout);
      context.setDefaultNavigationTimeout(this.config.navigationTimeout);

      const page = await context.newPage();

      // CDP-Session fuer Low-Level-Zugriff (nur Chromium)
      let cdpSession: CDPSession | null = null;
      if (this.config.browserType === "chromium") {
        cdpSession = await context.newCDPSession(page);
        await cdpSession.send("DOM.enable");
        await cdpSession.send("Performance.enable");
      }

      const managed: ManagedContext = {
        id: contextId,
        context,
        page,
        cdpSession,
        createdAt: new Date(),
      };

      this.contexts.set(contextId, managed);

      this.logger.info(
        { contextId, totalContexts: this.contexts.size },
        "Context created"
      );

      return contextId;
    } catch (err) {
      throw new ContextCreationError("Failed to create browser context", {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  /**
   * Context sauber schliessen und entfernen.
   */
  async destroyContext(contextId: string): Promise<void> {
    const managed = this.contexts.get(contextId);
    if (!managed) {
      this.logger.warn({ contextId }, "Context not found for destruction");
      return;
    }

    try {
      // CDP-Session zuerst detachen
      if (managed.cdpSession) {
        await managed.cdpSession.detach().catch(() => {});
      }

      // Context IMMER schliessen — kein Recycling
      await managed.context.close();
    } catch (err) {
      this.logger.error({ contextId, err }, "Error destroying context");
    } finally {
      this.contexts.delete(contextId);
      this.logger.info(
        { contextId, totalContexts: this.contexts.size },
        "Context destroyed"
      );
    }
  }

  /**
   * Page aus einem Context holen.
   */
  getPage(contextId: string): Page {
    const managed = this.contexts.get(contextId);
    if (!managed) {
      throw new ContextCreationError(`Context ${contextId} not found`);
    }
    return managed.page;
  }

  /**
   * CDP-Session aus einem Context holen (nur Chromium, sonst null).
   */
  getCdpSession(contextId: string): CDPSession | null {
    const managed = this.contexts.get(contextId);
    if (!managed) {
      throw new ContextCreationError(`Context ${contextId} not found`);
    }
    return managed.cdpSession;
  }

  /**
   * Pruefen ob Browser aktiv ist.
   */
  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  /**
   * Anzahl aktiver Contexts.
   */
  contextCount(): number {
    return this.contexts.size;
  }

  /**
   * Alle Context-IDs.
   */
  getContextIds(): string[] {
    return [...this.contexts.keys()];
  }

  /**
   * Zugriff auf die rohe Browser-Instanz (fuer Pool/HealthCheck).
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async performShutdown(): Promise<void> {
    // Alle Contexts schliessen
    const contextIds = [...this.contexts.keys()];
    for (const contextId of contextIds) {
      await this.destroyContext(contextId);
    }

    // Browser schliessen
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private handleBrowserDisconnect(): void {
    this.logger.error("Browser disconnected unexpectedly");

    // Alle Contexts als verloren markieren
    const lostContexts = [...this.contexts.keys()];
    this.contexts.clear();
    this.browser = null;

    for (const contextId of lostContexts) {
      this.logger.error(
        { contextId },
        "Context lost — page references invalidated"
      );
    }
  }

  private registerShutdownHandlers(): void {
    if (this.shutdownHandlersRegistered) return;
    this.shutdownHandlersRegistered = true;

    const shutdown = async (signal: string): Promise<void> => {
      this.logger.info({ signal }, "Graceful shutdown initiated");
      await this.shutdown();
    };

    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
  }
}
