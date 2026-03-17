/**
 * Confidence Engine — Evidence Collector
 *
 * Sammelt Belege fuer einen Endpoint aus verschiedenen Quellen.
 * Erkennt Widersprueche zwischen Evidence-Stuecken.
 */

import pino from "pino";
import { EvidenceSchema } from "../../shared_interfaces.js";
import type { Endpoint, Evidence, UISegment } from "./types.js";
import type { EvidenceContradiction } from "./types.js";
import { EvidenceCollectionError } from "./errors.js";

const logger = pino({ name: "confidence:evidence-collector" });

/**
 * Sammelt alle verfuegbaren Belege fuer einen Endpoint.
 */
export function collectEvidence(
  endpoint: Endpoint,
  _segment?: UISegment,
): Evidence[] {
  const evidence: Evidence[] = [];

  try {
    // DOM-basiert: aus Anchors
    for (const anchor of endpoint.anchors) {
      if (anchor.selector) {
        evidence.push(
          EvidenceSchema.parse({
            type: "structural_pattern",
            signal: `DOM selector: ${anchor.selector}`,
            weight: 0.7,
            detail: `CSS-Selektor deutet auf ${endpoint.type}`,
            source: "dom",
          }),
        );
      }

      // ARIA-basiert
      if (anchor.ariaRole) {
        evidence.push(
          EvidenceSchema.parse({
            type: "aria_role",
            signal: `ARIA role: ${anchor.ariaRole}`,
            weight: 0.8,
            detail: `ARIA-Rolle ${anchor.ariaRole} stuetzt Typ ${endpoint.type}`,
            source: "aria",
          }),
        );
      }

      if (anchor.ariaLabel) {
        evidence.push(
          EvidenceSchema.parse({
            type: "aria_role",
            signal: `ARIA label: ${anchor.ariaLabel}`,
            weight: 0.75,
            detail: `ARIA-Label stuetzt Klassifikation`,
            source: "aria",
          }),
        );
      }

      // Text-basiert
      if (anchor.textContent) {
        evidence.push(
          EvidenceSchema.parse({
            type: "text_content",
            signal: `Text: ${anchor.textContent.slice(0, 100)}`,
            weight: 0.6,
            detail: `Textinhalt des Anchors`,
            source: "dom",
          }),
        );
      }
    }

    // Label-basiert
    if (endpoint.label.primary) {
      evidence.push(
        EvidenceSchema.parse({
          type: "semantic_label",
          signal: `Label: ${endpoint.label.primary}`,
          weight: 0.85,
          detail: `Primaeres semantisches Label`,
          source: "dom",
        }),
      );
    }

    // Affordance-basiert
    if (endpoint.affordances.length > 0) {
      const affordanceTypes = endpoint.affordances.map((a) => a.type).join(", ");
      evidence.push(
        EvidenceSchema.parse({
          type: "structural_pattern",
          signal: `Affordances: ${affordanceTypes}`,
          weight: 0.65,
          detail: `Erkannte Interaktionsmoeglichkeiten`,
          source: "dom",
        }),
      );
    }

    // Historisch
    if (endpoint.successCount > 0 || endpoint.failureCount > 0) {
      const total = endpoint.successCount + endpoint.failureCount;
      const rate = total > 0 ? endpoint.successCount / total : 0;
      evidence.push(
        EvidenceSchema.parse({
          type: "historical_match",
          signal: `History: ${endpoint.successCount}/${total} success`,
          weight: Math.min(0.9, rate * 0.8 + 0.1),
          detail: `Historische Erfolgsrate: ${(rate * 100).toFixed(0)}%`,
          source: "history",
        }),
      );
    }
  } catch (err) {
    throw new EvidenceCollectionError(
      `Evidence-Sammlung fehlgeschlagen fuer Endpoint ${endpoint.id}`,
      err instanceof Error ? err : undefined,
    );
  }

  logger.debug(
    { endpointId: endpoint.id, evidenceCount: evidence.length },
    "Evidence gesammelt",
  );

  return evidence;
}

/**
 * Erkennt Widersprueche in Evidence.
 */
export function detectContradictions(
  evidence: Evidence[],
): EvidenceContradiction[] {
  const contradictions: EvidenceContradiction[] = [];

  if (evidence.length < 2) return contradictions;

  // Gruppiere nach Quelle
  const bySource = new Map<string, Evidence[]>();
  for (const e of evidence) {
    const source = e.source ?? "unknown";
    const list = bySource.get(source) ?? [];
    list.push(e);
    bySource.set(source, list);
  }

  // Suche nach widersprüchlichen Signalen zwischen verschiedenen Quellen
  const allSignals = evidence.map((e) => ({
    type: e.type,
    signal: e.signal.toLowerCase(),
    source: e.source ?? "unknown",
  }));

  // Einfache Keyword-basierte Widerspruchserkennung
  const loginIndicators = allSignals.filter(
    (s) => s.signal.includes("login") || s.signal.includes("sign in") || s.signal.includes("auth"),
  );
  const registerIndicators = allSignals.filter(
    (s) => s.signal.includes("register") || s.signal.includes("sign up") || s.signal.includes("create account"),
  );

  if (loginIndicators.length > 0 && registerIndicators.length > 0) {
    contradictions.push({
      signal1: { type: loginIndicators[0]!.type, value: loginIndicators[0]!.signal },
      signal2: { type: registerIndicators[0]!.type, value: registerIndicators[0]!.signal },
      severity: 0.6,
      description: "Widerspruch: Evidence deutet sowohl auf Login als auch auf Registrierung",
    });
  }

  // Navigation vs. Form-Submit Widerspruch
  const navIndicators = allSignals.filter(
    (s) => s.signal.includes("navigation") || s.signal.includes("nav") || s.signal.includes("menu"),
  );
  const formIndicators = allSignals.filter(
    (s) => s.signal.includes("form") || s.signal.includes("submit") || s.signal.includes("input"),
  );

  if (navIndicators.length > 0 && formIndicators.length > 0) {
    const navFromDom = navIndicators.some((s) => s.source === "dom" || s.source === "aria");
    const formFromDom = formIndicators.some((s) => s.source === "dom" || s.source === "aria");
    if (navFromDom && formFromDom) {
      contradictions.push({
        signal1: { type: navIndicators[0]!.type, value: navIndicators[0]!.signal },
        signal2: { type: formIndicators[0]!.type, value: formIndicators[0]!.signal },
        severity: 0.4,
        description: "Widerspruch: Evidence deutet sowohl auf Navigation als auch auf Formular",
      });
    }
  }

  return contradictions;
}
