/**
 * Semantic Match Factor Tests
 */

import { describe, it, expect } from "vitest";
import { computeSemanticMatch } from "../../factors/semantic-match.js";
import { LOGIN_ENDPOINT, NAVIGATION_ENDPOINT, BARE_ENDPOINT } from "../fixtures.js";

describe("SemanticMatch", () => {
  it("Login-Endpoint mit Passwort-Anchor bekommt hohen Score", () => {
    const score = computeSemanticMatch(LOGIN_ENDPOINT);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("Navigation-Endpoint mit nav-Anchor bekommt hohen Score", () => {
    const score = computeSemanticMatch(NAVIGATION_ENDPOINT);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("Endpoint ohne passende Signale bekommt niedrigeren Score", () => {
    const score = computeSemanticMatch(BARE_ENDPOINT);
    // Content-Typ mit nur einem div.content Anchor — wenig Signal-Match
    expect(score).toBeLessThanOrEqual(0.7);
  });

  it("Score ist immer zwischen 0.0 und 1.0", () => {
    for (const ep of [LOGIN_ENDPOINT, NAVIGATION_ENDPOINT, BARE_ENDPOINT]) {
      const score = computeSemanticMatch(ep);
      expect(score).toBeGreaterThanOrEqual(0.0);
      expect(score).toBeLessThanOrEqual(1.0);
    }
  });
});
