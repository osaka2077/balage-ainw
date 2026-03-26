/**
 * Tests: verifyFromHTML (HTML-basierte Verification API)
 *
 * Integration-Tests fuer die async HTML-Verification-Pipeline.
 * Prueft Login-Success, Login-Fail, Navigation, Edge Cases, Audit, Timing.
 */

import { describe, it, expect } from "vitest";
import { verifyFromHTML } from "../../src/core/verify.js";
import type {
  ActionSnapshot,
  VerificationExpectation,
  VerificationResult,
} from "../../src/core/verify-types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeSnapshot(overrides: {
  beforeHtml?: string;
  afterHtml?: string;
  beforeUrl?: string;
  afterUrl?: string;
}): ActionSnapshot {
  return {
    before: {
      html: overrides.beforeHtml ?? "",
      url: overrides.beforeUrl ?? "https://example.com",
      timestamp: 1000,
    },
    after: {
      html: overrides.afterHtml ?? "",
      url: overrides.afterUrl ?? "https://example.com",
      timestamp: 2000,
    },
    action: { type: "click" },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("verifyFromHTML", () => {
  it("returns 'verified' for login success with URL change and welcome text", async () => {
    const snapshot = makeSnapshot({
      beforeHtml:
        '<form><input type="password"><button>Login</button></form>',
      afterHtml:
        '<h1>Welcome User</h1><nav><a href="/profile">Profile</a></nav>',
      beforeUrl: "https://example.com/login",
      afterUrl: "https://example.com/dashboard",
    });

    const expectation: VerificationExpectation = { type: "login" };
    const result = await verifyFromHTML(snapshot, expectation);

    expect(result.verdict).toBe("verified");
  });

  it("does not return 'verified' for login failure with error div", async () => {
    const snapshot = makeSnapshot({
      beforeHtml:
        '<form><input type="password"><button>Login</button></form>',
      afterHtml:
        '<form><input type="password"><button>Login</button></form><div class="error">Wrong password</div>',
      beforeUrl: "https://example.com/login",
      afterUrl: "https://example.com/login",
    });

    const expectation: VerificationExpectation = { type: "login" };
    const result = await verifyFromHTML(snapshot, expectation);

    expect(result.verdict).not.toBe("verified");
  });

  it("returns 'verified' for navigation with URL change and new content", async () => {
    const snapshot = makeSnapshot({
      beforeHtml:
        "<html><body><h1>Home</h1><p>Welcome to our site</p><nav><a href='/about'>About</a></nav></body></html>",
      afterHtml:
        "<html><body><h1>About Us</h1><p>We are a company</p><p>Founded in 2020</p><p>Located in Berlin</p><section><h2>Team</h2><ul><li>Alice</li><li>Bob</li></ul></section></body></html>",
      beforeUrl: "https://example.com/",
      afterUrl: "https://example.com/about",
    });

    const expectation: VerificationExpectation = { type: "navigation" };
    const result = await verifyFromHTML(snapshot, expectation);

    expect(result.verdict).toBe("verified");
  });

  it("handles minimal input (empty HTML) without crash", async () => {
    const snapshot = makeSnapshot({
      beforeHtml: "",
      afterHtml: "",
      beforeUrl: "https://example.com",
      afterUrl: "https://example.com",
    });

    const expectation: VerificationExpectation = { type: "login" };
    const result = await verifyFromHTML(snapshot, expectation);

    // Soll nicht crashen und ein vollstaendiges Result liefern
    expect(result).toBeDefined();
    expect(result.verdict).toBeDefined();
    expect(result.checks).toBeDefined();
  });

  it("includes audit trail when options.audit=true", async () => {
    const snapshot = makeSnapshot({
      beforeHtml: "<p>Before</p>",
      afterHtml: "<p>After</p>",
      beforeUrl: "https://example.com",
      afterUrl: "https://example.com",
    });

    const expectation: VerificationExpectation = { type: "login" };
    const result = await verifyFromHTML(snapshot, expectation, {
      audit: true,
    });

    expect(result.audit).toBeDefined();
    expect(Array.isArray(result.audit)).toBe(true);
    expect(result.audit!.length).toBeGreaterThan(0);
  });

  it("reports non-negative timing", async () => {
    const snapshot = makeSnapshot({
      beforeHtml: "<p>Test</p>",
      afterHtml: "<p>Test</p>",
    });

    const expectation: VerificationExpectation = { type: "login" };
    const result = await verifyFromHTML(snapshot, expectation);

    expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("result contains all required fields", async () => {
    const snapshot = makeSnapshot({
      beforeHtml: "<div>A</div>",
      afterHtml: "<div>B</div>",
    });

    const expectation: VerificationExpectation = { type: "form_submit" };
    const result: VerificationResult = await verifyFromHTML(
      snapshot,
      expectation,
    );

    // Pflichtfelder pruefen
    expect(result).toHaveProperty("verdict");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("checks");
    expect(result).toHaveProperty("domDiff");
    expect(result).toHaveProperty("timing");

    // Typen pruefen
    expect(["verified", "failed", "inconclusive"]).toContain(result.verdict);
    expect(typeof result.confidence).toBe("number");
    expect(Array.isArray(result.checks)).toBe(true);
    expect(typeof result.domDiff).toBe("object");
    expect(typeof result.timing.totalMs).toBe("number");
  });
});
