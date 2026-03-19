/**
 * Health Route — GET /api/v1/health (keine Auth noetig)
 *
 * Echte Checks: Chromium-Browser, LLM-API-Key, Memory-Usage
 */

import type { FastifyInstance } from "fastify";
import { chromium } from "playwright";
import { createLogger } from "../../observability/index.js";

const logger = createLogger({ name: "api:health" });

const startTime = Date.now();

// Chromium check cache (recheck alle 5 Minuten, nicht bei jedem Request)
let chromiumOk: boolean | null = null;
let chromiumLastCheck = 0;
const CHROMIUM_CHECK_INTERVAL = 5 * 60 * 1000;

async function checkChromium(): Promise<"ok" | "error"> {
  const now = Date.now();
  if (chromiumOk !== null && now - chromiumLastCheck < CHROMIUM_CHECK_INTERVAL) {
    return chromiumOk ? "ok" : "error";
  }

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("about:blank");
    await browser.close();
    chromiumOk = true;
    chromiumLastCheck = now;
    return "ok";
  } catch (err) {
    logger.warn("Chromium health check failed", { error: String(err) });
    chromiumOk = false;
    chromiumLastCheck = now;
    return "error";
  }
}

function checkLlmApiKey(): "ok" | "error" {
  const hasOpenAi = !!process.env["BALAGE_OPENAI_API_KEY"];
  const hasAnthropic = !!process.env["BALAGE_ANTHROPIC_API_KEY"];
  return hasOpenAi || hasAnthropic ? "ok" : "error";
}

function checkMemory(): "ok" | "warning" {
  const heapUsed = process.memoryUsage().heapUsed;
  const limit = 1.5 * 1024 * 1024 * 1024; // 1.5 GB
  return heapUsed < limit ? "ok" : "warning";
}

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/v1/health", async (_request, reply) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    const [browserStatus, llmStatus, memoryStatus] = await Promise.all([
      checkChromium(),
      Promise.resolve(checkLlmApiKey()),
      Promise.resolve(checkMemory()),
    ]);

    const checks = {
      browser: browserStatus,
      llm_api: llmStatus,
      memory: memoryStatus,
    };

    // Status bestimmen
    const values = Object.values(checks);
    let status: "healthy" | "degraded" | "unhealthy";

    if (values.every((v) => v === "error")) {
      status = "unhealthy";
    } else if (values.some((v) => v === "error" || v === "warning")) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    const statusCode = status === "unhealthy" ? 503 : 200;

    return reply.status(statusCode).send({
      status,
      version: "0.1.0",
      uptime,
      timestamp: new Date().toISOString(),
      checks,
    });
  });
}
