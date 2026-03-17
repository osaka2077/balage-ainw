/**
 * Vision-Only Baseline Runner
 *
 * Vergleicht BALAGE's strukturellen Ansatz (DOM + ARIA + Segmentation + LLM)
 * mit einem reinen Vision-Ansatz (Screenshot + gpt-4o).
 *
 * Fuer dieselben 10 Ground-Truth Websites:
 * 1. Screenshot machen (Playwright, 1280x720, JPEG q80)
 * 2. Screenshot an gpt-4o Vision senden
 * 3. Ergebnis parsen
 * 4. Gegen Ground Truth matchen (selber Algorithmus wie BALAGE Benchmark)
 * 5. Precision/Recall/F1 berechnen
 * 6. Vergleichsreport generieren
 */

import { chromium, type Browser, type Page } from "playwright";
import OpenAI from "openai";
import { config as loadDotenv } from "dotenv";
import { resolve, join } from "node:path";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

// .env.local laden
loadDotenv({ path: resolve(process.cwd(), ".env.local") });
loadDotenv({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// Types
// ============================================================================

interface GroundTruthFile {
  url: string;
  captured_at: string;
  difficulty: string;
  notes: string;
  endpoints: GroundTruthEndpoint[];
  expected_metrics: {
    total_endpoints: number;
    phase1_endpoints: number;
    min_precision_target: number;
    min_recall_target: number;
  };
}

interface GroundTruthEndpoint {
  type: string;
  label: string;
  description: string;
  selector_hint: string;
  affordances: string[];
  risk_class: string;
  fields: string[];
  phase: number;
}

interface VisionEndpoint {
  type: string;
  label: string;
  confidence: number;
}

interface SiteResult {
  name: string;
  url: string;
  difficulty: string;
  detected: VisionEndpoint[];
  groundTruth: GroundTruthEndpoint[];
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
  latencyMs: number;
  tokenUsage: { prompt: number; completion: number; total: number };
  costUsd: number;
  error?: string;
}

interface VisionBaselineReport {
  runner: "vision-only-baseline";
  model: "gpt-4o";
  date: string;
  viewport: { width: number; height: number };
  totalSites: number;
  successfulSites: number;
  failedSites: number;
  aggregate: {
    precision: number;
    recall: number;
    f1: number;
    tp: number;
    fp: number;
    fn: number;
  };
  totalCostUsd: number;
  budgetLimitUsd: number;
  totalLatencyMs: number;
  totalTokens: number;
  sites: SiteResult[];
}

// ============================================================================
// Config
// ============================================================================

const VIEWPORT = { width: 1280, height: 720 };
const JPEG_QUALITY = 80;
const BUDGET_LIMIT_USD = 2.0;
const MODEL = "gpt-4o";
const MAX_TOKENS_RESPONSE = 2048;
const PAGE_LOAD_TIMEOUT_MS = 30_000;
const SCREENSHOT_DELAY_MS = 3000; // Warten bis Seite vollstaendig gerendert

// gpt-4o Kosten (USD pro 1M Tokens)
const COST_PER_1M_INPUT = 2.50;
const COST_PER_1M_OUTPUT = 10.00;

const VISION_PROMPT = `Analyze this screenshot of a web page. Identify all interactive endpoints (forms, buttons, links, search bars, login fields, etc.). For each endpoint, provide:
- type: one of auth, form, checkout, support, navigation, search, commerce, content, consent, media, social, settings
- label: human-readable name
- confidence: 0.0 to 1.0

Return as JSON array. Example:
[{"type": "auth", "label": "Login Form", "confidence": 0.95}]

IMPORTANT:
- Only return the JSON array, no markdown fencing, no explanation.
- Group related elements (e.g. all nav links = one "navigation" endpoint).
- Be specific with labels (e.g. "Search Bar" not just "Form").
- Confidence should reflect how certain you are this is an interactive endpoint.`;

// ============================================================================
// Matching Algorithm (identisch zu src/benchmark/metrics.ts)
// ============================================================================

function normalizedLevenshtein(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= la.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= la.length; i++) {
    for (let j = 1; j <= lb.length; j++) {
      const cost = la[i - 1] === lb[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  return matrix[la.length]![lb.length]! / maxLen;
}

/**
 * Normalisiert Vision-Types auf die Ground-Truth-Types.
 * Vision kann "search", "commerce", "consent" etc. liefern —
 * Ground Truth nutzt nur: auth, form, checkout, navigation, support.
 */
function normalizeType(visionType: string): string {
  const typeMap: Record<string, string> = {
    search: "form",
    commerce: "checkout",
    consent: "form",
    content: "navigation",
    media: "navigation",
    social: "navigation",
    settings: "navigation",
  };
  const lower = visionType.toLowerCase().trim();
  return typeMap[lower] ?? lower;
}

function isMatch(detected: VisionEndpoint, gt: GroundTruthEndpoint): boolean {
  const detType = normalizeType(detected.type);
  if (detType !== gt.type) return false;

  const distance = normalizedLevenshtein(detected.label, gt.label);
  return distance < 0.3;
}

function calculateMetrics(
  detected: VisionEndpoint[],
  groundTruth: GroundTruthEndpoint[],
): { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number } {
  const matchedGtIndices = new Set<number>();
  let tp = 0;

  for (const det of detected) {
    for (let i = 0; i < groundTruth.length; i++) {
      if (matchedGtIndices.has(i)) continue;
      const gt = groundTruth[i]!;
      if (isMatch(det, gt)) {
        tp++;
        matchedGtIndices.add(i);
        break;
      }
    }
  }

  const fp = detected.length - tp;
  const fn = groundTruth.length - tp;

  const precision = detected.length > 0 ? tp / detected.length : 0;
  const recall = groundTruth.length > 0 ? tp / groundTruth.length : 0;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { precision, recall, f1, tp, fp, fn };
}

// ============================================================================
// Cost Tracking
// ============================================================================

function calculateCost(usage: { prompt: number; completion: number }): number {
  return (
    (usage.prompt / 1_000_000) * COST_PER_1M_INPUT +
    (usage.completion / 1_000_000) * COST_PER_1M_OUTPUT
  );
}

// ============================================================================
// Ground Truth Loader
// ============================================================================

function loadGroundTruth(): Map<string, GroundTruthFile> {
  const gtDir = join(process.cwd(), "tests", "real-world", "ground-truth");
  const files = readdirSync(gtDir).filter((f) => f.endsWith(".json"));
  const result = new Map<string, GroundTruthFile>();

  for (const file of files) {
    const content = readFileSync(join(gtDir, file), "utf-8");
    const gt: GroundTruthFile = JSON.parse(content);
    const name = file.replace(".json", "");
    result.set(name, gt);
  }

  return result;
}

// ============================================================================
// Vision API Call
// ============================================================================

async function analyzeScreenshot(
  client: OpenAI,
  screenshotBase64: string,
): Promise<{ endpoints: VisionEndpoint[]; usage: { prompt: number; completion: number }; latencyMs: number }> {
  const start = Date.now();

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS_RESPONSE,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${screenshotBase64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  const latencyMs = Date.now() - start;
  const raw = response.choices[0]?.message?.content ?? "[]";
  const usage = {
    prompt: response.usage?.prompt_tokens ?? 0,
    completion: response.usage?.completion_tokens ?? 0,
  };

  // JSON parsen — robust gegen Markdown-Fencing
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let endpoints: VisionEndpoint[];
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      throw new Error("Response is not an array");
    }
    endpoints = parsed.map((e: Record<string, unknown>) => ({
      type: String(e["type"] ?? "unknown"),
      label: String(e["label"] ?? "unknown"),
      confidence: Number(e["confidence"] ?? 0.5),
    }));
  } catch (parseErr) {
    console.error(`  [WARN] JSON parse failed, trying regex extraction...`);
    // Fallback: versuche einzelne Objekte zu extrahieren
    const matches = cleaned.matchAll(/\{[^}]+\}/g);
    endpoints = [];
    for (const match of matches) {
      try {
        const obj = JSON.parse(match[0]);
        endpoints.push({
          type: String(obj.type ?? "unknown"),
          label: String(obj.label ?? "unknown"),
          confidence: Number(obj.confidence ?? 0.5),
        });
      } catch {
        // Skip unparseable objects
      }
    }
    if (endpoints.length === 0) {
      console.error(`  [ERROR] Could not parse any endpoints from response`);
    }
  }

  return { endpoints, usage, latencyMs };
}

// ============================================================================
// Screenshot Capture
// ============================================================================

async function captureScreenshot(page: Page, url: string): Promise<string> {
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });
  } catch {
    // Manche Seiten haben langsame Subresources — trotzdem weitermachen
    console.log(`  [WARN] Page load timeout, proceeding with partial load`);
  }

  // Warten damit JS rendern kann
  await page.waitForTimeout(SCREENSHOT_DELAY_MS);

  // Cookie-Banner ggf. wegklicken (best effort)
  await dismissCookieBanner(page);

  const buffer = await page.screenshot({
    type: "jpeg",
    quality: JPEG_QUALITY,
    fullPage: false, // Nur Viewport, nicht full page (Token-sparend)
  });

  return buffer.toString("base64");
}

async function dismissCookieBanner(page: Page): Promise<void> {
  const selectors = [
    "[id*='cookie'] button[id*='accept']",
    "[id*='consent'] button:first-of-type",
    "button[id*='accept-cookie']",
    "#onetrust-accept-btn-handler",
    "[data-testid='cookie-banner'] button:first-of-type",
    ".cookie-banner button",
  ];

  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click({ timeout: 1000 });
        await page.waitForTimeout(500);
        return;
      }
    } catch {
      // Kein Banner gefunden — weiter
    }
  }
}

// ============================================================================
// Main Runner
// ============================================================================

async function run(): Promise<void> {
  const apiKey = process.env["BALAGE_OPENAI_API_KEY"];
  if (!apiKey) {
    console.error("ERROR: BALAGE_OPENAI_API_KEY not set in .env.local");
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });
  const groundTruths = loadGroundTruth();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  VISION-ONLY BASELINE — Screenshot + gpt-4o");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Model:    ${MODEL}`);
  console.log(`  Viewport: ${VIEWPORT.width}x${VIEWPORT.height}`);
  console.log(`  JPEG:     quality ${JPEG_QUALITY}`);
  console.log(`  Budget:   $${BUDGET_LIMIT_USD.toFixed(2)}`);
  console.log(`  Sites:    ${groundTruths.size}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  let browser: Browser | undefined;
  const results: SiteResult[] = [];
  let totalCostUsd = 0;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      locale: "en-US",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      javaScriptEnabled: true,
    });

    const entries = Array.from(groundTruths.entries()).sort(
      ([, a], [, b]) => {
        const order = { easy: 0, medium: 1, hard: 2, extreme: 3 };
        return (order[a.difficulty as keyof typeof order] ?? 4) -
          (order[b.difficulty as keyof typeof order] ?? 4);
      },
    );

    for (const [name, gt] of entries) {
      // Budget Guard
      if (totalCostUsd >= BUDGET_LIMIT_USD) {
        console.log(`\n  ⛔ BUDGET LIMIT REACHED ($${totalCostUsd.toFixed(4)} >= $${BUDGET_LIMIT_USD.toFixed(2)})`);
        console.log(`  Skipping remaining sites.\n`);
        break;
      }

      console.log(`─── ${name} (${gt.difficulty}) ───────────────────────────`);
      console.log(`  URL: ${gt.url}`);
      console.log(`  Ground Truth: ${gt.endpoints.length} endpoints`);

      const page = await context.newPage();
      let result: SiteResult;

      try {
        // 1. Screenshot
        console.log(`  [1/3] Capturing screenshot...`);
        const screenshotBase64 = await captureScreenshot(page, gt.url);
        const screenshotSizeKb = Math.round((screenshotBase64.length * 3) / 4 / 1024);
        console.log(`  Screenshot: ${screenshotSizeKb} KB`);

        // 2. Vision API Call
        console.log(`  [2/3] Sending to gpt-4o Vision...`);
        const vision = await analyzeScreenshot(client, screenshotBase64);
        const cost = calculateCost(vision.usage);
        totalCostUsd += cost;

        console.log(`  Response: ${vision.endpoints.length} endpoints detected`);
        console.log(`  Tokens: ${vision.usage.prompt} in / ${vision.usage.completion} out`);
        console.log(`  Cost: $${cost.toFixed(4)} (running: $${totalCostUsd.toFixed(4)})`);
        console.log(`  Latency: ${vision.latencyMs}ms`);

        // 3. Match against Ground Truth
        console.log(`  [3/3] Matching against ground truth...`);
        const metrics = calculateMetrics(vision.endpoints, gt.endpoints);

        result = {
          name,
          url: gt.url,
          difficulty: gt.difficulty,
          detected: vision.endpoints,
          groundTruth: gt.endpoints,
          ...metrics,
          latencyMs: vision.latencyMs,
          tokenUsage: {
            prompt: vision.usage.prompt,
            completion: vision.usage.completion,
            total: vision.usage.prompt + vision.usage.completion,
          },
          costUsd: cost,
        };

        const status = metrics.f1 >= 0.5 ? "OK" : "LOW";
        console.log(`  Result: P=${metrics.precision.toFixed(2)} R=${metrics.recall.toFixed(2)} F1=${metrics.f1.toFixed(2)} [${status}]`);
        console.log(`  TP=${metrics.tp} FP=${metrics.fp} FN=${metrics.fn}`);

        // Detaillierter Match-Log
        for (const det of vision.endpoints) {
          const matched = gt.endpoints.find((g) => isMatch(det, g));
          const icon = matched ? "✓" : "✗";
          console.log(`    ${icon} ${normalizeType(det.type)}/${det.label} (${det.confidence.toFixed(2)})`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [ERROR] ${msg}`);
        result = {
          name,
          url: gt.url,
          difficulty: gt.difficulty,
          detected: [],
          groundTruth: gt.endpoints,
          precision: 0,
          recall: 0,
          f1: 0,
          tp: 0,
          fp: gt.endpoints.length,
          fn: gt.endpoints.length,
          latencyMs: 0,
          tokenUsage: { prompt: 0, completion: 0, total: 0 },
          costUsd: 0,
          error: msg,
        };
      } finally {
        await page.close();
      }

      results.push(result);
      console.log();
    }
  } finally {
    if (browser) await browser.close();
  }

  // ============================================================================
  // Aggregate Metrics
  // ============================================================================

  const successful = results.filter((r) => !r.error);
  const aggTp = results.reduce((s, r) => s + r.tp, 0);
  const aggFp = results.reduce((s, r) => s + r.fp, 0);
  const aggFn = results.reduce((s, r) => s + r.fn, 0);
  const aggDetected = aggTp + aggFp;
  const aggExpected = aggTp + aggFn;
  const aggPrecision = aggDetected > 0 ? aggTp / aggDetected : 0;
  const aggRecall = aggExpected > 0 ? aggTp / aggExpected : 0;
  const aggF1 =
    aggPrecision + aggRecall > 0
      ? (2 * aggPrecision * aggRecall) / (aggPrecision + aggRecall)
      : 0;

  const totalTokens = results.reduce((s, r) => s + r.tokenUsage.total, 0);
  const totalLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0);

  // ============================================================================
  // Console Report
  // ============================================================================

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  VISION-ONLY BASELINE — RESULTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Per-Site Tabelle
  console.log("  Site                    | Diff    | P      R      F1    | TP FP FN | Cost");
  console.log("  ────────────────────────┼─────────┼──────────────────────┼──────────┼────────");
  for (const r of results) {
    const nameCol = r.name.padEnd(24);
    const diffCol = r.difficulty.padEnd(7);
    const pCol = r.precision.toFixed(2).padStart(5);
    const rCol = r.recall.toFixed(2).padStart(5);
    const f1Col = r.f1.toFixed(2).padStart(5);
    const tpCol = String(r.tp).padStart(2);
    const fpCol = String(r.fp).padStart(2);
    const fnCol = String(r.fn).padStart(2);
    const costCol = `$${r.costUsd.toFixed(4)}`;
    const err = r.error ? " ERR" : "";
    console.log(`  ${nameCol}| ${diffCol} | ${pCol} ${rCol} ${f1Col} | ${tpCol} ${fpCol} ${fnCol} | ${costCol}${err}`);
  }

  console.log("  ────────────────────────┼─────────┼──────────────────────┼──────────┼────────");
  const aggPCol = aggPrecision.toFixed(2).padStart(5);
  const aggRCol = aggRecall.toFixed(2).padStart(5);
  const aggF1Col = aggF1.toFixed(2).padStart(5);
  console.log(`  ${"AGGREGATE".padEnd(24)}| ${"".padEnd(7)} | ${aggPCol} ${aggRCol} ${aggF1Col} | ${String(aggTp).padStart(2)} ${String(aggFp).padStart(2)} ${String(aggFn).padStart(2)} | $${totalCostUsd.toFixed(4)}`);

  console.log(`\n  Total Cost:    $${totalCostUsd.toFixed(4)} / $${BUDGET_LIMIT_USD.toFixed(2)} budget`);
  console.log(`  Total Tokens:  ${totalTokens.toLocaleString()}`);
  console.log(`  Total Latency: ${(totalLatencyMs / 1000).toFixed(1)}s`);
  console.log(`  Sites:         ${successful.length}/${results.length} successful`);

  // ============================================================================
  // JSON Report speichern
  // ============================================================================

  const report: VisionBaselineReport = {
    runner: "vision-only-baseline",
    model: MODEL,
    date: new Date().toISOString().slice(0, 10),
    viewport: VIEWPORT,
    totalSites: results.length,
    successfulSites: successful.length,
    failedSites: results.length - successful.length,
    aggregate: {
      precision: Math.round(aggPrecision * 1000) / 1000,
      recall: Math.round(aggRecall * 1000) / 1000,
      f1: Math.round(aggF1 * 1000) / 1000,
      tp: aggTp,
      fp: aggFp,
      fn: aggFn,
    },
    totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
    budgetLimitUsd: BUDGET_LIMIT_USD,
    totalLatencyMs,
    totalTokens,
    sites: results.map((r) => ({
      ...r,
      precision: Math.round(r.precision * 1000) / 1000,
      recall: Math.round(r.recall * 1000) / 1000,
      f1: Math.round(r.f1 * 1000) / 1000,
      costUsd: Math.round(r.costUsd * 10000) / 10000,
    })),
  };

  const dateStr = new Date().toISOString().slice(0, 10);
  const outPath = join(
    process.cwd(),
    "tests",
    "real-world",
    `vision-baseline-results-${dateStr}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n  JSON saved: ${outPath}`);

  // ============================================================================
  // Vergleichstabelle (Platzhalter fuer BALAGE-Ergebnisse)
  // ============================================================================

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  COMPARISON: BALAGE vs Vision-Only");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Versuche BALAGE-Ergebnisse zu laden (falls vorhanden)
  const balageResultFiles = readdirSync(join(process.cwd(), "tests", "real-world"))
    .filter((f) => f.startsWith("benchmark-results-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (balageResultFiles.length > 0) {
    try {
      const balagePath = join(process.cwd(), "tests", "real-world", balageResultFiles[0]!);
      const balageData = JSON.parse(readFileSync(balagePath, "utf-8"));
      const bp = balageData.aggregate?.precision ?? balageData.precision ?? "?";
      const br = balageData.aggregate?.recall ?? balageData.recall ?? "?";
      const bf1 = balageData.aggregate?.f1 ?? balageData.f1Score ?? "?";

      console.log("  Metric     | BALAGE  | Vision-Only | Delta");
      console.log("  ───────────┼─────────┼─────────────┼──────────");
      console.log(`  Precision  | ${fmtNum(bp)}   | ${fmtNum(aggPrecision)}       | ${fmtDelta(bp, aggPrecision)}`);
      console.log(`  Recall     | ${fmtNum(br)}   | ${fmtNum(aggRecall)}       | ${fmtDelta(br, aggRecall)}`);
      console.log(`  F1 Score   | ${fmtNum(bf1)}   | ${fmtNum(aggF1)}       | ${fmtDelta(bf1, aggF1)}`);
      console.log(`\n  BALAGE results from: ${balageResultFiles[0]}`);
    } catch {
      printPlaceholderComparison(aggPrecision, aggRecall, aggF1);
    }
  } else {
    printPlaceholderComparison(aggPrecision, aggRecall, aggF1);
  }

  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

function fmtNum(v: unknown): string {
  if (typeof v === "number") return v.toFixed(3);
  return String(v).padStart(5);
}

function fmtDelta(balage: unknown, vision: number): string {
  if (typeof balage !== "number") return "  n/a";
  const delta = balage - vision;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(3)}`;
}

function printPlaceholderComparison(p: number, r: number, f1: number): void {
  console.log("  No BALAGE benchmark results found for comparison.");
  console.log("  Run `npm run test:real` first, then re-run this baseline.\n");
  console.log("  Vision-Only Results:");
  console.log(`    Precision: ${p.toFixed(3)}`);
  console.log(`    Recall:    ${r.toFixed(3)}`);
  console.log(`    F1 Score:  ${f1.toFixed(3)}`);
}

// ============================================================================
// Entry Point
// ============================================================================

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
