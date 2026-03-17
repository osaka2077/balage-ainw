/**
 * Vision-Only Baseline — vitest wrapper
 *
 * Fuehrt vision-baseline-runner.ts via vitest aus, um das __name-Problem
 * bei page.evaluate() zu vermeiden (tsx/esbuild vs vitest transform).
 *
 * Ausfuehrung: npm run benchmark:vision
 * Wird uebersprungen wenn kein OPENAI API-Key gesetzt ist.
 */

import { describe, it, expect } from "vitest";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

const hasOpenAiKey = !!process.env["BALAGE_OPENAI_API_KEY"];

describe.skipIf(!hasOpenAiKey)("Vision-Only Baseline", () => {
  it("runs screenshot + gpt-4o against 10 websites", async () => {
    const { run } = await import("./vision-baseline-runner.js");
    const report = await run();

    console.log(
      `\nVision baseline done: ${report.successfulSites}/${report.totalSites} sites, ` +
      `F1=${(report.aggregate.f1 * 100).toFixed(1)}%, ` +
      `Cost=$${report.totalCostUsd.toFixed(4)}`,
    );

    expect(report.successfulSites).toBeGreaterThan(0);
  }, 1_200_000);
});
