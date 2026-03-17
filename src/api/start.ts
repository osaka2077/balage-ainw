/**
 * Server Entry Point — Liest Config aus Environment, startet den API-Server.
 * Nutzung: node dist/src/api/start.js
 */

import "dotenv/config";
import { createServer, startServer } from "./server.js";
import type { ApiServerConfig } from "./types.js";

const port = parseInt(process.env["BALAGE_API_PORT"] ?? "3100", 10);

const config: ApiServerConfig = {
  host: "0.0.0.0",
  port,
  apiKeys: process.env["BALAGE_API_KEY"]
    ? [
        {
          key: process.env["BALAGE_API_KEY"],
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
    origins: (process.env["BALAGE_CORS_ORIGINS"] ?? "*").split(","),
    credentials: true,
  },
  rateLimit: {
    global: parseInt(process.env["BALAGE_RATE_LIMIT_GLOBAL"] ?? "100", 10),
    perKey: parseInt(process.env["BALAGE_RATE_LIMIT_PER_KEY"] ?? "50", 10),
  },
  idempotencyTtlMs: 300_000,
};

const server = await createServer(config);
await startServer(server, config);
