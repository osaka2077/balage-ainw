/**
 * Safety Tests — GateContext-Fixtures
 *
 * Valide Kontexte mit UUIDs und Evidence-Arrays.
 */

import type { GateContext } from "../../../src/risk/types.js";
import type { Evidence } from "../../../shared_interfaces.js";

/** Erzeugt einen frischen GateContext mit gegebener Evidence */
export function createContext(evidence: Evidence[] = []): GateContext {
  return {
    sessionId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
    traceId: "11111111-2222-4333-4444-555555555555",
    evidence,
    domain: "shop.example.com",
  };
}

/** Erzeugt einen Context mit eigener sessionId (fuer Multi-Session-Tests) */
export function createContextWithSession(
  sessionId: string,
  evidence: Evidence[] = [],
): GateContext {
  return {
    sessionId,
    traceId: crypto.randomUUID(),
    evidence,
    domain: "shop.example.com",
  };
}

/** Erzeugt einen Context mit eigener traceId (fuer Audit-Trail-Tests) */
export function createTracedContext(
  traceId: string,
  evidence: Evidence[] = [],
): GateContext {
  return {
    sessionId: crypto.randomUUID(),
    traceId,
    evidence,
    domain: "shop.example.com",
  };
}
