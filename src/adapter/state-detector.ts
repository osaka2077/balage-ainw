/**
 * StateDetector — Erkennt State Changes in Browser-Pages.
 * SPA-Navigation, Modals, DOM-Stability, Network Idle.
 *
 * Installiert MutationObserver und Event-Listener auf der Page.
 * DOM-Mutations werden 100ms gebundelt bevor Event emittiert wird (Debounce).
 */

/// <reference lib="dom" />

import type { Page, Dialog } from "playwright";
import { randomUUID } from "node:crypto";
import pino from "pino";

import type { StateChangeEvent } from "./types.js";
import { StateChangeEventSchema } from "./types.js";
import { StateDetectionError } from "./errors.js";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}).child({ module: "state-detector" });

/** DOM-Mutation Debounce in ms */
const MUTATION_DEBOUNCE_MS = 100;

/** Network Idle Threshold in ms */
const NETWORK_IDLE_THRESHOLD_MS = 500;

type StateChangeCallback = (event: StateChangeEvent) => void;

/**
 * StateDetector — Ueberwacht Browser-Pages auf State-Aenderungen.
 */
export class StateDetector {
  private readonly sessionId: string;
  private readonly callbacks: StateChangeCallback[] = [];
  private installedPages: WeakSet<Page> = new WeakSet();
  private lastUrl = "";
  private pendingRequests = 0;
  private networkIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private dialogHandler: ((dialog: Dialog) => void) | null = null;
  private disposed = false;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? randomUUID();
  }

  /**
   * MutationObserver und Event-Listener auf der Page installieren.
   * Erkennt: navigation, spa_navigation, dom_mutation, dialog_opened,
   * dialog_closed, content_loaded, network_idle.
   */
  async install(page: Page): Promise<void> {
    if (this.disposed) {
      throw new StateDetectionError("StateDetector has been disposed");
    }
    if (this.installedPages.has(page)) {
      logger.warn("StateDetector already installed on this page");
      return;
    }

    try {
      this.lastUrl = page.url();
      this.installedPages.add(page);

      // 1. Navigation Events (volle Navigation)
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) {
          const newUrl = frame.url();
          const previousUrl = this.lastUrl;
          this.lastUrl = newUrl;

          this.emit({
            type: "navigation",
            timestamp: new Date(),
            url: newUrl,
            previousUrl: previousUrl || undefined,
            sessionId: this.sessionId,
          });
        }
      });

      // 2. Content Loaded Events
      page.on("load", () => {
        this.emit({
          type: "content_loaded",
          timestamp: new Date(),
          url: page.url(),
          sessionId: this.sessionId,
        });
      });

      page.on("domcontentloaded", () => {
        this.emit({
          type: "content_loaded",
          timestamp: new Date(),
          url: page.url(),
          sessionId: this.sessionId,
        });
      });

      // 3. Dialog Events (Alert, Confirm, Prompt)
      this.dialogHandler = (dialog: Dialog) => {
        this.emit({
          type: "dialog_opened",
          timestamp: new Date(),
          url: page.url(),
          sessionId: this.sessionId,
          mutation: {
            type: "added",
            target: `dialog[type=${dialog.type()}]`,
            details: {
              dialogType: dialog.type(),
              message: dialog.message(),
            },
          },
        });
      };
      page.on("dialog", this.dialogHandler);

      // 4. Network Tracking fuer Network Idle
      page.on("request", () => {
        this.pendingRequests++;
        this.clearNetworkIdleTimer();
      });

      page.on("requestfinished", () => {
        this.pendingRequests = Math.max(0, this.pendingRequests - 1);
        this.checkNetworkIdle(page);
      });

      page.on("requestfailed", () => {
        this.pendingRequests = Math.max(0, this.pendingRequests - 1);
        this.checkNetworkIdle(page);
      });

      // 5. SPA Navigation Detection + DOM Mutation Observer (via exposed function)
      await this.installBrowserObservers(page);

      logger.info(
        { sessionId: this.sessionId, url: this.lastUrl },
        "StateDetector installed"
      );
    } catch (err) {
      throw new StateDetectionError(
        `Failed to install StateDetector: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err instanceof Error ? err : new Error(String(err)) }
      );
    }
  }

  /**
   * Callback registrieren fuer StateChangeEvents.
   */
  onStateChange(callback: StateChangeCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Alle Listener entfernen und aufraumen.
   */
  dispose(): void {
    this.disposed = true;
    this.callbacks.length = 0;
    this.clearNetworkIdleTimer();
    logger.info({ sessionId: this.sessionId }, "StateDetector disposed");
  }

  /**
   * Warten bis DOM stabil ist (keine Mutations mehr fuer quietPeriodMs).
   */
  async waitForStability(
    page: Page,
    timeoutMs = 2000,
    quietPeriodMs = 500
  ): Promise<boolean> {
    let lastMutationTime = Date.now();
    const callbackName = `__balage_stability_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    try {
      await page.exposeFunction(callbackName, () => {
        lastMutationTime = Date.now();
      });
    } catch {
      // Funktion bereits exponiert — ignorieren
    }

    try {
      await page.evaluate((cbName: string) => {
        const obs = new MutationObserver(() => {
          (window as unknown as Record<string, () => void>)[cbName]?.();
        });
        obs.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
        });
        window.addEventListener(
          "beforeunload",
          () => obs.disconnect(),
          { once: true }
        );
      }, callbackName);
    } catch {
      // Page evtl. navigiert — return false
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const checkInterval = setInterval(() => {
        const timeSinceLastMutation = Date.now() - lastMutationTime;
        if (timeSinceLastMutation >= quietPeriodMs) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve(true);
        }
      }, 50);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, timeoutMs);
    });
  }

  /**
   * Warten auf Network Idle (keine offenen Requests fuer thresholdMs).
   */
  async waitForNetworkIdle(
    page: Page,
    timeoutMs = 10_000,
    thresholdMs = NETWORK_IDLE_THRESHOLD_MS
  ): Promise<boolean> {
    if (this.pendingRequests === 0) return true;

    return new Promise<boolean>((resolve) => {
      let settled = false;

      const checkInterval = setInterval(() => {
        if (settled) return;
        if (this.pendingRequests === 0) {
          // Warten ob es so bleibt
          setTimeout(() => {
            if (this.pendingRequests === 0 && !settled) {
              settled = true;
              clearInterval(checkInterval);
              clearTimeout(timeout);
              resolve(true);
            }
          }, thresholdMs);
        }
      }, 100);

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          clearInterval(checkInterval);
          logger.warn(
            { sessionId: this.sessionId, pendingRequests: this.pendingRequests },
            "Network idle timeout"
          );
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * MutationObserver und History API Hooks im Browser-Context installieren.
   */
  private async installBrowserObservers(page: Page): Promise<void> {
    const spaCallbackName = `__balage_spa_nav_${Date.now()}`;
    const mutationCallbackName = `__balage_dom_mutation_${Date.now()}`;

    // Exposed Functions fuer Browser -> Node Kommunikation
    try {
      await page.exposeFunction(
        spaCallbackName,
        (newUrl: string, prevUrl: string) => {
          this.lastUrl = newUrl;
          this.emit({
            type: "spa_navigation",
            timestamp: new Date(),
            url: newUrl,
            previousUrl: prevUrl || undefined,
            sessionId: this.sessionId,
          });
        }
      );

      await page.exposeFunction(
        mutationCallbackName,
        (mutationType: string, target: string, addedCount: number, removedCount: number) => {
          this.emit({
            type: "dom_mutation",
            timestamp: new Date(),
            url: page.url(),
            sessionId: this.sessionId,
            mutation: {
              type: mutationType as "added" | "removed" | "modified" | "attribute_changed",
              target,
              details: { addedNodes: addedCount, removedNodes: removedCount },
            },
          });
        }
      );
    } catch {
      // Funktionen schon exponiert — bei Re-Install ignorieren
      return;
    }

    // Browser-seitige Observer installieren
    await page.evaluate(
      (params: { spaCallback: string; mutCallback: string; debounceMs: number }) => {
        // SPA Navigation Detection — History API Hooks
        const origPushState = history.pushState.bind(history);
        const origReplaceState = history.replaceState.bind(history);

        history.pushState = function (...args: Parameters<typeof history.pushState>) {
          const prevUrl = location.href;
          origPushState(...args);
          (window as unknown as Record<string, (a: string, b: string) => void>)[
            params.spaCallback
          ]?.(location.href, prevUrl);
        };

        history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
          const prevUrl = location.href;
          origReplaceState(...args);
          (window as unknown as Record<string, (a: string, b: string) => void>)[
            params.spaCallback
          ]?.(location.href, prevUrl);
        };

        window.addEventListener("popstate", () => {
          (window as unknown as Record<string, (a: string, b: string) => void>)[
            params.spaCallback
          ]?.(location.href, "");
        });

        // DOM Mutation Observer mit Debounce
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let pendingAdded = 0;
        let pendingRemoved = 0;
        let pendingTarget = "";
        let pendingType = "modified";

        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            // Noise filtern
            const target = m.target as Element;
            if (!target.tagName) continue;
            const tag = target.tagName.toUpperCase();
            if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") continue;

            pendingAdded += m.addedNodes.length;
            pendingRemoved += m.removedNodes.length;
            pendingTarget = target.tagName.toLowerCase();

            if (m.type === "attributes") {
              pendingType = "attribute_changed";
            } else if (m.addedNodes.length > 0) {
              pendingType = "added";
            } else if (m.removedNodes.length > 0) {
              pendingType = "removed";
            } else {
              pendingType = "modified";
            }
          }

          // Debounce: Buendeln fuer params.debounceMs
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            // Nur signifikante Mutations emittieren (min. 1 Node)
            if (pendingAdded + pendingRemoved > 0) {
              (
                window as unknown as Record<
                  string,
                  (t: string, tgt: string, a: number, r: number) => void
                >
              )[params.mutCallback]?.(
                pendingType,
                pendingTarget,
                pendingAdded,
                pendingRemoved
              );
            }
            pendingAdded = 0;
            pendingRemoved = 0;
            pendingTarget = "";
            pendingType = "modified";
          }, params.debounceMs);
        });

        if (document.body) {
          observer.observe(document.body, {
            childList: true,
            attributes: true,
            subtree: true,
          });
        }

        // Aufraemen bei Navigation
        window.addEventListener(
          "beforeunload",
          () => {
            observer.disconnect();
            if (debounceTimer) clearTimeout(debounceTimer);
          },
          { once: true }
        );
      },
      {
        spaCallback: spaCallbackName,
        mutCallback: mutationCallbackName,
        debounceMs: MUTATION_DEBOUNCE_MS,
      }
    );
  }

  /**
   * Event emittieren — validiert mit Zod und ruft alle Callbacks auf.
   */
  private emit(event: StateChangeEvent): void {
    try {
      const validated = StateChangeEventSchema.parse(event);

      logger.debug(
        { type: validated.type, url: validated.url, sessionId: validated.sessionId },
        "State change detected"
      );

      for (const callback of this.callbacks) {
        try {
          callback(validated);
        } catch (err) {
          logger.error(
            { err },
            "Error in state change callback"
          );
        }
      }
    } catch (err) {
      logger.error(
        { err, rawEvent: event },
        "State change event validation failed"
      );
    }
  }

  /**
   * Network Idle pruefen und Event emittieren.
   */
  private checkNetworkIdle(page: Page): void {
    if (this.pendingRequests > 0) return;

    this.clearNetworkIdleTimer();
    this.networkIdleTimer = setTimeout(() => {
      if (this.pendingRequests === 0 && !this.disposed) {
        this.emit({
          type: "network_idle",
          timestamp: new Date(),
          url: page.url(),
          sessionId: this.sessionId,
        });
      }
    }, NETWORK_IDLE_THRESHOLD_MS);
  }

  private clearNetworkIdleTimer(): void {
    if (this.networkIdleTimer) {
      clearTimeout(this.networkIdleTimer);
      this.networkIdleTimer = null;
    }
  }
}
