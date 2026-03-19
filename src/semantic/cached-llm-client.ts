/**
 * CachedLLMClient — Decorator auf LLMClient-Interface
 *
 * Eliminiert LLM-Nondeterminismus (GPU Floating-Point, Batching) fuer
 * deterministische Benchmark-Ergebnisse. SHA-256-Key aus model + prompts.
 * Write-Through JSON-File Storage, zero Dependencies.
 *
 * Opt-in via BALAGE_LLM_CACHE=1 Environment Variable.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { LLMClient, LLMRequest, LLMResponse } from "./llm-client.js";

// ============================================================================
// Types
// ============================================================================

export interface CacheOptions {
  cacheDir: string;
  enabled: boolean;
}

interface CacheEntry {
  content: string;
  model: string;
  tokens: { prompt: number; completion: number };
  cachedAt: number;
}

interface CacheFile {
  version: number;
  entries: Record<string, CacheEntry>;
}

// ============================================================================
// CachedLLMClient
// ============================================================================

export class CachedLLMClient implements LLMClient {
  private readonly inner: LLMClient;
  private readonly cache: Map<string, CacheEntry>;
  private readonly cacheDir: string;
  private readonly enabled: boolean;
  private readonly stats: { hits: number; misses: number };

  constructor(inner: LLMClient, options?: Partial<CacheOptions>) {
    this.inner = inner;
    this.cacheDir = options?.cacheDir ?? "tests/real-world/.llm-cache/";
    this.enabled = options?.enabled ?? process.env.BALAGE_LLM_CACHE === "1";
    this.stats = { hits: 0, misses: 0 };
    this.cache = new Map();

    if (this.enabled) {
      this.loadFromDisk();
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.enabled) {
      return this.inner.complete(request);
    }

    const key = this.computeKey(request);

    // Cache-Hit
    const cached = this.cache.get(key);
    if (cached) {
      this.stats.hits++;
      return this.buildResponse(cached, request);
    }

    // Cache-Miss: an inner Client delegieren
    this.stats.misses++;
    const response = await this.inner.complete(request);

    const entry: CacheEntry = {
      content: response.content,
      model: response.model,
      tokens: {
        prompt: response.usage.promptTokens,
        completion: response.usage.completionTokens,
      },
      cachedAt: Date.now(),
    };

    this.cache.set(key, entry);
    this.persistToDisk();

    return response;
  }

  estimateTokens(text: string): number {
    return this.inner.estimateTokens(text);
  }

  getStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total === 0 ? 0 : this.stats.hits / total,
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.persistToDisk();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private computeKey(request: LLMRequest): string {
    const hash = createHash("sha256");
    hash.update(request.model ?? "default");
    hash.update(request.systemPrompt);
    // Strip dynamic Segment IDs (UUIDs) from prompt before hashing —
    // otherwise every run generates new UUIDs → cache never hits.
    const normalizedPrompt = request.userPrompt
      .replace(/Segment ID: [a-f0-9-]{36}/gi, "Segment ID: NORMALIZED")
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "UUID");
    hash.update(normalizedPrompt);
    return hash.digest("hex").slice(0, 32);
  }

  private buildResponse(entry: CacheEntry, request: LLMRequest): LLMResponse {
    let parsedContent: unknown;
    if (request.responseSchema) {
      try {
        const parsed: unknown = JSON.parse(entry.content);
        parsedContent = request.responseSchema.parse(parsed);
      } catch {
        // Wenn der Cache-Content nicht mehr zum Schema passt,
        // geben wir trotzdem den content zurueck — Consumer
        // entscheidet wie damit umgegangen wird.
        parsedContent = undefined;
      }
    }

    return {
      content: entry.content,
      parsedContent,
      model: entry.model,
      usage: {
        promptTokens: entry.tokens.prompt,
        completionTokens: entry.tokens.completion,
        totalTokens: entry.tokens.prompt + entry.tokens.completion,
      },
      latency: 0, // Kein API-Call, kein Latency
    };
  }

  private loadFromDisk(): void {
    const filePath = join(this.cacheDir, "cache.json");
    if (!existsSync(filePath)) {
      return;
    }

    try {
      const raw = readFileSync(filePath, "utf-8");
      const data: unknown = JSON.parse(raw);

      // Validiere Mindest-Struktur
      if (
        typeof data !== "object" ||
        data === null ||
        !("version" in data) ||
        !("entries" in data)
      ) {
        return;
      }

      const file = data as CacheFile;
      if (file.version !== 1 || typeof file.entries !== "object" || file.entries === null) {
        return;
      }

      for (const [key, entry] of Object.entries(file.entries)) {
        if (this.isValidEntry(entry)) {
          this.cache.set(key, entry);
        }
      }
    } catch {
      // Korrupte Datei: selbstheilend — leere Map, kein Crash
    }
  }

  private persistToDisk(): void {
    try {
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
      }

      const file: CacheFile = {
        version: 1,
        entries: Object.fromEntries(this.cache),
      };

      writeFileSync(
        join(this.cacheDir, "cache.json"),
        JSON.stringify(file, null, 2),
        "utf-8",
      );
    } catch {
      // Write-Fehler: nicht-kritisch, Cache funktioniert weiter im Memory
    }
  }

  private isValidEntry(entry: unknown): entry is CacheEntry {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.content === "string" &&
      typeof e.model === "string" &&
      typeof e.cachedAt === "number" &&
      typeof e.tokens === "object" &&
      e.tokens !== null &&
      typeof (e.tokens as Record<string, unknown>).prompt === "number" &&
      typeof (e.tokens as Record<string, unknown>).completion === "number"
    );
  }
}
