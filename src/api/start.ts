/**
 * Server Entry Point — Liest Config aus Environment, startet den API-Server.
 * Nutzung: node dist/src/api/start.js
 */

import "dotenv/config";
import { createServer, startServer } from "./server.js";
import { createLogger } from "../observability/index.js";
import type { ApiServerConfig } from "./types.js";

const logger = createLogger({ name: "api:start" });

// --- Crash Handler ---

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection — shutting down", {
    reason: String(reason),
  });
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception — shutting down", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// --- ENV Validation ---

const hasApiKey = !!process.env["BALAGE_API_KEY"];
if (!hasApiKey) {
  logger.warn(
    "BALAGE_API_KEY not set — running in deny-all mode, all authenticated requests will be rejected",
  );
}

const hasOpenAi = !!process.env["BALAGE_OPENAI_API_KEY"];
const hasAnthropic = !!process.env["BALAGE_ANTHROPIC_API_KEY"];
if (!hasOpenAi && !hasAnthropic) {
  logger.error(
    "Neither BALAGE_OPENAI_API_KEY nor BALAGE_ANTHROPIC_API_KEY is set. At least one LLM API key is required.",
  );
  process.exit(1);
}

// --- CORS ---

const corsOrigins = process.env["BALAGE_CORS_ORIGINS"];
if (!corsOrigins) {
  logger.warn(
    "BALAGE_CORS_ORIGINS not set — CORS is disabled (no origins allowed)",
  );
}

// --- Server Config ---

const port = parseInt(process.env["BALAGE_API_PORT"] ?? "3100", 10);

const config: ApiServerConfig = {
  host: "0.0.0.0",
  port,
  apiKeys: hasApiKey
    ? [
        {
          key: process.env["BALAGE_API_KEY"]!,
          name: "default",
          permissions: [
            "workflows:read",
            "workflows:write",
            "endpoints:read",
            "actions:execute",
            "evidence:read",
          ],
        },
      ]
    : [],
  cors: {
    origins: corsOrigins ? corsOrigins.split(",") : [],
    credentials: false,
  },
  rateLimit: {
    global: parseInt(process.env["BALAGE_RATE_LIMIT_GLOBAL"] ?? "100", 10),
    perKey: parseInt(process.env["BALAGE_RATE_LIMIT_PER_KEY"] ?? "50", 10),
  },
  idempotencyTtlMs: 300_000,
};

const server = await createServer(config);
await startServer(server, config);
