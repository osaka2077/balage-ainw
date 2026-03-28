/**
 * Fastify Server Setup + Plugin Registration
 */

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { createLogger } from "../observability/index.js";
import { createAuthHook } from "./middleware/auth.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { createRateLimitConfig } from "./middleware/rate-limit.js";
import { healthRoutes } from "./routes/health.js";
import { workflowRoutes } from "./routes/workflows.js";
import { endpointRoutes } from "./routes/endpoints.js";
import { actionRoutes } from "./routes/actions.js";
import { evidenceRoutes } from "./routes/evidence.js";
import { WebSocketManager } from "./websocket.js";
import type { ApiServerConfig } from "./types.js";

const logger = createLogger({ name: "api:server" });

/** Fastify-Instanz mit angehaengter Config */
interface ServerWithConfig extends FastifyInstance {
  apiConfig?: ApiServerConfig;
  wsManager?: WebSocketManager;
}

/** Erstellt eine konfigurierte Fastify-Instanz (startet NICHT) */
export async function createServer(config: ApiServerConfig): Promise<FastifyInstance> {
  const server: ServerWithConfig = Fastify({
    logger: false,
    disableRequestLogging: true,
    bodyLimit: 2 * 1024 * 1024, // 2 MB — genuegt fuer grosse HTML-Seiten
  });

  // Config am Server haengen fuer Routes
  server.apiConfig = config;

  // --- Plugins ---

  // CORS
  await server.register(cors, {
    origin: config.cors.origins,
    credentials: config.cors.credentials,
  });

  // Rate Limiting
  await server.register(rateLimit, createRateLimitConfig(config));

  // WebSocket
  await server.register(websocket);

  // --- Middleware ---

  // Security Headers
  server.addHook("onRequest", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-XSS-Protection", "0");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    reply.header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'");
  });

  // Auth Hook (preHandler)
  server.addHook("preHandler", createAuthHook(config.apiKeys));

  // Error Handler
  server.setErrorHandler(createErrorHandler(logger));

  // --- Routes ---

  await server.register(healthRoutes);
  await server.register(workflowRoutes);
  await server.register(endpointRoutes);
  await server.register(actionRoutes);
  await server.register(evidenceRoutes);

  // --- WebSocket Route ---
  const wsManager = new WebSocketManager(config.apiKeys, 0);
  server.wsManager = wsManager;

  server.get("/api/v1/ws", { websocket: true }, (socket, request) => {
    // Primaer: API-Key aus Sec-WebSocket-Protocol Header
    const protocolHeader = request.headers["sec-websocket-protocol"];
    const headerApiKey = typeof protocolHeader === "string" ? protocolHeader.trim() : "";

    // Fallback: Query-Parameter (deprecated, loggt Warning)
    const query = request.query as Record<string, string>;
    const queryApiKey = query["apiKey"] ?? "";

    if (queryApiKey && !headerApiKey) {
      logger.warn(
        "WebSocket API key passed as query parameter is deprecated — use Sec-WebSocket-Protocol header or auth message",
        { remoteAddress: request.ip },
      );
    }

    const apiKey = headerApiKey || queryApiKey;
    wsManager.handleConnection(socket, apiKey);
  });

  // Request Logging
  server.addHook("onResponse", async (request, reply) => {
    logger.info("Request completed", {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
    });
  });

  return server;
}

/** Server starten mit Graceful Shutdown */
export async function startServer(
  server: FastifyInstance,
  config: ApiServerConfig,
): Promise<void> {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    const srv = server as ServerWithConfig;
    if (srv.wsManager) {
      srv.wsManager.destroy();
    }
    await server.close();
    logger.info("Server stopped");
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await server.listen({ host: config.host, port: config.port });
  logger.info(`Server listening on ${config.host}:${config.port}`);
}
