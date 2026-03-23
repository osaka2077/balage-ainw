/**
 * Modellagnostischer LLM-Wrapper (OpenAI / Anthropic)
 *
 * MUSS als Interface definiert sein fuer Testbarkeit.
 * Tests verwenden IMMER den Mock-Client.
 */

import { z } from "zod";
import pino from "pino";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { LLMCallError, LLMParseError, LLMRateLimitError } from "./errors.js";
import type { OpenAIConfig, AnthropicConfig } from "./types.js";

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "silent", name: "semantic:llm-client" });

// ============================================================================
// Interfaces
// ============================================================================

/** LLM-Client Interface — fuer Tests mockbar */
export interface LLMClient {
  complete(request: LLMRequest): Promise<LLMResponse>;
  estimateTokens(text: string): number;
}

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  responseSchema?: z.ZodSchema;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMResponse {
  content: string;
  parsedContent?: unknown;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latency: number;
}

// ============================================================================
// OpenAI-Implementierung
// ============================================================================

export function createOpenAIClient(config: OpenAIConfig): LLMClient {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: config.timeout ?? 30_000,
    maxRetries: 0, // Wir handlen Retries selbst
  });

  const modelId = config.model ?? "gpt-4o";
  const maxRetries = config.maxRetries ?? 2;

  return {
    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },

    async complete(request: LLMRequest): Promise<LLMResponse> {
      const model = request.model ?? modelId;
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
          logger.warn({ attempt, delay, model }, "Retrying OpenAI call");
          await sleep(delay);
        }

        const start = Date.now();
        try {
          const response = await client.chat.completions.create({
            model,
            messages: [
              { role: "system", content: request.systemPrompt },
              { role: "user", content: request.userPrompt },
            ],
            temperature: request.temperature ?? 0,
            max_tokens: request.maxTokens ?? 4096,
            response_format: { type: "json_object" },
          });

          const latency = Date.now() - start;
          const raw = response.choices[0]?.message?.content ?? "";
          const usage = response.usage;

          let parsedContent: unknown;
          if (request.responseSchema) {
            try {
              const parsed = JSON.parse(raw) as unknown;
              parsedContent = request.responseSchema.parse(parsed);
            } catch (parseErr) {
              throw new LLMParseError(
                `Failed to parse/validate LLM response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
                raw,
                parseErr instanceof Error ? parseErr : undefined,
              );
            }
          }

          return {
            content: raw,
            parsedContent,
            model,
            usage: {
              promptTokens: usage?.prompt_tokens ?? 0,
              completionTokens: usage?.completion_tokens ?? 0,
              totalTokens: usage?.total_tokens ?? 0,
            },
            latency,
          };
        } catch (err) {
          if (err instanceof LLMParseError) throw err;

          if (err instanceof OpenAI.RateLimitError) {
            lastError = new LLMRateLimitError(
              "OpenAI rate limit reached",
              undefined,
              err,
            );
            continue;
          }

          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxRetries) continue;
        }
      }

      throw new LLMCallError(
        `OpenAI call failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
        lastError,
      );
    },
  };
}

// ============================================================================
// Anthropic-Implementierung
// ============================================================================

export function createAnthropicClient(config: AnthropicConfig): LLMClient {
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: config.timeout ?? 30_000,
    maxRetries: 0,
  });

  const modelId = config.model ?? "claude-sonnet-4-6-20250514";
  const maxRetries = config.maxRetries ?? 2;

  return {
    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },

    async complete(request: LLMRequest): Promise<LLMResponse> {
      const model = request.model ?? modelId;
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
          logger.warn({ attempt, delay, model }, "Retrying Anthropic call");
          await sleep(delay);
        }

        const start = Date.now();
        try {
          const response = await client.messages.create({
            model,
            system: request.systemPrompt,
            messages: [{ role: "user", content: request.userPrompt }],
            temperature: request.temperature ?? 0,
            max_tokens: request.maxTokens ?? 4096,
          });

          const latency = Date.now() - start;
          const textBlock = response.content.find((b) => b.type === "text");
          const raw = textBlock && "text" in textBlock ? textBlock.text : "";

          let parsedContent: unknown;
          if (request.responseSchema) {
            try {
              const parsed = JSON.parse(raw) as unknown;
              parsedContent = request.responseSchema.parse(parsed);
            } catch (parseErr) {
              throw new LLMParseError(
                `Failed to parse/validate Anthropic response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
                raw,
                parseErr instanceof Error ? parseErr : undefined,
              );
            }
          }

          return {
            content: raw,
            parsedContent,
            model,
            usage: {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens:
                response.usage.input_tokens + response.usage.output_tokens,
            },
            latency,
          };
        } catch (err) {
          if (err instanceof LLMParseError) throw err;

          if (err instanceof Anthropic.RateLimitError) {
            lastError = new LLMRateLimitError(
              "Anthropic rate limit reached",
              undefined,
              err,
            );
            continue;
          }

          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxRetries) continue;
        }
      }

      throw new LLMCallError(
        `Anthropic call failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
        lastError,
      );
    },
  };
}

// ============================================================================
// Mock-Client fuer Tests
// ============================================================================

export interface MockCallRecord {
  request: LLMRequest;
  timestamp: number;
}

export interface MockLLMClient extends LLMClient {
  calls: MockCallRecord[];
}

/**
 * Mock-Client: gibt vordefinierte Responses zurueck.
 * `responses` mappt System-Prompt-Substrings auf LLMResponse.
 * Falls kein Match: wirft LLMCallError.
 */
export function createMockClient(
  responses: Map<string, LLMResponse>,
): MockLLMClient {
  const calls: MockCallRecord[] = [];

  return {
    calls,

    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },

    async complete(request: LLMRequest): Promise<LLMResponse> {
      calls.push({ request, timestamp: Date.now() });

      // Suche Match via System-Prompt-Substring
      for (const [key, response] of responses) {
        if (request.systemPrompt.includes(key) || request.userPrompt.includes(key)) {
          // Wenn responseSchema vorhanden, validiere
          if (request.responseSchema && response.content) {
            try {
              const parsed = JSON.parse(response.content) as unknown;
              const validated = request.responseSchema.parse(parsed);
              return { ...response, parsedContent: validated };
            } catch (parseErr) {
              throw new LLMParseError(
                `Mock response failed validation: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
                response.content,
                parseErr instanceof Error ? parseErr : undefined,
              );
            }
          }
          return response;
        }
      }

      // Default: erste Response zurueckgeben wenn nur eine vorhanden
      if (responses.size === 1) {
        const [, response] = [...responses.entries()][0]!;
        if (request.responseSchema && response.content) {
          try {
            const parsed = JSON.parse(response.content) as unknown;
            const validated = request.responseSchema.parse(parsed);
            return { ...response, parsedContent: validated };
          } catch (parseErr) {
            throw new LLMParseError(
              `Mock response failed validation: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
              response.content,
              parseErr instanceof Error ? parseErr : undefined,
            );
          }
        }
        return response;
      }

      throw new LLMCallError("No mock response matched the request");
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
