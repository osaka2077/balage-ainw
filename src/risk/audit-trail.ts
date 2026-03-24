/**
 * AuditTrail — Lueckenloses, IMMUTABLE Audit-Protokoll.
 *
 * Jede Gate-Entscheidung wird protokolliert — ausnahmslos.
 * Eintraege koennen NICHT geaendert oder geloescht werden.
 */

import pino from "pino";
import type { AuditEntry } from "./types.js";
import { AuditTrailImmutableError } from "./errors.js";

const logger = pino({ name: "risk-gate:audit-trail" });

/** Default Retention: 90 Tage in Millisekunden */
const DEFAULT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface AuditTrailOptions {
  retentionMs?: number;
}

export class AuditTrail {
  private readonly entries: AuditEntry[] = [];
  private readonly retentionMs: number;
  private sequenceNumber = 0;

  constructor(options?: AuditTrailOptions) {
    this.retentionMs = options?.retentionMs ?? DEFAULT_RETENTION_MS;
  }

  /** Protokolliert eine Gate-Entscheidung — APPEND ONLY */
  logDecision(entry: AuditEntry): void {
    this.sequenceNumber++;

    // Deep-freeze den Eintrag, damit er nicht nachtraeglich geaendert werden kann
    const frozen = deepFreeze({ ...entry });
    this.entries.push(frozen);

    logger.info(
      {
        auditId: entry.id,
        traceId: entry.traceId,
        action: entry.action,
        decision: entry.decision,
        confidence: entry.confidence,
        sequence: this.sequenceNumber,
      },
      "Audit entry logged"
    );
  }

  /** Gibt den vollstaendigen Trail einer Session zurueck (Kopien!) */
  getTrail(sessionId: string): ReadonlyArray<Readonly<AuditEntry>> {
    return this.entries.filter(
      (e) => e.traceId === sessionId || e.actorId === sessionId
    );
  }

  /** Gibt alle Eintraege zurueck (Kopien!) */
  getAllEntries(): ReadonlyArray<Readonly<AuditEntry>> {
    return [...this.entries];
  }

  /** Gibt die Anzahl der Eintraege zurueck */
  size(): number {
    return this.entries.length;
  }

  /**
   * Versuch einen Eintrag zu aendern — wirft IMMER AuditTrailImmutableError.
   * Diese Methode existiert nur um die Immutability explizit zu dokumentieren.
   */
  updateEntry(_id: string, _updates: Partial<AuditEntry>): never {
    throw new AuditTrailImmutableError();
  }

  /**
   * Versuch einen Eintrag zu loeschen — wirft IMMER AuditTrailImmutableError.
   * Diese Methode existiert nur um die Immutability explizit zu dokumentieren.
   */
  deleteEntry(_id: string): never {
    throw new AuditTrailImmutableError();
  }

  /**
   * Entfernt abgelaufene Eintraege basierend auf Retention-Policy.
   * Dies ist die EINZIGE erlaubte Form der Entfernung — automatisch nach Ablauf.
   */
  purgeExpired(): number {
    const cutoff = new Date(Date.now() - this.retentionMs);
    const before = this.entries.length;

    // Von hinten nach vorne iterieren um Splice-Probleme zu vermeiden
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i]!.timestamp < cutoff) {
        this.entries.splice(i, 1);
      }
    }

    const purged = before - this.entries.length;
    if (purged > 0) {
      logger.info(
        { purged, remaining: this.entries.length },
        "Expired audit entries purged"
      );
    }

    return purged;
  }

  /** Prueft ob der Audit-Trail lueckenlos ist (keine fehlenden Sequenzen) */
  isContiguous(): boolean {
    return this.entries.length === this.sequenceNumber;
  }
}

/** Deep-freeze ein Objekt rekursiv */
function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return obj;
}
