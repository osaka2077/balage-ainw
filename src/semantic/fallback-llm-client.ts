/**
 * FallbackLLMClient — Resiliente LLM-Anbindung mit:
 *   - Provider-Fallback-Chain (primary → fallback → degraded)
 *   - Token-Bucket Rate Limiting (10K tokens/minute)
 *   - Cost Tracking (per-call + Gesamtkosten)
 *   - Circuit Breaker (nach 3 Fehlern → naechster Provider)
 */

import pino from "pino";
import { createOpenAIClient, createAnthropicClient } from "./llm-client.js";
import type { LLMClient, LLMRequest, LLMResponse } from "./llm-client.js";
import { LLMCallError } from "./errors.js";
import type { BalageEnvConfig } from "../config/env.js";

const logger = pino({ name: "semantic:fallback-llm-client" });

// ============================================================================
// Cost Tracking
// ============================================================================

/** Kosten pro 1M Tokens (Input/Output) — Stand Maerz 2026 */
const COST_TABLE: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "claude-sonnet-4-6-20250514": { input: 3.00, output: 15.00 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
};

function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = COST_TABLE[model] ?? { input: 2.50, output: 10.00 };
  return (
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output
  );
}

export interface CostRecord {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  timestamp: number;
}

// ============================================================================
// Token Bucket Rate Limiter
// ============================================================================

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number = 10_000,
    private readonly refillIntervalMs: number = 60_000,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async consume(amount: number): Promise<void> {
    this.refill();
    if (this.tokens >= amount) {
      this.tokens -= amount;
      return;
    }
    // Warte bis genug Tokens da sind
    const deficit = amount - this.tokens;
    const waitMs = (deficit / this.maxTokens) * this.refillIntervalMs;
    logger.debug({ waitMs, deficit }, "Rate limiter: waiting for tokens");
    await sleep(Math.min(waitMs, 30_000));
    this.refill();
    this.tokens = Math.max(0, this.tokens - amount);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refilled = (elapsed / this.refillIntervalMs) * this.maxTokens;
    this.tokens = Math.min(this.maxTokens, this.tokens + refilled);
    this.lastRefill = now;
  }
}

// ============================================================================
// Circuit Breaker (per Provider)
// ============================================================================

interface ProviderCircuitBreaker {
  failures: number;
  state: "closed" | "open";
  lastFailure: number;
}

// ============================================================================
// FallbackLLMClient
// ============================================================================

export interface FallbackLLMClientOptions {
  envConfig: BalageEnvConfig;
  maxCostUsd?: number;
  rateLimitTokensPerMinute?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

export interface FallbackLLMClient extends LLMClient {
  /** Alle aufgezeichneten Calls */
  costLog: CostRecord[];
  /** Gesamtkosten */
  totalCostUsd(): number;
  /** Gesamt-Tokens */
  totalTokens(): number;
  /** Zusammenfassung fuer Ausgabe */
  summary(): CostSummary;
}

export interface CostSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number;
  callsByModel: Record<string, number>;
}

export function createFallbackLLMClient(
  options: FallbackLLMClientOptions,
): FallbackLLMClient {
  const {
    envConfig: cfg,
    maxCostUsd = cfg.maxCostPerRunUsd,
    rateLimitTokensPerMinute = 10_000,
    circuitBreakerThreshold = 3,
    circuitBreakerResetMs = 60_000,
  } = options;

  // Provider-Chain aufbauen
  const providers: Array<{ name: string; client: LLMClient; model: string }> =
    [];

  if (cfg.openaiApiKey) {
    providers.push({
      name: "openai-primary",
      client: createOpenAIClient({
        apiKey: cfg.openaiApiKey,
        model: cfg.llmModel,
        maxRetries: 1,
      }),
      model: cfg.llmModel,
    });

    if (cfg.llmFallbackModel !== cfg.llmModel) {
      providers.push({
        name: "openai-fallback",
        client: createOpenAIClient({
          apiKey: cfg.openaiApiKey,
          model: cfg.llmFallbackModel,
          maxRetries: 1,
        }),
        model: cfg.llmFallbackModel,
      });
    }
  }

  if (cfg.anthropicApiKey) {
    providers.push({
      name: "anthropic",
      client: createAnthropicClient({
        apiKey: cfg.anthropicApiKey,
        maxRetries: 1,
      }),
      model: "claude-sonnet-4-6-20250514",
    });
  }

  if (providers.length === 0) {
    logger.warn("No API keys configured — FallbackLLMClient runs in degraded mode (no LLM)");
  }

  // State
  const costLog: CostRecord[] = [];
  const rateLimiter = new TokenBucket(rateLimitTokensPerMinute);
  const circuitBreakers = new Map<string, ProviderCircuitBreaker>();

  for (const p of providers) {
    circuitBreakers.set(p.name, {
      failures: 0,
      state: "closed",
      lastFailure: 0,
    });
  }

  function getCircuitBreaker(name: string): ProviderCircuitBreaker {
    let cb = circuitBreakers.get(name);
    if (!cb) {
      cb = { failures: 0, state: "closed", lastFailure: 0 };
      circuitBreakers.set(name, cb);
    }
    // Auto-Reset nach Timeout
    if (
      cb.state === "open" &&
      Date.now() - cb.lastFailure > circuitBreakerResetMs
    ) {
      logger.info({ provider: name }, "Circuit breaker reset");
      cb.state = "closed";
      cb.failures = 0;
    }
    return cb;
  }

  function recordFailure(name: string): void {
    const cb = getCircuitBreaker(name);
    cb.failures++;
    cb.lastFailure = Date.now();
    if (cb.failures >= circuitBreakerThreshold) {
      cb.state = "open";
      logger.warn(
        { provider: name, failures: cb.failures },
        "Circuit breaker OPEN — skipping provider",
      );
    }
  }

  function recordSuccess(name: string): void {
    const cb = getCircuitBreaker(name);
    cb.failures = 0;
    cb.state = "closed";
  }

  function currentCost(): number {
    return costLog.reduce((sum, r) => sum + r.costUsd, 0);
  }

  return {
    costLog,

    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },

    totalCostUsd(): number {
      return currentCost();
    },

    totalTokens(): number {
      return costLog.reduce((sum, r) => sum + r.totalTokens, 0);
    },

    summary(): CostSummary {
      const callsByModel: Record<string, number> = {};
      for (const r of costLog) {
        callsByModel[r.model] = (callsByModel[r.model] ?? 0) + 1;
      }
      const avgLatency =
        costLog.length > 0
          ? costLog.reduce((s, r) => s + r.latencyMs, 0) / costLog.length
          : 0;

      return {
        totalCalls: costLog.length,
        totalTokens: costLog.reduce((s, r) => s + r.totalTokens, 0),
        totalCostUsd: currentCost(),
        averageLatencyMs: Math.round(avgLatency),
        callsByModel,
      };
    },

    async complete(request: LLMRequest): Promise<LLMResponse> {
      // Cost Guard
      if (currentCost() >= maxCostUsd) {
        throw new LLMCallError(
          `Cost limit reached: $${currentCost().toFixed(4)} >= $${maxCostUsd.toFixed(2)}`,
        );
      }

      // Kein Provider verfuegbar
      if (providers.length === 0) {
        throw new LLMCallError(
          "No LLM providers available — configure BALAGE_OPENAI_API_KEY or BALAGE_ANTHROPIC_API_KEY",
        );
      }

      // Rate Limiting (schaetze Input-Tokens)
      const estimatedTokens = Math.ceil(
        (request.systemPrompt.length + request.userPrompt.length) / 4,
      );
      await rateLimiter.consume(estimatedTokens);

      // Fallback-Chain durchlaufen
      let lastError: Error | undefined;

      for (const provider of providers) {
        const cb = getCircuitBreaker(provider.name);
        if (cb.state === "open") {
          logger.debug(
            { provider: provider.name },
            "Skipping provider (circuit breaker open)",
          );
          continue;
        }

        try {
          logger.info(
            { provider: provider.name, model: provider.model },
            "Attempting LLM call",
          );

          const response = await provider.client.complete(request);

          // Erfolg tracken
          recordSuccess(provider.name);

          const cost = estimateCostUsd(
            response.model,
            response.usage.promptTokens,
            response.usage.completionTokens,
          );

          costLog.push({
            model: response.model,
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens,
            costUsd: cost,
            latencyMs: response.latency,
            timestamp: Date.now(),
          });

          logger.info(
            {
              provider: provider.name,
              model: response.model,
              tokens: response.usage.totalTokens,
              costUsd: cost.toFixed(6),
              latencyMs: response.latency,
            },
            "LLM call succeeded",
          );

          return response;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          recordFailure(provider.name);
          logger.warn(
            {
              provider: provider.name,
              error: lastError.message,
              failures: getCircuitBreaker(provider.name).failures,
            },
            "LLM call failed, trying next provider",
          );
        }
      }

      throw new LLMCallError(
        `All LLM providers failed. Last error: ${lastError?.message ?? "unknown"}`,
        lastError,
      );
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
