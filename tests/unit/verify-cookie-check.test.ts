/**
 * Tests: Cookie Check (checkNewSessionCookies)
 *
 * Prueft Session-Cookie-Erkennung, Non-Session-Cookies, leere Arrays.
 * SECURITY: Evidence darf nur Cookie-Namen enthalten, keine Werte.
 */

import { describe, it, expect } from "vitest";
import { checkNewSessionCookies } from "../../src/core/verify-checks/cookie-check.js";
import type { CookieInfo } from "../../src/core/verify-types.js";

// ============================================================================
// Tests
// ============================================================================

describe("checkNewSessionCookies", () => {
  it('detects new "session_id" cookie as session cookie', () => {
    const before: CookieInfo[] = [];
    const after: CookieInfo[] = [{ name: "session_id", exists: true }];

    const result = checkNewSessionCookies(before, after);

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it('detects new "jwt_token" cookie as session cookie', () => {
    const before: CookieInfo[] = [];
    const after: CookieInfo[] = [{ name: "jwt_token", exists: true }];

    const result = checkNewSessionCookies(before, after);

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it('detects new "PHPSESSID" cookie as session cookie', () => {
    const before: CookieInfo[] = [];
    const after: CookieInfo[] = [{ name: "PHPSESSID", exists: true }];

    const result = checkNewSessionCookies(before, after);

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it('detects new "connect.sid" cookie as session cookie', () => {
    const before: CookieInfo[] = [];
    const after: CookieInfo[] = [{ name: "connect.sid", exists: true }];

    const result = checkNewSessionCookies(before, after);

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it('detects new non-session cookie "_ga" with lower confidence', () => {
    const before: CookieInfo[] = [];
    const after: CookieInfo[] = [{ name: "_ga", exists: true }];

    const result = checkNewSessionCookies(before, after);

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.5);
  });

  it("returns passed=false when no new cookies (before and after identical)", () => {
    const cookies: CookieInfo[] = [
      { name: "existing_cookie", exists: true },
    ];

    const result = checkNewSessionCookies(cookies, cookies);

    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(0.6);
  });

  it("returns passed=false with empty arrays", () => {
    const result = checkNewSessionCookies([], []);

    expect(result.passed).toBe(false);
  });

  it("evidence contains only cookie names, never values", () => {
    const before: CookieInfo[] = [];
    const after: CookieInfo[] = [
      { name: "session_id", exists: true },
      { name: "_ga", exists: true },
    ];

    const result = checkNewSessionCookies(before, after);

    // Evidence soll Cookie-Namen enthalten
    expect(result.evidence).toContain("session_id");

    // Evidence darf keine "value"-artigen Inhalte haben
    // (CookieInfo hat kein value-Feld, aber wir pruefen trotzdem
    // dass kein Wort wie "value" oder strukturelle Leak-Patterns vorkommen)
    expect(result.evidence).not.toMatch(/value\s*[:=]/i);
  });
});
