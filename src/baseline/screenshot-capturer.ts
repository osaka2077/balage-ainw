/**
 * BALAGE Baseline — Screenshot Capturer
 *
 * Erstellt Screenshots von HTML-Fragmenten mittels Playwright (headless).
 * Browser-Instanz wird wiederverwendet fuer bessere Performance.
 */

import { chromium, type Browser, type Page } from "playwright";
import { createLogger } from "../observability/index.js";
import type { ScreenshotConfig, ScreenshotResult, CorpusEntry } from "./types.js";
import { ScreenshotCaptureError, ScreenshotTimeoutError } from "./errors.js";

const logger = createLogger({ name: "baseline:screenshot" });

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_TIMEOUT = 10_000;

export class ScreenshotCapturer {
  private readonly viewport: { width: number; height: number };
  private readonly fullPage: boolean;
  private readonly format: "png" | "jpeg";
  private readonly quality: number;
  private readonly timeout: number;
  private browser: Browser | null = null;

  constructor(config?: ScreenshotConfig) {
    this.viewport = config?.viewport ?? DEFAULT_VIEWPORT;
    this.fullPage = config?.fullPage ?? true;
    this.format = config?.format ?? "png";
    this.quality = config?.quality ?? 80;
    this.timeout = config?.timeout ?? DEFAULT_TIMEOUT;
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      logger.debug("Launching headless browser");
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  async captureFromHtml(corpusId: string, html: string): Promise<ScreenshotResult> {
    const start = performance.now();
    let page: Page | null = null;

    try {
      const browser = await this.ensureBrowser();
      page = await browser.newPage();
      await page.setViewportSize(this.viewport);

      // Timeout-geschuetztes setContent
      await Promise.race([
        page.setContent(html, { waitUntil: "load" }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new ScreenshotTimeoutError(corpusId, this.timeout)),
            this.timeout,
          ),
        ),
      ]);

      const screenshotOptions: { fullPage: boolean; type: "png" | "jpeg"; quality?: number } = {
        fullPage: this.fullPage,
        type: this.format,
      };

      if (this.format === "jpeg") {
        screenshotOptions.quality = this.quality;
      }

      const imageBuffer = await page.screenshot(screenshotOptions);
      const captureTimeMs = performance.now() - start;

      logger.info("Screenshot captured", { corpusId, captureTimeMs });

      return {
        corpusId,
        imageBuffer: Buffer.from(imageBuffer),
        format: this.format,
        dimensions: this.viewport,
        captureTimeMs,
      };
    } catch (error) {
      if (error instanceof ScreenshotTimeoutError) {
        throw error;
      }
      throw new ScreenshotCaptureError(
        corpusId,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  async captureCorpus(corpus: CorpusEntry[]): Promise<ScreenshotResult[]> {
    logger.info("Capturing corpus screenshots", { count: corpus.length });
    const results: ScreenshotResult[] = [];

    for (const entry of corpus) {
      const result = await this.captureFromHtml(entry.id, entry.html);
      results.push(result);
    }

    return results;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      logger.debug("Closing browser");
      await this.browser.close();
      this.browser = null;
    }
  }
}
