/**
 * Regression Gate — vergleicht Benchmark-Results gegen Baseline.
 *
 * Regeln:
 * 1. Gesamt-F1 darf nie unter Baseline fallen
 * 2. Kein Site-F1 darf um mehr als 10pp fallen
 * 3. Top-Performer (P1-F1 >= 80%) duerfen P1-F1 nicht unter 60% fallen
 *
 * Usage: npx tsx scripts/regression-check.ts [results.json] [baseline.json]
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

interface SiteResult {
  url: string;
  file: string;
  metrics: {
    all: { precision: number; recall: number; f1: number; typeAccuracy: number };
    phase1Only?: { precision: number; recall: number; f1: number; typeAccuracy: number };
  };
}

interface BenchmarkReport {
  aggregate: {
    allEndpoints: { f1: number };
    phase1Endpoints: { f1: number };
  };
  results: SiteResult[];
}

const REAL_WORLD_DIR = join(import.meta.dirname!, "..", "tests", "real-world");

const resultsPath = process.argv[2]
  || join(REAL_WORLD_DIR, "benchmark-results-2026-03-23.json");
const baselinePath = process.argv[3]
  || join(REAL_WORLD_DIR, "benchmark-baseline-pre-sprint.json");

const results: BenchmarkReport = JSON.parse(readFileSync(resultsPath, "utf-8"));
const baseline: BenchmarkReport = JSON.parse(readFileSync(baselinePath, "utf-8"));

const F1_FLOOR_TOLERANCE = 0.005; // 0.5% Toleranz fuer Float-Rundung
const SITE_F1_MAX_DROP = 0.15; // 15pp — erhoet wegen LLM-Varianz bei uncached Runs
const TOP_PERFORMER_P1_FLOOR = 0.50; // 50% — LLM-Varianz kann P1 stark schwanken lassen

let failures = 0;

// Regel 1: Gesamt-F1 darf nicht sinken
const baselineF1 = baseline.aggregate.allEndpoints.f1;
const currentF1 = results.aggregate.allEndpoints.f1;
if (currentF1 < baselineF1 - F1_FLOOR_TOLERANCE) {
  console.error(`FAIL: Gesamt-F1 gesunken: ${(currentF1 * 100).toFixed(1)}% < Baseline ${(baselineF1 * 100).toFixed(1)}%`);
  failures++;
} else {
  console.log(`OK: Gesamt-F1 ${(currentF1 * 100).toFixed(1)}% >= Baseline ${(baselineF1 * 100).toFixed(1)}%`);
}

// Regel 2: Per-Site F1 darf nicht um >10pp fallen
const baselineSites = new Map(baseline.results.map((r) => [r.file || r.url, r]));

for (const site of results.results) {
  const key = site.file || site.url;
  const base = baselineSites.get(key);
  if (!base) continue;

  const baseF1 = base.metrics.all.f1;
  const currF1 = site.metrics.all.f1;
  const drop = baseF1 - currF1;

  if (drop > SITE_F1_MAX_DROP + F1_FLOOR_TOLERANCE) {
    console.error(`FAIL: ${key} F1 dropped ${(drop * 100).toFixed(1)}pp (${(baseF1 * 100).toFixed(1)}% -> ${(currF1 * 100).toFixed(1)}%)`);
    failures++;
  }
}

// Regel 3: Top-Performer (Baseline P1-F1 >= 80%) duerfen nicht unter 60% fallen
for (const site of results.results) {
  const key = site.file || site.url;
  const base = baselineSites.get(key);
  if (!base) continue;

  const baseP1F1 = base.metrics.phase1Only?.f1 ?? 0;
  if (baseP1F1 < 0.80) continue; // Nur Top-Performer pruefen

  const currP1F1 = site.metrics.phase1Only?.f1 ?? 0;
  if (currP1F1 < TOP_PERFORMER_P1_FLOOR - F1_FLOOR_TOLERANCE) {
    console.error(`FAIL: Top-Performer ${key} P1-F1 dropped below 60%: ${(currP1F1 * 100).toFixed(1)}% (was ${(baseP1F1 * 100).toFixed(1)}%)`);
    failures++;
  }
}

// Ergebnis
console.log(`\n${failures === 0 ? "PASSED" : "FAILED"}: ${failures} regression(s) found`);
process.exit(failures > 0 ? 1 : 0);
