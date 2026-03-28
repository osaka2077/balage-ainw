/**
 * WebSocket Manager — Real-Time Streaming fuer Workflow Progress
 */

import type { WebSocket, RawData } from "ws";
import type { WorkflowProgressEvent, WebSocketMessage, ApiKeyConfig } from "./types.js";
import { safeCompare } from "./middleware/auth.js";
import { createLogger } from "../observability/index.js";

const logger = createLogger({ name: "api:websocket" });

interface Connection {
  socket: WebSocket;
  apiKey: string;
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

    const connection: Connection = {
      socket,
      apiKey,
      subscriptions: new Set(),
      lastPong: Date.now(),
    };

    this.connections.set(socket, connection);
    logger.debug("WebSocket connection established", { apiKey: apiKey.slice(0, 8) + "..." });

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

  /** Nachricht von Client verarbeiten */
  private handleMessage(socket: WebSocket, raw: string): void {
    const connection = this.connections.get(socket);
    if (!connection) return;

    let msg: WebSocketMessage;
    try {
      msg = JSON.parse(raw) as WebSocketMessage;
    } catch {
      this.sendError(socket, "INVALID_MESSAGE", "Invalid JSON");
      return;
    }

    switch (msg.type) {
      case "subscribe":
        if (msg.workflowId) {
          connection.subscriptions.add(msg.workflowId);
          logger.debug("Subscribed to workflow", { workflowId: msg.workflowId });
        }
        break;

      case "unsubscribe":
        if (msg.workflowId) {
          connection.subscriptions.delete(msg.workflowId);
          logger.debug("Unsubscribed from workflow", { workflowId: msg.workflowId });
        }
        break;

      case "pong":
        connection.lastPong = Date.now();
        break;

      default:
        this.sendError(socket, "UNKNOWN_MESSAGE_TYPE", `Unknown type: ${msg.type}`);
    }
  }

  /** Event an alle Subscriber eines Workflows senden */
  broadcast(workflowId: string, event: WorkflowProgressEvent): void {
    for (const connection of this.connections.values()) {
      if (connection.subscriptions.has(workflowId)) {
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
