import { describe, it, expect, beforeEach } from "vitest";
import { analyzeFromHTML } from "../../src/core/analyze.js";
import { clearCache, cacheStats } from "../../src/core/fingerprint-cache.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LOGIN_HTML = `<html><body>
<form action="/login">
  <input type="email" name="email" placeholder="Email" />
  <input type="password" name="password" placeholder="Password" />
  <button type="submit">Sign In</button>
</form>
</body></html>`;

const SEARCH_HTML = `<html><body>
<form role="search">
  <input type="search" name="q" placeholder="Search..." />
  <button type="submit">Search</button>
</form>
</body></html>`;

const STATIC_HTML = `<html><body>
<h1>Hello World</h1>
<p>This is a static page with no interactive elements.</p>
</body></html>`;

const TEST_URL = "https://example.com/test";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Fingerprint Cache", () => {
  beforeEach(() => {
    clearCache();
  });

  it("cache miss on first call: cached=false, endpoints > 0", async () => {
    const result = await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    expect(result.meta.cached).toBe(false);
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("stores result in cache after first call", async () => {
    await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    const stats = cacheStats();
    expect(stats.resultCount).toBe(1);
  });

  it("cache hit on second identical call: cached=true, similarity=1.0", async () => {
    await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    const second = await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    expect(second.meta.cached).toBe(true);
    expect(second.meta.cacheSimilarity).toBe(1.0);
  });

  it("cached result has same endpoints as original", async () => {
    const first = await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    const second = await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    expect(second.endpoints).toEqual(first.endpoints);
  });

  it("cache hit has llmCalls=0", async () => {
    await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    const second = await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    expect(second.timing.llmCalls).toBe(0);
  });

  it("cache miss for different HTML (login vs search)", async () => {
    await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    const search = await analyzeFromHTML(SEARCH_HTML, { url: TEST_URL });
    expect(search.meta.cached).not.toBe(true);
  });

  it("cache=false skips cache, meta.cached is undefined", async () => {
    const result = await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL, cache: false });
    expect(result.meta.cached).toBeUndefined();
  });

  it("cache=false stores nothing", async () => {
    await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL, cache: false });
    expect(cacheStats().resultCount).toBe(0);
  });

  it("TTL expiry: ttlMs=1 causes cache miss", async () => {
    await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL, cache: { ttlMs: 1 } });
    await new Promise(r => setTimeout(r, 20));
    const second = await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL, cache: { ttlMs: 1 } });
    expect(second.meta.cached).not.toBe(true);
  });

  it("custom threshold: similarityThreshold=1.0 with identical HTML hits", async () => {
    await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL, cache: { similarityThreshold: 1.0 } });
    const second = await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL, cache: { similarityThreshold: 1.0 } });
    expect(second.meta.cached).toBe(true);
  });

  it("clearCache() clears all entries", async () => {
    await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    expect(cacheStats().resultCount).toBe(1);
    clearCache();
    expect(cacheStats().resultCount).toBe(0);
    expect(cacheStats().fingerprintCount).toBe(0);
  });

  it("clearCache() causes cache miss on re-call", async () => {
    await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    clearCache();
    const result = await analyzeFromHTML(LOGIN_HTML, { url: TEST_URL });
    expect(result.meta.cached).toBe(false);
  });

  it("empty HTML: graceful, endpoints=[]", async () => {
    const result = await analyzeFromHTML("", { url: TEST_URL });
    expect(result.endpoints).toEqual([]);
  });

  it("HTML without interactive elements: cache miss, endpoints=[]", async () => {
    const result = await analyzeFromHTML(STATIC_HTML, { url: TEST_URL });
    expect(result.endpoints).toEqual([]);
  });

  it("rapid successive calls: at least one is non-cached", async () => {
    const results = await Promise.all([
      analyzeFromHTML(LOGIN_HTML, { url: TEST_URL }),
      analyzeFromHTML(LOGIN_HTML, { url: TEST_URL }),
      analyzeFromHTML(LOGIN_HTML, { url: TEST_URL }),
    ]);
    const nonCached = results.filter(r => r.meta.cached !== true);
    expect(nonCached.length).toBeGreaterThanOrEqual(1);
  });
});
