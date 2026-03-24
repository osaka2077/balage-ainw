/**
 * verify() — Network Request Check
 *
 * POST-Requests, Status 4xx/5xx erkennen.
 * SECURITY: Request/Response-Bodies werden NIEMALS gespeichert.
 */

import type { NetworkRequest, CheckResult } from "../verify-types.js";

export function checkNetworkPost(requests: NetworkRequest[]): CheckResult {
  const postRequests = requests.filter(
    (r) => r.method.toUpperCase() === "POST",
  );

  if (postRequests.length === 0) {
    return {
      name: "network-post",
      passed: false,
      confidence: 0.8,
      evidence: "No POST requests detected",
      source: "network",
    };
  }

  const successful = postRequests.filter(
    (r) => r.status >= 200 && r.status < 400,
  );
  const failed = postRequests.filter((r) => r.status >= 400);

  if (successful.length > 0) {
    const urls = successful
      .map((r) => `${r.method} ${r.url} → ${r.status}`)
      .join("; ");
    return {
      name: "network-post",
      passed: true,
      confidence: 0.85,
      evidence: `Successful POST: ${urls}`,
      source: "network",
    };
  }

  if (failed.length > 0) {
    const urls = failed
      .map((r) => `${r.method} ${r.url} → ${r.status}`)
      .join("; ");
    return {
      name: "network-post",
      passed: false,
      confidence: 0.75,
      evidence: `POST failed: ${urls}`,
      source: "network",
    };
  }

  return {
    name: "network-post",
    passed: true,
    confidence: 0.6,
    evidence: "POST detected, status pending",
    source: "network",
  };
}

export function checkNetworkErrors(requests: NetworkRequest[]): CheckResult {
  const errors = requests.filter((r) => r.status >= 400);

  if (errors.length === 0) {
    return {
      name: "no-network-errors",
      passed: true,
      confidence: 0.8,
      evidence: "No HTTP error responses detected",
      source: "network",
    };
  }

  const clientErrors = errors.filter((r) => r.status < 500);
  const serverErrors = errors.filter((r) => r.status >= 500);
  const details = errors
    .map((r) => `${r.method} ${r.url} → ${r.status}`)
    .join("; ");

  return {
    name: "network-errors",
    passed: true,
    confidence: serverErrors.length > 0 ? 0.9 : 0.8,
    evidence: `HTTP errors (${clientErrors.length} client, ${serverErrors.length} server): ${details}`,
    source: "network",
  };
}

export function checkHttp4xx(requests: NetworkRequest[]): CheckResult {
  const clientErrors = requests.filter(
    (r) => r.status >= 400 && r.status < 500,
  );

  return {
    name: "http-4xx",
    passed: clientErrors.length > 0,
    confidence: clientErrors.length > 0 ? 0.85 : 0.7,
    evidence:
      clientErrors.length > 0
        ? `Client errors: ${clientErrors.map((r) => `${r.url} → ${r.status}`).join("; ")}`
        : "No 4xx errors",
    source: "network",
  };
}
