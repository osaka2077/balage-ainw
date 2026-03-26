/**
 * Tests: Network Check (checkNetworkPost, checkNetworkErrors, checkHttp4xx)
 *
 * Prueft POST-Erkennung, Error-Detection, 4xx-Erkennung.
 */

import { describe, it, expect } from "vitest";
import {
  checkNetworkPost,
  checkNetworkErrors,
  checkHttp4xx,
} from "../../src/core/verify-checks/network-check.js";
import type { NetworkRequest } from "../../src/core/verify-types.js";

// ============================================================================
// checkNetworkPost
// ============================================================================

describe("checkNetworkPost", () => {
  it("detects successful POST 200", () => {
    const requests: NetworkRequest[] = [
      { url: "/api/login", method: "POST", status: 200 },
    ];

    const result = checkNetworkPost(requests);

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.85);
  });

  it("detects failed POST 400", () => {
    const requests: NetworkRequest[] = [
      { url: "/api/login", method: "POST", status: 400 },
    ];

    const result = checkNetworkPost(requests);

    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(0.75);
  });

  it("returns passed=false when no POST requests (only GET)", () => {
    const requests: NetworkRequest[] = [
      { url: "/api/data", method: "GET", status: 200 },
    ];

    const result = checkNetworkPost(requests);

    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(0.8);
  });

  it("returns passed=false with empty array", () => {
    const result = checkNetworkPost([]);

    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// checkNetworkErrors
// ============================================================================

describe("checkNetworkErrors", () => {
  it('returns passed=true with name "no-network-errors" when no errors', () => {
    const requests: NetworkRequest[] = [
      { url: "/api/data", method: "GET", status: 200 },
      { url: "/api/user", method: "POST", status: 201 },
    ];

    const result = checkNetworkErrors(requests);

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.8);
    expect(result.name).toBe("no-network-errors");
  });

  it("detects server error 500 with higher confidence", () => {
    const requests: NetworkRequest[] = [
      { url: "/api/data", method: "POST", status: 500 },
    ];

    const result = checkNetworkErrors(requests);

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it("detects client error 403 with standard confidence", () => {
    const requests: NetworkRequest[] = [
      { url: "/api/admin", method: "GET", status: 403 },
    ];

    const result = checkNetworkErrors(requests);

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.8);
  });
});

// ============================================================================
// checkHttp4xx
// ============================================================================

describe("checkHttp4xx", () => {
  it("detects 401 Unauthorized", () => {
    const requests: NetworkRequest[] = [
      { url: "/api/login", method: "POST", status: 401 },
    ];

    const result = checkHttp4xx(requests);

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.85);
  });

  it("detects 404 Not Found", () => {
    const requests: NetworkRequest[] = [
      { url: "/api/missing", method: "GET", status: 404 },
    ];

    const result = checkHttp4xx(requests);

    expect(result.passed).toBe(true);
  });

  it("returns passed=false when no 4xx errors present", () => {
    const requests: NetworkRequest[] = [
      { url: "/api/data", method: "GET", status: 200 },
      { url: "/api/error", method: "POST", status: 500 },
    ];

    const result = checkHttp4xx(requests);

    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(0.7);
  });
});
