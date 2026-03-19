/**
 * Debug-Script: Warum liefern Outlook, PayPal, Etsy 0 Segments?
 *
 * Usage:
 *   BALAGE_DIAG=1 BALAGE_SAVE_SNAPSHOTS=1 npx tsx tests/debug-zero-sites.ts [url]
 *
 * Default: laeuft fuer alle 3 Zero-Sites wenn keine URL angegeben.
 */
import { BrowserAdapter, extractStructuredDOM, extractAccessibilityTree } from "../src/adapter/index.js";
import { pruneDom, parseDom, parseAria, segmentUI } from "../src/parser/index.js";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { UISegment, DomNode } from "../shared_interfaces.js";

const SAVE_SNAPSHOTS = process.env.BALAGE_SAVE_SNAPSHOTS === "1";
const DIAG_ENABLED = process.env.BALAGE_DIAG === "1";
const SNAPSHOTS_DIR = join(import.meta.dirname!, "real-world", "snapshots");

const ZERO_SITES = [
  "https://outlook.live.com/login",
  "https://www.paypal.com/signin",
  "https://www.etsy.com",
];

// Schluesseltypen fuer Filter-Simulation (gleiche wie in benchmark-runner.ts)
const KEY_SEGMENT_TYPES = ["form", "navigation", "auth", "search", "checkout", "table", "content", "list"];
const ALWAYS_KEEP_TYPES = new Set(["form"]);
const LOW_CONF_KEEP_TYPES = new Set(["navigation"]);
const LOW_CONF_THRESHOLD = 0.30;
const MIN_SEGMENT_CONFIDENCE = 0.50;
const MIN_INTERACTIVE_FOR_LOW_CONF = 1;

function urlToSlug(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.[a-z]{2,4}\//g, "-")
    .replace(/\.[a-z]{2,4}$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// DIAGNOSTIC ONLY — This detection is for analysis purposes.
// Do NOT add bypass logic, User-Agent spoofing, cookie injection,
// or any other measures to circumvent bot detection based on these signals.
interface BotDetectionResult {
  suspected: boolean;
  signals: string[];
}

function checkBotDetection(html: string, title: string): BotDetectionResult {
  const signals: string[] = [];
  const pageSize = Buffer.byteLength(html, "utf-8");

  // Title-basierte Erkennung
  const botTitlePattern = /access denied|please verify|captcha|robot|are you human|challenge/i;
  if (botTitlePattern.test(title)) {
    signals.push(`Title contains: "${title}"`);
  }

  // Page-Size Check
  if (pageSize < 5_000) {
    signals.push(`Page size: ${(pageSize / 1024).toFixed(1)}KB (< 5KB threshold)`);
  }

  // Meta robots Check
  const metaRobotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i);
  if (metaRobotsMatch) {
    signals.push(`Meta robots: ${metaRobotsMatch[1]}`);
  }

  // DOM-Node-Count Heuristik (grobe Schaetzung per Tag-Count)
  const tagCount = (html.match(/<[a-z][a-z0-9]*[\s>]/gi) ?? []).length;
  if (tagCount < 100) {
    signals.push(`DOM nodes: ~${tagCount} (< 100 threshold)`);
  }

  return { suspected: signals.length >= 2, signals };
}

/** Simuliert die gleiche Filter-Kaskade wie benchmark-runner.ts */
function simulateFilter(segments: UISegment[]): { passed: UISegment[]; rejected: Array<{ segment: UISegment; reason: string }> } {
  const rejected: Array<{ segment: UISegment; reason: string }> = [];

  const withInteractive = segments.filter((s) => {
    if (ALWAYS_KEEP_TYPES.has(s.type)) return true;
    if (LOW_CONF_KEEP_TYPES.has(s.type) && s.confidence >= LOW_CONF_THRESHOLD) return true;
    if (s.confidence >= MIN_SEGMENT_CONFIDENCE && KEY_SEGMENT_TYPES.includes(s.type)) return true;
    if (s.confidence < MIN_SEGMENT_CONFIDENCE && s.interactiveElementCount < MIN_INTERACTIVE_FOR_LOW_CONF) {
      const reasons: string[] = [];
      if (s.confidence < MIN_SEGMENT_CONFIDENCE) reasons.push(`confidence=${s.confidence.toFixed(2)} < 0.50`);
      if (s.interactiveElementCount < 1) reasons.push(`interactive=${s.interactiveElementCount} < 1`);
      if (!KEY_SEGMENT_TYPES.includes(s.type)) reasons.push(`type=${s.type} not in KEY_TYPES`);
      rejected.push({ segment: s, reason: reasons.join(", ") });
      return false;
    }
    if (s.interactiveElementCount > 0 || KEY_SEGMENT_TYPES.includes(s.type)) return true;
    rejected.push({ segment: s, reason: `no interactive elements, type=${s.type} not key` });
    return false;
  });

  return { passed: withInteractive, rejected };
}

function countInteractiveNodes(nodes: DomNode[]): { total: number; interactive: number } {
  let total = 0;
  let interactive = 0;
  function walk(node: DomNode): void {
    total++;
    if (node.isInteractive) interactive++;
    for (const child of node.children) walk(child);
  }
  for (const n of nodes) walk(n);
  return { total, interactive };
}

async function debugSite(url: string): Promise<void> {
  const adapter = new BrowserAdapter({ headless: true, browserType: "chromium" });
  await adapter.launch();
  const ctx = await adapter.newContext();
  try {
    const page = adapter.getPage(ctx);
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  ${url}`);
    console.log("=".repeat(70));

    // Navigate
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch {
      console.log("  Nav: domcontentloaded timeout, continuing...");
    }
    await page.waitForTimeout(5000); // Warte auf SPAs/Redirects

    const finalUrl = page.url();
    const title = await page.title();
    console.log(`  Final URL: ${finalUrl}`);
    console.log(`  Title: ${title}`);

    // HTML Snapshot
    const slug = urlToSlug(url);
    let htmlContent = "";
    try {
      htmlContent = await page.content();
      console.log(`  HTML size: ${(Buffer.byteLength(htmlContent, "utf-8") / 1024).toFixed(1)}KB`);
      if (SAVE_SNAPSHOTS) {
        if (!existsSync(SNAPSHOTS_DIR)) {
          mkdirSync(SNAPSHOTS_DIR, { recursive: true });
        }
        const snapshotPath = join(SNAPSHOTS_DIR, `${slug}.html`);
        writeFileSync(snapshotPath, htmlContent, "utf-8");
        console.log(`  [SNAPSHOT] Saved → ${snapshotPath}`);
      }
    } catch (snapErr) {
      console.log(`  [SNAPSHOT] Failed: ${snapErr instanceof Error ? snapErr.message : String(snapErr)}`);
    }

    // Bot Detection (diagnostic only)
    if (htmlContent) {
      const botResult = checkBotDetection(htmlContent, title);
      if (botResult.suspected) {
        console.log(`[DIAG] WARNING: Possible bot detection on ${slug}`);
        for (const signal of botResult.signals) {
          console.log(`[DIAG]   - ${signal}`);
        }
      } else if (DIAG_ENABLED && botResult.signals.length > 0) {
        console.log(`[DIAG] Bot detection signals (${botResult.signals.length}, below threshold):`);
        for (const signal of botResult.signals) {
          console.log(`[DIAG]   - ${signal}`);
        }
      }
    }

    // DOM
    const dom = await extractStructuredDOM(page);
    const { prunedDom, removedCount } = pruneDom(dom);
    const parsed = parseDom(prunedDom);
    console.log(`  Nodes: ${parsed.nodeCount} | Pruned: ${removedCount}`);

    // ARIA
    const cdp = adapter.getCdpSession(ctx);
    const axTree = await extractAccessibilityTree(page, cdp);

    // Segmente
    const aria = parseAria(parsed.root, axTree);
    const segments: UISegment[] = segmentUI(parsed.root, aria);
    console.log(`  Segments: ${segments.length}`);

    if (segments.length === 0) {
      console.log("  >>> PROBLEM: 0 Segmente! Seite hat wahrscheinlich nicht gerendert.");
      console.log(`  >>> Body text length: ${dom.textContent?.length ?? 0}`);
      // Check ob redirect passiert ist
      if (finalUrl !== url) {
        console.log(`  >>> REDIRECT detected: ${url} → ${finalUrl}`);
      }
    } else {
      // Segment-Details (erweitert)
      console.log(`  ${"─".repeat(66)}`);
      console.log("  Segment Details:");
      for (const s of segments) {
        const nodeCounts = countInteractiveNodes(s.nodes);
        const textPreview = s.nodes
          .map(n => (n.textContent ?? "").trim())
          .filter(t => t.length > 0)
          .join(" ")
          .slice(0, 80);
        console.log(
          `    ${s.type.padEnd(15)} conf=${s.confidence.toFixed(2)} ` +
          `interactive=${s.interactiveElementCount} ` +
          `isInteractive=${String(nodeCounts.interactive > 0).padEnd(5)} ` +
          `label=${s.label ?? "-"}`,
        );
        if (DIAG_ENABLED) {
          console.log(
            `      nodes=${nodeCounts.total}, interactiveNodes=${nodeCounts.interactive}, ` +
            `text="${textPreview}"`,
          );
        }
      }

      // Filter-Simulation
      console.log(`  ${"─".repeat(66)}`);
      console.log("  Filter Simulation:");
      const filterResult = simulateFilter(segments);
      for (const r of filterResult.rejected) {
        console.log(`    REJECTED: type=${r.segment.type} conf=${r.segment.confidence.toFixed(2)} — ${r.reason}`);
      }
      for (const s of filterResult.passed) {
        console.log(`    KEPT:     type=${s.type} conf=${s.confidence.toFixed(2)} interactive=${s.interactiveElementCount}`);
      }

      // Zusammenfassung
      const rejReasons = new Map<string, number>();
      for (const r of filterResult.rejected) {
        const key = r.reason.split(",")[0]!.trim();
        rejReasons.set(key, (rejReasons.get(key) ?? 0) + 1);
      }
      const reasonSummary = [...rejReasons.entries()]
        .map(([reason, count]) => `${reason} (${count}x)`)
        .join(", ");

      console.log(`  ${"─".repeat(66)}`);
      console.log(
        `  SUMMARY: ${segments.length} segments found, ${filterResult.passed.length} passed filter, ` +
        `${filterResult.rejected.length} rejected` +
        (reasonSummary ? ` (reasons: ${reasonSummary})` : ""),
      );
    }
  } catch (e) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await adapter.destroyContext(ctx);
    await adapter.shutdown();
  }
}

async function main(): Promise<void> {
  const cliUrl = process.argv[2];
  const sites = cliUrl ? [cliUrl] : ZERO_SITES;
  console.log(`\nDebug Zero-Sites — ${sites.length} site(s)`);
  if (DIAG_ENABLED) console.log("  BALAGE_DIAG=1 (verbose output)");
  if (SAVE_SNAPSHOTS) console.log("  BALAGE_SAVE_SNAPSHOTS=1 (saving HTML)");
  console.log("");

  for (const url of sites) {
    await debugSite(url);
  }
}

main().catch(console.error);
