/**
 * Real-World Benchmark — vitest wrapper
 *
 * Fuehrt benchmark-runner.ts via vitest aus, um das __name-Problem
 * bei page.evaluate() zu vermeiden (tsx/esbuild vs vitest transform).
 *
 * Ausfuehrung: npm run benchmark:real
 * Wird uebersprungen wenn kein API-Key gesetzt ist.
 */

import { describe, it, expect } from "vitest";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config(); // also load .env as fallback

const hasApiKey =
  !!process.env["BALAGE_OPENAI_API_KEY"] ||
  !!process.env["BALAGE_ANTHROPIC_API_KEY"];

describe.skipIf(!hasApiKey)("Real-World Benchmark", () => {
  it("runs full BALAGE pipeline against 10 websites", async () => {
    const { main } = await import("./benchmark-runner.js");
    const report = await main();

    console.log(
      `\nBenchmark done: ${report.aggregate.successful}/${report.aggregate.totalWebsites} sites, ` +
      `F1=${(report.aggregate.allEndpoints.f1 * 100).toFixed(1)}%, ` +
      `Cost=$${report.aggregate.totalLlmCostUsd.toFixed(4)}`,
    );

    expect(report.aggregate.successful).toBeGreaterThan(0);
  }, 1_200_000);
});
