/**
 * CachedLLMClient Tests — Vitest, Mock-LLM
 *
 * Alle Tests verwenden einen minimalen MockLLMClient der Calls zaehlt.
 * KEINE echten API-Calls, kein Netzwerk.
 */

import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CachedLLMClient } from "./cached-llm-client.js";
import type { LLMClient, LLMRequest, LLMResponse } from "./llm-client.js";

// ============================================================================
// Test-Helfer
// ============================================================================

/** Minimaler Mock der Calls zaehlt und konfigurierbare Responses liefert */
function createCountingMock(
  response?: Partial<LLMResponse>,
): LLMClient & { callCount: number; lastRequest: LLMRequest | null } {
  const mock = {
    callCount: 0,
    lastRequest: null as LLMRequest | null,

    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },

    async complete(request: LLMRequest): Promise<LLMResponse> {
      mock.callCount++;
      mock.lastRequest = request;
      return {
        content: response?.content ?? '{"result": "ok"}',
        parsedContent: response?.parsedContent,
        model: response?.model ?? "gpt-4o-mini",
        usage: response?.usage ?? {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        latency: response?.latency ?? 200,
      };
    },
  };
  return mock;
}

function makeRequest(overrides?: Partial<LLMRequest>): LLMRequest {
  return {
    systemPrompt: overrides?.systemPrompt ?? "You are a test assistant",
    userPrompt: overrides?.userPrompt ?? "Say hello",
    model: overrides?.model,
    temperature: overrides?.temperature,
    maxTokens: overrides?.maxTokens,
    responseSchema: overrides?.responseSchema,
  };
}

// Einzigartiger Cache-Dir pro Test um Isolation zu gewaehrleisten
function uniqueCacheDir(): string {
  return join("tmp", `test-cache-${randomUUID()}`);
}

// ============================================================================
// Tests
// ============================================================================

describe("CachedLLMClient", () => {
  const cacheDirs: string[] = [];

  // Aufraeumen: alle Test-Cache-Dirs nach jedem Test entfernen
  afterEach(() => {
    for (const dir of cacheDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignoring cleanup errors
      }
    }
    cacheDirs.length = 0;
  });

  function trackDir(dir: string): string {
    cacheDirs.push(dir);
    return dir;
  }

  // --------------------------------------------------------------------------
  // Cache-Hit / Cache-Miss
  // --------------------------------------------------------------------------

  it("delegates first call to inner client (cache miss)", async () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    const request = makeRequest();
    const result = await client.complete(request);

    expect(mock.callCount).toBe(1);
    expect(result.content).toBe('{"result": "ok"}');
    expect(result.model).toBe("gpt-4o-mini");
  });

  it("returns cached result on second identical call (cache hit)", async () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    const request = makeRequest();
    await client.complete(request);
    const result = await client.complete(request);

    // Inner client nur einmal aufgerufen
    expect(mock.callCount).toBe(1);
    expect(result.content).toBe('{"result": "ok"}');
    expect(result.latency).toBe(0); // Cached = keine Latenz
  });

  // --------------------------------------------------------------------------
  // Key-Isolation
  // --------------------------------------------------------------------------

  it("different systemPrompt produces different cache key", async () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    await client.complete(makeRequest({ systemPrompt: "prompt-a" }));
    await client.complete(makeRequest({ systemPrompt: "prompt-b" }));

    expect(mock.callCount).toBe(2);
  });

  it("different userPrompt produces different cache key", async () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    await client.complete(makeRequest({ userPrompt: "hello" }));
    await client.complete(makeRequest({ userPrompt: "world" }));

    expect(mock.callCount).toBe(2);
  });

  it("different model produces different cache key", async () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    await client.complete(makeRequest({ model: "gpt-4o" }));
    await client.complete(makeRequest({ model: "gpt-4o-mini" }));

    expect(mock.callCount).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  it("tracks hits, misses, and hitRate correctly", async () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    const request = makeRequest();
    await client.complete(request); // miss
    await client.complete(request); // hit
    await client.complete(request); // hit
    await client.complete(makeRequest({ userPrompt: "different" })); // miss

    const stats = client.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  it("returns hitRate 0 when no calls made", () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    const stats = client.getStats();
    expect(stats.hitRate).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Persistenz
  // --------------------------------------------------------------------------

  it("persists cache across new instances (same cacheDir)", async () => {
    const cacheDir = trackDir(uniqueCacheDir());
    const request = makeRequest();

    // Erste Instanz: fuellt den Cache
    const mock1 = createCountingMock();
    const client1 = new CachedLLMClient(mock1, { enabled: true, cacheDir });
    await client1.complete(request);
    expect(mock1.callCount).toBe(1);

    // Zweite Instanz: liest vom Disk
    const mock2 = createCountingMock();
    const client2 = new CachedLLMClient(mock2, { enabled: true, cacheDir });
    await client2.complete(request);
    expect(mock2.callCount).toBe(0); // Aus Cache geladen, kein Inner-Call
  });

  // --------------------------------------------------------------------------
  // Selbstheilung
  // --------------------------------------------------------------------------

  it("ignores corrupt cache file and starts with empty map", async () => {
    const cacheDir = trackDir(uniqueCacheDir());
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, "cache.json"), "{{broken json!!", "utf-8");

    const mock = createCountingMock();
    // Soll keinen Fehler werfen
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    const request = makeRequest();
    await client.complete(request);
    expect(mock.callCount).toBe(1); // Kein Cache-Hit, also inner Call
  });

  it("ignores cache file with wrong version", async () => {
    const cacheDir = trackDir(uniqueCacheDir());
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, "cache.json"),
      JSON.stringify({ version: 99, entries: {} }),
      "utf-8",
    );

    const mock = createCountingMock();
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    const request = makeRequest();
    await client.complete(request);
    expect(mock.callCount).toBe(1);
  });

  it("ignores cache entries with invalid structure", async () => {
    const cacheDir = trackDir(uniqueCacheDir());
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, "cache.json"),
      JSON.stringify({
        version: 1,
        entries: {
          "abc123": { content: 42, model: null }, // Ungueltige Typen
        },
      }),
      "utf-8",
    );

    const mock = createCountingMock();
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    // Soll keine Entries geladen haben
    const stats = client.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  // --------------------------------------------------------------------------
  // clearCache
  // --------------------------------------------------------------------------

  it("clears all entries and resets stats", async () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    const request = makeRequest();
    await client.complete(request); // miss -> cached
    await client.complete(request); // hit

    client.clearCache();
    const stats = client.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);

    // Nach clearCache muss der naechste Call wieder an inner gehen
    await client.complete(request);
    expect(mock.callCount).toBe(2); // Erster + nach clear
  });

  it("clearCache persists empty state to disk", async () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    await client.complete(makeRequest());
    client.clearCache();

    // Neue Instanz sollte leeren Cache haben
    const mock2 = createCountingMock();
    const client2 = new CachedLLMClient(mock2, { enabled: true, cacheDir });
    await client2.complete(makeRequest());
    expect(mock2.callCount).toBe(1); // Kein Cache-Hit
  });

  // --------------------------------------------------------------------------
  // Disabled
  // --------------------------------------------------------------------------

  it("bypasses cache entirely when disabled", async () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: false, cacheDir });

    const request = makeRequest();
    await client.complete(request);
    await client.complete(request);
    await client.complete(request);

    // Alle Calls gehen direkt an inner
    expect(mock.callCount).toBe(3);
  });

  it("does not create cache directory when disabled", async () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: false, cacheDir });

    await client.complete(makeRequest());

    expect(existsSync(cacheDir)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // estimateTokens delegation
  // --------------------------------------------------------------------------

  it("delegates estimateTokens to inner client", () => {
    const mock = createCountingMock();
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    const estimate = client.estimateTokens("some text for estimation");
    expect(estimate).toBe(Math.ceil("some text for estimation".length / 4));
  });

  // --------------------------------------------------------------------------
  // Usage-Felder korrekt aus Cache
  // --------------------------------------------------------------------------

  it("reconstructs usage fields correctly from cache", async () => {
    const mock = createCountingMock({
      content: '{"test": true}',
      model: "test-model",
      usage: { promptTokens: 42, completionTokens: 17, totalTokens: 59 },
      latency: 500,
    });
    const cacheDir = trackDir(uniqueCacheDir());
    const client = new CachedLLMClient(mock, { enabled: true, cacheDir });

    const request = makeRequest();
    await client.complete(request); // miss, caches the response
    const cached = await client.complete(request); // hit

    expect(cached.usage.promptTokens).toBe(42);
    expect(cached.usage.completionTokens).toBe(17);
    expect(cached.usage.totalTokens).toBe(59);
    expect(cached.model).toBe("test-model");
    expect(cached.latency).toBe(0);
  });
});
