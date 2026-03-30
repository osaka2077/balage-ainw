/**
 * Firecrawl Cost-Limiter (FC-014)
 *
 * In-memory Rate-Limiter fuer Firecrawl API Calls.
 * Begrenzt Calls pro Minute und pro Stunde.
 * Pruefung erfolgt in FirecrawlFetcher.fetch() VOR dem API-Call.
 *
 * Sliding-Window-Ansatz: Timestamps werden gespeichert und alte Eintraege
 * beim naechsten Check entfernt. Kein Hintergrund-Timer noetig.
 */

import { FetchRateLimitError } from "./errors.js";

// ============================================================================
// Config
// ============================================================================

export interface CostLimiterConfig {
  /** Max Calls pro Minute. Default: 10 */
  maxPerMinute: number;

  /** Max Calls pro Stunde. Default: 100 */
  maxPerHour: number;
}

const DEFAULT_CONFIG: CostLimiterConfig = {
  maxPerMinute: 10,
  maxPerHour: 100,
};

// ============================================================================
// CostLimiter
// ============================================================================

export class CostLimiter {
  private readonly config: CostLimiterConfig;
  private readonly timestamps: number[] = [];

  constructor(config?: Partial<CostLimiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Prueft ob ein neuer Call erlaubt ist.
   * Wirft FetchRateLimitError wenn ein Limit erreicht wurde.
   *
   * MUSS vor jedem Firecrawl API-Call aufgerufen werden.
   */
  check(url: string): void {
    const now = Date.now();
    this.pruneOldEntries(now);

    const oneMinuteAgo = now - 60_000;
    const oneHourAgo = now - 3_600_000;

    const callsLastMinute = this.timestamps.filter(t => t > oneMinuteAgo).length;
    const callsLastHour = this.timestamps.filter(t => t > oneHourAgo).length;

    if (callsLastMinute >= this.config.maxPerMinute) {
      const retryAfterSec = Math.ceil(
        (this.timestamps.find(t => t > oneMinuteAgo)! - oneMinuteAgo) / 1000,
      );
      throw new FetchRateLimitError(
        url,
        retryAfterSec,
      );
    }

    if (callsLastHour >= this.config.maxPerHour) {
      const retryAfterSec = Math.ceil(
        (this.timestamps.find(t => t > oneHourAgo)! - oneHourAgo) / 1000,
      );
      throw new FetchRateLimitError(
        url,
        retryAfterSec,
      );
    }
  }

  /**
   * Registriert einen erfolgreichen API-Call.
   * Wird NACH dem Call aufgerufen.
   */
  record(): void {
    this.timestamps.push(Date.now());
  }

  /**
   * Entfernt Timestamps die aelter als 1 Stunde sind.
   * Verhindert unbegrenztes Wachstum des Arrays.
   */
  private pruneOldEntries(now: number): void {
    const oneHourAgo = now - 3_600_000;
    // Finde den ersten Eintrag der noch relevant ist
    let firstRelevant = 0;
    while (firstRelevant < this.timestamps.length && this.timestamps[firstRelevant]! <= oneHourAgo) {
      firstRelevant++;
    }
    if (firstRelevant > 0) {
      this.timestamps.splice(0, firstRelevant);
    }
  }

  /**
   * Gibt aktuelle Statistiken zurueck (fuer Logging/Monitoring).
   */
  stats(): { callsLastMinute: number; callsLastHour: number; limits: CostLimiterConfig } {
    const now = Date.now();
    this.pruneOldEntries(now);
    const oneMinuteAgo = now - 60_000;
    return {
      callsLastMinute: this.timestamps.filter(t => t > oneMinuteAgo).length,
      callsLastHour: this.timestamps.length,
      limits: { ...this.config },
    };
  }

  /**
   * Setzt den Limiter zurueck (fuer Tests).
   */
  reset(): void {
    this.timestamps.length = 0;
  }
}
