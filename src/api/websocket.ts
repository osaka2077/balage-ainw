/**
 * WebSocket Manager — Real-Time Streaming fuer Workflow Progress
 */

import { z } from "zod";
import type { WebSocket, RawData } from "ws";
import type { WorkflowProgressEvent, WebSocketMessage, ApiKeyConfig } from "./types.js";
import { safeCompare } from "./middleware/auth.js";
import { createLogger } from "../observability/index.js";

// Zod-Schema fuer eingehende WebSocket-Nachrichten (SEC-004)
const IncomingWebSocketMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    apiKey: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("subscribe"),
    workflowId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    workflowId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("pong"),
  }),
]);

type IncomingWebSocketMessage = z.infer<typeof IncomingWebSocketMessageSchema>;

const logger = createLogger({ name: "api:websocket" });

/** Timeout fuer pending-auth Verbindungen (5 Sekunden) */
const AUTH_TIMEOUT_MS = 5_000;

interface Connection {
  socket: WebSocket;
  apiKey: string;
  authenticated: boolean;
  subscriptions: Set<string>;
  lastPong: number;
}

export class WebSocketManager {
  private connections = new Map<WebSocket, Connection>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly apiKeys: ApiKeyConfig[],
    heartbeatIntervalMs: number = 30_000,
  ) {
    if (heartbeatIntervalMs > 0) {
      this.heartbeatInterval = setInterval(() => {
        this.sendHeartbeats();
      }, heartbeatIntervalMs);
    }
  }

  /** Neue WebSocket-Verbindung registrieren */
  handleConnection(socket: WebSocket, apiKey: string): void {
    // Wenn API-Key vorhanden (Header oder Query), sofort validieren
    if (apiKey) {
      const isValid = this.apiKeys.some((k) => safeCompare(k.key, apiKey));
      if (!isValid) {
        socket.send(JSON.stringify({
          type: "error",
          code: "AUTH_INVALID_KEY",
          message: "Invalid API key",
        } satisfies WebSocketMessage));
        socket.close(4001, "Invalid API key");
        return;
      }
    }

    const connection: Connection = {
      socket,
      apiKey,
      authenticated: apiKey !== "",
      subscriptions: new Set(),
      lastPong: Date.now(),
    };

    this.connections.set(socket, connection);

    if (connection.authenticated) {
      logger.debug("WebSocket connection established", { apiKey: apiKey.slice(0, 8) + "..." });
    } else {
      // Kein API-Key — warte auf auth-Message, mit Timeout
      logger.debug("WebSocket connection pending auth");
      const authTimer = setTimeout(() => {
        const conn = this.connections.get(socket);
        if (conn && !conn.authenticated) {
          this.sendError(socket, "AUTH_TIMEOUT", "Authentication timeout — send auth message within 5s");
          socket.close(4001, "Authentication timeout");
          this.connections.delete(socket);
        }
      }, AUTH_TIMEOUT_MS);
      socket.once("close", () => clearTimeout(authTimer));
    }

    socket.on("message", (data: RawData) => {
      this.handleMessage(socket, data.toString());
    });

    socket.on("close", () => {
      this.connections.delete(socket);
      logger.debug("WebSocket connection closed");
    });

    socket.on("pong", () => {
      const conn = this.connections.get(socket);
      if (conn) {
        conn.lastPong = Date.now();
      }
    });
  }

  /** Nachricht von Client verarbeiten — Zod-validiert (SEC-004) */
  private handleMessage(socket: WebSocket, raw: string): void {
    const connection = this.connections.get(socket);
    if (!connection) return;

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.sendError(socket, "INVALID_MESSAGE", "Invalid JSON");
      return;
    }

    const parsed = IncomingWebSocketMessageSchema.safeParse(json);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "Validation failed";
      this.sendError(socket, "INVALID_MESSAGE", `Message validation failed: ${firstIssue}`);
      return;
    }

    const msg = parsed.data;

    // Auth-Message ist die einzige die vor Authentifizierung erlaubt ist
    if (!connection.authenticated && msg.type !== "auth") {
      this.sendError(socket, "AUTH_REQUIRED", "Send auth message before other commands");
      return;
    }

    switch (msg.type) {
      case "auth":
        this.handleAuth(socket, connection, msg);
        break;

      case "subscribe":
        connection.subscriptions.add(msg.workflowId);
        logger.debug("Subscribed to workflow", { workflowId: msg.workflowId });
        break;

      case "unsubscribe":
        connection.subscriptions.delete(msg.workflowId);
        logger.debug("Unsubscribed from workflow", { workflowId: msg.workflowId });
        break;

      case "pong":
        connection.lastPong = Date.now();
        break;
    }
  }

  /** Auth-Message verarbeiten */
  private handleAuth(socket: WebSocket, connection: Connection, msg: IncomingWebSocketMessage): void {
    if (connection.authenticated) {
      this.sendError(socket, "AUTH_ALREADY_AUTHENTICATED", "Connection already authenticated");
      return;
    }

    const apiKey = ("apiKey" in msg ? msg.apiKey : undefined) ?? "";
    if (!apiKey) {
      this.sendError(socket, "AUTH_MISSING_KEY", "API key required in auth message");
      socket.close(4001, "Missing API key");
      this.connections.delete(socket);
      return;
    }

    const isValid = this.apiKeys.some((k) => safeCompare(k.key, apiKey));
    if (!isValid) {
      this.sendError(socket, "AUTH_INVALID_KEY", "Invalid API key");
      socket.close(4001, "Invalid API key");
      this.connections.delete(socket);
      return;
    }

    connection.apiKey = apiKey;
    connection.authenticated = true;
    logger.debug("WebSocket authenticated via message", { apiKey: apiKey.slice(0, 8) + "..." });

    // Bestaetigung senden
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({ type: "auth", message: "authenticated" } satisfies WebSocketMessage));
    }
  }

  /** Event an alle Subscriber eines Workflows senden */
  broadcast(workflowId: string, event: WorkflowProgressEvent): void {
    for (const connection of this.connections.values()) {
      if (connection.authenticated && connection.subscriptions.has(workflowId)) {
        const message: WebSocketMessage = {
          type: "workflow_progress",
          workflowId,
          event,
        };
        if (connection.socket.readyState === 1) { // OPEN
          connection.socket.send(JSON.stringify(message));
        }
      }
    }
  }

  /** Aktive Connections zaehlen */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /** Disconnected Connections aufraeumen */
  cleanup(): void {
    for (const [socket, connection] of this.connections) {
      if (socket.readyState !== 1) { // nicht OPEN
        this.connections.delete(socket);
      } else if (Date.now() - connection.lastPong > 90_000) {
        // Keine Pong-Antwort seit 90s
        socket.close(4002, "Heartbeat timeout");
        this.connections.delete(socket);
      }
    }
  }

  /** Heartbeat an alle Connections senden */
  private sendHeartbeats(): void {
    const pingMessage = JSON.stringify({ type: "ping" });
    for (const [socket] of this.connections) {
      if (socket.readyState === 1) { // OPEN
        socket.send(pingMessage);
      }
    }
    this.cleanup();
  }

  /** Error an einen Client senden */
  private sendError(socket: WebSocket, code: string, message: string): void {
    const errorMsg: WebSocketMessage = { type: "error", code, message };
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(errorMsg));
    }
  }

  /** Manager stoppen */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const [socket] of this.connections) {
      socket.close(1001, "Server shutting down");
    }
    this.connections.clear();
  }
}
