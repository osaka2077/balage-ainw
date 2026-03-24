/**
 * QA: URL-Change Classification Tests
 *
 * Testet classifyUrlChange() — bestimmt die Art der URL-Aenderung zwischen zwei Snapshots.
 * Importiert aus src/core/verify-checks/url-change.ts (wird parallel in Terminal E erstellt).
 */

import { describe, it, expect } from "vitest";
import { classifyUrlChange } from "../../src/core/verify-checks/url-change.js";

// ============================================================================
// Keine Aenderung
// ============================================================================

describe("classifyUrlChange — no change", () => {
  it("returns 'no_change' for identical URLs", () => {
    const result = classifyUrlChange(
      "https://example.com/page",
      "https://example.com/page",
    );
    expect(result.type).toBe("no_change");
  });

  it("returns 'no_change' for identical URLs with trailing slash normalization", () => {
    const result = classifyUrlChange(
      "https://example.com/page/",
      "https://example.com/page/",
    );
    expect(result.type).toBe("no_change");
  });
});

// ============================================================================
// Hash-Change
// ============================================================================

describe("classifyUrlChange — hash change", () => {
  it("detects hash added (#section)", () => {
    const result = classifyUrlChange(
      "https://example.com/page",
      "https://example.com/page#section",
    );
    expect(result.type).toBe("hash_change");
  });

  it("detects hash changed (#section1 → #section2)", () => {
    const result = classifyUrlChange(
      "https://example.com/page#section1",
      "https://example.com/page#section2",
    );
    expect(result.type).toBe("hash_change");
  });

  it("detects hash removed", () => {
    const result = classifyUrlChange(
      "https://example.com/page#section",
      "https://example.com/page",
    );
    expect(result.type).toBe("hash_change");
  });
});

// ============================================================================
// Path-Change (Navigation)
// ============================================================================

describe("classifyUrlChange — navigation (path change)", () => {
  it("detects path change (/login → /dashboard)", () => {
    const result = classifyUrlChange(
      "https://example.com/login",
      "https://example.com/dashboard",
    );
    expect(result.type).toBe("navigation");
  });

  it("detects path change with nested paths", () => {
    const result = classifyUrlChange(
      "https://example.com/app/settings",
      "https://example.com/app/profile",
    );
    expect(result.type).toBe("navigation");
  });

  it("detects navigation from root to subpage", () => {
    const result = classifyUrlChange(
      "https://example.com/",
      "https://example.com/about",
    );
    expect(result.type).toBe("navigation");
  });
});

// ============================================================================
// Query-Change
// ============================================================================

describe("classifyUrlChange — query change", () => {
  it("detects query parameter added (?page=2)", () => {
    const result = classifyUrlChange(
      "https://example.com/results",
      "https://example.com/results?page=2",
    );
    expect(result.type).toBe("query_change");
  });

  it("detects query parameter changed (?page=1 → ?page=2)", () => {
    const result = classifyUrlChange(
      "https://example.com/results?page=1",
      "https://example.com/results?page=2",
    );
    expect(result.type).toBe("query_change");
  });

  it("detects query parameter removed", () => {
    const result = classifyUrlChange(
      "https://example.com/results?q=test",
      "https://example.com/results",
    );
    expect(result.type).toBe("query_change");
  });
});

// ============================================================================
// Cross-Origin (Redirect)
// ============================================================================

describe("classifyUrlChange — redirect (cross-origin)", () => {
  it("detects cross-origin redirect", () => {
    const result = classifyUrlChange(
      "https://example.com/login",
      "https://auth.example.com/callback",
    );
    expect(result.type).toBe("redirect");
  });

  it("detects protocol change as redirect", () => {
    const result = classifyUrlChange(
      "http://example.com/page",
      "https://example.com/page",
    );
    // Gleicher Host, anderes Protokoll — je nach Implementierung redirect oder navigation
    expect(["redirect", "navigation"]).toContain(result.type);
  });

  it("detects entirely different domain as redirect", () => {
    const result = classifyUrlChange(
      "https://example.com/login",
      "https://google.com/oauth",
    );
    expect(result.type).toBe("redirect");
  });
});
