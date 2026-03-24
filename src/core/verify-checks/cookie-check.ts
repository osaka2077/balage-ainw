/**
 * verify() — Cookie Check
 *
 * Neue Session-Cookies erkennen.
 * SECURITY: Cookie-Werte werden NIEMALS gespeichert (nur Name + exists).
 */

import type { CookieInfo, CheckResult } from "../verify-types.js";

const SESSION_COOKIE_PATTERNS = [
  /sess/i,
  /session/i,
  /\bsid\b/i,
  /token/i,
  /\bauth/i,
  /\bjwt\b/i,
  /\bcsrf\b/i,
  /\bxsrf\b/i,
  /login/i,
  /connect\.sid/i,
  /phpsessid/i,
  /jsessionid/i,
  /asp\.net_sessionid/i,
  /_session/i,
];

function isSessionCookie(name: string): boolean {
  return SESSION_COOKIE_PATTERNS.some((p) => p.test(name));
}

export function checkNewSessionCookies(
  beforeCookies: CookieInfo[],
  afterCookies: CookieInfo[],
): CheckResult {
  const beforeNames = new Set(
    beforeCookies.filter((c) => c.exists).map((c) => c.name),
  );
  const newCookies = afterCookies.filter(
    (c) => c.exists && !beforeNames.has(c.name),
  );
  const newSessionCookies = newCookies.filter((c) => isSessionCookie(c.name));

  if (newSessionCookies.length > 0) {
    return {
      name: "new-session-cookie",
      passed: true,
      confidence: 0.9,
      evidence: `New session cookies: ${newSessionCookies.map((c) => c.name).join(", ")}`,
      source: "cookie",
    };
  }

  if (newCookies.length > 0) {
    return {
      name: "new-session-cookie",
      passed: true,
      confidence: 0.5,
      evidence: `New cookies (non-session): ${newCookies.map((c) => c.name).join(", ")}`,
      source: "cookie",
    };
  }

  return {
    name: "new-session-cookie",
    passed: false,
    confidence: 0.6,
    evidence: "No new cookies detected",
    source: "cookie",
  };
}
