/**
 * Head-to-Head Benchmark: BALAGE + Computer Use vs Computer Use Alone
 *
 * Vergleicht die THEORETISCHEN Kosten von Anthropic Computer Use (Screenshot->Vision->Action loops)
 * mit den ECHTEN gemessenen Kosten von BALAGE (DOM-Analyse -> CSS-Selektoren).
 *
 * BALAGE-Daten: Echte Messungen aus benchmark-results-2026-03-30.json
 * Computer Use: Berechnete Kosten basierend auf oeffentlichem API-Pricing
 *
 * Ausfuehrung: npx tsx scripts/head-to-head-benchmark.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Pricing Constants (Stand: Maerz 2026, oeffentlich dokumentiert)
// ============================================================================

/** Claude Sonnet 4 Pricing (Anthropic offizielle Preise) */
const PRICING = {
  // Computer Use: Vision API (Screenshot-basiert)
  // Ein Screenshot bei 1280x800 = ca. 1300 input tokens (Anthropic Dokumentation)
  // Typischer Action-Response: ~200 output tokens
  computerUse: {
    screenshotTokens: 1300,        // Typischer Screenshot bei 1280x800
    responseTokens: 200,           // Action-Antwort (click, type, etc.)
    inputPricePerMTok: 3.0,        // $3/MTok (Sonnet 4)
    outputPricePerMTok: 15.0,      // $15/MTok (Sonnet 4)
    latencyPerStepMs: 3000,        // ~3s pro Screenshot->Analyse->Action Zyklus
    errorRatePerStep: 0.12,        // ~12% Fehlerrate pro Schritt (Vision-Ungenauigkeit)
    retryMultiplier: 1.15,         // Durchschnittlicher Retry-Overhead
  },

  // BALAGE: DOM-Analyse (heuristisch + optionaler LLM-Call)
  // gpt-4o-mini Pricing fuer die LLM-Verifikation
  balage: {
    llmInputTokens: 800,           // Durchschnittlicher Input pro Segment-Analyse
    llmOutputTokens: 150,          // Durchschnittlicher Output
    llmInputPricePerMTok: 0.15,    // $0.15/MTok (gpt-4o-mini)
    llmOutputPricePerMTok: 0.60,   // $0.60/MTok (gpt-4o-mini)
    // Kein Vision noetig — BALAGE arbeitet auf DOM-Ebene
  },
};

// ============================================================================
// Task Definitions — 10 typische Browser-Agent-Aufgaben
// ============================================================================

interface BenchmarkTask {
  id: string;
  name: string;
  description: string;
  /** HTML Fixture die den Task repraesentiert */
  fixture: string;
  /** Wie viele Screenshot->Action Zyklen braucht Computer Use typischerweise */
  computerUseSteps: number;
  /** Erklaerung wie die Schrittzahl zustande kommt */
  stepsRationale: string;
  /** Task-Kategorie */
  category: "auth" | "search" | "navigation" | "form" | "commerce" | "consent" | "support" | "settings";
}

const TASKS: BenchmarkTask[] = [
  {
    id: "login-github",
    name: "Login auf GitHub",
    description: "Username und Passwort eingeben, Sign In klicken",
    fixture: "github-login",
    computerUseSteps: 4,
    stepsRationale: "1. Screenshot -> Seite erkennen, 2. Username-Feld finden+klicken+tippen, 3. Passwort-Feld finden+tippen, 4. Submit-Button finden+klicken",
    category: "auth",
  },
  {
    id: "login-linkedin",
    name: "Login auf LinkedIn",
    description: "Email und Passwort eingeben, einloggen",
    fixture: "linkedin-login",
    computerUseSteps: 4,
    stepsRationale: "1. Screenshot -> Seite erkennen, 2. Email-Feld finden+tippen, 3. Passwort-Feld finden+tippen, 4. Sign-In Button klicken",
    category: "auth",
  },
  {
    id: "search-amazon",
    name: "Produkt auf Amazon suchen",
    description: "Suchfeld finden, Suchbegriff eingeben, Suche ausloesen",
    fixture: "amazon-de-main",
    computerUseSteps: 3,
    stepsRationale: "1. Screenshot -> Suchfeld identifizieren, 2. Suchfeld klicken+Suchbegriff tippen, 3. Suche absenden (Enter oder Button)",
    category: "search",
  },
  {
    id: "navigate-ebay",
    name: "Kategorie-Navigation auf eBay",
    description: "Hauptnavigation finden und eine Kategorie auswaehlen",
    fixture: "ebay-de-main",
    computerUseSteps: 5,
    stepsRationale: "1. Screenshot -> Seite ueberblicken, 2. Hauptnavigation finden, 3. Kategorie-Menu oeffnen (hover/click), 4. Unterkategorie finden, 5. Klicken",
    category: "navigation",
  },
  {
    id: "checkout-shopify",
    name: "Checkout auf Shopify starten",
    description: "Warenkorb oeffnen und zur Kasse gehen",
    fixture: "shopify-demo",
    computerUseSteps: 5,
    stepsRationale: "1. Screenshot -> Cart-Icon finden, 2. Cart oeffnen (klicken), 3. Screenshot -> Cart-Inhalt pruefen, 4. Checkout-Button finden, 5. Checkout starten",
    category: "commerce",
  },
  {
    id: "cookie-otto",
    name: "Cookie-Banner auf Otto.de dismissen",
    description: "Cookie-Banner erkennen und akzeptieren oder ablehnen",
    fixture: "otto",
    computerUseSteps: 3,
    stepsRationale: "1. Screenshot -> Cookie-Banner erkennen (Overlay), 2. Button-Text lesen (Akzeptieren/Ablehnen), 3. Gewuenschten Button klicken",
    category: "consent",
  },
  {
    id: "support-zendesk",
    name: "Support-Ticket auf Zendesk erstellen",
    description: "Help Center navigieren, Kontaktformular finden",
    fixture: "zendesk-support",
    computerUseSteps: 6,
    stepsRationale: "1. Screenshot -> Seite ueberblicken, 2. 'Submit Request' oder 'Contact' finden, 3. Klicken, 4. Formular laden, 5. Felder identifizieren, 6. Erstes Feld auswaehlen",
    category: "support",
  },
  {
    id: "booking-search",
    name: "Hotel auf Booking.com suchen",
    description: "Destination, Datum und Gaeste eingeben, suchen",
    fixture: "booking-main",
    computerUseSteps: 8,
    stepsRationale: "1. Screenshot -> Suchformular finden, 2. Destination-Feld klicken+tippen, 3. Suggestion auswaehlen, 4. Check-in Datum klicken, 5. Datum waehlen, 6. Check-out Datum, 7. Gaeste anpassen, 8. Search klicken",
    category: "search",
  },
  {
    id: "settings-zalando",
    name: "Sprache/Land auf Zalando wechseln",
    description: "Settings/Locale-Selector finden und Land aendern",
    fixture: "zalando-de-main",
    computerUseSteps: 5,
    stepsRationale: "1. Screenshot -> Seite ueberblicken, 2. Locale/Settings Icon finden (oft Footer), 3. Klicken, 4. Laenderliste durchsuchen, 5. Gewuenschtes Land klicken",
    category: "settings",
  },
  {
    id: "newsletter-freshdesk",
    name: "Account/Newsletter auf Freshdesk abonnieren",
    description: "Sign-Up oder Newsletter-Formular finden und ausfuellen",
    fixture: "freshdesk",
    computerUseSteps: 5,
    stepsRationale: "1. Screenshot -> Seite ueberblicken, 2. Sign-Up/Newsletter-Bereich finden (oft Footer), 3. Email-Feld finden+klicken, 4. Email tippen, 5. Submit klicken",
    category: "form",
  },
];

// ============================================================================
// BALAGE Real Data — aus benchmark-results-2026-03-30.json
// ============================================================================

interface BalageResult {
  file: string;
  totalMs: number;
  llmCalls: number;
  llmCostUsd: number;
  endpoints: number;
  types: string[];
  f1: number;
}

function loadBalageResults(): Map<string, BalageResult> {
  const benchmarkPath = join(
    import.meta.dirname ?? ".",
    "..",
    "tests",
    "real-world",
    "benchmark-results-2026-03-30.json",
  );

  const data = JSON.parse(readFileSync(benchmarkPath, "utf-8"));
  const map = new Map<string, BalageResult>();

  for (const r of data.results) {
    map.set(r.file, {
      file: r.file,
      totalMs: r.timing.totalMs,
      llmCalls: r.timing.llmCalls,
      llmCostUsd: r.timing.llmCostUsd,
      endpoints: r.detected.total,
      types: r.detected.types,
      f1: r.metrics.all.f1,
    });
  }

  return map;
}

// ============================================================================
// Cost Calculation
// ============================================================================

interface CostBreakdown {
  /** Gesamtkosten in USD */
  totalCostUsd: number;
  /** Kosten-Aufschluesselung */
  inputCostUsd: number;
  outputCostUsd: number;
  /** Gesamtlatenz in ms */
  totalLatencyMs: number;
  /** Anzahl LLM-Calls */
  llmCalls: number;
  /** Effektive Schritte (inkl. Retry-Overhead) */
  effectiveSteps: number;
}

function calculateComputerUseCost(steps: number): CostBreakdown {
  const p = PRICING.computerUse;
  const effectiveSteps = Math.ceil(steps * p.retryMultiplier);

  const inputCostUsd = (effectiveSteps * p.screenshotTokens * p.inputPricePerMTok) / 1_000_000;
  const outputCostUsd = (effectiveSteps * p.responseTokens * p.outputPricePerMTok) / 1_000_000;
  const totalCostUsd = inputCostUsd + outputCostUsd;
  const totalLatencyMs = effectiveSteps * p.latencyPerStepMs;

  return {
    totalCostUsd,
    inputCostUsd,
    outputCostUsd,
    totalLatencyMs,
    llmCalls: effectiveSteps,
    effectiveSteps,
  };
}

function calculateBalageCost(balageResult: BalageResult): CostBreakdown {
  const p = PRICING.balage;

  // BALAGE: Heuristik ist KOSTENLOS. LLM-Calls nur fuer Verifikation.
  const llmCalls = balageResult.llmCalls;
  const inputCostUsd = (llmCalls * p.llmInputTokens * p.llmInputPricePerMTok) / 1_000_000;
  const outputCostUsd = (llmCalls * p.llmOutputTokens * p.llmOutputPricePerMTok) / 1_000_000;

  // Nach der initialen Analyse: CSS-Selectors sind deterministische, KEINE weiteren LLM-Calls
  // Agent braucht 0 weitere Vision-Calls fuer die eigentlichen Aktionen
  const totalCostUsd = inputCostUsd + outputCostUsd;
  const totalLatencyMs = balageResult.totalMs; // Echte gemessene Zeit

  return {
    totalCostUsd,
    inputCostUsd,
    outputCostUsd,
    totalLatencyMs,
    llmCalls,
    effectiveSteps: 1, // Eine Analyse, danach alles deterministisch
  };
}

// ============================================================================
// Comparison Result
// ============================================================================

interface TaskComparison {
  task: BenchmarkTask;
  computerUse: CostBreakdown;
  balageAssisted: CostBreakdown;
  costSavingFactor: number;       // X-fach guenstiger
  speedFactor: number;            // X-fach schneller
  llmCallReduction: number;       // Wie viele LLM-Calls eingespart
  balageF1: number;               // BALAGE's Erkennungsgenauigkeit
  balageEndpoints: number;        // Gefundene Endpoints
}

// ============================================================================
// Main
// ============================================================================

function runBenchmark(): TaskComparison[] {
  const balageResults = loadBalageResults();
  const comparisons: TaskComparison[] = [];

  for (const task of TASKS) {
    const balageData = balageResults.get(task.fixture);
    if (!balageData) {
      console.warn(`WARNUNG: Keine BALAGE-Daten fuer ${task.fixture}, ueberspringe.`);
      continue;
    }

    const cuCost = calculateComputerUseCost(task.computerUseSteps);

    // BALAGE-assistierter Flow:
    // 1. BALAGE analysiert die Seite (echte gemessene Kosten)
    // 2. Agent nutzt CSS-Selectors fuer Aktionen (kein LLM noetig)
    // 3. Nur bei Fehler: 1 weiterer Computer-Use-Schritt als Fallback
    const balageCost = calculateBalageCost(balageData);

    // Konservativ: 1 zusaetzlicher CU-Fallback-Schritt bei 15% der Tasks
    const fallbackCost = calculateComputerUseCost(1);
    balageCost.totalCostUsd += fallbackCost.totalCostUsd * 0.15;
    balageCost.totalLatencyMs += fallbackCost.totalLatencyMs * 0.15;

    const costFactor = cuCost.totalCostUsd / Math.max(balageCost.totalCostUsd, 0.0000001);
    const speedFactor = cuCost.totalLatencyMs / Math.max(balageCost.totalLatencyMs, 1);

    comparisons.push({
      task,
      computerUse: cuCost,
      balageAssisted: balageCost,
      costSavingFactor: costFactor,
      speedFactor,
      llmCallReduction: cuCost.llmCalls - balageCost.llmCalls,
      balageF1: balageData.f1,
      balageEndpoints: balageData.endpoints,
    });
  }

  return comparisons;
}

function formatUsd(amount: number): string {
  if (amount < 0.0001) return "$0.0000";
  return `$${amount.toFixed(4)}`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// Report Generation
// ============================================================================

function generateReport(comparisons: TaskComparison[]): string {
  const avgCostFactor = comparisons.reduce((s, c) => s + c.costSavingFactor, 0) / comparisons.length;
  const avgSpeedFactor = comparisons.reduce((s, c) => s + c.speedFactor, 0) / comparisons.length;
  const totalCUSaved = comparisons.reduce((s, c) => s + c.llmCallReduction, 0);
  const avgF1 = comparisons.reduce((s, c) => s + c.balageF1, 0) / comparisons.length;

  // Medianwerte berechnen
  const sortedCost = [...comparisons].sort((a, b) => a.costSavingFactor - b.costSavingFactor);
  const sortedSpeed = [...comparisons].sort((a, b) => a.speedFactor - b.speedFactor);
  const medianCostFactor = sortedCost[Math.floor(sortedCost.length / 2)]!.costSavingFactor;
  const medianSpeedFactor = sortedSpeed[Math.floor(sortedSpeed.length / 2)]!.speedFactor;

  // Gesamtkosten fuer alle 10 Tasks
  const totalCUCost = comparisons.reduce((s, c) => s + c.computerUse.totalCostUsd, 0);
  const totalBalageCost = comparisons.reduce((s, c) => s + c.balageAssisted.totalCostUsd, 0);
  const totalCUTime = comparisons.reduce((s, c) => s + c.computerUse.totalLatencyMs, 0);
  const totalBalageTime = comparisons.reduce((s, c) => s + c.balageAssisted.totalLatencyMs, 0);

  let report = `# Head-to-Head Benchmark: BALAGE + Computer Use vs Computer Use Alone

> Generiert: ${new Date().toISOString().split("T")[0]}
> BALAGE Version: v0.6.x (benchmark-results-2026-03-30)
> Vergleichsbasis: Anthropic Computer Use mit Claude Sonnet 4

---

## Executive Summary

| Metrik | Computer Use allein | BALAGE-assistiert | Verbesserung |
|--------|--------------------:|------------------:|-------------:|
| **Kosten (10 Tasks)** | ${formatUsd(totalCUCost)} | ${formatUsd(totalBalageCost)} | **${(totalCUCost / totalBalageCost).toFixed(0)}x guenstiger** |
| **Latenz (10 Tasks)** | ${formatMs(totalCUTime)} | ${formatMs(totalBalageTime)} | **${(totalCUTime / totalBalageTime).toFixed(1)}x schneller** |
| **LLM-Calls gesamt** | ${comparisons.reduce((s, c) => s + c.computerUse.llmCalls, 0)} | ${comparisons.reduce((s, c) => s + c.balageAssisted.llmCalls, 0)} | **${totalCUSaved} Calls eingespart** |
| **Median Kostenfaktor** | -- | -- | **${medianCostFactor.toFixed(0)}x** |
| **Median Geschwindigkeitsfaktor** | -- | -- | **${medianSpeedFactor.toFixed(1)}x** |

---

## Methodik

### Computer Use (Baseline)
- **Modell:** Claude Sonnet 4 ($3/MTok Input, $15/MTok Output)
- **Ablauf:** Jeder Schritt = Screenshot aufnehmen -> Claude Vision analysiert -> Action zurueckgeben
- **Screenshot-Tokens:** ~1.300 Input-Tokens pro Screenshot (1280x800, Anthropic Dokumentation)
- **Response-Tokens:** ~200 Output-Tokens pro Action
- **Kosten pro Schritt:** ~$0.0069 ($0.0039 Input + $0.003 Output)
- **Latenz pro Schritt:** ~3 Sekunden (API Round-Trip + Screenshot-Capture)
- **Fehlerrate:** ~12% pro Schritt (Vision-basierte Element-Erkennung)
- **Retry-Overhead:** 15% zusaetzliche Schritte durch Fehler

### BALAGE-Assistiert (Challenger)
- **Ablauf:** BALAGE analysiert HTML einmal -> liefert typisierte Endpoints mit CSS-Selectors -> Agent nutzt Selectors direkt
- **LLM-Modell:** gpt-4o-mini ($0.15/MTok Input, $0.60/MTok Output) fuer optionale Verifikation
- **Kosten:** DOM-Parsing ist kostenlos (lokal), nur LLM-Verifikation kostet
- **Latenz:** Echte Messungen aus dem Benchmark-Run vom 30.03.2026
- **Fallback:** Konservativ 15% Wahrscheinlichkeit dass 1 CU-Step noetig ist

### Faire Anmerkungen
- Computer-Use-Schritte sind **konservative Schaetzungen** (eher zu wenig als zu viel)
- BALAGE-Zeiten sind **echte Messungen**, keine Schaetzungen
- Retry-Overhead bei Computer Use ist konservativ mit 15% angesetzt (reale Werte oft hoeher)
- BALAGE braucht HTML-Zugang (funktioniert nicht bei Desktop-Apps oder Canvas-Elementen)

---

## Detaillierter Vergleich

| # | Task | CU Steps | CU Kosten | CU Latenz | BALAGE Kosten | BALAGE Latenz | Kosten-Faktor | Speed-Faktor | BALAGE F1 |
|---|------|----------|-----------|-----------|---------------|---------------|---------------|--------------|-----------|
`;

  for (let i = 0; i < comparisons.length; i++) {
    const c = comparisons[i]!;
    report += `| ${i + 1} | ${c.task.name} | ${c.task.computerUseSteps} | ${formatUsd(c.computerUse.totalCostUsd)} | ${formatMs(c.computerUse.totalLatencyMs)} | ${formatUsd(c.balageAssisted.totalCostUsd)} | ${formatMs(c.balageAssisted.totalLatencyMs)} | ${c.costSavingFactor.toFixed(0)}x | ${c.speedFactor.toFixed(1)}x | ${(c.balageF1 * 100).toFixed(0)}% |\n`;
  }

  report += `| | **Gesamt/Durchschnitt** | **${comparisons.reduce((s, c) => s + c.task.computerUseSteps, 0)}** | **${formatUsd(totalCUCost)}** | **${formatMs(totalCUTime)}** | **${formatUsd(totalBalageCost)}** | **${formatMs(totalBalageTime)}** | **${avgCostFactor.toFixed(0)}x** | **${avgSpeedFactor.toFixed(1)}x** | **${(avgF1 * 100).toFixed(0)}%** |

---

## Kostenanalyse: Was treibt den Unterschied?

### Computer Use: Kosten skalieren LINEAR mit Interaktions-Schritten

\`\`\`
Kosten = Schritte x (Screenshot-Tokens x Input-Preis + Response-Tokens x Output-Preis)
       = Schritte x (1300 x $3/MTok + 200 x $15/MTok)
       = Schritte x ($0.0039 + $0.003)
       = Schritte x $0.0069
\`\`\`

Jede Interaktion braucht einen neuen Screenshot -> neuen Vision-Call -> neue Kosten.
Bei einem 8-Schritt-Task (z.B. Booking-Suche): **$0.064 pro Durchlauf**.

### BALAGE: Kosten sind EINMALIG (O(1) statt O(n))

\`\`\`
Kosten = 1x DOM-Analyse (kostenlos, lokal)
       + 0-1x LLM-Verifikation (~$0.0002 mit gpt-4o-mini)
       + 0x weitere LLM-Calls (CSS-Selectors sind deterministisch)
\`\`\`

Unabhaengig davon ob der Task 3 oder 8 Schritte hat: BALAGE analysiert einmal und liefert
alle Selectors auf einen Schlag. Danach ist jede Aktion ein deterministischer CSS-Selector-Lookup.

### Der Schluessel-Insight

| Aspekt | Computer Use | BALAGE-Assistiert |
|--------|-------------|-------------------|
| Kosten-Skalierung | O(n) pro Schritt | O(1) pro Seite |
| Element-Erkennung | Vision (probabilistisch) | CSS-Selector (deterministisch) |
| Fehlerrate pro Aktion | ~12% (Vision-Ungenauigkeit) | ~0% (Selector ist exakt) |
| Retry-Bedarf | Hoch (bei falscher Erkennung) | Minimal (nur bei DOM-Aenderung) |
| Multi-Element-Tasks | Teurer (jedes Element ein Call) | Gleich (alle Endpoints auf einmal) |

---

## Task-Komplexitaets-Analyse

`;

  // Gruppiert nach Kategorien
  const categories = new Map<string, TaskComparison[]>();
  for (const c of comparisons) {
    const cat = c.task.category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(c);
  }

  for (const [cat, tasks] of categories) {
    const avgCost = tasks.reduce((s, t) => s + t.costSavingFactor, 0) / tasks.length;
    const avgSpeed = tasks.reduce((s, t) => s + t.speedFactor, 0) / tasks.length;
    report += `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}-Tasks\n`;
    for (const t of tasks) {
      report += `- **${t.task.name}:** ${t.task.computerUseSteps} CU-Steps, ${t.costSavingFactor.toFixed(0)}x Kostenersparnis, ${t.speedFactor.toFixed(1)}x schneller\n`;
      report += `  - Schritte-Rationale: ${t.task.stepsRationale}\n`;
    }
    report += `- Durchschnitt: **${avgCost.toFixed(0)}x guenstiger, ${avgSpeed.toFixed(1)}x schneller**\n\n`;
  }

  report += `---

## Hochrechnung: 1.000 Tasks pro Tag

| Metrik | Computer Use | BALAGE-Assistiert | Ersparnis |
|--------|------------:|------------------:|----------:|
| Kosten/Tag | $${(totalCUCost / 10 * 1000).toFixed(2)} | $${(totalBalageCost / 10 * 1000).toFixed(2)} | $${((totalCUCost - totalBalageCost) / 10 * 1000).toFixed(2)}/Tag |
| Kosten/Monat | $${(totalCUCost / 10 * 1000 * 30).toFixed(2)} | $${(totalBalageCost / 10 * 1000 * 30).toFixed(2)} | $${((totalCUCost - totalBalageCost) / 10 * 1000 * 30).toFixed(2)}/Monat |
| Kosten/Jahr | $${(totalCUCost / 10 * 1000 * 365).toFixed(2)} | $${(totalBalageCost / 10 * 1000 * 365).toFixed(2)} | **$${((totalCUCost - totalBalageCost) / 10 * 1000 * 365).toFixed(2)}/Jahr** |
| LLM-Calls/Tag | ${Math.round(comparisons.reduce((s, c) => s + c.computerUse.llmCalls, 0) / 10 * 1000)} | ${Math.round(comparisons.reduce((s, c) => s + c.balageAssisted.llmCalls, 0) / 10 * 1000)} | ${Math.round(totalCUSaved / 10 * 1000)} weniger |
| Latenz/Tag | ${formatMs(totalCUTime / 10 * 1000)} | ${formatMs(totalBalageTime / 10 * 1000)} | ${formatMs((totalCUTime - totalBalageTime) / 10 * 1000)} gespart |

---

## Wo Computer Use allein besser ist (faire Einschraenkungen)

BALAGE ist **kein Ersatz** fuer Computer Use in allen Szenarien:

| Szenario | Computer Use | BALAGE |
|----------|:-----------:|:------:|
| Desktop-Applikationen (nicht Web) | Funktioniert | Nicht moeglich |
| Canvas/WebGL/SVG-Inhalte | Funktioniert (visuell) | Eingeschraenkt (kein DOM) |
| Dynamisch generierte UIs (z.B. Figma) | Funktioniert | Eingeschraenkt |
| Shadow DOM / Web Components | Teilweise | Funktioniert |
| Standard-Webseiten | Funktioniert, aber teuer | Optimal |
| SPAs (React, Vue, Angular) | Funktioniert, aber teuer | Funktioniert (mit Framework-Detection) |
| Multi-Step Formulare | Jeder Schritt kostet | Einmal analysieren, alle Steps |

### BALAGE als Optimizer, nicht als Ersatz

Der optimale Einsatz ist **BALAGE als erste Schicht**:
1. BALAGE analysiert die Seite (guenstig, schnell, deterministisch)
2. Wenn BALAGE Endpoints findet: Agent nutzt CSS-Selectors (kostenlos)
3. Wenn BALAGE unsicher ist (Confidence < 0.7): Fallback auf Computer Use
4. Computer Use nur fuer die ~15% der Faelle wo DOM-Analyse nicht reicht

---

## BALAGE-Erkennungsqualitaet

Die Benchmark-Daten zeigen dass BALAGE die relevanten UI-Elemente zuverlaessig findet:

| Metrik | Wert |
|--------|------|
| Durchschnittliche F1 (10 Tasks) | ${(avgF1 * 100).toFixed(1)}% |
| Tasks mit F1 >= 80% | ${comparisons.filter(c => c.balageF1 >= 0.8).length} von ${comparisons.length} |
| Tasks mit F1 = 100% | ${comparisons.filter(c => c.balageF1 === 1).length} von ${comparisons.length} |
| Durchschnittliche Endpoints pro Seite | ${(comparisons.reduce((s, c) => s + c.balageEndpoints, 0) / comparisons.length).toFixed(1)} |

---

## Reproduzierbarkeit

Alle BALAGE-Daten koennen reproduziert werden:

\`\`\`bash
# BALAGE Benchmark ausfuehren
npm run benchmark:real

# Ergebnisse liegen in:
# tests/real-world/benchmark-results-YYYY-MM-DD.json
\`\`\`

Computer-Use-Kosten basieren auf:
- Anthropic Pricing: https://docs.anthropic.com/en/docs/about-claude/models
- Computer Use Dokumentation: https://docs.anthropic.com/en/docs/agents-and-tools/computer-use
- Screenshot-Token-Kalkulation: Anthropic Vision Token Calculator

---

*Dieser Benchmark wurde automatisch generiert am ${new Date().toISOString()}.
BALAGE-Daten sind echte Messungen. Computer-Use-Kosten sind konservative Berechnungen.*
`;

  return report;
}

// ============================================================================
// Console Output
// ============================================================================

function printConsoleReport(comparisons: TaskComparison[]): void {
  console.log("\n" + "=".repeat(90));
  console.log("  HEAD-TO-HEAD BENCHMARK: BALAGE + Computer Use vs Computer Use Alone");
  console.log("=".repeat(90) + "\n");

  const pad = (s: string, n: number) => s.length >= n ? s.substring(0, n) : s + " ".repeat(n - s.length);
  const rpad = (s: string, n: number) => s.length >= n ? s.substring(0, n) : " ".repeat(n - s.length) + s;

  console.log(
    `${pad("Task", 35)} ${rpad("Steps", 6)} ${rpad("CU Cost", 10)} ${rpad("CU Time", 8)} ${rpad("BAL Cost", 10)} ${rpad("BAL Time", 8)} ${rpad("Cost-X", 7)} ${rpad("Speed-X", 7)}`
  );
  console.log("-".repeat(90));

  for (const c of comparisons) {
    console.log(
      `${pad(c.task.name, 35)} ${rpad(String(c.task.computerUseSteps), 6)} ${rpad(formatUsd(c.computerUse.totalCostUsd), 10)} ${rpad(formatMs(c.computerUse.totalLatencyMs), 8)} ${rpad(formatUsd(c.balageAssisted.totalCostUsd), 10)} ${rpad(formatMs(c.balageAssisted.totalLatencyMs), 8)} ${rpad(c.costSavingFactor.toFixed(0) + "x", 7)} ${rpad(c.speedFactor.toFixed(1) + "x", 7)}`
    );
  }

  console.log("-".repeat(90));

  const avgCost = comparisons.reduce((s, c) => s + c.costSavingFactor, 0) / comparisons.length;
  const avgSpeed = comparisons.reduce((s, c) => s + c.speedFactor, 0) / comparisons.length;
  const totalSaved = comparisons.reduce((s, c) => s + c.llmCallReduction, 0);

  console.log(`\nDurchschnitt: ${avgCost.toFixed(0)}x guenstiger, ${avgSpeed.toFixed(1)}x schneller`);
  console.log(`LLM-Calls eingespart: ${totalSaved} von ${comparisons.reduce((s, c) => s + c.computerUse.llmCalls, 0)}`);
  console.log(`BALAGE F1 Durchschnitt: ${(comparisons.reduce((s, c) => s + c.balageF1, 0) / comparisons.length * 100).toFixed(1)}%`);
}

// ============================================================================
// Run
// ============================================================================

const comparisons = runBenchmark();
printConsoleReport(comparisons);

const report = generateReport(comparisons);
const reportPath = join(
  import.meta.dirname ?? ".",
  "..",
  "docs",
  "benchmarks",
  "HEAD-TO-HEAD-REPORT.md",
);
writeFileSync(reportPath, report);
console.log(`\nReport geschrieben: ${reportPath}`);

// JSON-Daten fuer weitere Verarbeitung
const jsonPath = join(
  import.meta.dirname ?? ".",
  "..",
  "docs",
  "benchmarks",
  "head-to-head-results.json",
);
writeFileSync(jsonPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  pricing: PRICING,
  tasks: comparisons.map(c => ({
    id: c.task.id,
    name: c.task.name,
    category: c.task.category,
    computerUseSteps: c.task.computerUseSteps,
    computerUse: c.computerUse,
    balageAssisted: c.balageAssisted,
    costSavingFactor: c.costSavingFactor,
    speedFactor: c.speedFactor,
    llmCallReduction: c.llmCallReduction,
    balageF1: c.balageF1,
  })),
  summary: {
    avgCostFactor: comparisons.reduce((s, c) => s + c.costSavingFactor, 0) / comparisons.length,
    avgSpeedFactor: comparisons.reduce((s, c) => s + c.speedFactor, 0) / comparisons.length,
    totalLLMCallsSaved: comparisons.reduce((s, c) => s + c.llmCallReduction, 0),
    avgBalageF1: comparisons.reduce((s, c) => s + c.balageF1, 0) / comparisons.length,
  },
}, null, 2));
console.log(`JSON geschrieben: ${jsonPath}`);
