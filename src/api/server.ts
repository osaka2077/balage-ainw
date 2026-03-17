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
    const query = request.query as Record<string, string>;
    const apiKey = query["apiKey"] ?? "";
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
