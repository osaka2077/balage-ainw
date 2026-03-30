/**
 * URL Validator — Unit Tests (FC-001 + FC-002)
 *
 * Deckt alle 8+ Bypass-Varianten fuer isPrivateHost() ab:
 *   1. IPv4 Standard (127.0.0.1, 10.x, 172.16-31.x, 192.168.x)
 *   2. IPv6 Loopback (::1, [::1])
 *   3. IPv6 Private (fc00::/7, fe80::/10)
 *   4. IPv4-Mapped IPv6 (::ffff:127.0.0.1)
 *   5. Cloud Metadata (169.254.169.254, metadata.google.internal)
 *   6. Dezimal-IP (2130706433 = 127.0.0.1)
 *   7. Oktal-IP (0177.0.0.1 = 127.0.0.1)
 *   8. URL-Encoded Hostnames (%31%32%37.0.0.1)
 *   9. Blocked TLDs (.local, .internal, .localhost)
 *  10. Redirect-SSRF (validateRedirectUrl)
 *
 * Plus: Keine False-Positives auf oeffentliche Domains.
 */

import { describe, it, expect } from "vitest";
import {
  isPrivateHost,
  validateFetchUrl,
  validateRedirectUrl,
} from "../url-validator.js";

// ============================================================================
// isPrivateHost() — FC-001
// ============================================================================

describe("isPrivateHost", () => {
  // ---------- Bekannte lokale Hostnamen ----------

  it("should block 'localhost'", () => {
    expect(isPrivateHost("localhost")).toBe(true);
  });

  it("should block 'LOCALHOST' (case-insensitive)", () => {
    expect(isPrivateHost("LOCALHOST")).toBe(true);
  });

  it("should block empty hostname", () => {
    expect(isPrivateHost("")).toBe(true);
  });

  // ---------- IPv4 Standard ----------

  it("should block 127.0.0.1 (loopback)", () => {
    expect(isPrivateHost("127.0.0.1")).toBe(true);
  });

  it("should block 127.255.255.255 (loopback range)", () => {
    expect(isPrivateHost("127.255.255.255")).toBe(true);
  });

  it("should block 10.0.0.1 (RFC 1918)", () => {
    expect(isPrivateHost("10.0.0.1")).toBe(true);
  });

  it("should block 172.16.0.1 (RFC 1918)", () => {
    expect(isPrivateHost("172.16.0.1")).toBe(true);
  });

  it("should block 172.31.255.255 (RFC 1918 upper bound)", () => {
    expect(isPrivateHost("172.31.255.255")).toBe(true);
  });

  it("should NOT block 172.15.0.1 (below RFC 1918 range)", () => {
    expect(isPrivateHost("172.15.0.1")).toBe(false);
  });

  it("should NOT block 172.32.0.1 (above RFC 1918 range)", () => {
    expect(isPrivateHost("172.32.0.1")).toBe(false);
  });

  it("should block 192.168.1.1 (RFC 1918)", () => {
    expect(isPrivateHost("192.168.1.1")).toBe(true);
  });

  it("should block 0.0.0.0 (unspecified)", () => {
    expect(isPrivateHost("0.0.0.0")).toBe(true);
  });

  it("should block 169.254.169.254 (Link-Local / Cloud Metadata)", () => {
    expect(isPrivateHost("169.254.169.254")).toBe(true);
  });

  it("should block 100.100.100.200 (Alibaba Cloud Metadata)", () => {
    expect(isPrivateHost("100.100.100.200")).toBe(true);
  });

  // ---------- IPv6 Loopback ----------

  it("should block [::1] (IPv6 loopback with brackets)", () => {
    expect(isPrivateHost("[::1]")).toBe(true);
  });

  it("should block ::1 (IPv6 loopback without brackets)", () => {
    expect(isPrivateHost("::1")).toBe(true);
  });

  // ---------- IPv6 Private ----------

  it("should block fc00::1 (Unique Local Address)", () => {
    expect(isPrivateHost("fc00::1")).toBe(true);
  });

  it("should block fd12:3456:789a::1 (ULA)", () => {
    expect(isPrivateHost("fd12:3456:789a::1")).toBe(true);
  });

  it("should block fe80::1 (Link-Local)", () => {
    expect(isPrivateHost("fe80::1")).toBe(true);
  });

  it("should block [fe80::1%eth0] style (Link-Local with brackets)", () => {
    expect(isPrivateHost("[fe80::1]")).toBe(true);
  });

  // ---------- IPv4-Mapped IPv6 ----------

  it("should block ::ffff:127.0.0.1 (IPv4-Mapped loopback)", () => {
    expect(isPrivateHost("::ffff:127.0.0.1")).toBe(true);
  });

  it("should block [::ffff:127.0.0.1] (IPv4-Mapped with brackets)", () => {
    expect(isPrivateHost("[::ffff:127.0.0.1]")).toBe(true);
  });

  it("should block ::ffff:10.0.0.1 (IPv4-Mapped RFC 1918)", () => {
    expect(isPrivateHost("::ffff:10.0.0.1")).toBe(true);
  });

  it("should block ::ffff:192.168.1.1 (IPv4-Mapped RFC 1918)", () => {
    expect(isPrivateHost("::ffff:192.168.1.1")).toBe(true);
  });

  // ---------- Cloud Metadata ----------

  it("should block metadata.google.internal", () => {
    expect(isPrivateHost("metadata.google.internal")).toBe(true);
  });

  // ---------- Dezimal-IP ----------

  it("should block 2130706433 (127.0.0.1 as decimal integer)", () => {
    expect(isPrivateHost("2130706433")).toBe(true);
  });

  it("should block 167772161 (10.0.0.1 as decimal integer)", () => {
    // 10 * 2^24 + 0 + 0 + 1 = 167772161
    expect(isPrivateHost("167772161")).toBe(true);
  });

  // ---------- Oktal-IP ----------

  it("should block 0177.0.0.1 (127.0.0.1 in octal notation)", () => {
    expect(isPrivateHost("0177.0.0.1")).toBe(true);
  });

  it("should block 012.0.0.1 (10.0.0.1 in octal notation)", () => {
    expect(isPrivateHost("012.0.0.1")).toBe(true);
  });

  it("should block 0300.0250.0.1 (192.168.0.1 in octal)", () => {
    expect(isPrivateHost("0300.0250.0.1")).toBe(true);
  });

  // ---------- Hex-IP ----------

  it("should block 0x7f.0.0.1 (127.0.0.1 in hex notation)", () => {
    expect(isPrivateHost("0x7f.0.0.1")).toBe(true);
  });

  // ---------- URL-Encoded ----------

  it("should block %31%32%37.0.0.1 (URL-encoded 127.0.0.1)", () => {
    expect(isPrivateHost("%31%32%37.0.0.1")).toBe(true);
  });

  it("should block double-encoded localhost", () => {
    // %6c%6f%63%61%6c%68%6f%73%74 = localhost
    expect(isPrivateHost("%6c%6f%63%61%6c%68%6f%73%74")).toBe(true);
  });

  // ---------- Blocked TLDs ----------

  it("should block app.local", () => {
    expect(isPrivateHost("app.local")).toBe(true);
  });

  it("should block server.internal", () => {
    expect(isPrivateHost("server.internal")).toBe(true);
  });

  it("should block test.localhost", () => {
    expect(isPrivateHost("test.localhost")).toBe(true);
  });

  it("should block my.intranet", () => {
    expect(isPrivateHost("my.intranet")).toBe(true);
  });

  it("should block corp-app.corp", () => {
    expect(isPrivateHost("corp-app.corp")).toBe(true);
  });

  // ---------- False-Positive-Checks (oeffentliche Domains) ----------

  it("should NOT block google.com", () => {
    expect(isPrivateHost("google.com")).toBe(false);
  });

  it("should NOT block amazon.de", () => {
    expect(isPrivateHost("amazon.de")).toBe(false);
  });

  it("should NOT block github.com", () => {
    expect(isPrivateHost("github.com")).toBe(false);
  });

  it("should NOT block 8.8.8.8 (Google DNS)", () => {
    expect(isPrivateHost("8.8.8.8")).toBe(false);
  });

  it("should NOT block 1.1.1.1 (Cloudflare DNS)", () => {
    expect(isPrivateHost("1.1.1.1")).toBe(false);
  });

  it("should NOT block example.com", () => {
    expect(isPrivateHost("example.com")).toBe(false);
  });

  it("should NOT block 142.250.186.46 (public IP)", () => {
    expect(isPrivateHost("142.250.186.46")).toBe(false);
  });

  // Sicherstellen dass localhost-Substring in Domain nicht matcht
  it("should NOT block notlocalhost.com", () => {
    expect(isPrivateHost("notlocalhost.com")).toBe(false);
  });

  it("should NOT block internal.google.com", () => {
    // Endet auf .com, nicht auf .internal
    expect(isPrivateHost("internal.google.com")).toBe(false);
  });

  // Malformed input
  it("should treat malformed percent-encoding as private (defensive)", () => {
    expect(isPrivateHost("%ZZ%ZZ")).toBe(true);
  });
});

// ============================================================================
// validateFetchUrl() — FC-002
// ============================================================================

describe("validateFetchUrl", () => {
  // ---------- Happy Path ----------

  it("should accept valid HTTPS URL", () => {
    const result = validateFetchUrl("https://example.com");
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("should accept HTTPS URL with path and query", () => {
    const result = validateFetchUrl("https://example.com/path?q=test&page=1");
    expect(result.valid).toBe(true);
  });

  it("should accept HTTPS URL with port", () => {
    const result = validateFetchUrl("https://example.com:8443/api");
    expect(result.valid).toBe(true);
  });

  // ---------- HTTP — default blocked, opt-in allowed ----------

  it("should reject HTTP URL by default", () => {
    const result = validateFetchUrl("http://example.com");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("HTTP URLs are not allowed");
  });

  it("should accept HTTP URL when allowHttp is true", () => {
    const result = validateFetchUrl("http://example.com", { allowHttp: true });
    expect(result.valid).toBe(true);
  });

  // ---------- Blocked Protocols ----------

  it("should reject file:// protocol", () => {
    const result = validateFetchUrl("file:///etc/passwd");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not allowed");
  });

  it("should reject ftp:// protocol", () => {
    const result = validateFetchUrl("ftp://example.com/file.txt");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not allowed");
  });

  it("should reject gopher:// protocol", () => {
    const result = validateFetchUrl("gopher://evil.com/");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not allowed");
  });

  it("should reject javascript: protocol", () => {
    // URL constructor treats javascript: as valid but with no hostname
    const result = validateFetchUrl("javascript:alert(1)");
    expect(result.valid).toBe(false);
  });

  it("should reject data: protocol", () => {
    const result = validateFetchUrl("data:text/html,<h1>Hello</h1>");
    expect(result.valid).toBe(false);
  });

  // ---------- SSRF Protection ----------

  it("should reject https://127.0.0.1", () => {
    const result = validateFetchUrl("https://127.0.0.1");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("private or internal");
  });

  it("should reject https://localhost", () => {
    const result = validateFetchUrl("https://localhost");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("private or internal");
  });

  it("should reject https://[::1]", () => {
    const result = validateFetchUrl("https://[::1]");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("private or internal");
  });

  it("should reject https://169.254.169.254 (metadata)", () => {
    const result = validateFetchUrl("https://169.254.169.254");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("private or internal");
  });

  it("should reject https://10.0.0.1/admin", () => {
    const result = validateFetchUrl("https://10.0.0.1/admin");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("private or internal");
  });

  it("should reject URL with embedded credentials", () => {
    const result = validateFetchUrl("https://admin:password@example.com");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("credentials");
  });

  // ---------- Invalid Input ----------

  it("should reject empty string", () => {
    const result = validateFetchUrl("");
    expect(result.valid).toBe(false);
  });

  it("should reject non-URL string", () => {
    const result = validateFetchUrl("not a url");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Invalid URL");
  });

  it("should reject null-ish input", () => {
    // TypeScript erlaubt das eigentlich nicht, aber defensiv
    const result = validateFetchUrl(undefined as unknown as string);
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// validateRedirectUrl() — FC-001a
// ============================================================================

describe("validateRedirectUrl", () => {
  it("should accept redirect to public HTTPS URL", () => {
    const result = validateRedirectUrl("https://example.com/new-page", "https://example.com/old-page");
    expect(result.valid).toBe(true);
  });

  it("should reject redirect to localhost (SSRF)", () => {
    const result = validateRedirectUrl("http://127.0.0.1/admin", "https://example.com");
    expect(result.valid).toBe(false);
  });

  it("should reject redirect to metadata endpoint", () => {
    const result = validateRedirectUrl(
      "http://169.254.169.254/latest/meta-data",
      "https://malicious-redirect.com",
    );
    expect(result.valid).toBe(false);
  });

  it("should reject redirect to internal TLD", () => {
    const result = validateRedirectUrl(
      "https://admin-panel.internal",
      "https://example.com",
    );
    expect(result.valid).toBe(false);
  });
});
