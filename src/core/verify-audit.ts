/**
 * verify() — Audit Trail
 *
 * Optionaler Audit-Trail fuer Debugging und Compliance.
 */

import type { AuditEntry } from "./verify-types.js";

export class AuditTrail {
  private readonly entries: AuditEntry[] = [];
  private readonly enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  log(phase: string, detail: string): void {
    if (!this.enabled) return;
    this.entries.push({
      timestamp: Date.now(),
      phase,
      detail,
    });
  }

  getEntries(): AuditEntry[] | undefined {
    return this.enabled ? [...this.entries] : undefined;
  }
}
