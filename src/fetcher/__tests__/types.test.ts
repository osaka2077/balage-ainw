/**
 * Fetcher Types — Unit Tests (FC-005)
 *
 * Prueft dass Zod-Schemas korrekt validieren und Defaults richtig setzen.
 */

import { describe, it, expect } from "vitest";
import {
  FetchOptionsSchema,
  FetchMetadataSchema,
  FetchTimingSchema,
} from "../types.js";

describe("FetchOptionsSchema", () => {
  it("should set defaults for empty input", () => {
    const result = FetchOptionsSchema.parse({});
    expect(result.timeoutMs).toBe(30_000);
    expect(result.dismissCookies).toBe(true);
    expect(result.screenshot).toBe(false);
    expect(result.viewport.width).toBe(1280);
    expect(result.viewport.height).toBe(720);
    expect(result.headers).toEqual({});
    expect(result.waitForSelector).toBeUndefined();
  });

  it("should accept custom values", () => {
    const result = FetchOptionsSchema.parse({
      timeoutMs: 60000,
      waitForSelector: "#main",
      dismissCookies: false,
      screenshot: true,
      viewport: { width: 1920, height: 1080 },
      headers: { "Accept-Language": "de-DE" },
    });
    expect(result.timeoutMs).toBe(60000);
    expect(result.waitForSelector).toBe("#main");
    expect(result.dismissCookies).toBe(false);
    expect(result.screenshot).toBe(true);
    expect(result.viewport.width).toBe(1920);
    expect(result.viewport.height).toBe(1080);
    expect(result.headers["Accept-Language"]).toBe("de-DE");
  });

  it("should reject negative timeout", () => {
    expect(() => FetchOptionsSchema.parse({ timeoutMs: -1 })).toThrow();
  });

  it("should reject waitForSelector exceeding 512 chars", () => {
    expect(() =>
      FetchOptionsSchema.parse({ waitForSelector: "x".repeat(513) }),
    ).toThrow();
  });
});

describe("FetchMetadataSchema", () => {
  it("should parse valid metadata", () => {
    const result = FetchMetadataSchema.parse({
      finalUrl: "https://example.com/page",
      statusCode: 200,
      fetcherType: "firecrawl",
    });
    expect(result.finalUrl).toBe("https://example.com/page");
    expect(result.statusCode).toBe(200);
    expect(result.title).toBe("");
    expect(result.botProtection).toBeNull();
    expect(result.cookieBannerDismissed).toBe(false);
    expect(result.fetcherType).toBe("firecrawl");
  });

  it("should reject invalid fetcherType", () => {
    expect(() =>
      FetchMetadataSchema.parse({
        finalUrl: "https://example.com",
        statusCode: 200,
        fetcherType: "curl",
      }),
    ).toThrow();
  });
});

describe("FetchTimingSchema", () => {
  it("should parse valid timing", () => {
    const result = FetchTimingSchema.parse({
      totalMs: 1500,
      navigationMs: 800,
    });
    expect(result.totalMs).toBe(1500);
    expect(result.navigationMs).toBe(800);
  });

  it("should allow optional navigationMs", () => {
    const result = FetchTimingSchema.parse({ totalMs: 500 });
    expect(result.navigationMs).toBeUndefined();
  });
});
